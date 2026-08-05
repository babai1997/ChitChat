import { Injectable, Logger, HttpException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { MessagesService } from '../../messages/messages.service';
import { ChatsService } from '../../chats/chats.service';
import { SocketRegistryService } from '../services/socket-registry.service';
import { PushService } from '../../push/push.service';
import { SOCKET_EVENTS } from '../../../shared/constants/socket-events';
import { SendMessageDto, ReadMessagesDto } from '../dto';
import { MessageType } from '@prisma/client';

interface AuthSocket {
  id: string;
  user: { id: string; profile?: { displayName?: string | null } | null };
  emit: (event: string, data: unknown) => void;
  to: (room: string) => { emit: (event: string, data: unknown) => void };
}

@Injectable()
export class MessageHandler {
  private readonly logger = new Logger(MessageHandler.name);
  private server: Server;

  constructor(
    private readonly messagesService: MessagesService,
    private readonly chatsService: ChatsService,
    private readonly registry: SocketRegistryService,
    private readonly pushService: PushService,
  ) {}

  setServer(server: Server) {
    this.server = server;
  }

  async handleSend(socket: AuthSocket, data: SendMessageDto) {
    try {
      const {
        chatId,
        content,
        type = MessageType.text,
        tempId,
        replyToId,
      } = data;
      const senderId = socket.user.id;

      this.logger.debug(
        `[handleSend] Receiving attachments: ${JSON.stringify(data.attachments)}`,
      );
      const message = await this.messagesService.create(
        {
          chatId,
          senderId,
          content,
          type,
          replyToId,
          attachments: data.attachments,
        },
        { emitEvent: false },
      );
      this.logger.debug(
        `[handleSend] Created message with attachments: ${JSON.stringify(message.attachments)}`,
      );

      // Notify sender: temp → real message mapping
      socket.emit(SOCKET_EVENTS.MESSAGE_SENT, {
        tempId,
        message: { ...message, status: 'sent' },
      });

      // Deliver MESSAGE_NEW directly to each member via the registry instead of
      // broadcasting to a room. This makes delivery independent of socket room
      // membership — CHAT_LEAVE / socket.leave() can no longer break it.
      const allMemberIds = await this.chatsService.getChatMemberIds(chatId);
      allMemberIds.forEach((memberId) => {
        this.registry.emitToUser(memberId, SOCKET_EVENTS.MESSAGE_NEW, {
          ...message,
          tempId,
        });
      });
      this.logger.log(
        `[MSG_NEW] msgId=${message.id} members=${allMemberIds.join(',')} online=${allMemberIds.filter(id => this.registry.isOnline(id)).join(',')}`,
      );

      // Mark as delivered for currently online recipients (excludes sender)
      const recipientIds = allMemberIds.filter((id) => id !== senderId);
      const onlineRecipients = recipientIds.filter((id) =>
        this.registry.isOnline(id),
      );

      if (onlineRecipients.length > 0) {
        await this.messagesService.updateStatus(message.id, 'delivered' as any);
        socket.emit(SOCKET_EVENTS.MESSAGE_DELIVERED, {
          messageId: message.id,
          chatId,
          tempId,
          deliveredTo: onlineRecipients,
        });
      }

      // Push notification for offline recipients
      const offlineRecipients = recipientIds.filter(
        (id) => !this.registry.isOnline(id),
      );
      if (offlineRecipients.length > 0) {
        const senderName =
          socket.user.profile?.displayName ?? 'Someone';
        const contentPreview = this.getContentPreview(type, content);
        await Promise.allSettled(
          offlineRecipients.map((id) =>
            this.pushService.sendMessagePush(id, {
              messageId: message.id,
              chatId,
              chatName: senderName,
              senderId,
              senderName,
              messageType: type as any,
              content: contentPreview,
            }),
          ),
        );
      }

      return { success: true, messageId: message.id };
    } catch (error) {
      this.logger.error('Error sending message:', error);
      // Preserve specific, client-facing validation messages (e.g. "not a
      // member", "cannot reply to a message outside this chat") instead of
      // flattening every failure into the same generic string.
      const errorMessage =
        error instanceof HttpException
          ? error.message
          : 'Failed to send message';
      throw new WsException(errorMessage);
    }
  }

  async handleRead(socket: AuthSocket, data: ReadMessagesDto) {
    try {
      const userId = socket.user.id;
      const { chatId, messageIds } = data;

      // Always update lastReadAt (clears unread badge on refresh).
      // If messageIds is empty, this acts as a "mark chat opened" signal.
      await this.chatsService.updateLastRead(chatId, userId);

      if (messageIds && messageIds.length > 0) {
        await this.messagesService.markAsRead(messageIds, userId);
        this.server.to(`chat:${chatId}`).emit(SOCKET_EVENTS.MESSAGE_READ_ACK, {
          chatId,
          messageIds,
          readBy: userId,
          readAt: new Date(),
        });
      }

      return { success: true };
    } catch {
      throw new WsException('Failed to mark messages as read');
    }
  }

  async handleDelete(
    socket: AuthSocket,
    data: { messageId: string; chatId: string; deleteForEveryone: boolean },
  ) {
    try {
      const { messageId, chatId, deleteForEveryone } = data;
      const userId = socket.user.id;

      const result = await this.messagesService.deleteMessage(
        messageId,
        userId,
        deleteForEveryone,
      );

      if (deleteForEveryone && result.success) {
        this.server.to(`chat:${chatId}`).emit(SOCKET_EVENTS.MESSAGE_DELETED, {
          messageId,
          chatId,
          deleteForEveryone: true,
        });
      }

      return result;
    } catch (error) {
      throw new WsException(error.message || 'Failed to delete message');
    }
  }

  async handleEdit(
    socket: AuthSocket,
    data: { messageId: string; chatId: string; content: string },
  ) {
    try {
      const { messageId, chatId, content } = data;
      const userId = socket.user.id;

      const result = await this.messagesService.editMessage(
        messageId,
        userId,
        content,
      );

      if (result.success && result.message) {
        this.server.to(`chat:${chatId}`).emit(SOCKET_EVENTS.MESSAGE_EDITED, {
          messageId,
          chatId,
          message: result.message,
        });
      }

      return result;
    } catch (error) {
      throw new WsException(error.message || 'Failed to edit message');
    }
  }

  private getContentPreview(type: MessageType, content: string): string {
    switch (type) {
      case MessageType.image: return '📷 Photo';
      case MessageType.audio: return '🎤 Voice message';
      case MessageType.video: return '🎬 Video';
      case MessageType.file:  return '📎 File';
      default: return content.length > 100 ? content.slice(0, 100) + '…' : content;
    }
  }
}
