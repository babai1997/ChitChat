import { create } from 'zustand';
import type { Chat, Message, MessageStatus } from '../types';

const MAX_MESSAGES = 200;

interface ChatState {
  // ── State ──────────────────────────────────────────────────────────────────
  chats: Chat[];
  activeChat: Chat | null;
  messages: Record<string, Message[]>;
  messageHasMore: Record<string, boolean>; // chatId → older history exists beyond window
  typingUsers: Record<string, string[]>; // chatId → userId[]
  onlineUsers: Set<string>;
  lastSeen: Record<string, string>; // userId → ISO timestamp
  isLoading: boolean;

  // ── Chat actions ───────────────────────────────────────────────────────────
  setChats: (chats: Chat[]) => void;
  addChat: (chat: Chat) => void;
  /** Inserts new chat or merges updates if it already exists */
  upsertChat: (chat: Chat) => void;
  updateChat: (chatId: string, updates: Partial<Chat>) => void;
  /**
   * Patches a user's displayName/avatarUrl/about wherever it's embedded as
   * a snapshot inside `chats[].members[]` — used when a contact's profile
   * changes elsewhere (see PROFILE_UPDATED in chat.handlers.ts), since chat
   * member data is otherwise a point-in-time copy with no other update path.
   */
  updateMemberProfile: (
    userId: string,
    updates: { displayName?: string | null; avatarUrl?: string | null; about?: string | null },
  ) => void;
  /**
   * Patches a member's role within ONE specific chat — unlike
   * updateMemberProfile, role is chat-scoped, not global, so this only
   * ever touches that one chat's members array.
   */
  updateMemberRole: (chatId: string, userId: string, role: 'admin' | 'member') => void;
  removeChat: (chatId: string) => void;
  setActiveChat: (chat: Chat | null) => void;

  // ── Message actions ────────────────────────────────────────────────────────
  setMessages: (chatId: string, messages: Message[]) => void;
  setMessageHasMore: (chatId: string, hasMore: boolean) => void;
  /**
   * Adds a message, deduplicating by both real id AND tempId.
   * This prevents duplicates when message:new arrives before message:sent.
   */
  addMessage: (chatId: string, message: Message & { tempId?: string }) => void;
  prependMessages: (chatId: string, messages: Message[]) => void;
  /**
   * Merges a device-linking history-sync batch (see deviceLinkSync.ts) into
   * a chat's message list. Unlike prependMessages, sync messages can't be
   * assumed to be strictly older than what's already loaded — a couple of
   * live messages may well have streamed in via MESSAGE_NEW before the
   * sync payload arrives — so this dedupes by id AND re-sorts by
   * createdAt, rather than blindly prepending.
   */
  mergeHistoryMessages: (chatId: string, messages: Message[]) => void;
  /**
   * Atomically replaces the optimistic temp message with the confirmed real one.
   * Fixes the duplicate message bug — use this in the message:sent handler.
   */
  replaceMessage: (chatId: string, tempId: string, realMessage: Message) => void;
  /** Generic field-level update (use for status-only changes like delivered/read) */
  updateMessage: (chatId: string, messageId: string, updates: Partial<Message>) => void;
  /** Convenience wrapper for status updates */
  updateMessageStatus: (chatId: string, messageId: string, status: MessageStatus) => void;

  // ── Typing ─────────────────────────────────────────────────────────────────
  setTypingUser: (chatId: string, userId: string, isTyping: boolean) => void;
  clearTypingUsers: (chatId: string) => void;

  // ── Presence ───────────────────────────────────────────────────────────────
  setUserOnline: (userId: string, isOnline: boolean, lastSeen?: string) => void;
  setOnlineUsers: (userIds: string[]) => void;

  // ── Misc ───────────────────────────────────────────────────────────────────
  setLoading: (isLoading: boolean) => void;
  clearChatData: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  chats: [],
  activeChat: null,
  messages: {},
  messageHasMore: {},
  typingUsers: {},
  lastSeen: {},
  onlineUsers: new Set(),
  isLoading: false,

  // ── Chat actions ───────────────────────────────────────────────────────────

  setChats: (chats) => set({ chats }),

  addChat: (chat) => {
    if (!get().chats.find((c) => c.id === chat.id)) {
      set((state) => ({ chats: [chat, ...state.chats] }));
    }
  },

  upsertChat: (chat) => {
    set((state) => {
      const exists = state.chats.find((c) => c.id === chat.id);
      if (exists) {
        // Merge — existing fields take precedence only when not provided in update
        return {
          chats: state.chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c)),
          activeChat:
            state.activeChat?.id === chat.id
              ? { ...state.activeChat, ...chat }
              : state.activeChat,
        };
      }
      return { chats: [chat, ...state.chats] };
    });
  },

  updateChat: (chatId, updates) => {
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, ...updates } : c)),
      activeChat:
        state.activeChat?.id === chatId
          ? { ...state.activeChat, ...updates }
          : state.activeChat,
    }));
  },

  updateMemberProfile: (userId, updates) => {
    const patchMembers = (chat: Chat): Chat => ({
      ...chat,
      members: chat.members.map((m) =>
        m.userId === userId && m.user.profile
          ? { ...m, user: { ...m.user, profile: { ...m.user.profile, ...updates } } }
          : m,
      ),
    });
    set((state) => ({
      chats: state.chats.map(patchMembers),
      activeChat: state.activeChat ? patchMembers(state.activeChat) : state.activeChat,
    }));
  },

  updateMemberRole: (chatId, userId, role) => {
    const patchRole = (chat: Chat): Chat =>
      chat.id === chatId
        ? { ...chat, members: chat.members.map((m) => (m.userId === userId ? { ...m, role } : m)) }
        : chat;
    set((state) => ({
      chats: state.chats.map(patchRole),
      activeChat: state.activeChat ? patchRole(state.activeChat) : state.activeChat,
    }));
  },

  removeChat: (chatId) => {
    set((state) => ({
      chats: state.chats.filter((c) => c.id !== chatId),
      activeChat: state.activeChat?.id === chatId ? null : state.activeChat,
    }));
  },

  setActiveChat: (chat) => set({ activeChat: chat }),

  // ── Message actions ────────────────────────────────────────────────────────

  setMessages: (chatId, messages) => {
    set((state) => ({
      messages: { ...state.messages, [chatId]: messages },
      messageHasMore: { ...state.messageHasMore, [chatId]: false },
    }));
  },

  setMessageHasMore: (chatId, hasMore) => {
    set((state) => ({
      messageHasMore: { ...state.messageHasMore, [chatId]: hasMore },
    }));
  },

  addMessage: (chatId, message) => {
    set((state) => {
      const existing = state.messages[chatId] || [];
      const tempId = (message as any).tempId as string | undefined;

      // Skip if we already have this message by real id OR by tempId
      const alreadyExists = existing.some(
        (m) => m.id === message.id || (tempId && m.id === tempId),
      );
      if (alreadyExists) return state;

      const appended = [...existing, message];
      const trimmed = appended.length > MAX_MESSAGES;
      const capped = trimmed ? appended.slice(-MAX_MESSAGES) : appended;

      return {
        messages: { ...state.messages, [chatId]: capped },
        ...(trimmed && { messageHasMore: { ...state.messageHasMore, [chatId]: true } }),
      };
    });
  },

  prependMessages: (chatId, messages) => {
    set((state) => {
      const existing = state.messages[chatId] || [];
      const existingIds = new Set(existing.map((m) => m.id));
      const newOnes = messages.filter((m) => !existingIds.has(m.id));
      return {
        messages: { ...state.messages, [chatId]: [...newOnes, ...existing] },
      };
    });
  },

  mergeHistoryMessages: (chatId, messages) => {
    set((state) => {
      const existing = state.messages[chatId] || [];
      const incomingById = new Map(messages.map((m) => [m.id, m]));

      // A message already in the store may have been loaded BEFORE this
      // device was approved — rendered as "🔒 Message not available" or
      // "⚠️ Unable to decrypt" — so an id match isn't a true duplicate to
      // discard, it's the same message with a now-available plaintext.
      // Patch only `content` (now correctly decrypted via the sync
      // payload's own plaintext-cache write) — never the whole object,
      // which would blow away already-loaded attachments/sender/status.
      const patched = existing.map((m) => {
        const incoming = incomingById.get(m.id);
        return incoming ? { ...m, content: incoming.content } : m;
      });

      const existingIds = new Set(existing.map((m) => m.id));
      const newOnes = messages.filter((m) => !existingIds.has(m.id));

      const changed = newOnes.length > 0 || patched.some((m, i) => m !== existing[i]);
      if (!changed) return state;

      const merged = [...patched, ...newOnes].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      return { messages: { ...state.messages, [chatId]: merged } };
    });
  },

  replaceMessage: (chatId, tempId, realMessage) => {
    set((state) => {
      const existing = state.messages[chatId] || [];
      const replaced = existing.map((m) => (m.id === tempId ? { ...realMessage, tempId } : m));

      // Deduplicate — if message:new already added the real message before message:sent,
      // we'll now have two entries with the same real id. Keep only the first.
      const seen = new Set<string>();
      const deduped = replaced.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      return { messages: { ...state.messages, [chatId]: deduped } };
    });
  },

  updateMessage: (chatId, messageId, updates) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: (state.messages[chatId] || []).map((m) =>
          m.id === messageId ? { ...m, ...updates } : m,
        ),
      },
    }));
  },

  updateMessageStatus: (chatId, messageId, status) => {
    get().updateMessage(chatId, messageId, { status });
  },

  // ── Typing ─────────────────────────────────────────────────────────────────

  setTypingUser: (chatId, userId, isTyping) => {
    set((state) => {
      const current = state.typingUsers[chatId] || [];
      const updated = isTyping
        ? current.includes(userId)
          ? current
          : [...current, userId]
        : current.filter((id) => id !== userId);
      return { typingUsers: { ...state.typingUsers, [chatId]: updated } };
    });
  },

  clearTypingUsers: (chatId) => {
    set((state) => ({ typingUsers: { ...state.typingUsers, [chatId]: [] } }));
  },

  // ── Presence ───────────────────────────────────────────────────────────────

  setUserOnline: (userId, isOnline, lastSeen) => {
    set((state) => {
      const online = new Set(state.onlineUsers);
      const seen = { ...state.lastSeen };
      if (isOnline) {
        online.add(userId);
      } else {
        online.delete(userId);
        if (lastSeen) seen[userId] = lastSeen;
      }
      return { onlineUsers: online, lastSeen: seen };
    });
  },

  setOnlineUsers: (userIds) => set({ onlineUsers: new Set(userIds) }),

  // ── Misc ───────────────────────────────────────────────────────────────────

  setLoading: (isLoading) => set({ isLoading }),

  clearChatData: () =>
    set({
      chats: [],
      activeChat: null,
      messages: {},
      messageHasMore: {},
      typingUsers: {},
      onlineUsers: new Set(),
      lastSeen: {},
    }),
}));
