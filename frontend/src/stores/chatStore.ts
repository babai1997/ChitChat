import { create } from 'zustand';
import type { Chat, Message } from '../types';

interface ChatState {
  // State
  chats: Chat[];
  activeChat: Chat | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>; // chatId -> userId[]
  onlineUsers: Set<string>;
  lastSeen: Record<string, string>; // userId -> timestamp
  isLoading: boolean;

  // Actions
  setChats: (chats: Chat[]) => void;
  addChat: (chat: Chat) => void;
  updateChat: (chatId: string, updates: Partial<Chat>) => void;
  removeChat: (chatId: string) => void;
  
  setActiveChat: (chat: Chat | null) => void;
  
  setMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (chatId: string, message: Message) => void;
  prependMessages: (chatId: string, messages: Message[]) => void;
  updateMessage: (chatId: string, messageId: string, updates: Partial<Message>) => void;
  
  setTypingUser: (chatId: string, userId: string, isTyping: boolean) => void;
  clearTypingUsers: (chatId: string) => void;
  
  setUserOnline: (userId: string, isOnline: boolean, lastSeen?: string) => void;
  setOnlineUsers: (userIds: string[]) => void;
  
  setLoading: (isLoading: boolean) => void;
  
  clearChatData: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  chats: [],
  activeChat: null,
  messages: {},
  typingUsers: {},
  lastSeen: {},
  onlineUsers: new Set(),
  isLoading: false,

  // Actions
  setChats: (chats) => {
    set({ chats });
  },

  addChat: (chat) => {
    const { chats } = get();
    if (!chats.find((c) => c.id === chat.id)) {
      set({ chats: [chat, ...chats] });
    }
  },

  updateChat: (chatId, updates) => {
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === chatId ? { ...chat, ...updates } : chat
      ),
      activeChat:
        state.activeChat?.id === chatId
          ? { ...state.activeChat, ...updates }
          : state.activeChat,
    }));
  },

  removeChat: (chatId) => {
    set((state) => ({
      chats: state.chats.filter((chat) => chat.id !== chatId),
      activeChat: state.activeChat?.id === chatId ? null : state.activeChat,
    }));
  },

  setActiveChat: (chat) => {
    set({ activeChat: chat });
  },

  setMessages: (chatId, messages) => {
    set((state) => ({
      messages: { ...state.messages, [chatId]: messages },
    }));
  },

  addMessage: (chatId, message) => {
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      // Avoid duplicates
      if (chatMessages.find((m) => m.id === message.id)) {
        return state;
      }
      return {
        messages: {
          ...state.messages,
          [chatId]: [...chatMessages, message],
        },
      };
    });
  },

  prependMessages: (chatId, messages) => {
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      const existingIds = new Set(chatMessages.map((m) => m.id));
      const newMessages = messages.filter((m) => !existingIds.has(m.id));
      return {
        messages: {
          ...state.messages,
          [chatId]: [...newMessages, ...chatMessages],
        },
      };
    });
  },

  updateMessage: (chatId, messageId, updates) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: (state.messages[chatId] || []).map((msg) =>
          msg.id === messageId ? { ...msg, ...updates } : msg
        ),
      },
    }));
  },

  setTypingUser: (chatId, userId, isTyping) => {
    set((state) => {
      const currentTyping = state.typingUsers[chatId] || [];
      let newTyping: string[];
      
      if (isTyping) {
        if (!currentTyping.includes(userId)) {
          newTyping = [...currentTyping, userId];
        } else {
          newTyping = currentTyping;
        }
      } else {
        newTyping = currentTyping.filter((id) => id !== userId);
      }
      
      return {
        typingUsers: { ...state.typingUsers, [chatId]: newTyping },
      };
    });
  },

  clearTypingUsers: (chatId) => {
    set((state) => ({
      typingUsers: { ...state.typingUsers, [chatId]: [] },
    }));
  },

  setUserOnline: (userId, isOnline, lastSeen) => {
    set((state) => {
      const newOnlineUsers = new Set(state.onlineUsers);
      const newLastSeen = { ...state.lastSeen };
      
      if (isOnline) {
        newOnlineUsers.add(userId);
      } else {
        newOnlineUsers.delete(userId);
        if (lastSeen) {
          newLastSeen[userId] = lastSeen;
        }
      }
      return { onlineUsers: newOnlineUsers, lastSeen: newLastSeen };
    });
  },

  setOnlineUsers: (userIds: string[]) => {
    set({ onlineUsers: new Set(userIds) });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },

  clearChatData: () => {
    set({
      chats: [],
      activeChat: null,
      messages: {},
      typingUsers: {},
      onlineUsers: new Set(),
      lastSeen: {},
    });
  },
}));
