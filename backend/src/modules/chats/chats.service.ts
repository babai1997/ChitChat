import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatType, ChatMemberRole } from '@prisma/client';
import { CreateDirectChatDto, CreateGroupDto, UpdateGroupDto, AddMemberDto } from './dto';

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

    return chatMembers.map((cm) => this.formatChat(cm.chat, userId, cm.lastReadAt));
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
    return this.formatChat(chat, userId, member?.lastReadAt || null);
  }

  async getUserChatIds(userId: string): Promise<string[]> {
    const chatMembers = await this.prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });

    return chatMembers.map((cm) => cm.chatId);
  }

  async getChatMemberIds(chatId: string, excludeUserId?: string): Promise<string[]> {
    const members = await this.prisma.chatMember.findMany({
      where: {
        chatId,
        ...(excludeUserId && { userId: { not: excludeUserId } }),
      },
      select: { userId: true },
    });

    return members.map((m) => m.userId);
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
      return this.formatChat(existingChat, userId, member?.lastReadAt || null);
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

    const formattedChat = this.formatChat(chat, userId, null);
    
    // Emit event for real-time updates
    this.eventEmitter.emit('chat.created', { chat: formattedChat, userIds: [userId, dto.participantId] });

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
            role: memberId === userId ? ChatMemberRole.admin : ChatMemberRole.member,
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

    const formattedChat = this.formatChat(chat, userId, null);

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
    const chat = await this.getChatWithMemberCheck(chatId, userId, true);

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

    return this.formatChat(updated, userId, null);
  }

  // ============================================
  // Member Management
  // ============================================

  async addMember(chatId: string, userId: string, dto: AddMemberDto) {
    await this.getChatWithMemberCheck(chatId, userId, true);

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
    const updatedChat = await this.getChatById(chatId, dto.userId);
    this.eventEmitter.emit('chat.created', {
      chat: updatedChat,
      userIds: [dto.userId],
    });
    
    // Ideally we would also emit 'chat.member_added' to the group
    // this.eventEmitter.emit('chat.member_added', { chatId, member: formattedMember });

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

  private formatChat(
    chat: {
      id: string;
      type: ChatType;
      name: string | null;
      avatarUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
      members: Array<{
        id: string;
        userId: string;
        role: ChatMemberRole;
        joinedAt: Date;
        lastReadAt: Date | null;
        user: {
          id: string;
          phone: string | null;
          email: string | null;
          profile: {
            displayName: string | null;
            avatarUrl: string | null;
            isOnline: boolean;
          } | null;
        };
      }>;
      messages?: Array<{
        id: string;
        content: string | null;
        type: string;
        createdAt: Date;
        senderId: string;
        sender?: {
          id: string;
          profile: {
            displayName: string | null;
          } | null;
        };
      }>;
    },
    currentUserId: string,
    lastReadAt: Date | null,
  ) {
    const lastMessage = chat.messages?.[0];
    const otherMembers = chat.members.filter((m) => m.userId !== currentUserId);

    // For direct chats, use the other user's info
    let displayName = chat.name;
    let avatarUrl = chat.avatarUrl;

    if (chat.type === ChatType.direct && otherMembers.length > 0) {
      const otherUser = otherMembers[0];
      displayName =
        otherUser.user.profile?.displayName ||
        otherUser.user.phone ||
        otherUser.user.email ||
        'Unknown';
      avatarUrl = otherUser.user.profile?.avatarUrl || null;
    }

    // Count unread messages
    let unreadCount = 0;
    if (lastReadAt && lastMessage) {
      // In a real app, you'd count messages after lastReadAt
      unreadCount = lastMessage.createdAt > lastReadAt ? 1 : 0;
    }

    return {
      id: chat.id,
      type: chat.type,
      name: displayName,
      avatarUrl,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      unreadCount,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            type: lastMessage.type,
            createdAt: lastMessage.createdAt,
            senderId: lastMessage.senderId,
            senderName: lastMessage.sender?.profile?.displayName || 'Unknown',
          }
        : null,
      members: chat.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: {
          id: m.user.id,
          phone: m.user.phone,
          email: m.user.email,
          profile: m.user.profile
            ? {
                displayName: m.user.profile.displayName,
                avatarUrl: m.user.profile.avatarUrl,
                isOnline: m.user.profile.isOnline,
              }
            : null,
        },
      })),
    };
  }
}
