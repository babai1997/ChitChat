import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
    // (removed import)
import { PrismaService } from '../../prisma/prisma.service';
import { MessageType, MessageStatus, Prisma } from '@prisma/client';
import { CreateMessageDto, MessageQueryDto } from './dto';

interface CreateMessageData {
  chatId: string;
  senderId: string;
  content: string;
  type?: MessageType;
  replyToId?: string;
  attachments?: {
    filename: string;
    url: string;
    mimetype: string;
    size: number;
  }[];
}

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ============================================
  // Get Messages
  // ============================================

  async getMessages(chatId: string, userId: string, query: MessageQueryDto) {
    // Verify user is a member of the chat
    const membership = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this chat');
    }

    const limit = query.limit || 50;
    const direction = query.direction || 'before';

    let cursor: Prisma.MessageWhereInput = {};

    if (query.cursor) {
      // Find the cursor message to get its createdAt
      const cursorMessage = await this.prisma.message.findUnique({
        where: { id: query.cursor },
      });

      if (cursorMessage) {
        cursor = {
          createdAt:
            direction === 'before'
              ? { lt: cursorMessage.createdAt }
              : { gt: cursorMessage.createdAt },
        };
      }
    }

    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        ...cursor,
      },
      orderBy: { createdAt: direction === 'before' ? 'desc' : 'asc' },
      take: limit + 1, // Fetch one extra to check if there are more
      include: {
        sender: {
          include: { profile: true },
        },
        replyTo: {
          include: {
            sender: {
              include: { profile: true },
            },
          },
        },
        attachments: true,
      },
    });

    const hasMore = messages.length > limit;
    const messageList = hasMore ? messages.slice(0, limit) : messages;

    // Reverse if fetching before (we query desc but display asc)
    if (direction === 'before') {
      messageList.reverse();
    }

    const formattedMessages = messageList.map((m) => this.formatMessage(m));

    const nextCursor =
      hasMore && messageList.length > 0
        ? direction === 'before'
          ? messageList[0].id
          : messageList[messageList.length - 1].id
        : null;

    const prevCursor =
      messageList.length > 0
        ? direction === 'before'
          ? messageList[messageList.length - 1].id
          : messageList[0].id
        : null;

    return {
      messages: formattedMessages,
      nextCursor,
      prevCursor,
      hasMore,
    };
  }

  // ============================================
  // Create Message
  // ============================================

  async create(data: CreateMessageData) {
    // Verify sender is a member
    const membership = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: data.chatId, userId: data.senderId } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this chat');
    }

    // Create message with attachments
    const message = await this.prisma.message.create({
      data: {
        chatId: data.chatId,
        senderId: data.senderId,
        content: data.content,
        type: data.type || MessageType.text,
        status: MessageStatus.sent,
        replyToId: data.replyToId,
        attachments: data.attachments?.length
          ? {
              create: data.attachments.map((file) => ({
                fileName: file.filename,
                url: file.url,
                fileType: file.mimetype,
                fileSize: file.size,
              })),
            }
          : undefined,
      },
      include: {
        sender: {
          include: { profile: true },
        },
        replyTo: {
          include: {
            sender: {
              include: { profile: true },
            },
          },
        },
        attachments: true,
      },
    });

    // Update chat's updatedAt
    await this.prisma.chat.update({
      where: { id: data.chatId },
      data: { updatedAt: new Date() },
    });

    const formattedMessage = this.formatMessage(message);
    
    // Emit event for real-time updates
    this.eventEmitter.emit('message.created', formattedMessage);

    return formattedMessage;
  }

  // ============================================
  // Message Status
  // ============================================

  async updateStatus(messageId: string, status: MessageStatus) {
    const message = await this.prisma.message.update({
      where: { id: messageId },
      data: { status },
    });

    return message;
  }

  async markAsDelivered(messageIds: string[]) {
    await this.prisma.message.updateMany({
      where: {
        id: { in: messageIds },
        status: MessageStatus.sent,
      },
      data: { status: MessageStatus.delivered },
    });
  }

  async markAllAsDeliveredForChats(chatIds: string[], userId: string) {
    // Find messages to update
    const pendingMessages = await this.prisma.message.findMany({
      where: {
        chatId: { in: chatIds },
        senderId: { not: userId },
        status: MessageStatus.sent,
      },
      select: { id: true, senderId: true, chatId: true },
    });

    if (pendingMessages.length === 0) return [];

    const messageIds = pendingMessages.map((m) => m.id);

    // Update status
    await this.prisma.message.updateMany({
      where: { id: { in: messageIds } },
      data: { status: MessageStatus.delivered },
    });

    return pendingMessages;
  }

  async markAsRead(messageIds: string[], userId: string) {
    // Only mark messages from other users as read
    await this.prisma.message.updateMany({
      where: {
        id: { in: messageIds },
        senderId: { not: userId },
        status: { not: MessageStatus.read },
      },
      data: { status: MessageStatus.read },
    });
  }

  async getUndeliveredMessages(chatId: string, userId: string) {
    // Get messages that were sent while user was offline
    const membership = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!membership || !membership.lastReadAt) {
      return [];
    }

    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        senderId: { not: userId },
        createdAt: { gt: membership.lastReadAt },
      },
      include: {
        sender: { include: { profile: true } },
        attachments: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map((m) => this.formatMessage(m));
  }

  // ============================================
  // Helper Methods
  // ============================================

  private formatMessage(message: {
    id: string;
    chatId: string;
    senderId: string;
    content: string | null;
    type: MessageType;
    status: MessageStatus;
    createdAt: Date;
    updatedAt: Date;
    sender: {
      id: string;
      phone: string | null;
      email: string | null;
      profile: {
        displayName: string | null;
        avatarUrl: string | null;
      } | null;
    };
    replyTo?: {
      id: string;
      content: string | null;
      sender: {
        id: string;
        profile: {
          displayName: string | null;
        } | null;
      };
    } | null;
    attachments: Array<{
      id: string;
      fileName: string;
      fileType: string;
      fileSize: bigint;
      url: string;
    }>;
  }) {
    return {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      content: message.content,
      type: message.type,
      status: message.status,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      sender: {
        id: message.sender.id,
        displayName:
          message.sender.profile?.displayName ||
          message.sender.phone ||
          message.sender.email ||
          'Unknown',
        avatarUrl: message.sender.profile?.avatarUrl,
      },
      replyTo: message.replyTo
        ? {
            id: message.replyTo.id,
            content: message.replyTo.content,
            senderName:
              message.replyTo.sender.profile?.displayName || 'Unknown',
          }
        : null,
      attachments: message.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        fileType: a.fileType,
        fileSize: Number(a.fileSize),
        url: a.url,
      })),
    };
  }
}
