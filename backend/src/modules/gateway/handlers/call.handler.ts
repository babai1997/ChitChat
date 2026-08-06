import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ChatsService } from '../../chats/chats.service';
import { MessagesService } from '../../messages/messages.service';
import { SocketRegistryService } from '../services/socket-registry.service';
import { PushService } from '../../push';
import { SOCKET_EVENTS } from '../../../shared/constants/socket-events';
import { MessageType } from '@prisma/client';

/** Nobody answered within this window — treat as a missed call. */
const RING_TIMEOUT_MS = 45_000;

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
  callId: string;
  type: 'audio' | 'video';
  callerId: string;
  callerName: string;
  /** Set of userIds currently connected in this call. */
  participantUserIds: Set<string>;
  /** The full set of invited recipients — fixed at call start, used to cancel pushes for everyone once the call is over. */
  recipientIds: string[];
}

@Injectable()
export class CallHandler {
  private readonly logger = new Logger(CallHandler.name);
  private server: Server;
  /** In-memory registry of currently active calls, keyed by chatId. */
  private readonly activeCalls = new Map<string, ActiveCall>();
  /** Server-side ring timeout handles, keyed by chatId — cleared once answered/rejected/ended. */
  private readonly ringTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly chatsService: ChatsService,
    private readonly messagesService: MessagesService,
    private readonly registry: SocketRegistryService,
    private readonly pushService: PushService,
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
    const callId = uuidv4();
    const callerName = sender.profile?.displayName || 'Unknown';

    recipientIds.forEach((recipientId) => {
      this.registry.emitToUser(recipientId, SOCKET_EVENTS.CALL_INCOMING, {
        callId,
        chatId,
        callerId: sender.id,
        callerName,
        callerAvatar: sender.profile?.avatarUrl,
        offer,
        type,
      });

      // Wake up the recipient's device even if their socket is disconnected
      // (backgrounded/killed app) — see docs/CALL_NOTIFICATIONS_PLAN.md.
      void this.pushService.sendCallPush(recipientId, {
        callId,
        chatId,
        callerId: sender.id,
        callerName,
        callerAvatar: sender.profile?.avatarUrl,
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
      callId,
      type,
      callerId: sender.id,
      callerName,
      participantUserIds: new Set([sender.id]),
      recipientIds,
    });

    this.startRingTimeout(chatId);

    this.logger.log(
      `[Call] ${sender.id} started ${type} call in chat ${chatId} (${callId})`,
    );
  }

  /**
   * Server-side counterpart to the caller's own 45s client-side timer — covers
   * the case where the caller's client dies/loses connection before it can
   * emit CALL_MISSED itself, so a pushed notification doesn't ring forever.
   */
  private startRingTimeout(chatId: string) {
    this.clearRingTimeout(chatId);
    const timeout = setTimeout(() => {
      this.ringTimeouts.delete(chatId);
      const active = this.activeCalls.get(chatId);
      // Still nobody but the caller connected → nobody answered in time.
      if (active && active.participantUserIds.size <= 1) {
        void this.finalizeMissedCall(chatId, active.callerId, active.type);
      }
    }, RING_TIMEOUT_MS);
    this.ringTimeouts.set(chatId, timeout);
  }

  private clearRingTimeout(chatId: string) {
    const existing = this.ringTimeouts.get(chatId);
    if (existing) {
      clearTimeout(existing);
      this.ringTimeouts.delete(chatId);
    }
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

      // Someone answered — stop the server-side ring timeout, and stop
      // ringing this same user's OTHER devices (multi-device).
      this.clearRingTimeout(chatId);
      void this.pushService.sendCancelPush(userId, active.callId);

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
  async handleCallSignal(
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

    const memberIds = await this.chatsService.getChatMemberIds(chatId);
    if (!memberIds.includes(senderId) || !memberIds.includes(targetUserId)) {
      this.logger.warn(
        `[Call] Unauthorized signal attempt by ${senderId} → ${targetUserId} in chat ${chatId}`,
      );
      socket.emit('error', { message: 'You are not a member of this chat' });
      return;
    }

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

    await this.rejectCall(
      chatId,
      callerId,
      rejectorId,
      socket.user.profile?.displayName || 'Unknown',
    );
  }

  /**
   * Reject a call. Shared by the socket-driven path above (the in-app
   * Decline button) and the HTTP path (CallHttpController — used when
   * Decline is tapped on the notification, which may run in a headless
   * background context with no live socket connection at all).
   */
  async rejectCall(
    chatId: string,
    callerId: string,
    rejectorId: string,
    rejectorName: string,
  ) {
    this.logger.log(
      `[Call] User ${rejectorId} rejected call from ${callerId} in chat ${chatId}`,
    );

    this.registry.emitToUser(callerId, SOCKET_EVENTS.CALL_REJECTED, {
      chatId,
      rejectorId,
      rejectorName,
    });

    // Stop ringing this same user's OTHER devices (multi-device) too.
    const active = this.activeCalls.get(chatId);
    if (active) {
      void this.pushService.sendCancelPush(rejectorId, active.callId);
    }
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

    // Reuse the ongoing call's id so a push notification for this invite
    // correlates with the same call session; fall back to a fresh one if for
    // some reason there's no tracked active call for this chat.
    const active = this.activeCalls.get(chatId);
    const callId = active?.callId ?? uuidv4();
    const callerName = sender.profile?.displayName || 'Unknown';
    if (active && !active.recipientIds.includes(targetUserId)) {
      active.recipientIds.push(targetUserId);
    }

    this.registry.emitToUser(targetUserId, SOCKET_EVENTS.CALL_INCOMING, {
      callId,
      chatId,
      callerId: sender.id,
      callerName,
      callerAvatar: sender.profile?.avatarUrl,
      type,
    });

    void this.pushService.sendCallPush(targetUserId, {
      callId,
      chatId,
      callerId: sender.id,
      callerName,
      callerAvatar: sender.profile?.avatarUrl,
      type,
    });
  }

  async handleCallVideoState(
    socket: AuthSocket,
    data: { chatId: string; videoEnabled: boolean },
  ) {
    const { chatId, videoEnabled } = data;
    const userId = socket.user.id;

    if (!(await this.chatsService.isChatMember(chatId, userId))) {
      this.logger.warn(
        `[Call] Unauthorized video-state broadcast by ${userId} in chat ${chatId}`,
      );
      socket.emit('error', { message: 'You are not a member of this chat' });
      return;
    }

    socket.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_VIDEO_STATE, {
      senderId: userId,
      videoEnabled,
    });
  }

  async handleCallAudioState(
    socket: AuthSocket,
    data: { chatId: string; isMuted: boolean },
  ) {
    const { chatId, isMuted } = data;
    const userId = socket.user.id;

    if (!(await this.chatsService.isChatMember(chatId, userId))) {
      this.logger.warn(
        `[Call] Unauthorized audio-state broadcast by ${userId} in chat ${chatId}`,
      );
      socket.emit('error', { message: 'You are not a member of this chat' });
      return;
    }

    socket.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_AUDIO_STATE, {
      senderId: userId,
      isMuted,
    });
  }

  async handleScreenShareStart(socket: AuthSocket, data: { chatId: string }) {
    const { chatId } = data;
    const userId = socket.user.id;

    if (!(await this.chatsService.isChatMember(chatId, userId))) {
      this.logger.warn(
        `[Call] Unauthorized screen-share-start by ${userId} in chat ${chatId}`,
      );
      socket.emit('error', { message: 'You are not a member of this chat' });
      return;
    }

    this.logger.log(
      `[Call] User ${userId} started screen share in chat ${chatId}`,
    );
    socket.to(`chat:${chatId}`).emit(SOCKET_EVENTS.CALL_SCREEN_SHARING, {
      userId,
      chatId,
    });
  }

  async handleScreenShareStop(socket: AuthSocket, data: { chatId: string }) {
    const { chatId } = data;
    const userId = socket.user.id;

    if (!(await this.chatsService.isChatMember(chatId, userId))) {
      this.logger.warn(
        `[Call] Unauthorized screen-share-stop by ${userId} in chat ${chatId}`,
      );
      socket.emit('error', { message: 'You are not a member of this chat' });
      return;
    }

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
        this.clearRingTimeout(chatId);
        // Call is over — stop ringing anyone still showing a call notification.
        active.recipientIds.forEach((recipientId) => {
          void this.pushService.sendCancelPush(recipientId, active.callId);
        });
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

    const memberIds = await this.chatsService.getChatMemberIds(chatId);
    if (!memberIds.includes(callerId)) {
      this.logger.warn(
        `[Call] Unauthorized missed-call attempt by ${callerId} in chat ${chatId}`,
      );
      socket.emit('error', { message: 'You are not a member of this chat' });
      return;
    }

    await this.finalizeMissedCall(chatId, callerId, type);
  }

  /**
   * Shared by both the caller's own client-side 45s timer (handleCallMissed,
   * above) and the server-side ring timeout (startRingTimeout) — covers the
   * case where the caller's client dies before it can tell us itself.
   *
   * 1. Stop ringing on all callee devices (socket + any push notification)
   * 2. Persist a "Missed call" message in the chat for both sides to see
   * 3. Broadcast that message via MESSAGE_NEW so it appears in real-time
   * 4. Clear the active-call registry
   */
  private async finalizeMissedCall(
    chatId: string,
    callerId: string,
    type: 'audio' | 'video',
  ) {
    this.logger.log(
      `[Call] Missed ${type} call from ${callerId} in chat ${chatId}`,
    );

    const active = this.activeCalls.get(chatId);
    const memberIds = await this.chatsService.getChatMemberIds(chatId);
    const recipientIds = memberIds.filter((id) => id !== callerId);

    recipientIds.forEach((recipientId) => {
      this.registry.emitToUser(recipientId, SOCKET_EVENTS.CALL_MISSED, {
        chatId,
        callerId,
        type,
      });
      if (active) {
        void this.pushService.sendCancelPush(recipientId, active.callId);
      }
    });

    // Persist a "Missed call" system message authored by the caller
    const label = type === 'video' ? 'Missed video call' : 'Missed audio call';
    const missedMsg = await this.messagesService.createSystemMessage(
      chatId,
      callerId,
      label,
      MessageType.missed_call,
    );

    // Broadcast it to the chat room so it appears in real-time for everyone
    if (this.server) {
      this.server
        .to(`chat:${chatId}`)
        .emit(SOCKET_EVENTS.MESSAGE_NEW, missedMsg);
    }

    // Clean up the active-call registry — nobody answered so the call is over.
    // Remove the entry and broadcast CALL_FINISHED so any "Tap to join" banners disappear.
    this.clearRingTimeout(chatId);
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
        this.clearRingTimeout(chatId);
        active.recipientIds.forEach((recipientId) => {
          void this.pushService.sendCancelPush(recipientId, active.callId);
        });
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
