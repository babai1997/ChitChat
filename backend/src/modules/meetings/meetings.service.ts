import { randomBytes } from 'crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatMemberRole, ChatType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatsService } from '../chats/chats.service';
import { CreateMeetingDto, RenameMeetingDto } from './dto';

const SLUG_GENERATION_ATTEMPTS = 5;

/**
 * MeetingsService — Google-Meet-style shareable call links. A Meeting is a
 * thin pointer from a shareable `slug` to an otherwise-ordinary
 * Chat(type: meeting). Joining grants ChatMember membership based on
 * "you supplied the correct slug," not an admin invite (see
 * ChatsService.addSelfAsMember) — every other call/E2EE/messaging code
 * path is untouched and applies exactly as it does for any other chat
 * once that ChatMember row exists.
 */
@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatsService: ChatsService,
  ) {}

  private generateSlug(): string {
    // 6 random bytes -> 8 URL-safe base64url chars, e.g. "aZ3f9K2q"
    return randomBytes(6).toString('base64url');
  }

  /** Shared by create() (ad-hoc rooms) and getPersonalRoom() (the one persistent room) — same Chat+Meeting creation, just called from different places. */
  private async createRoom(hostId: string, name: string) {
    for (let attempt = 0; attempt < SLUG_GENERATION_ATTEMPTS; attempt++) {
      const slug = this.generateSlug();
      const existing = await this.prisma.meeting.findUnique({ where: { slug } });
      if (existing) continue; // negligible-probability collision — retry with a fresh slug

      const chat = await this.prisma.chat.create({
        data: {
          type: ChatType.meeting,
          name,
          createdBy: hostId,
          members: {
            create: [{ userId: hostId, role: ChatMemberRole.admin }],
          },
        },
      });

      const meeting = await this.prisma.meeting.create({
        data: { chatId: chat.id, slug, hostId },
      });

      return { meetingId: meeting.id, chatId: chat.id, slug };
    }
    throw new Error('Failed to generate a unique meeting slug — please try again');
  }

  async create(hostId: string, hostDisplayName: string, dto: CreateMeetingDto) {
    const { chatId, slug } = await this.createRoom(hostId, dto.name ?? `${hostDisplayName}'s Meeting`);
    return { chatId, slug };
  }

  /**
   * Get-or-create the caller's Personal Meeting Room — one persistent,
   * reusable link per user (like Zoom's PMI), the actual fix for "every
   * 'New Meeting' click makes me a throwaway link I can never get back
   * to." Regenerates lazily if the current one was revoked, so revoking
   * your personal room from "My Meetings" doesn't permanently strand you.
   */
  async getPersonalRoom(userId: string, hostDisplayName: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { personalMeeting: true },
    });

    if (user?.personalMeeting && !user.personalMeeting.revoked) {
      return { chatId: user.personalMeeting.chatId, slug: user.personalMeeting.slug };
    }

    const { meetingId, chatId, slug } = await this.createRoom(userId, `${hostDisplayName}'s Meeting Room`);
    await this.prisma.user.update({
      where: { id: userId },
      data: { personalMeetingId: meetingId },
    });
    return { chatId, slug };
  }

  /** Every meeting the caller hosts, for the "My Meetings" list — the personal room is flagged, not hidden, so the list is a complete picture. */
  async listMine(userId: string) {
    const [user, meetings] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { personalMeetingId: true } }),
      this.prisma.meeting.findMany({
        where: { hostId: userId },
        include: { chat: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return meetings.map((m) => ({
      slug: m.slug,
      name: m.chat.name,
      chatId: m.chatId,
      createdAt: m.createdAt,
      revoked: m.revoked,
      isPersonal: m.id === user?.personalMeetingId,
    }));
  }

  /**
   * Resolve a chat's meeting link from inside the chat itself — any
   * current member can retrieve and re-share it, not just the host
   * (sharing an ongoing meeting forward is the whole point); revoking
   * stays host-only (see revoke()).
   */
  async getByChatId(chatId: string, userId: string) {
    const isMember = await this.chatsService.isChatMember(chatId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this chat');
    }

    const meeting = await this.prisma.meeting.findUnique({ where: { chatId } });
    if (!meeting) {
      throw new NotFoundException('This chat has no associated meeting link');
    }

    return {
      slug: meeting.slug,
      revoked: meeting.revoked,
      isHost: meeting.hostId === userId,
    };
  }

  /** Resolves a meeting by slug WITHOUT requiring the caller to already be a member — that's the point of this endpoint. */
  async getBySlug(slug: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { slug },
      include: {
        chat: { select: { id: true, name: true } },
        host: { include: { profile: true } },
      },
    });
    if (!meeting || meeting.revoked) {
      throw new NotFoundException('This meeting link is no longer valid');
    }
    return {
      chatId: meeting.chat.id,
      name: meeting.chat.name,
      hostName: meeting.host.profile?.displayName ?? 'Unknown',
    };
  }

  async join(slug: string, userId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { slug } });
    if (!meeting || meeting.revoked) {
      throw new NotFoundException('This meeting link is no longer valid');
    }

    await this.chatsService.addSelfAsMember(meeting.chatId, userId);
    return { chatId: meeting.chatId };
  }

  /** Renames a meeting's room — host-only, updates the underlying Chat's name since that's what listMine()/getByChatId() display. */
  async rename(slug: string, userId: string, dto: RenameMeetingDto) {
    const meeting = await this.prisma.meeting.findUnique({ where: { slug } });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    if (meeting.hostId !== userId) {
      throw new ForbiddenException('Only the host can rename this meeting');
    }

    await this.prisma.chat.update({
      where: { id: meeting.chatId },
      data: { name: dto.name },
    });
    return { success: true };
  }

  async revoke(slug: string, userId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { slug } });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    if (meeting.hostId !== userId) {
      throw new ForbiddenException('Only the host can revoke this meeting link');
    }

    await this.prisma.meeting.update({
      where: { slug },
      data: { revoked: true },
    });
    return { success: true };
  }
}
