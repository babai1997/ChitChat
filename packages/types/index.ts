/**
 * @chitchat/types — shared contract between backend, frontend, and mobile.
 *
 * These types are derived from the backend mapper DTOs (MessagesMapper,
 * ChatsMapper) and the Prisma schema. When either changes, update here first
 * and TypeScript will surface every downstream breakage across both clients.
 */

// ── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  phone: string | null;
  email: string | null;
  isVerified: boolean;
  lastSeen?: string | null;
}

export interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  about: string | null;
  isOnline: boolean;
  user?: User;
}

export interface UserWithProfile extends User {
  profile: Profile | null;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    phone: string | null;
    email: string | null;
    isVerified: boolean;
    profile: {
      displayName: string | null;
      avatarUrl: string | null;
      about: string | null;
    } | null;
  };
  isNewUser: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export type ChatType = 'direct' | 'group';

export interface ChatMember {
  id: string;
  userId: string;
  role: 'admin' | 'member';
  joinedAt: string;
  user: {
    id: string;
    phone: string | null;
    email: string | null;
    profile: {
      displayName: string | null;
      avatarUrl: string | null;
      about: string | null;
      isOnline: boolean;
    } | null;
    lastSeen?: string | null;
  };
}

export interface LastMessage {
  id: string;
  content: string;
  type: MessageType;
  createdAt: string;
  senderId: string;
  senderName: string | null;
  status: MessageStatus;
}

export interface Chat {
  id: string;
  type: ChatType;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  lastMessage: LastMessage | null;
  members: ChatMember[];
}

// ── Message ───────────────────────────────────────────────────────────────────

export type MessageType =
  | 'text'
  | 'image'
  | 'file'
  | 'audio'
  | 'video'
  | 'system'
  | 'missed_call'
  | 'call_log';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageAttachment {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface MessageSender {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

// The API never nests a full Message under replyTo — it's flattened to just
// enough to render a quoted preview (see backend messages.mapper.ts).
export interface MessageReplyPreview {
  id: string;
  content: string | null;
  isDeleted: boolean;
  senderName: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: MessageType;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
  sender: MessageSender;
  replyTo: MessageReplyPreview | null;
  attachments: MessageAttachment[];
  isDeleted?: boolean;
  isEdited?: boolean;
}

export interface MessagesResponse {
  messages: Message[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
}

// ── WebSocket events ──────────────────────────────────────────────────────────

export interface SocketMessage {
  chatId: string;
  content: string;
  type?: MessageType;
  replyToId?: string;
}

export interface TypingEvent {
  chatId: string;
  userId: string;
  displayName: string;
}

export interface UserStatusEvent {
  userId: string;
  isOnline: boolean;
  lastSeen?: string;
}
