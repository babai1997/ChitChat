import { Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { MessagesService } from '../../messages/messages.service';
import { ChatsService } from '../../chats/chats.service';
import { SocketRegistryService } from '../services/socket-registry.service';
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
  ) {}

  setServer(server: Server) {
    this.server = server;
  }

  async handleSend(socket: AuthSocket, data: SendMessageDto) {
    try {
      const { chatId, content, type = MessageType.text, tempId, replyToId } = data;
      const senderId = socket.user.id;

      // Persist message
      const message = await this.messagesService.create({
        chatId,
        senderId,
        content,
        type,
        replyToId,
      }, { emitEvent: false });

      // Notify sender: temp → real message mapping
      socket.emit(SOCKET_EVENTS.MESSAGE_SENT, {
        tempId,
        message: { ...message, status: 'sent' },
      });

      // Broadcast to room (all participants including sender)
      this.server.to(`chat:${chatId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, {
        ...message,
        tempId,
      });

      // Mark as delivered for currently online recipients
      const recipientIds = await this.chatsService.getChatMemberIds(chatId, senderId);
      const onlineRecipients = recipientIds.filter((id) => this.registry.isOnline(id));

      if (onlineRecipients.length > 0) {
        await this.messagesService.updateStatus(message.id, 'delivered' as any);
        socket.emit(SOCKET_EVENTS.MESSAGE_DELIVERED, {
          messageId: message.id,
          chatId,
          tempId,
          deliveredTo: onlineRecipients,
        });
      }

      return { success: true, messageId: message.id };
    } catch (error) {
      this.logger.error('Error sending message:', error);
      throw new WsException('Failed to send message');
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

      const result = await this.messagesService.deleteMessage(messageId, userId, deleteForEveryone);

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

      const result = await this.messagesService.editMessage(messageId, userId, content);

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
}
