import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { socketManager } from '../shared/socket/SocketManager';
import { registerMessageHandlers } from '../shared/socket/handlers/message.handlers';
import { registerPresenceHandlers } from '../shared/socket/handlers/presence.handlers';
import { registerChatHandlers } from '../shared/socket/handlers/chat.handlers';
import { SOCKET_EVENTS } from '../shared/constants/socket-events';
import { useChatStore } from '../stores/chatStore';
import * as Crypto from 'expo-crypto';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.2.95:3000/api';

// ── Context type ────────────────────────────────────────────────────────────

interface SocketContextType {
  isConnected: boolean;
  joinChat: (chatId: string) => void;
  leaveChat: (chatId: string) => void;
  sendMessage: (chatId: string, content: string, type?: string, replyToId?: string, attachments?: any[], customTempId?: string) => string | null;
  markAsRead: (chatId: string, messageIds: string[]) => void;
  startTyping: (chatId: string) => void;
  stopTyping: (chatId: string) => void;
  deleteMessage: (chatId: string, messageId: string, deleteForEveryone: boolean) => void;
  editMessage: (chatId: string, messageId: string, content: string) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const { accessToken, isAuthenticated } = useAuthStore();

  // Connect / disconnect based on auth state
  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      socketManager.disconnect();
      setIsConnected(false);
      return;
    }

    socketManager.connect(API_URL, accessToken);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onConnectError = (err: Error) => {
      console.error('[Socket] Connection error:', err.message);
      setIsConnected(false);
    };

    socketManager.on('connect', onConnect);
    socketManager.on('disconnect', onDisconnect);
    socketManager.on('connect_error', onConnectError as any);

    // Register domain handlers — each returns a cleanup fn
    const cleanupMessages = registerMessageHandlers();
    const cleanupPresence = registerPresenceHandlers();
    const cleanupChats = registerChatHandlers();

    return () => {
      socketManager.off('connect', onConnect);
      socketManager.off('disconnect', onDisconnect);
      socketManager.off('connect_error', onConnectError as any);
      cleanupMessages();
      cleanupPresence();
      cleanupChats();
    };
  }, [isAuthenticated, accessToken]);

  // ── Action methods ─────────────────────────────────────────────────────────

  const joinChat = useCallback((chatId: string) => {
    socketManager.emit(SOCKET_EVENTS.CHAT_JOIN, { chatId });
  }, []);

  const leaveChat = useCallback((chatId: string) => {
    socketManager.emit(SOCKET_EVENTS.CHAT_LEAVE, { chatId });
  }, []);

  const sendMessage = useCallback(
    (chatId: string, content: string, type = 'text', replyToId?: string, attachments?: any[], customTempId?: string) => {
      if (!socketManager.isConnected) {
        console.warn('[Socket] Cannot send — not connected');
        return null;
      }
      const tempId = customTempId || Crypto.randomUUID();

      // --- Optimistic Update ---
      const store = useChatStore.getState();
      const currentUser = useAuthStore.getState().user;

      if (currentUser) {
        // 1. Add optimistic message to the chat
        store.addMessage(chatId, {
          id: tempId,
          tempId, // this signals chatStore to replace it when confirmed
          chatId,
          content,
          type: type as any,
          senderId: currentUser.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'sending',
          isEdited: false,
          isDeleted: false,
          sender: {
            id: currentUser.id,
            displayName: currentUser.profile?.displayName || '',
            avatarUrl: currentUser.profile?.avatarUrl || null,
          },
          attachments: attachments || [],
          replyTo: null,
        });

        // 2. Optimistically update the chat list's last message
        store.updateChat(chatId, {
          updatedAt: new Date().toISOString(),
          lastMessage: {
            id: tempId,
            content,
            type: type as any,
            createdAt: new Date().toISOString(),
            senderId: currentUser.id,
            senderName: currentUser.profile?.displayName || null,
            status: 'sending',
          },
        });
      }

      socketManager.emit(SOCKET_EVENTS.MESSAGE_SEND, {
        tempId,
        chatId,
        content,
        type,
        replyToId,
        attachments,
      });
      return tempId;
    },
    [],
  );

  const markAsRead = useCallback((chatId: string, messageIds: string[]) => {
    socketManager.emit(SOCKET_EVENTS.MESSAGE_READ, { chatId, messageIds });
  }, []);

  const startTyping = useCallback((chatId: string) => {
    socketManager.emit(SOCKET_EVENTS.TYPING_START, { chatId });
  }, []);

  const stopTyping = useCallback((chatId: string) => {
    socketManager.emit(SOCKET_EVENTS.TYPING_STOP, { chatId });
  }, []);

  const deleteMessage = useCallback(
    (chatId: string, messageId: string, deleteForEveryone: boolean) => {
      socketManager.emit(SOCKET_EVENTS.MESSAGE_DELETE, { chatId, messageId, deleteForEveryone });

      if (!deleteForEveryone) {
        const store = useChatStore.getState();
        const updated = (store.messages[chatId] || []).filter((m) => m.id !== messageId);
        store.setMessages(chatId, updated);

        const chat = store.chats.find((c) => c.id === chatId);
        if (chat?.lastMessage?.id === messageId) {
          const prev = updated[updated.length - 1];
          store.updateChat(chatId, {
            lastMessage: prev
              ? {
                  id: prev.id,
                  content: prev.content,
                  type: prev.type,
                  createdAt: prev.createdAt,
                  senderId: prev.senderId,
                  senderName: prev.sender?.displayName ?? null,
                  status: prev.status,
                }
              : null,
          });
        }
      }
    },
    [],
  );

  const editMessage = useCallback((chatId: string, messageId: string, content: string) => {
    socketManager.emit(SOCKET_EVENTS.MESSAGE_EDIT, { chatId, messageId, content });
  }, []);

  return (
    <SocketContext.Provider
      value={{
        isConnected,
        joinChat,
        leaveChat,
        sendMessage,
        markAsRead,
        startTyping,
        stopTyping,
        deleteMessage,
        editMessage,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export const useSocketContext = (): SocketContextType => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocketContext must be used within a SocketProvider');
  return ctx;
};
