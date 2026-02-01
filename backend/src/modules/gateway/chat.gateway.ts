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
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { ChatsService } from '../chats/chats.service';
import { UsersService } from '../users/users.service';
import { SendMessageDto, TypingDto, ReadMessagesDto } from './dto';
import { MessageType, User, Profile } from '@prisma/client';

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
  private userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private messagesService: MessagesService,
    private chatsService: ChatsService,
    private usersService: UsersService,
  ) {}

  // ============================================
  // Connection Handlers
  // ============================================

  async handleConnection(socket: Socket) {
    this.logger.log(`Incoming connection attempt: ${socket.id}`);
    try {
      // Extract and verify token
      const user = await this.authenticateSocket(socket);

      if (!user) {
        socket.disconnect();
        return;
      }

      // Attach user to socket
      (socket as AuthenticatedSocket).user = user;

      // Track user sockets
      if (!this.userSockets.has(user.id)) {
        this.userSockets.set(user.id, new Set());
      }
      this.userSockets.get(user.id)!.add(socket.id);

      // Join user's chat rooms
      const userChatIds = await this.chatsService.getUserChatIds(user.id);
      this.logger.log(`User ${user.id} joining rooms: ${userChatIds.map(id => `chat:${id}`).join(', ')}`);
      userChatIds.forEach((chatId) => socket.join(`chat:${chatId}`));

      // Update pending messages to delivered and notify senders
      const deliveredMessages = await this.messagesService.markAllAsDeliveredForChats(
        userChatIds,
        user.id,
      );

      deliveredMessages.forEach((msg) => {
        this.emitToUser(msg.senderId, 'message:delivered', {
          messageId: msg.id,
          chatId: msg.chatId,
        });
      });

      // Update online status
      await this.usersService.setOnlineStatus(user.id, true);
      await this.usersService.updateLastSeen(user.id);

      // Broadcast online status to all chats
      userChatIds.forEach((chatId) => {
        socket.to(`chat:${chatId}`).emit('user:online', {
          userId: user.id,
          chatId,
        });
      });

      // Send list of currently online users to the connecting user
      // We'll collect all user IDs from the user's chats that are currently connected
      const onlineUserIds = new Set<string>();
      onlineUserIds.add(user.id); // Add self

      for (const chatId of userChatIds) {
        const memberIds = await this.chatsService.getChatMemberIds(chatId);
        for (const memberId of memberIds) {
          if (this.userSockets.has(memberId)) {
            onlineUserIds.add(memberId);
          }
        }
      }

      socket.emit('users:online', Array.from(onlineUserIds));

      this.logger.log(
        `User ${user.profile?.displayName || user.id} connected (socket: ${socket.id})`,
      );
    } catch (error) {
      this.logger.error('Connection error:', error);
      socket.disconnect();
    }
  }

  async handleDisconnect(socket: Socket) {
    const authSocket = socket as AuthenticatedSocket;

    if (!authSocket.user) {
      return;
    }

    const userId = authSocket.user.id;
    const userSocketSet = this.userSockets.get(userId);

    if (userSocketSet) {
      userSocketSet.delete(socket.id);

      // Only update status if no more connections for this user
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);

        // Update offline status
        await this.usersService.setOnlineStatus(userId, false);
        await this.usersService.updateLastSeen(userId);

        // Broadcast offline status
        const userChatIds = await this.chatsService.getUserChatIds(userId);
        userChatIds.forEach((chatId) => {
          this.server.to(`chat:${chatId}`).emit('user:offline', {
            userId,
            chatId,
            lastSeen: new Date(),
          });
        });
      }
    }

    this.logger.log(
      `User ${authSocket.user.profile?.displayName || userId} disconnected (socket: ${socket.id})`,
    );
  }

  // ============================================
  // Message Events
  // ============================================

  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: SendMessageDto,
  ) {
    try {
      const { chatId, content, type = MessageType.text, tempId, replyToId } = data;
      const senderId = socket.user.id;

      // Create message in database
      const message = await this.messagesService.create({
        chatId,
        senderId,
        content,
        type,
        replyToId,
      });

      // First, notify the sender that message was sent (for updating temp message)
      socket.emit('message:sent', {
        tempId,
        message: {
          ...message,
          status: 'sent',
        },
      });

      // Emit to room (including sender for confirmation)
      this.logger.log(`Emitting message:new to room chat:${chatId}`);
      this.server.to(`chat:${chatId}`).emit('message:new', {
        ...message,
        tempId, // Client uses this to match optimistic update
      });

      // Mark as delivered for online recipients
      const recipientIds = await this.chatsService.getChatMemberIds(
        chatId,
        senderId,
      );
      const onlineRecipients = recipientIds.filter((id) =>
        this.userSockets.has(id),
      );

      if (onlineRecipients.length > 0) {
        await this.messagesService.updateStatus(message.id, 'delivered' as any);

        // Notify sender of delivery
        socket.emit('message:delivered', {
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

  @SubscribeMessage('message:read')
  async handleMessageRead(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: ReadMessagesDto,
  ) {
    try {
      const userId = socket.user.id;
      const { chatId, messageIds } = data;

      // Mark messages as read
      await this.messagesService.markAsRead(messageIds, userId);
      await this.chatsService.updateLastRead(chatId, userId);

      // Notify message senders
      this.server.to(`chat:${chatId}`).emit('message:read', {
        chatId,
        messageIds,
        readBy: userId,
        readAt: new Date(),
      });

      return { success: true };
    } catch (error) {
      throw new WsException('Failed to mark messages as read');
    }
  }

  // ============================================
  // Event Listeners
  // ============================================

  @OnEvent('chat.created')
  handleChatCreated(payload: { chat: any; userIds: string[] }) {
    const { chat, userIds } = payload;
    
    // For each user, check if online and join them to the room
    // For each user, check if online and join them to the room
    userIds.forEach(userId => {
      const socketIds = this.userSockets.get(userId);
      if (socketIds) {
        socketIds.forEach(socketId => {
          // Cast to Map to avoid TS error with strict types
          const socket = (this.server.sockets as any).get(socketId);
          if (socket) {
            socket.join(`chat:${chat.id}`);
            socket.emit('chat:new', chat);
          }
        });

        // Broadcast their online status to the new room
        this.server.to(`chat:${chat.id}`).emit('user:online', {
          userId,
          chatId: chat.id,
        });
      }
    });

    this.logger.log(`Broadcasting new chat ${chat.id} to users ${userIds.join(', ')}`);
  }

  @OnEvent('message.created')
  handleMessageCreated(message: any) {
    this.logger.log(`Event received: message.created for chat ${message.chatId}`);
    this.server.to(`chat:${message.chatId}`).emit('message:new', message);
    this.logger.log(`Emitted message:new to chat:${message.chatId}`);
  }

  // ============================================
  // Typing Events
  // ============================================

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: TypingDto,
  ) {
    socket.to(`chat:${data.chatId}`).emit('typing:start', {
      chatId: data.chatId,
      userId: socket.user.id,
      displayName: socket.user.profile?.displayName || 'Someone',
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: TypingDto,
  ) {
    socket.to(`chat:${data.chatId}`).emit('typing:stop', {
      chatId: data.chatId,
      userId: socket.user.id,
    });
  }
  // ============================================
  // Call Signaling Events
  // ============================================

  @SubscribeMessage('call:start')
  async handleCallStart(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string; offer: any; type: 'video' | 'audio' },
  ) {
    const sender = socket.user;
    const { chatId, offer, type } = data;

    // Get other members of the chat
    const memberIds = await this.chatsService.getChatMemberIds(chatId);
    const recipientIds = memberIds.filter((id) => id !== sender.id);

    // For 1:1 chats, this will be just one person. For groups, it might blast everyone (feature toggle?)
    // For now assuming 1:1 or small groups where we notify all others
    recipientIds.forEach((recipientId) => {
      this.emitToUser(recipientId, 'call:incoming', {
        chatId,
        callerId: sender.id,
        callerName: sender.profile?.displayName || 'Unknown',
        callerAvatar: sender.profile?.avatarUrl,
        offer,
        type,
      });
    });
  }

  @SubscribeMessage('call:answer')
  handleCallAnswer(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string; callerId: string; answer: any },
  ) {
    const { chatId, callerId, answer } = data;
    const responderId = socket.user.id;

    // Send answer back to the original caller
    this.emitToUser(callerId, 'call:accepted', {
      chatId,
      responderId,
      responderName: socket.user.profile?.displayName || 'Unknown',
      answer,
    });
  }

  @SubscribeMessage('call:ice-candidate')
  handleIceCandidate(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string; getTargetUserId?: string; candidate: any },
  ) {
    // If target is specified, send only to them. Otherwise broadcast to chat (excluding self)
    const senderId = socket.user.id;
    const { chatId, candidate, getTargetUserId } = data;

    if (getTargetUserId) {
      this.emitToUser(getTargetUserId, 'call:ice-candidate', {
        chatId,
        senderId,
        candidate,
      });
    } else {
        // Fallback for groups or simpler logic
        socket.to(`chat:${chatId}`).emit('call:ice-candidate', {
            chatId,
            senderId,
            candidate,
        });
    }
  }

  @SubscribeMessage('call:reject')
  handleCallReject(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string; callerId: string },
  ) {
    const { chatId, callerId } = data;
    const rejectorId = socket.user.id;

    this.logger.log(`[Call Reject] User ${rejectorId} rejecting call from ${callerId} in chat ${chatId}`);
    this.logger.log(`[Call Reject] Caller sockets: ${JSON.stringify(Array.from(this.userSockets.get(callerId) || []))}`);
    
    this.emitToUser(callerId, 'call:rejected', {
      chatId,
      rejectorId,
      rejectorName: socket.user.profile?.displayName || 'Unknown',
    });
    
    this.logger.log(`[Call Reject] Emitted call:rejected to caller ${callerId}`);
  }

  @SubscribeMessage('call:end')
  handleCallEnd(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    const { chatId } = data;
    const senderId = socket.user.id;

    // Notify everyone in the chat that the call ended
    socket.to(`chat:${chatId}`).emit('call:ended', {
      chatId,
      enderId: senderId,
    });
  }

  @SubscribeMessage('call:signal')
  handleCallSignal(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { targetUserId: string; type: 'offer' | 'answer' | 'candidate'; signal: any; chatId: string },
  ) {
    const { targetUserId, type, signal, chatId } = data;
    const senderId = socket.user.id;

    this.emitToUser(targetUserId, 'call:signal', {
      senderId,
      type,
      signal,
      chatId,
    });
  }

  @SubscribeMessage('call:join')
  handleCallJoin(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    const { chatId } = data;
    const userId = socket.user.id;
    
    // Broadcast to room so existing participants can initiate connection to this new user
    socket.to(`chat:${chatId}`).emit('call:user-joined', {
      userId,
      chatId,
    });
  }
  // ============================================
  // Room Management
  // ============================================

  @SubscribeMessage('chat:join')
  async handleJoinChat(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    // Verify user is a member
    const memberIds = await this.chatsService.getChatMemberIds(data.chatId);
    if (!memberIds.includes(socket.user.id)) {
      throw new WsException('You are not a member of this chat');
    }

    socket.join(`chat:${data.chatId}`);
    return { success: true };
  }

  @SubscribeMessage('chat:leave')
  handleLeaveChat(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    socket.leave(`chat:${data.chatId}`);
    return { success: true };
  }

  // ============================================
  // Message Edit/Delete Handlers
  // ============================================

  @SubscribeMessage('message:delete')
  async handleMessageDelete(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { messageId: string; chatId: string; deleteForEveryone: boolean },
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
        // Emit to all users in the chat
        this.server.to(`chat:${chatId}`).emit('message:deleted', {
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

  @SubscribeMessage('message:edit')
  async handleMessageEdit(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { messageId: string; chatId: string; content: string },
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
        // Emit to all users in the chat
        this.server.to(`chat:${chatId}`).emit('message:edited', {
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

  // ============================================
  // Utility Methods
  // ============================================

  private async authenticateSocket(
    socket: Socket,
  ): Promise<(User & { profile: Profile | null }) | null> {
    try {
      const token = this.extractTokenFromSocket(socket);

      if (!token) {
        this.logger.warn('No token provided');
        return null;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { profile: true },
      });

      if (!user || !user.isVerified) {
        this.logger.warn('User not found or not verified');
        return null;
      }

      return user;
    } catch (error) {
      this.logger.error('Socket authentication failed:', error);
      return null;
    }
  }

  private extractTokenFromSocket(socket: Socket): string | undefined {
    // Check auth object first
    const auth = socket.handshake?.auth;
    if (auth?.token) {
      return auth.token;
    }

    // Fallback to query params
    const query = socket.handshake?.query;
    if (query?.token) {
      return query.token as string;
    }

    // Fallback to authorization header
    const authHeader = socket.handshake?.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return undefined;
  }

  // ============================================
  // Public Methods for External Use
  // ============================================

  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  getUserSocketCount(userId: string): number {
    return this.userSockets.get(userId)?.size || 0;
  }

  emitToUser(userId: string, event: string, data: unknown) {
    const socketIds = this.userSockets.get(userId);
    if (socketIds) {
      socketIds.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }

  emitToChat(chatId: string, event: string, data: unknown) {
    this.server.to(`chat:${chatId}`).emit(event, data);
  }
}
