import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatType, ChatMemberRole } from '@prisma/client';
import {
  CreateDirectChatDto,
  CreateGroupDto,
  UpdateGroupDto,
  AddMemberDto,
} from './dto';
import { ChatsMapper } from './chats.mapper';

@Injectable()
export class ChatsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ============================================
  // Get Chats
  // ============================================

  async getUserChats(userId: string) {
    // Query 1: load all chat data with members + last message in one round-trip.
    const chatMembers = await this.prisma.chatMember.findMany({
      where: { userId },
      include: {
        chat: {
          include: {
            members: {
              include: {
                user: {
                  include: { profile: true },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                sender: {
                  include: { profile: true },
                },
              },
            },
          },
        },
      },
      orderBy: {
        chat: {
          updatedAt: 'desc',
        },
      },
    });

    // Query 2: batch unread counts for all chats in a single SQL round-trip.
    // Each row uses that membership's own lastReadAt (or joinedAt) as the threshold,
    // so we avoid one COUNT query per chat (the N+1 that the loop above produced).
    const unreadRows = await this.prisma.$queryRaw<
      { chat_id: string; count: bigint }[]
    >`
      SELECT m.chat_id, COUNT(*) AS count
      FROM messages m
      JOIN chat_members cm
        ON  cm.chat_id = m.chat_id
        AND cm.user_id = ${userId}
      WHERE m.sender_id != ${userId}
        AND m.created_at > COALESCE(cm.last_read_at, cm.joined_at)
      GROUP BY m.chat_id
    `;

    const unreadMap = new Map(
      unreadRows.map((r) => [r.chat_id, Number(r.count)]),
    );

    return chatMembers.map((cm) =>
      ChatsMapper.toDto(cm.chat, userId, unreadMap.get(cm.chatId) ?? 0),
    );
  }

  async getChatById(chatId: string, userId: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: {
          include: {
            user: {
              include: { profile: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    // Check if user is a member
    const isMember = chat.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this chat');
    }

    const member = chat.members.find((m) => m.userId === userId);

    // Calculate unread count
    const unreadCount = await this.prisma.message.count({
      where: {
        chatId,
        createdAt: {
          gt: member?.lastReadAt || member?.joinedAt || new Date(0),
        },
        senderId: { not: userId },
      },
    });

    return ChatsMapper.toDto(chat, userId, unreadCount);
  }

  async getUserChatIds(userId: string): Promise<string[]> {
    const chatMembers = await this.prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });

    return chatMembers.map((cm) => cm.chatId);
  }

  async getChatMemberIds(
    chatId: string,
    excludeUserId?: string,
  ): Promise<string[]> {
    const members = await this.prisma.chatMember.findMany({
      where: {
        chatId,
        ...(excludeUserId && { userId: { not: excludeUserId } }),
      },
      select: { userId: true },
    });

    return members.map((m) => m.userId);
  }

  async isChatMember(chatId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId },
      select: { userId: true },
    });
    return member !== null;
  }

  // ============================================
  // Create Chats
  // ============================================

  async createDirectChat(userId: string, dto: CreateDirectChatDto) {
    // Check if participant exists
    const participant = await this.prisma.user.findUnique({
      where: { id: dto.participantId },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    if (dto.participantId === userId) {
      throw new BadRequestException('Cannot create chat with yourself');
    }

    // Check if direct chat already exists between these users
    const existingChat = await this.prisma.chat.findFirst({
      where: {
        type: ChatType.direct,
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: dto.participantId } } },
        ],
      },
      include: {
        members: {
          include: {
            user: { include: { profile: true } },
          },
        },
      },
    });

    if (existingChat) {
      const member = existingChat.members.find((m) => m.userId === userId);
      const unreadCount = await this.prisma.message.count({
        where: {
          chatId: existingChat.id,
          createdAt: {
            gt: member?.lastReadAt || member?.joinedAt || new Date(0),
          },
          senderId: { not: userId },
        },
      });
      return ChatsMapper.toDto(existingChat, userId, unreadCount);
    }

    // Create new direct chat
    const chat = await this.prisma.chat.create({
      data: {
        type: ChatType.direct,
        createdBy: userId,
        members: {
          create: [
            { userId, role: ChatMemberRole.member },
            { userId: dto.participantId, role: ChatMemberRole.member },
          ],
        },
      },
      include: {
        members: {
          include: {
            user: { include: { profile: true } },
          },
        },
      },
    });

    const formattedChat = ChatsMapper.toDto(chat, userId, 0);

    // Emit event for real-time updates
    this.eventEmitter.emit('chat.created', {
      chat: formattedChat,
      userIds: [userId, dto.participantId],
    });

    return formattedChat;
  }

  async createGroup(userId: string, dto: CreateGroupDto) {
    // Validate all member IDs exist
    const users = await this.prisma.user.findMany({
      where: { id: { in: dto.memberIds } },
    });

    if (users.length !== dto.memberIds.length) {
      throw new BadRequestException('One or more users not found');
    }

    // Remove duplicates and add creator if not included
    const uniqueMemberIds = [...new Set([userId, ...dto.memberIds])];

    // Create group
    const chat = await this.prisma.chat.create({
      data: {
        type: ChatType.group,
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        createdBy: userId,
        members: {
          create: uniqueMemberIds.map((memberId) => ({
            userId: memberId,
            role:
              memberId === userId
                ? ChatMemberRole.admin
                : ChatMemberRole.member,
          })),
        },
      },
      include: {
        members: {
          include: {
            user: { include: { profile: true } },
          },
        },
      },
    });

    const formattedChat = ChatsMapper.toDto(chat, userId, 0);

    // Emit event for real-time updates
    this.eventEmitter.emit('chat.created', {
      chat: formattedChat,
      userIds: uniqueMemberIds,
    });

    return formattedChat;
  }

  // ============================================
  // Update Chat
  // ============================================

  async updateGroup(chatId: string, userId: string, dto: UpdateGroupDto) {
    await this.getChatWithMemberCheck(chatId, userId, true);

    const updated = await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      },
      include: {
        members: {
          include: {
            user: { include: { profile: true } },
          },
        },
      },
    });

    const member = updated.members.find((m) => m.userId === userId);
    const unreadCount = await this.prisma.message.count({
      where: {
        chatId,
        createdAt: {
          gt: member?.lastReadAt || member?.joinedAt || new Date(0),
        },
        senderId: { not: userId },
      },
    });

    return ChatsMapper.toDto(updated, userId, unreadCount);
  }

  // ============================================
  // Member Management
  // ============================================

  async addMember(chatId: string, userId: string, dto: AddMemberDto) {
    const chat = await this.getChatWithMemberCheck(chatId, userId, true);

    // Check if user to add exists
    const userToAdd = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!userToAdd) {
      throw new NotFoundException('User not found');
    }

    // Check if already a member
    const existingMember = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: dto.userId } },
    });

    if (existingMember) {
      throw new BadRequestException('User is already a member');
    }

    // Add member
    const member = await this.prisma.chatMember.create({
      data: {
        chatId,
        userId: dto.userId,
        role: dto.role || ChatMemberRole.member,
      },
      include: {
        user: { include: { profile: true } },
      },
    });

    const formattedMember = {
      id: member.id,
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt,
      user: {
        id: member.user.id,
        phone: member.user.phone,
        email: member.user.email,
        profile: member.user.profile
          ? {
              displayName: member.user.profile.displayName,
              avatarUrl: member.user.profile.avatarUrl,
            }
          : null,
      },
    };

    // Emit event to the new member to add the chat to their list
    // Ensure we fetch the updated chat state for the notification
    const updatedChat = await this.getChatById(chatId, dto.userId);
    this.eventEmitter.emit('chat.created', {
      chat: updatedChat,
      userIds: [dto.userId],
    });

    return formattedMember;
  }

  async removeMember(chatId: string, userId: string, memberUserId: string) {
    const chat = await this.getChatWithMemberCheck(chatId, userId, true);

    // Cannot remove yourself if you're the only admin
    if (memberUserId === userId) {
      const adminCount = chat.members.filter(
        (m) => m.role === ChatMemberRole.admin,
      ).length;
      if (adminCount === 1) {
        throw new BadRequestException(
          'Cannot leave group as the only admin. Promote another member first.',
        );
      }
    }

    // Check if member exists
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: memberUserId } },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    await this.prisma.chatMember.delete({
      where: { id: member.id },
    });

    return { success: true };
  }

  async leaveGroup(chatId: string, userId: string) {
    return this.removeMember(chatId, userId, userId);
  }

  async updateLastRead(chatId: string, userId: string) {
    await this.prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastReadAt: new Date() },
    });
  }

  // ============================================
  // Call History
  // ============================================

  async getCallHistory(
    userId: string,
    chatId?: string,
    cursor?: string,
    take = 20,
  ) {
    const messages = await this.prisma.message.findMany({
      where: {
        type: { in: ['missed_call', 'call_log'] },
        ...(chatId ? { chatId } : {}),
        chat: {
          members: {
            some: { userId },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        sender: { include: { profile: true } },
        chat: {
          include: {
            members: {
              include: {
                user: { include: { profile: true } },
              },
            },
          },
        },
      },
    });

    const hasMore = messages.length > take;
    const data = hasMore ? messages.slice(0, take) : messages;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor };
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async getChatWithMemberCheck(
    chatId: string,
    userId: string,
    requireAdmin = false,
  ) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: {
          include: {
            user: { include: { profile: true } },
          },
        },
      },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    const member = chat.members.find((m) => m.userId === userId);

    if (!member) {
      throw new ForbiddenException('You are not a member of this chat');
    }

    if (requireAdmin && member.role !== ChatMemberRole.admin) {
      throw new ForbiddenException('Only admins can perform this action');
    }

    return chat;
  }

  // formatChat removed — use ChatsMapper.toDto() instead
}
