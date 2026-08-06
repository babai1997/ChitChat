# ChitChat - WhatsApp-Like Chat Application Implementation Plan

A production-grade, real-time chat application with modern UX standards, built with React, NestJS, and PostgreSQL.

---

## 1. System Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[React Web App]
    end
    
    subgraph "API Gateway"
        REST[REST API<br/>NestJS]
        WS[WebSocket Gateway<br/>Socket.IO]
    end
    
    subgraph "Service Layer"
        AUTH[Auth Service]
        USER[User Service]
        CHAT[Chat Service]
        MSG[Message Service]
        FILE[File Service]
    end
    
    subgraph "Data Layer"
        DB[(PostgreSQL<br/>Neon)]
        REDIS[(Redis<br/>Sessions/Cache)]
        S3[Object Storage<br/>Attachments]
    end
    
    WEB --> REST
    WEB --> WS
    REST --> AUTH
    REST --> USER
    REST --> CHAT
    REST --> MSG
    REST --> FILE
    WS --> MSG
    WS --> CHAT
    AUTH --> DB
    USER --> DB
    CHAT --> DB
    MSG --> DB
    FILE --> S3
    AUTH --> REDIS
```

### REST + WebSocket Flow

| Operation | Protocol | Reason |
|-----------|----------|--------|
| Authentication (OTP, Google) | REST | Security, rate limiting, error handling |
| Profile CRUD | REST | Non-real-time, cacheable |
| Chat/Group CRUD | REST | Complex operations, validation |
| Message History | REST | Pagination, caching |
| Real-time Messages | WebSocket | Low latency, bi-directional |
| Typing Indicators | WebSocket | Ephemeral, real-time |
| Online Status | WebSocket | Continuous updates |
| Message Status (delivered/read) | WebSocket | Real-time acknowledgments |

### Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant R as REST API
    participant W as WebSocket Gateway
    participant DB as Database
    
    Note over C,R: Initial Authentication
    C->>R: POST /auth/otp/send {phone}
    R->>DB: Store OTP (hashed, with expiry)
    R-->>C: {success: true}
    
    C->>R: POST /auth/otp/verify {phone, otp}
    R->>DB: Validate OTP
    R-->>C: {accessToken, refreshToken}
    
    Note over C,W: WebSocket Connection
    C->>W: connect({auth: {token: accessToken}})
    W->>W: Validate JWT
    W-->>C: connected
    
    Note over C,R: Token Refresh
    C->>R: POST /auth/refresh {refreshToken}
    R-->>C: {accessToken, refreshToken}
```

### Scalability Strategy

| Layer | Strategy |
|-------|----------|
| **WebSocket** | Horizontal scaling with Redis Pub/Sub for cross-server messaging |
| **REST API** | Stateless design, easy horizontal scaling |
| **Database** | Read replicas, connection pooling, query optimization |
| **File Storage** | CDN for attachments, pre-signed URLs |
| **Caching** | Redis for sessions, frequently accessed data |

---

## 2. Database Schema Design

### Entity Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ AUTH_PROVIDERS : has
    USERS ||--|| PROFILES : has
    USERS ||--o{ CHAT_MEMBERS : participates
    CHATS ||--o{ CHAT_MEMBERS : contains
    CHATS ||--o{ MESSAGES : contains
    MESSAGES ||--o{ ATTACHMENTS : has
    USERS ||--o{ MESSAGES : sends
    
    USERS {
        uuid id PK
        string phone UK
        string email UK
        boolean is_verified
        timestamp last_seen
        timestamp created_at
        timestamp updated_at
    }
    
    AUTH_PROVIDERS {
        uuid id PK
        uuid user_id FK
        enum provider "otp|google"
        string provider_id
        jsonb metadata
        timestamp created_at
    }
    
    PROFILES {
        uuid id PK
        uuid user_id FK UK
        string display_name
        string avatar_url
        string about
        boolean is_online
        timestamp created_at
        timestamp updated_at
    }
    
    CHATS {
        uuid id PK
        enum type "direct|group"
        string name
        string avatar_url
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
    }
    
    CHAT_MEMBERS {
        uuid id PK
        uuid chat_id FK
        uuid user_id FK
        enum role "admin|member"
        timestamp joined_at
        timestamp last_read_at
    }
    
    MESSAGES {
        uuid id PK
        uuid chat_id FK
        uuid sender_id FK
        text content
        enum type "text|image|file"
        enum status "sent|delivered|read"
        uuid reply_to FK
        timestamp created_at
        timestamp updated_at
    }
    
    ATTACHMENTS {
        uuid id PK
        uuid message_id FK
        string file_name
        string file_type
        bigint file_size
        string url
        jsonb metadata
        timestamp created_at
    }
```

### Table Definitions

#### users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(255) UNIQUE,
    is_verified BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_last_seen ON users(last_seen);
```

#### auth_providers
```sql
CREATE TABLE auth_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('otp', 'google')),
    provider_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

CREATE INDEX idx_auth_providers_user ON auth_providers(user_id);
CREATE INDEX idx_auth_providers_provider ON auth_providers(provider, provider_id);
```

#### profiles
```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(100),
    avatar_url TEXT,
    about VARCHAR(500) DEFAULT 'Hey there! I am using ChitChat',
    is_online BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_profiles_user ON profiles(user_id);
CREATE INDEX idx_profiles_online ON profiles(is_online);
```

#### chats
```sql
CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(10) NOT NULL CHECK (type IN ('direct', 'group')),
    name VARCHAR(100),
    avatar_url TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chats_type ON chats(type);
CREATE INDEX idx_chats_created_by ON chats(created_by);
```

#### chat_members
```sql
CREATE TABLE chat_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(10) DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_read_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(chat_id, user_id)
);

CREATE INDEX idx_chat_members_chat ON chat_members(chat_id);
CREATE INDEX idx_chat_members_user ON chat_members(user_id);
CREATE INDEX idx_chat_members_composite ON chat_members(chat_id, user_id);
```

#### messages
```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    content TEXT,
    type VARCHAR(20) DEFAULT 'text' CHECK (type IN ('text', 'image', 'file')),
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
    reply_to UUID REFERENCES messages(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Critical: Composite index for chat message pagination
CREATE INDEX idx_messages_chat_created ON messages(chat_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_status ON messages(status);
```

#### attachments
```sql
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    url TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_attachments_message ON attachments(message_id);
```

### Pagination Strategy

For message history, we use **cursor-based pagination** for consistent results:

```sql
-- Get messages before a cursor (for infinite scroll up)
SELECT * FROM messages 
WHERE chat_id = $1 
  AND created_at < $2  -- cursor timestamp
ORDER BY created_at DESC 
LIMIT 50;

-- Get messages after a cursor (for new messages catch-up)
SELECT * FROM messages 
WHERE chat_id = $1 
  AND created_at > $2
ORDER BY created_at ASC 
LIMIT 50;
```

---

## 3. Backend Structure (NestJS)

### Project Structure

```
chitchat-backend/
├── src/
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   └── public.decorator.ts
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   └── ws-jwt.guard.ts
│   │   ├── interceptors/
│   │   │   └── transform.interceptor.ts
│   │   ├── pipes/
│   │   │   └── validation.pipe.ts
│   │   └── interfaces/
│   │       └── request.interface.ts
│   │
│   ├── config/
│   │   ├── database.config.ts
│   │   ├── jwt.config.ts
│   │   └── app.config.ts
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── dto/
│   │   │   │   ├── send-otp.dto.ts
│   │   │   │   ├── verify-otp.dto.ts
│   │   │   │   └── google-auth.dto.ts
│   │   │   ├── strategies/
│   │   │   │   └── jwt.strategy.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.module.ts
│   │   │   └── otp.service.ts
│   │   │
│   │   ├── users/
│   │   │   ├── dto/
│   │   │   │   ├── create-user.dto.ts
│   │   │   │   └── update-user.dto.ts
│   │   │   ├── entities/
│   │   │   │   ├── user.entity.ts
│   │   │   │   └── auth-provider.entity.ts
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   └── users.module.ts
│   │   │
│   │   ├── profiles/
│   │   │   ├── dto/
│   │   │   │   ├── create-profile.dto.ts
│   │   │   │   └── update-profile.dto.ts
│   │   │   ├── entities/
│   │   │   │   └── profile.entity.ts
│   │   │   ├── profiles.controller.ts
│   │   │   ├── profiles.service.ts
│   │   │   └── profiles.module.ts
│   │   │
│   │   ├── chats/
│   │   │   ├── dto/
│   │   │   │   ├── create-chat.dto.ts
│   │   │   │   ├── create-group.dto.ts
│   │   │   │   └── add-member.dto.ts
│   │   │   ├── entities/
│   │   │   │   ├── chat.entity.ts
│   │   │   │   └── chat-member.entity.ts
│   │   │   ├── chats.controller.ts
│   │   │   ├── chats.service.ts
│   │   │   └── chats.module.ts
│   │   │
│   │   ├── messages/
│   │   │   ├── dto/
│   │   │   │   ├── create-message.dto.ts
│   │   │   │   └── message-query.dto.ts
│   │   │   ├── entities/
│   │   │   │   ├── message.entity.ts
│   │   │   │   └── attachment.entity.ts
│   │   │   ├── messages.controller.ts
│   │   │   ├── messages.service.ts
│   │   │   └── messages.module.ts
│   │   │
│   │   └── gateway/
│   │       ├── dto/
│   │       │   ├── send-message.dto.ts
│   │       │   └── typing.dto.ts
│   │       ├── chat.gateway.ts
│   │       └── gateway.module.ts
│   │
│   ├── database/
│   │   ├── migrations/
│   │   └── seeds/
│   │
│   ├── app.module.ts
│   └── main.ts
│
├── test/
├── .env.example
├── nest-cli.json
├── package.json
└── tsconfig.json
```

### Key Code Examples

#### JWT Strategy
```typescript
// src/modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  sub: string; // user id
  phone?: string;
  email?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }
}
```

#### OTP Service
```typescript
// src/modules/auth/otp.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as crypto from 'crypto';

interface OtpRecord {
  phone: string;
  otp: string; // hashed
  expiresAt: Date;
  attempts: number;
}

@Injectable()
export class OtpService {
  private otpStore = new Map<string, OtpRecord>(); // Use Redis in production
  private readonly OTP_EXPIRY_MINUTES = 5;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RATE_LIMIT_MINUTES = 1;

  async sendOtp(phone: string): Promise<{ success: boolean; message: string }> {
    // Rate limiting check
    const existing = this.otpStore.get(phone);
    if (existing) {
      const timeSinceCreated = Date.now() - (existing.expiresAt.getTime() - this.OTP_EXPIRY_MINUTES * 60 * 1000);
      if (timeSinceCreated < this.RATE_LIMIT_MINUTES * 60 * 1000) {
        throw new BadRequestException('Please wait before requesting another OTP');
      }
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = this.hashOtp(otp);

    // Store OTP
    this.otpStore.set(phone, {
      phone,
      otp: hashedOtp,
      expiresAt: new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000),
      attempts: 0,
    });

    // TODO: Send SMS via Twilio/AWS SNS
    console.log(`OTP for ${phone}: ${otp}`); // Dev only!

    return { success: true, message: 'OTP sent successfully' };
  }

  async verifyOtp(phone: string, otp: string): Promise<boolean> {
    const record = this.otpStore.get(phone);
    
    if (!record) {
      throw new BadRequestException('No OTP found. Please request a new one.');
    }

    if (record.expiresAt < new Date()) {
      this.otpStore.delete(phone);
      throw new BadRequestException('OTP expired. Please request a new one.');
    }

    if (record.attempts >= this.MAX_ATTEMPTS) {
      this.otpStore.delete(phone);
      throw new BadRequestException('Too many attempts. Please request a new OTP.');
    }

    const isValid = this.hashOtp(otp) === record.otp;
    
    if (!isValid) {
      record.attempts++;
      throw new BadRequestException(`Invalid OTP. ${this.MAX_ATTEMPTS - record.attempts} attempts remaining.`);
    }

    this.otpStore.delete(phone);
    return true;
  }

  private hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }
}
```

#### WebSocket Gateway
```typescript
// src/modules/gateway/chat.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { MessagesService } from '../messages/messages.service';
import { ChatsService } from '../chats/chats.service';

interface AuthenticatedSocket extends Socket {
  user: { id: string; phone: string };
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

  private userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(
    private messagesService: MessagesService,
    private chatsService: ChatsService,
  ) {}

  async handleConnection(socket: AuthenticatedSocket) {
    try {
      // JWT validation happens in middleware/guard
      const userId = socket.user.id;
      
      // Track user sockets
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(socket.id);

      // Join user's chat rooms
      const userChats = await this.chatsService.getUserChatIds(userId);
      userChats.forEach(chatId => socket.join(`chat:${chatId}`));

      // Broadcast online status
      this.server.emit('user:online', { userId });
      
      console.log(`User ${userId} connected (socket: ${socket.id})`);
    } catch (error) {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: AuthenticatedSocket) {
    if (!socket.user) return;
    
    const userId = socket.user.id;
    const userSocketSet = this.userSockets.get(userId);
    
    if (userSocketSet) {
      userSocketSet.delete(socket.id);
      
      // Only emit offline if no more connections
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
        this.server.emit('user:offline', { userId });
      }
    }
  }

  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string; content: string; type?: string; tempId?: string },
  ) {
    const { chatId, content, type = 'text', tempId } = data;
    const senderId = socket.user.id;

    // Save message to database
    const message = await this.messagesService.create({
      chatId,
      senderId,
      content,
      type,
    });

    // Emit to room (including sender for confirmation)
    this.server.to(`chat:${chatId}`).emit('message:new', {
      ...message,
      tempId, // Client uses this to match optimistic update
    });

    // Mark as delivered for online recipients
    const recipients = await this.chatsService.getChatMemberIds(chatId, senderId);
    const onlineRecipients = recipients.filter(id => this.userSockets.has(id));
    
    if (onlineRecipients.length > 0) {
      await this.messagesService.updateStatus(message.id, 'delivered');
      socket.emit('message:delivered', { messageId: message.id, tempId });
    }
  }

  @SubscribeMessage('message:read')
  async handleMessageRead(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string; messageIds: string[] },
  ) {
    const userId = socket.user.id;
    
    await this.messagesService.markAsRead(data.messageIds, userId);
    await this.chatsService.updateLastRead(data.chatId, userId);

    // Notify message senders
    this.server.to(`chat:${data.chatId}`).emit('message:read', {
      chatId: data.chatId,
      messageIds: data.messageIds,
      readBy: userId,
    });
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    socket.to(`chat:${data.chatId}`).emit('typing:start', {
      chatId: data.chatId,
      userId: socket.user.id,
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    socket.to(`chat:${data.chatId}`).emit('typing:stop', {
      chatId: data.chatId,
      userId: socket.user.id,
    });
  }
}
```

---

## 4. Frontend Structure (React)

### Project Structure

```
chitchat-frontend/
├── src/
│   ├── assets/
│   │   ├── icons/
│   │   └── images/
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   ├── Spinner.tsx
│   │   │   └── index.ts
│   │   └── shared/
│   │       ├── Header.tsx
│   │       ├── EmptyState.tsx
│   │       └── ErrorBoundary.tsx
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   │   ├── PhoneInput.tsx
│   │   │   │   ├── OtpInput.tsx
│   │   │   │   ├── GoogleSignIn.tsx
│   │   │   │   └── AuthLayout.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useAuth.ts
│   │   │   ├── services/
│   │   │   │   └── auth.service.ts
│   │   │   └── pages/
│   │   │       └── LoginPage.tsx
│   │   │
│   │   ├── profile/
│   │   │   ├── components/
│   │   │   │   ├── ProfileForm.tsx
│   │   │   │   ├── AvatarUpload.tsx
│   │   │   │   └── ProfileCard.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useProfile.ts
│   │   │   ├── services/
│   │   │   │   └── profile.service.ts
│   │   │   └── pages/
│   │   │       ├── ProfileSetupPage.tsx
│   │   │       └── ProfileEditPage.tsx
│   │   │
│   │   ├── chat/
│   │   │   ├── components/
│   │   │   │   ├── ChatList/
│   │   │   │   │   ├── ChatList.tsx
│   │   │   │   │   ├── ChatListItem.tsx
│   │   │   │   │   ├── ChatListSkeleton.tsx
│   │   │   │   │   └── ChatSearch.tsx
│   │   │   │   ├── ChatView/
│   │   │   │   │   ├── ChatView.tsx
│   │   │   │   │   ├── ChatHeader.tsx
│   │   │   │   │   ├── MessageList.tsx
│   │   │   │   │   ├── MessageBubble.tsx
│   │   │   │   │   ├── MessageInput.tsx
│   │   │   │   │   ├── TypingIndicator.tsx
│   │   │   │   │   └── MessageStatus.tsx
│   │   │   │   ├── NewChat/
│   │   │   │   │   ├── NewChatModal.tsx
│   │   │   │   │   └── ContactList.tsx
│   │   │   │   └── GroupChat/
│   │   │   │       ├── CreateGroupModal.tsx
│   │   │   │       ├── GroupInfo.tsx
│   │   │   │       └── MemberList.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useChats.ts
│   │   │   │   ├── useMessages.ts
│   │   │   │   └── useTyping.ts
│   │   │   ├── services/
│   │   │   │   ├── chat.service.ts
│   │   │   │   └── message.service.ts
│   │   │   └── pages/
│   │   │       └── ChatPage.tsx
│   │   │
│   │   └── websocket/
│   │       ├── socket.ts
│   │       ├── useSocket.ts
│   │       └── socketEvents.ts
│   │
│   ├── stores/
│   │   ├── authStore.ts
│   │   ├── chatStore.ts
│   │   ├── uiStore.ts
│   │   └── index.ts
│   │
│   ├── services/
│   │   ├── api.ts           # Axios instance
│   │   └── queryClient.ts   # TanStack Query client
│   │
│   ├── hooks/
│   │   ├── useDebounce.ts
│   │   └── useIntersection.ts
│   │
│   ├── utils/
│   │   ├── cn.ts            # Tailwind class merge
│   │   ├── formatters.ts
│   │   └── validators.ts
│   │
│   ├── types/
│   │   ├── user.types.ts
│   │   ├── chat.types.ts
│   │   └── message.types.ts
│   │
│   ├── router/
│   │   ├── routes.tsx
│   │   └── ProtectedRoute.tsx
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── public/
├── index.html
├── tailwind.config.js
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### State Management

#### Zustand Store - Auth
```typescript
// src/stores/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  phone?: string;
  email?: string;
  profile?: {
    displayName: string;
    avatarUrl?: string;
    about?: string;
  };
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isProfileComplete: boolean;
  
  // Actions
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  updateUser: (user: Partial<User>) => void;
  logout: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isProfileComplete: false,

      setAuth: (user, accessToken, refreshToken) =>
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isProfileComplete: !!user.profile?.displayName,
        }),

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
          isProfileComplete: !!updates.profile?.displayName || state.isProfileComplete,
        })),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isProfileComplete: false,
        }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
    }),
    {
      name: 'chitchat-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);
```

#### Zustand Store - Chat
```typescript
// src/stores/chatStore.ts
import { create } from 'zustand';

interface ChatState {
  selectedChatId: string | null;
  typingUsers: Map<string, Set<string>>; // chatId -> Set of userIds
  
  // Actions
  selectChat: (chatId: string | null) => void;
  setTyping: (chatId: string, userId: string, isTyping: boolean) => void;
  clearTyping: (chatId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  selectedChatId: null,
  typingUsers: new Map(),

  selectChat: (chatId) => set({ selectedChatId: chatId }),

  setTyping: (chatId, userId, isTyping) =>
    set((state) => {
      const newTypingUsers = new Map(state.typingUsers);
      const chatTyping = newTypingUsers.get(chatId) || new Set();
      
      if (isTyping) {
        chatTyping.add(userId);
      } else {
        chatTyping.delete(userId);
      }
      
      newTypingUsers.set(chatId, chatTyping);
      return { typingUsers: newTypingUsers };
    }),

  clearTyping: (chatId) =>
    set((state) => {
      const newTypingUsers = new Map(state.typingUsers);
      newTypingUsers.delete(chatId);
      return { typingUsers: newTypingUsers };
    }),
}));
```

#### TanStack Query - Messages Hook
```typescript
// src/features/chat/hooks/useMessages.ts
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { messageService } from '../services/message.service';
import { useChatStore } from '@/stores/chatStore';
import { Message } from '@/types/message.types';

export function useMessages(chatId: string) {
  const queryClient = useQueryClient();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['messages', chatId],
    queryFn: ({ pageParam }) =>
      messageService.getMessages(chatId, { cursor: pageParam, limit: 50 }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    getPreviousPageParam: (firstPage) => firstPage.prevCursor,
    enabled: !!chatId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const messages = data?.pages.flatMap((page) => page.messages) ?? [];

  return {
    messages,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
}

export function useSendMessage(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { content: string; type?: string }) =>
      messageService.sendMessage(chatId, data),
    
    // Optimistic update
    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      
      const previousMessages = queryClient.getQueryData(['messages', chatId]);
      
      const tempMessage: Message = {
        id: `temp-${Date.now()}`,
        chatId,
        content: newMessage.content,
        type: newMessage.type || 'text',
        status: 'sending',
        senderId: 'me', // Will be replaced with actual user id
        createdAt: new Date().toISOString(),
      };
      
      queryClient.setQueryData(['messages', chatId], (old: any) => ({
        ...old,
        pages: old?.pages?.map((page: any, i: number) =>
          i === 0 ? { ...page, messages: [tempMessage, ...page.messages] } : page
        ),
      }));
      
      return { previousMessages };
    },
    
    onError: (err, newMessage, context) => {
      queryClient.setQueryData(['messages', chatId], context?.previousMessages);
    },
    
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    },
  });
}
```

---

## 5. WebSocket Design

### Event Naming Convention

```
namespace:action
```

### Event Specifications

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `message:send` | Client → Server | `{ chatId, content, type?, tempId }` | Send new message |
| `message:new` | Server → Client | `{ id, chatId, senderId, content, type, status, createdAt, tempId }` | New message received |
| `message:delivered` | Server → Client | `{ messageId, tempId }` | Message delivered confirmation |
| `message:read` | Client → Server | `{ chatId, messageIds[] }` | Mark messages as read |
| `message:read` | Server → Client | `{ chatId, messageIds[], readBy }` | Read receipt notification |
| `typing:start` | Client → Server | `{ chatId }` | User started typing |
| `typing:start` | Server → Client | `{ chatId, userId }` | User is typing |
| `typing:stop` | Client → Server | `{ chatId }` | User stopped typing |
| `typing:stop` | Server → Client | `{ chatId, userId }` | User stopped typing |
| `user:online` | Server → Client | `{ userId }` | User came online |
| `user:offline` | Server → Client | `{ userId }` | User went offline |
| `chat:created` | Server → Client | `{ chat }` | New chat created (for all members) |
| `chat:updated` | Server → Client | `{ chatId, updates }` | Chat updated |
| `member:added` | Server → Client | `{ chatId, userId, member }` | Member added to group |
| `member:removed` | Server → Client | `{ chatId, userId }` | Member removed from group |

### Room Strategy

```typescript
// Room naming convention
`chat:${chatId}`     // For chat-specific events
`user:${userId}`     // For user-specific events (optional, for direct notifications)
```

### Reconnection & Missed Messages

```typescript
// src/features/websocket/socket.ts
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';
import { queryClient } from '@/services/queryClient';

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private lastDisconnectTime: Date | null = null;

  connect() {
    const { accessToken } = useAuthStore.getState();
    
    if (!accessToken) {
      console.warn('No access token, cannot connect');
      return;
    }

    this.socket = io(`${import.meta.env.VITE_API_URL}/chat`, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.reconnectAttempts = 0;
      
      // Fetch missed messages since last disconnect
      if (this.lastDisconnectTime) {
        this.syncMissedMessages();
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.lastDisconnectTime = new Date();
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.reconnectAttempts++;
      
      if (error.message === 'jwt expired') {
        // Trigger token refresh
        this.handleTokenRefresh();
      }
    });

    // Message handlers
    this.socket.on('message:new', this.handleNewMessage.bind(this));
    this.socket.on('message:delivered', this.handleDelivered.bind(this));
    this.socket.on('message:read', this.handleRead.bind(this));
    this.socket.on('typing:start', this.handleTypingStart.bind(this));
    this.socket.on('typing:stop', this.handleTypingStop.bind(this));
  }

  private async syncMissedMessages() {
    // Invalidate all message queries to fetch fresh data
    await queryClient.invalidateQueries({ queryKey: ['messages'] });
    await queryClient.invalidateQueries({ queryKey: ['chats'] });
    this.lastDisconnectTime = null;
  }

  private handleNewMessage(data: any) {
    const { chatId, ...message } = data;
    
    // Update query cache with new message
    queryClient.setQueryData(['messages', chatId], (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: any, i: number) =>
          i === 0 ? { ...page, messages: [message, ...page.messages] } : page
        ),
      };
    });

    // Update chat list (last message, unread count)
    queryClient.invalidateQueries({ queryKey: ['chats'] });
  }

  // ... other handlers

  emit(event: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('Socket not connected, queuing event');
      // TODO: Implement offline queue
    }
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketService = new SocketService();
```

---

## 6. Security & Production Readiness

### OTP Abuse Prevention

| Measure | Implementation |
|---------|----------------|
| Rate Limiting | 1 OTP per phone per minute |
| Attempt Limiting | Max 3 wrong attempts per OTP |
| OTP Hashing | SHA-256 before storage |
| Short Expiry | 5 minutes validity |
| IP Throttling | Max 10 OTP requests per IP per hour |
| Phone Validation | E.164 format enforcement |

### JWT Security

```typescript
// Token configuration
ACCESS_TOKEN_EXPIRY = '15m'   // Short-lived access tokens
REFRESH_TOKEN_EXPIRY = '7d'   // Longer refresh tokens

// Refresh token rotation
// Each refresh issues new refresh token, old one invalidated
```

### File Upload Security

| Check | Description |
|-------|-------------|
| File Type | Whitelist allowed MIME types |
| File Size | Max 10MB per file |
| Filename Sanitization | Remove special characters |
| Virus Scanning | Optional ClamAV integration |
| Storage | Pre-signed URLs with expiry |

### Rate Limiting (Express/NestJS)

```typescript
// Global rate limit
{
  ttl: 60,           // 1 minute window
  limit: 100,        // 100 requests per minute
}

// Auth endpoints (stricter)
{
  ttl: 60,
  limit: 10,         // 10 auth attempts per minute
}
```

### Environment Configuration

```env
# .env.example
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@host:5432/chitchat

# JWT
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=another-super-secret-key
JWT_REFRESH_EXPIRES_IN=7d

# Redis (optional for production)
REDIS_URL=redis://localhost:6379

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# SMS Provider
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=your-twilio-number

# File Storage
AWS_S3_BUCKET=chitchat-uploads
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_REGION=ap-south-1

# Frontend
FRONTEND_URL=http://localhost:5173
```

---

## 7. MVP → Phase 2 Roadmap

### MVP (Phase 1) - Current Plan
✅ Authentication (OTP + Google)
✅ User Profile
✅ 1-to-1 Chat
✅ Group Chat
✅ Real-time Messaging
✅ File Sharing
✅ Message States

### Phase 2 - Enhanced Features
- [ ] Message Reactions
- [ ] Reply to Messages
- [ ] Forward Messages
- [ ] Star/Save Messages
- [ ] Message Search
- [ ] Delete Messages (for me / for everyone)
- [ ] Edit Messages
- [ ] Mute Chats
- [ ] Archive Chats
- [ ] Block Users

### Phase 3 - Media & Communication
- [ ] Voice Messages
- [ ] Video Messages
- [ ] Audio Calls (WebRTC)
- [ ] Video Calls (WebRTC)
- [ ] Screen Sharing

### Phase 4 - Advanced Features
- [ ] End-to-End Encryption
- [ ] Push Notifications (FCM/APNs)
- [ ] Status/Stories
- [ ] Message Scheduling
- [ ] Broadcast Lists

### Phase 5 - Scale & Enterprise
- [ ] Multi-device Support
- [ ] Backup & Restore
- [ ] Admin Dashboard
- [ ] Audit Logs
- [ ] API Rate Tiers

---

## Verification Plan

### Automated Tests
```bash
# Backend unit tests
npm run test

# Backend e2e tests  
npm run test:e2e

# Frontend tests
npm run test
```

### Manual Verification
1. **Auth Flow**: Register → OTP → Profile Setup → Chat Access
2. **Real-time**: Open 2 browser tabs, send messages both ways
3. **Group Chat**: Create group, add members, verify all receive messages
4. **File Upload**: Upload image, verify display and download
5. **Message States**: Verify sent → delivered → read progression
6. **Reconnection**: Disconnect network, reconnect, verify message sync

---

> [!IMPORTANT]
> **Next Steps**: Please review this implementation plan. Once approved, I'll proceed with:
> 1. Setting up the backend project (NestJS + PostgreSQL)
> 2. Implementing the database schema
> 3. Building the auth module
> 4. Setting up the frontend project
