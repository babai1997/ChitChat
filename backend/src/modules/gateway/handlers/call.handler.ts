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

interface ActiveCall {
  type: 'audio' | 'video';
  callerId: string;
  callerName: string;
  /** Set of userIds currently connected in this call. */
  participantUserIds: Set<string>;
}

@Injectable()
export class CallHandler {
  private readonly logger = new Logger(CallHandler.name);
  private server: Server;
  /** In-memory registry of currently active calls, keyed by chatId. */
  private readonly activeCalls = new Map<string, ActiveCall>();

  constructor(
    private readonly chatsService: ChatsService,
    private readonly messagesService: MessagesService,
    private readonly registry: SocketRegistryService,
  ) {}

  setServer(server: Server) {
    this.server = server;
  }

  getActiveCall(chatId: string) {
    const call = this.activeCalls.get(chatId);
    if (!call) return null;
    return { ...call, participantCount: call.participantUserIds.size };
  }

  async handleCallStart(
    socket: AuthSocket,
    data: { chatId: string; offer: unknown; type: 'video' | 'audio' },
  ) {
    const { chatId, offer, type } = data;
    const sender = socket.user;

    const memberIds = await this.chatsService.getChatMemberIds(chatId);

    if (!memberIds.includes(sender.id)) {
      this.logger.warn(
        `[Call] Unauthorized call attempt by ${sender.id} in chat ${chatId}`,
      );
      socket.emit('error', { message: 'You are not a member of this chat' });
      return;
    }

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

    // Tell the caller how many people are ringing so the client can track
    // rejections correctly and only end the call when ALL have declined.
    socket.emit(SOCKET_EVENTS.CALL_RINGING, {
      chatId,
      recipientCount: recipientIds.length,
    });

    // Track this as an active call. The banner (CALL_ONGOING) is only broadcast
    // once a second participant joins — a call with 1 person is not yet "active".
    this.activeCalls.set(chatId, {
      type,
      callerId: sender.id,
      callerName: sender.profile?.displayName || 'Unknown',
      participantUserIds: new Set([sender.id]),
    });

    this.logger.log(
      `[Call] ${sender.id} started ${type} call in chat ${chatId}`,
    );
  }

  /**
   * Receiver joins the call room.
   * Existing participants receive CALL_USER_JOINED and initiate WebRTC peer connections.
   */
  async handleCallJoin(socket: AuthSocket, data: { chatId: string }) {
    const { chatId } = data;
    const userId = socket.user.id;

    if (!(await this.chatsService.isChatMember(chatId, userId))) {
      this.logger.warn(
        `[Call] Unauthorized join attempt by ${userId} in chat ${chatId}`,
      );
      socket.emit('error', { message: 'You are not a member of this chat' });
      return;
    }

    this.logger.log(`[Call] User ${userId} joined call in chat ${chatId}`);

    // Notify everyone else in the chat so they can initiate an offer to the new joiner
    socket.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_USER_JOINED, {
      userId,
      chatId,
    });

    // Update participant set. Broadcast banner once ≥2 people are connected.
    const active = this.activeCalls.get(chatId);
    if (active) {
      active.participantUserIds.add(userId);
      const count = active.participantUserIds.size;
      if (this.server) {
        this.server.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_ONGOING, {
          chatId,
          type: active.type,
          callerName: active.callerName,
          participantCount: count,
        });
      }
    }
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

  async handleCallReject(
    socket: AuthSocket,
    data: { chatId: string; callerId: string },
  ) {
    const { chatId, callerId } = data;
    const rejectorId = socket.user.id;

    if (!(await this.chatsService.isChatMember(chatId, rejectorId))) {
      this.logger.warn(
        `[Call] Unauthorized reject attempt by ${rejectorId} in chat ${chatId}`,
      );
      socket.emit('error', { message: 'You are not a member of this chat' });
      return;
    }

    this.logger.log(
      `[Call] User ${rejectorId} rejected call from ${callerId} in chat ${chatId}`,
    );

    this.registry.emitToUser(callerId, SOCKET_EVENTS.CALL_REJECTED, {
      chatId,
      rejectorId,
      rejectorName: socket.user.profile?.displayName || 'Unknown',
    });
  }

  /**
   * Invite a chat member to join an ongoing call.
   * Emits CALL_INCOMING to the target — they answer just like a normal incoming call.
   */
  async handleAddToCall(
    socket: AuthSocket,
    data: { chatId: string; targetUserId: string; type: 'audio' | 'video' },
  ) {
    const { chatId, targetUserId, type } = data;
    const sender = socket.user;

    const memberIds = await this.chatsService.getChatMemberIds(chatId);
    if (!memberIds.includes(sender.id)) {
      socket.emit('error', { message: 'You are not a member of this chat' });
      return;
    }
    if (!memberIds.includes(targetUserId)) {
      socket.emit('error', {
        message: 'Target user is not a member of this chat',
      });
      return;
    }

    this.logger.log(
      `[Call] ${sender.id} invited ${targetUserId} to join call in chat ${chatId}`,
    );

    this.registry.emitToUser(targetUserId, SOCKET_EVENTS.CALL_INCOMING, {
      chatId,
      callerId: sender.id,
      callerName: sender.profile?.displayName || 'Unknown',
      callerAvatar: sender.profile?.avatarUrl,
      type,
    });
  }

  handleCallVideoState(
    socket: AuthSocket,
    data: { chatId: string; videoEnabled: boolean },
  ) {
    const { chatId, videoEnabled } = data;
    socket.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_VIDEO_STATE, {
      senderId: socket.user.id,
      videoEnabled,
    });
  }

  handleCallAudioState(
    socket: AuthSocket,
    data: { chatId: string; isMuted: boolean },
  ) {
    const { chatId, isMuted } = data;
    socket.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_AUDIO_STATE, {
      senderId: socket.user.id,
      isMuted,
    });
  }

  handleScreenShareStart(socket: AuthSocket, data: { chatId: string }) {
    const { chatId } = data;
    const userId = socket.user.id;
    this.logger.log(
      `[Call] User ${userId} started screen share in chat ${chatId}`,
    );
    socket.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_SCREEN_SHARING, {
      userId,
      chatId,
    });
  }

  handleScreenShareStop(socket: AuthSocket, data: { chatId: string }) {
    const { chatId } = data;
    const userId = socket.user.id;
    this.logger.log(
      `[Call] User ${userId} stopped screen share in chat ${chatId}`,
    );
    socket.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_SCREEN_STOPPED, {
      userId,
      chatId,
    });
  }

  async handleCallEnd(socket: AuthSocket, data: { chatId: string }) {
    const { chatId } = data;
    const senderId = socket.user.id;

    if (!(await this.chatsService.isChatMember(chatId, senderId))) {
      this.logger.warn(
        `[Call] Unauthorized end attempt by ${senderId} in chat ${chatId}`,
      );
      socket.emit('error', { message: 'You are not a member of this chat' });
      return;
    }

    this.logger.log(`[Call] User ${senderId} ended call in chat ${chatId}`);

    // Notify everyone else in the room that this participant left
    socket.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_ENDED, {
      chatId,
      enderId: senderId,
    });

    // Remove user from the active set. Emit CALL_FINISHED when fewer than 2 remain.
    const active = this.activeCalls.get(chatId);
    if (active) {
      active.participantUserIds.delete(senderId);
      const count = active.participantUserIds.size;
      if (count <= 1) {
        this.activeCalls.delete(chatId);
        if (this.server) {
          this.server
            .to(`chat:${chatId}`)
            .emit(SOCKET_EVENTS.CALL_FINISHED, { chatId });
        }
      } else {
        if (this.server) {
          this.server.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_ONGOING, {
            chatId,
            type: active.type,
            callerName: active.callerName,
            participantCount: count,
          });
        }
      }
    }
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

    if (!memberIds.includes(callerId)) {
      this.logger.warn(
        `[Call] Unauthorized missed-call attempt by ${callerId} in chat ${chatId}`,
      );
      socket.emit('error', { message: 'You are not a member of this chat' });
      return;
    }

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

    // 4. Clean up the active-call registry — nobody answered so the call is over.
    //    Remove the entry and broadcast CALL_FINISHED so any "Tap to join" banners disappear.
    if (this.activeCalls.has(chatId)) {
      this.activeCalls.delete(chatId);
      if (this.server) {
        this.server
          .to(`chat:${chatId}`)
          .emit(SOCKET_EVENTS.CALL_FINISHED, { chatId });
      }
    }
  }

  /**
   * Called on socket disconnect. Removes the user from any call they were in
   * so the participant count stays accurate even when the app crashes or loses
   * connection without emitting CALL_END.
   */
  handleUserDisconnect(userId: string) {
    for (const [chatId, active] of this.activeCalls.entries()) {
      if (!active.participantUserIds.has(userId)) continue;

      active.participantUserIds.delete(userId);
      const count = active.participantUserIds.size;

      if (count <= 1) {
        this.activeCalls.delete(chatId);
        if (this.server) {
          this.server
            .to(`chat:${chatId}`)
            .emit(SOCKET_EVENTS.CALL_FINISHED, { chatId });
        }
      } else {
        if (this.server) {
          this.server.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_ONGOING, {
            chatId,
            type: active.type,
            callerName: active.callerName,
            participantCount: count,
          });
        }
      }

      this.logger.log(
        `[Call] User ${userId} removed from call in chat ${chatId} via disconnect (remaining: ${count})`,
      );
    }
  }
}
