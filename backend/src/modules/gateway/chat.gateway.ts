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
import { Logger } from '@nestjs/common';
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
import { SOCKET_EVENTS } from '../../shared/constants/socket-events';
import { SendMessageDto, TypingDto, ReadMessagesDto } from './dto';
import { User, Profile } from '@prisma/client';

interface AuthenticatedSocket extends Socket {
  user: User & { profile: Profile | null };
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/chat',
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

      // Share server reference with sub-services (done once here)
      this.registry.setServer(this.server);
      this.messageHandler.setServer(this.server);
      this.callHandler.setServer(this.server);

      // Register socket
      this.registry.register(user.id, socket.id);

      // Join all user's chat rooms
      const userChatIds = await this.chatsService.getUserChatIds(user.id);
      userChatIds.forEach((chatId) => socket.join(`chat:${chatId}`));

      // Mark unread messages as delivered
      const deliveredMessages = await this.messagesService.markAllAsDeliveredForChats(
        userChatIds,
        user.id,
      );
      deliveredMessages.forEach((msg) => {
        this.registry.emitToUser(msg.senderId, SOCKET_EVENTS.MESSAGE_DELIVERED, {
          messageId: msg.id,
          chatId: msg.chatId,
        });
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
    const isLastConnection = this.registry.unregister(userId, socket.id);

    if (isLastConnection) {
      await this.usersService.setOnlineStatus(userId, false);
      await this.usersService.updateLastSeen(userId);

      const userChatIds = await this.chatsService.getUserChatIds(userId);
      userChatIds.forEach((chatId) => {
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
    @MessageBody() data: { messageId: string; chatId: string; deleteForEveryone: boolean },
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
    @MessageBody() data: { chatId: string; offer: unknown; type: 'video' | 'audio' },
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
    @MessageBody() data: { targetUserId: string; type: 'offer' | 'answer' | 'candidate'; signal: unknown; chatId: string },
  ) {
    this.callHandler.handleCallSignal(socket as any, data);
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
    return { success: true };
  }

  @SubscribeMessage(SOCKET_EVENTS.CHAT_LEAVE)
  handleLeaveChat(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    socket.leave(`chat:${data.chatId}`);
    return { success: true };
  }

  // ─── Internal EventEmitter Listeners ──────────────────────────────────────

  @OnEvent('chat.created')
  handleChatCreated(payload: { chat: any; userIds: string[] }) {
    const { chat, userIds } = payload;

    userIds.forEach((userId) => {
      const socketIds = this.registry.getSocketIds(userId);
      socketIds.forEach((socketId) => {
        const socket = (this.server.sockets as any).get(socketId);
        if (socket) {
          socket.join(`chat:${chat.id}`);
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

    this.logger.log(`📢 New chat ${chat.id} broadcast to ${userIds.join(', ')}`);
  }

  // ─── HTTP Message Broadcaster ──────────────────────────────────────────────

  @OnEvent('message.created')
  handleMessageCreatedEvent(message: any) {
    this.logger.log(`📢 Broadcasting message.created (HTTP) to chat:${message.chatId}`);
    // Broadcast the full formatted message to the specific chat room
    this.server.to(`chat:${message.chatId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, message);
  }

  // ─── Auth Helpers ──────────────────────────────────────────────────────────

  private async authenticateSocket(socket: Socket) {
    try {
      const token = this.extractToken(socket);
      if (!token) return null;

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

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
    if (auth?.token) return auth.token;

    const query = socket.handshake?.query;
    if (query?.token) return query.token as string;

    const header = socket.handshake?.headers?.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);

    return undefined;
  }
}
