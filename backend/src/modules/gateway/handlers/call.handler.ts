import { Injectable, Logger } from '@nestjs/common';
import { ChatsService } from '../../chats/chats.service';
import { SocketRegistryService } from '../services/socket-registry.service';
import { SOCKET_EVENTS } from '../../../shared/constants/socket-events';

interface AuthSocket {
  id: string;
  user: { id: string; profile?: { displayName?: string | null; avatarUrl?: string | null } | null };
  to: (room: string) => { emit: (event: string, data: unknown) => void };
  emit: (event: string, data: unknown) => void;
}

@Injectable()
export class CallHandler {
  private readonly logger = new Logger(CallHandler.name);

  constructor(
    private readonly chatsService: ChatsService,
    private readonly registry: SocketRegistryService,
  ) {}

  async handleCallStart(
    socket: AuthSocket,
    data: { chatId: string; offer: unknown; type: 'video' | 'audio' },
  ) {
    const { chatId, offer, type } = data;
    const sender = socket.user;

    const memberIds = await this.chatsService.getChatMemberIds(chatId);
    const recipientIds = memberIds.filter((id) => id !== sender.id);

    recipientIds.forEach((recipientId) => {
      this.registry.emitToUser(recipientId, SOCKET_EVENTS.CALL_INCOMING, {
        chatId,
        callerId: sender.id,
        callerName: sender.profile?.displayName || 'Unknown',
        callerAvatar: sender.profile?.avatarUrl,
        offer,
        type,
      });
    });

    this.logger.log(`[Call] ${sender.id} started ${type} call in chat ${chatId}`);
  }

  /**
   * Receiver joins the call room.
   * Existing participants receive CALL_USER_JOINED and initiate WebRTC peer connections.
   */
  handleCallJoin(socket: AuthSocket, data: { chatId: string }) {
    const { chatId } = data;
    const userId = socket.user.id;

    this.logger.log(`[Call] User ${userId} joined call in chat ${chatId}`);

    // Notify everyone else in the chat so they can initiate an offer to the new joiner
    socket.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_USER_JOINED, {
      userId,
      chatId,
    });
  }

  /**
   * Routes WebRTC signals (offer / answer / ICE candidates) between peers.
   * Uses targetUserId for direct routing — avoids broadcasting to unintended recipients.
   */
  handleCallSignal(
    socket: AuthSocket,
    data: { targetUserId: string; type: 'offer' | 'answer' | 'candidate'; signal: unknown; chatId: string },
  ) {
    const { targetUserId, type, signal, chatId } = data;
    const senderId = socket.user.id;

    this.logger.log(`[Call] Signal ${type} from ${senderId} → ${targetUserId} (chat ${chatId})`);

    this.registry.emitToUser(targetUserId, SOCKET_EVENTS.CALL_SIGNAL, {
      senderId,
      type,
      signal,
      chatId,
    });
  }

  handleCallReject(socket: AuthSocket, data: { chatId: string; callerId: string }) {
    const { chatId, callerId } = data;
    const rejectorId = socket.user.id;

    this.logger.log(`[Call] User ${rejectorId} rejected call from ${callerId} in chat ${chatId}`);

    this.registry.emitToUser(callerId, SOCKET_EVENTS.CALL_REJECTED, {
      chatId,
      rejectorId,
      rejectorName: socket.user.profile?.displayName || 'Unknown',
    });
  }

  handleCallEnd(socket: AuthSocket, data: { chatId: string }) {
    const { chatId } = data;
    const senderId = socket.user.id;

    this.logger.log(`[Call] User ${senderId} ended call in chat ${chatId}`);

    // Notify everyone else in the room that this participant left
    socket.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_ENDED, {
      chatId,
      enderId: senderId,
    });
  }
}
