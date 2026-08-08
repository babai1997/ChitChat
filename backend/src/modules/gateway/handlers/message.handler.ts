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
  deviceId?: string;
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
        isEncrypted,
        ciphers,
        groupCiphertext,
      } = data;
      const senderId = socket.user.id;
      // A group Sender Key message carries ONE shared ciphertext for every
      // recipient (see messages.service.ts's create()) — the mapper already
      // puts it on `message.cipher` for us, so it can broadcast through the
      // same plain-room-emit path as plaintext below, unlike a direct
      // message's genuinely-per-device ciphers.
      const isGroupMessage = isEncrypted && !!groupCiphertext;

      this.logger.debug(
        `[handleSend] Receiving attachments: ${JSON.stringify(data.attachments)}`,
      );
      const { dto: message, ciphers: resolvedCiphers } =
        await this.messagesService.create(
          {
            chatId,
            senderId,
            content,
            type,
            replyToId,
            attachments: data.attachments,
            isEncrypted,
            senderDeviceId: socket.deviceId,
            ciphers,
            groupCiphertext,
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

      // Deliver MESSAGE_NEW. Plaintext AND group-encrypted messages broadcast
      // the SAME payload to every member — a group Sender Key message's
      // ciphertext is identical for everyone (mapper already put it on
      // `message.cipher`), so there's no per-device split needed, same as
      // plaintext. Direct-chat encrypted messages fan out per DEVICE instead:
      // `resolvedCiphers` tells us exactly which (userId, deviceId) pairs the
      // sender addressed (their recipients' and their own other devices), so
      // each one gets only its own ciphertext — no other device, including
      // the server, ever sees another device's copy.
      const allMemberIds = await this.chatsService.getChatMemberIds(chatId);
      if (isEncrypted && !isGroupMessage) {
        resolvedCiphers.forEach(({ userId, deviceId, ciphertext }) => {
          this.registry.emitToDevice(
            userId,
            deviceId,
            SOCKET_EVENTS.MESSAGE_NEW,
            {
              // senderDeviceId is already on `message` — persisted via
              // create()'s data.senderDeviceId, not just this live payload,
              // so a later history fetch/reconnect resolves the same way.
              ...message,
              cipher: ciphertext,
              tempId,
            },
          );
        });
      } else {
        allMemberIds.forEach((memberId) => {
          this.registry.emitToUser(memberId, SOCKET_EVENTS.MESSAGE_NEW, {
            ...message,
            tempId,
          });
        });
      }
      this.logger.log(
        `[MSG_NEW] msgId=${message.id} members=${allMemberIds.join(',')} online=${allMemberIds.filter((id) => this.registry.isOnline(id)).join(',')}`,
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
        const senderName = socket.user.profile?.displayName ?? 'Someone';
        // Encrypted messages: the server never has plaintext to preview, so
        // push notifications fall back to a generic body — a permanent,
        // accepted trade-off of E2EE, not a temporary gap (see E2EE_PLAN.md).
        const contentPreview = isEncrypted
          ? 'New message'
          : this.getContentPreview(type, content!);
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
      case MessageType.image:
        return '📷 Photo';
      case MessageType.audio:
        return '🎤 Voice message';
      case MessageType.video:
        return '🎬 Video';
      case MessageType.file:
        return '📎 File';
      default:
        return content.length > 100 ? content.slice(0, 100) + '…' : content;
    }
  }
}
