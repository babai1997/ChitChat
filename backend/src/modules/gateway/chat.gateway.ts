import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { Logger, UseFilters } from '@nestjs/common';
import { WsExceptionFilter } from '../../common/filters/ws-exception.filter';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatsService } from '../chats/chats.service';
import { MessagesService } from '../messages/messages.service';
import { UsersService } from '../users/users.service';
import { SocketRegistryService } from './services/socket-registry.service';
import { MessageHandler } from './handlers/message.handler';
import { PresenceHandler } from './handlers/presence.handler';
import { CallHandler } from './handlers/call.handler';
import { SenderKeyHandler } from './handlers/sender-key.handler';
import { SOCKET_EVENTS } from '../../shared/constants/socket-events';
import { SendMessageDto, TypingDto, ReadMessagesDto } from './dto';
import type { DistributeSenderKeyDto } from '../sender-keys/dto';
import { User, Profile } from '@prisma/client';
import { getAllowedOrigins } from '../../common/utils/allowed-origins';

interface AuthenticatedSocket extends Socket {
  user: User & { profile: Profile | null };
  deviceId?: string;
}

@UseFilters(WsExceptionFilter)
@WebSocketGateway({
  cors: {
    origin: getAllowedOrigins(),
    credentials: true,
  },
  namespace: '/chat',
  pingInterval: 25000,
  pingTimeout: 20000,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly chatsService: ChatsService,
    private readonly messagesService: MessagesService,
    private readonly usersService: UsersService,
    // Modular services
    private readonly registry: SocketRegistryService,
    private readonly messageHandler: MessageHandler,
    private readonly presenceHandler: PresenceHandler,
    private readonly callHandler: CallHandler,
    private readonly senderKeyHandler: SenderKeyHandler,
  ) {}

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async handleConnection(socket: Socket) {
    try {
      const user = await this.authenticateSocket(socket);
      if (!user) {
        socket.disconnect();
        return;
      }

      (socket as AuthenticatedSocket).user = user;
      const deviceId = this.extractDeviceId(socket);
      (socket as AuthenticatedSocket).deviceId = deviceId;

      // Share server reference with sub-services (done once here)
      this.registry.setServer(this.server);
      this.messageHandler.setServer(this.server);
      this.callHandler.setServer(this.server);

      // Register socket — deviceId falls back to socket.id for clients that
      // haven't sent one yet (see SocketRegistryService.register's jsdoc).
      this.registry.register(user.id, socket.id, deviceId);

      // Join all user's chat rooms
      const userChatIds = await this.chatsService.getUserChatIds(user.id);
      for (const chatId of userChatIds) {
        void socket.join(`chat:${chatId}`);
      }

      // Mark unread messages as delivered
      const deliveredMessages =
        await this.messagesService.markAllAsDeliveredForChats(
          userChatIds,
          user.id,
        );
      deliveredMessages.forEach((msg) => {
        this.registry.emitToUser(
          msg.senderId,
          SOCKET_EVENTS.MESSAGE_DELIVERED,
          {
            messageId: msg.id,
            chatId: msg.chatId,
          },
        );
      });

      // Update presence
      await this.usersService.setOnlineStatus(user.id, true);
      await this.usersService.updateLastSeen(user.id);

      // Broadcast online status to all the user's chats
      userChatIds.forEach((chatId) => {
        socket.to(`chat:${chatId}`).emit(SOCKET_EVENTS.USER_ONLINE, {
          userId: user.id,
          chatId,
        });
      });

      // Send the connecting user a list of currently online contacts
      const onlineUserIds = new Set<string>([user.id]);
      for (const chatId of userChatIds) {
        const memberIds = await this.chatsService.getChatMemberIds(chatId);
        memberIds.forEach((id) => {
          if (this.registry.isOnline(id)) onlineUserIds.add(id);
        });
      }
      socket.emit(SOCKET_EVENTS.USERS_ONLINE, Array.from(onlineUserIds));

      this.logger.log(
        `✅ Connected: ${user.profile?.displayName || user.id} (socket: ${socket.id})`,
      );
    } catch (error) {
      this.logger.error('Connection error:', error);
      socket.disconnect();
    }
  }

  async handleDisconnect(socket: Socket) {
    const authSocket = socket as AuthenticatedSocket;
    if (!authSocket.user) return;

    const userId = authSocket.user.id;
    const isLastConnection = this.registry.unregister(
      userId,
      socket.id,
      authSocket.deviceId,
    );

    if (isLastConnection) {
      await this.usersService.setOnlineStatus(userId, false);
      await this.usersService.updateLastSeen(userId);

      // Remove from any active call so participant count and banners stay accurate
      // even when the client disconnects without emitting CALL_END.
      this.callHandler.handleUserDisconnect(userId);

      const userChatIds = await this.chatsService.getUserChatIds(userId);
      userChatIds.forEach((chatId) => {
        // Clear any stuck typing indicator before going offline
        this.server
          .to(`chat:${chatId}`)
          .emit(SOCKET_EVENTS.TYPING_STOP, { chatId, userId });
        this.server.to(`chat:${chatId}`).emit(SOCKET_EVENTS.USER_OFFLINE, {
          userId,
          chatId,
          lastSeen: new Date(),
        });
      });
    }

    this.logger.log(
      `❌ Disconnected: ${authSocket.user.profile?.displayName || userId} (socket: ${socket.id})`,
    );
  }

  // ─── Message Events ────────────────────────────────────────────────────────

  @SubscribeMessage(SOCKET_EVENTS.MESSAGE_SEND)
  handleMessage(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: SendMessageDto,
  ) {
    return this.messageHandler.handleSend(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.MESSAGE_READ)
  handleMessageRead(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: ReadMessagesDto,
  ) {
    return this.messageHandler.handleRead(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.MESSAGE_DELETE)
  handleMessageDelete(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody()
    data: { messageId: string; chatId: string; deleteForEveryone: boolean },
  ) {
    return this.messageHandler.handleDelete(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.MESSAGE_EDIT)
  handleMessageEdit(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { messageId: string; chatId: string; content: string },
  ) {
    return this.messageHandler.handleEdit(socket as any, data);
  }

  // ─── Typing Events ─────────────────────────────────────────────────────────

  @SubscribeMessage(SOCKET_EVENTS.TYPING_START)
  handleTypingStart(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: TypingDto,
  ) {
    this.presenceHandler.handleTypingStart(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.TYPING_STOP)
  handleTypingStop(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: TypingDto,
  ) {
    this.presenceHandler.handleTypingStop(socket as any, data);
  }

  // ─── Call Events ───────────────────────────────────────────────────────────

  @SubscribeMessage(SOCKET_EVENTS.CALL_START)
  handleCallStart(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody()
    data: { chatId: string; offer: unknown; type: 'video' | 'audio' },
  ) {
    return this.callHandler.handleCallStart(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.CALL_JOIN)
  handleCallJoin(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    this.callHandler.handleCallJoin(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.CALL_SIGNAL)
  handleCallSignal(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody()
    data: {
      targetUserId: string;
      type: 'offer' | 'answer' | 'candidate';
      signal: unknown;
      chatId: string;
    },
  ) {
    this.callHandler.handleCallSignal(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.CALL_VIDEO_STATE)
  handleCallVideoState(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string; videoEnabled: boolean },
  ) {
    this.callHandler.handleCallVideoState(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.CALL_AUDIO_STATE)
  handleCallAudioState(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string; isMuted: boolean },
  ) {
    this.callHandler.handleCallAudioState(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.CALL_REJECT)
  handleCallReject(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string; callerId: string },
  ) {
    this.callHandler.handleCallReject(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.CALL_END)
  handleCallEnd(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    this.callHandler.handleCallEnd(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.CALL_MISSED)
  handleCallMissed(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string; type: 'audio' | 'video' },
  ) {
    return this.callHandler.handleCallMissed(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.CALL_SCREEN_SHARE_START)
  handleScreenShareStart(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    this.callHandler.handleScreenShareStart(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.CALL_SCREEN_SHARE_STOP)
  handleScreenShareStop(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    this.callHandler.handleScreenShareStop(socket as any, data);
  }

  @SubscribeMessage(SOCKET_EVENTS.CALL_ADD_MEMBER)
  handleCallAddMember(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody()
    data: { chatId: string; targetUserId: string; type: 'audio' | 'video' },
  ) {
    return this.callHandler.handleAddToCall(socket as any, data);
  }

  // ─── Sender Key Events (Phase 2 group E2EE) ────────────────────────────────

  @SubscribeMessage(SOCKET_EVENTS.SENDER_KEY_DISTRIBUTE)
  handleSenderKeyDistribute(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string } & DistributeSenderKeyDto,
  ) {
    const { chatId, ...dto } = data;
    return this.senderKeyHandler.handleDistribute(socket as any, chatId, dto);
  }

  // ─── Room Management ───────────────────────────────────────────────────────

  @SubscribeMessage(SOCKET_EVENTS.CHAT_JOIN)
  async handleJoinChat(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    const memberIds = await this.chatsService.getChatMemberIds(data.chatId);
    if (!memberIds.includes(socket.user.id)) {
      throw new WsException('You are not a member of this chat');
    }
    socket.join(`chat:${data.chatId}`);

    // Only send the banner if the call already has ≥2 participants (truly active).
    const activeCall = this.callHandler.getActiveCall(data.chatId);
    if (activeCall && activeCall.participantCount >= 2) {
      socket.emit(SOCKET_EVENTS.CALL_ONGOING, {
        chatId: data.chatId,
        type: activeCall.type,
        callerName: activeCall.callerName,
        participantCount: activeCall.participantCount,
      });
    }

    return { success: true };
  }

  @SubscribeMessage(SOCKET_EVENTS.CHAT_LEAVE)
  handleLeaveChat() {
    // Do NOT call socket.leave() here. The socket must stay in all its chat
    // rooms so MESSAGE_NEW is always delivered for badge/real-time updates,
    // even when the user navigates away from that chat screen.
    // handleConnection() auto-joins all rooms on connect; socket.io auto-removes
    // rooms on disconnect. The client tracks the active chat separately via
    // store.activeChat / activeChatIdRef to suppress in-chat notifications.
    return { success: true };
  }

  // ─── Internal EventEmitter Listeners ──────────────────────────────────────

  @OnEvent('chat.created')
  handleChatCreated(payload: { chat: { id: string }; userIds: string[] }) {
    const { chat, userIds } = payload;

    userIds.forEach((userId) => {
      const socketIds = this.registry.getSocketIds(userId);
      socketIds.forEach((socketId) => {
        // NestJS injects the Namespace (not the global Server) for a
        // namespaced gateway — Namespace.sockets is ALREADY the
        // Map<socketId, Socket> (see socket-registry.service.ts's own
        // comment on this); there's no nested `.sockets.sockets`.
        const socket = (
          this.server as unknown as { sockets: Map<string, Socket> }
        ).sockets.get(socketId);
        if (socket) {
          void socket.join(`chat:${chat.id}`);
          socket.emit(SOCKET_EVENTS.CHAT_NEW, chat);
        }
      });

      if (socketIds.size > 0) {
        this.server.to(`chat:${chat.id}`).emit(SOCKET_EVENTS.USER_ONLINE, {
          userId,
          chatId: chat.id,
        });
      }
    });

    this.logger.log(
      `📢 New chat ${chat.id} broadcast to ${userIds.join(', ')}`,
    );
  }

  @OnEvent('chat.member-added')
  handleChatMemberAdded(payload: { chatId: string; newUserId: string }) {
    // Existing members' clients react to this by distributing their CURRENT
    // sender-key chain (targeted at just the new member's devices) — not a
    // full-group redistribution. The new member gets no retroactive access
    // to history (matches Signal/WhatsApp's default), only messages from
    // whenever their distribution actually lands.
    this.server
      .to(`chat:${payload.chatId}`)
      .emit(SOCKET_EVENTS.CHAT_MEMBER_ADDED, payload);
  }

  @OnEvent('chat.member-removed')
  handleChatMemberRemoved(payload: {
    chatId: string;
    removedUserId: string;
    remainingMemberIds: string[];
  }) {
    // Evict the removed user's sockets from the room FIRST — otherwise
    // they'd keep receiving MESSAGE_NEW broadcasts for this group in real
    // time via the room, even though their ChatMember row (and therefore
    // any REST fetch) already denies them. Group ciphertext is identical
    // for every room member, so room membership IS an access boundary here,
    // unlike 1:1 chats where per-device targeting already gates delivery.
    const removedSocketIds = this.registry.getSocketIds(payload.removedUserId);
    removedSocketIds.forEach((socketId) => {
      const socket = (
        this.server as unknown as { sockets: Map<string, Socket> }
      ).sockets.get(socketId);
      void socket?.leave(`chat:${payload.chatId}`);
    });

    // Remaining members' clients react by rekeying: a fresh sender-key
    // chain, redistributed to `remainingMemberIds` only — the removed
    // member never receives the new chain, so they're locked out of every
    // future message even if they cached the old chain key (see
    // senderKeys.ts's rekey self-test).
    this.server
      .to(`chat:${payload.chatId}`)
      .emit(SOCKET_EVENTS.CHAT_MEMBER_REMOVED, payload);
  }

  @OnEvent('chat.updated')
  handleChatUpdated(payload: {
    chatId: string;
    name: string | null;
    avatarUrl: string | null;
  }) {
    // Without this, only the member who made the change ever learns about
    // it in their own client — everyone else's chatStore has no mechanism
    // to pick it up short of a full refetch (see chats.service.ts's
    // updateGroup, which used to just return the new DTO to the caller
    // and nothing else).
    this.server
      .to(`chat:${payload.chatId}`)
      .emit(SOCKET_EVENTS.CHAT_UPDATED, payload);
  }

  @OnEvent('chat.member-role-updated')
  handleChatMemberRoleUpdated(payload: {
    chatId: string;
    userId: string;
    role: 'admin' | 'member';
  }) {
    // Same gap as chat.updated — only the admin who made the change
    // otherwise ever learns about it.
    this.server
      .to(`chat:${payload.chatId}`)
      .emit(SOCKET_EVENTS.CHAT_MEMBER_ROLE_UPDATED, payload);
  }

  @OnEvent('profile.updated')
  handleProfileUpdated(payload: {
    userId: string;
    contactUserIds: string[];
    displayName: string | null;
    avatarUrl: string | null;
    about: string;
  }) {
    // Not chat-room-scoped like the events above — a profile change is
    // relevant to every contact across every chat this user is in, so it's
    // targeted per-user via emitToUser rather than a single room broadcast.
    const { contactUserIds, ...profileUpdate } = payload;
    contactUserIds.forEach((userId) => {
      this.registry.emitToUser(
        userId,
        SOCKET_EVENTS.PROFILE_UPDATED,
        profileUpdate,
      );
    });
  }

  @OnEvent('device.link-requested')
  handleDeviceLinkRequested(payload: {
    userId: string;
    newDeviceId: string;
    platform?: string;
  }) {
    // Every one of the user's connected sockets gets this — including the
    // new device itself (which ignores it, it's not "about" any other
    // device) and any other already-approved device, which is what
    // actually drives the approval-prompt UI.
    this.registry.emitToUser(
      payload.userId,
      SOCKET_EVENTS.DEVICE_LINK_REQUEST,
      payload,
    );
  }

  @OnEvent('device.link-approved')
  handleDeviceLinkApproved(payload: { userId: string; deviceId: string }) {
    this.registry.emitToUser(
      payload.userId,
      SOCKET_EVENTS.DEVICE_LINK_APPROVED,
      payload,
    );
  }

  @OnEvent('device.link-declined')
  handleDeviceLinkDeclined(payload: { userId: string; deviceId: string }) {
    this.registry.emitToUser(
      payload.userId,
      SOCKET_EVENTS.DEVICE_LINK_DECLINED,
      payload,
    );
  }

  @OnEvent('device.history-chunk')
  handleDeviceHistoryChunk(payload: {
    userId: string;
    newDeviceId: string;
    chatId: string;
    ciphertext: string;
    approvingDeviceId: string;
  }) {
    const { userId, newDeviceId, ...rest } = payload;
    this.registry.emitToDevice(
      userId,
      newDeviceId,
      SOCKET_EVENTS.DEVICE_HISTORY_CHUNK,
      rest,
    );
  }

  // ─── HTTP Message Broadcaster ──────────────────────────────────────────────

  @OnEvent('message.created')
  handleMessageCreatedEvent(message: { chatId: string }) {
    this.logger.log(
      `📢 Broadcasting message.created (HTTP) to chat:${message.chatId}`,
    );
    // Broadcast the full formatted message to the specific chat room
    this.server
      .to(`chat:${message.chatId}`)
      .emit(SOCKET_EVENTS.MESSAGE_NEW, message);
  }

  // ─── Auth Helpers ──────────────────────────────────────────────────────────

  private async authenticateSocket(socket: Socket) {
    try {
      const token = this.extractToken(socket);
      if (!token) return null;

      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        token,
        {
          secret: this.configService.get<string>('jwt.secret'),
        },
      );

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { profile: true },
      });

      if (!user || !user.isVerified) return null;
      return user;
    } catch {
      return null;
    }
  }

  private extractToken(socket: Socket): string | undefined {
    const auth = socket.handshake?.auth;
    if (auth?.token) return auth.token as string;

    const query = socket.handshake?.query;
    if (query?.token) return query.token as string;

    const header = socket.handshake?.headers?.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);

    return undefined;
  }

  /**
   * Falls back to socket.id (undefined here — SocketRegistryService.register
   * applies its own socket.id fallback) for clients on a build that predates
   * the E2EE device-identity rollout.
   */
  private extractDeviceId(socket: Socket): string | undefined {
    const auth = socket.handshake?.auth;
    if (typeof auth?.deviceId === 'string') return auth.deviceId;

    const query = socket.handshake?.query;
    if (typeof query?.deviceId === 'string') return query.deviceId;

    return undefined;
  }
}
