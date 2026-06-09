import { Injectable, Logger } from '@nestjs/common';
import { ChatsService } from '../../chats/chats.service';
import { MessagesService } from '../../messages/messages.service';
import { SocketRegistryService } from '../services/socket-registry.service';
import { SOCKET_EVENTS } from '../../../shared/constants/socket-events';
import { MessageType } from '@prisma/client';

interface AuthSocket {
  id: string;
  user: {
    id: string;
    profile?: { displayName?: string | null; avatarUrl?: string | null } | null;
  };
  to: (room: string) => { emit: (event: string, data: unknown) => void };
  emit: (event: string, data: unknown) => void;
}

interface Server {
  to: (room: string) => { emit: (event: string, data: unknown) => void };
}

@Injectable()
export class CallHandler {
  private readonly logger = new Logger(CallHandler.name);
  private server: Server;

  constructor(
    private readonly chatsService: ChatsService,
    private readonly messagesService: MessagesService,
    private readonly registry: SocketRegistryService,
  ) {}

  setServer(server: Server) {
    this.server = server;
  }

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

    this.logger.log(
      `[Call] ${sender.id} started ${type} call in chat ${chatId}`,
    );
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
    data: {
      targetUserId: string;
      type: 'offer' | 'answer' | 'candidate';
      signal: unknown;
      chatId: string;
    },
  ) {
    const { targetUserId, type, signal, chatId } = data;
    const senderId = socket.user.id;

    this.logger.log(
      `[Call] Signal ${type} from ${senderId} → ${targetUserId} (chat ${chatId})`,
    );

    this.registry.emitToUser(targetUserId, SOCKET_EVENTS.CALL_SIGNAL, {
      senderId,
      type,
      signal,
      chatId,
    });
  }

  handleCallReject(
    socket: AuthSocket,
    data: { chatId: string; callerId: string },
  ) {
    const { chatId, callerId } = data;
    const rejectorId = socket.user.id;

    this.logger.log(
      `[Call] User ${rejectorId} rejected call from ${callerId} in chat ${chatId}`,
    );

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

  /**
   * Called when the outgoing call timer expires on the caller's side (no one answered).
   *
   * Responsibilities:
   * 1. Tell callee(s) to stop ringing (dismiss the incoming call UI)
   * 2. Persist a "Missed call" message in the chat for both sides to see
   * 3. Broadcast that message via MESSAGE_NEW so it appears in real-time
   */
  async handleCallMissed(
    socket: AuthSocket,
    data: { chatId: string; type: 'audio' | 'video' },
  ) {
    const { chatId, type } = data;
    const callerId = socket.user.id;

    this.logger.log(
      `[Call] Missed ${type} call from ${callerId} in chat ${chatId}`,
    );

    // 1. Stop ringing on all callee devices
    const memberIds = await this.chatsService.getChatMemberIds(chatId);
    const recipientIds = memberIds.filter((id) => id !== callerId);
    recipientIds.forEach((recipientId) => {
      this.registry.emitToUser(recipientId, SOCKET_EVENTS.CALL_MISSED, {
        chatId,
        callerId,
        type,
      });
    });

    // 2. Persist a "Missed call" system message authored by the caller
    const label = type === 'video' ? 'Missed video call' : 'Missed audio call';
    const missedMsg = await this.messagesService.createSystemMessage(
      chatId,
      callerId,
      label,
      MessageType.missed_call,
    );

    // 3. Broadcast it to the chat room so it appears in real-time for everyone
    if (this.server) {
      this.server
        .to(`chat:${chatId}`)
        .emit(SOCKET_EVENTS.MESSAGE_NEW, missedMsg);
    }
  }
}
