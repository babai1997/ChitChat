import { create } from 'zustand';
import type { Chat, Message, MessageStatus } from '../types';

interface ChatState {
  // ── State ──────────────────────────────────────────────────────────────────
  chats: Chat[];
  activeChat: Chat | null;
  messages: Record<string, Message[]>;
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
  removeChat: (chatId: string) => void;
  setActiveChat: (chat: Chat | null) => void;

  // ── Message actions ────────────────────────────────────────────────────────
  setMessages: (chatId: string, messages: Message[]) => void;
  /**
   * Adds a message, deduplicating by both real id AND tempId.
   * This prevents duplicates when message:new arrives before message:sent.
   */
  addMessage: (chatId: string, message: Message & { tempId?: string }) => void;
  prependMessages: (chatId: string, messages: Message[]) => void;
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

  removeChat: (chatId) => {
    set((state) => ({
      chats: state.chats.filter((c) => c.id !== chatId),
      activeChat: state.activeChat?.id === chatId ? null : state.activeChat,
    }));
  },

  setActiveChat: (chat) => set({ activeChat: chat }),

  // ── Message actions ────────────────────────────────────────────────────────

  setMessages: (chatId, messages) => {
    set((state) => ({ messages: { ...state.messages, [chatId]: messages } }));
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

      return {
        messages: { ...state.messages, [chatId]: [...existing, message] },
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
      typingUsers: {},
      onlineUsers: new Set(),
      lastSeen: {},
    }),
}));
