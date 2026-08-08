import React, { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { SocketContext, SOCKET_URL } from './SocketContextShared';
import { socketManager } from '../shared/socket/SocketManager';
import { registerMessageHandlers } from '../shared/socket/handlers/message.handlers';
import { registerPresenceHandlers } from '../shared/socket/handlers/presence.handlers';
import { registerChatHandlers } from '../shared/socket/handlers/chat.handlers';
import { registerDeviceLinkHandlers } from '../shared/socket/handlers/deviceLink.handlers';
import { SOCKET_EVENTS } from '../shared/constants/socket-events';
import { registerE2eeDevice } from '../services/e2ee';
import { encryptForMembers } from '../services/e2eeSessions';
import { encryptGroupMessage, fetchAndApplyPendingDistributions } from '../services/e2eeGroupSessions';
import { getOrCreateDeviceId } from '../services/deviceId';

/**
 * SocketProvider — thin React wrapper around the SocketManager singleton.
 *
 * Responsibilities:
 *  1. Connect / disconnect based on auth state
 *  2. Register / unregister domain event handlers
 *  3. Expose socket action methods via context
 *
 * All business logic lives in the handler files, not here.
 */
export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const { accessToken, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      socketManager.disconnect();
      // Use setTimeout to avoid synchronous setState inside useEffect warning
      setTimeout(() => { setIsConnected(false); setIsReconnecting(false); }, 0);
      return;
    }

    // Connect with JWT in handshake auth
    socketManager.connect(SOCKET_URL, accessToken, getOrCreateDeviceId());
    void registerE2eeDevice();
    // Catches up on any Sender Key distribution this device missed while
    // offline (or never got a real-time SENDER_KEY_NEW push for) — see
    // e2eeGroupSessions.ts. Safe to call on every (re)connect: reapplying an
    // already-known chain is a no-op.
    void fetchAndApplyPendingDistributions();

    // Track connection state
    const onConnect = () => { setIsConnected(true); setIsReconnecting(false); };
    const onDisconnect = (reason: unknown) => {
      setIsConnected(false);
      // Intentional disconnects (server kicked or client called disconnect()) are not reconnecting states
      const intentional = reason === 'io client disconnect' || reason === 'io server disconnect';
      setIsReconnecting(!intentional);
    };
    const onConnectError = (err: Error) => {
      console.error('[Socket] Connection error:', err.message);
      setIsConnected(false);
      setIsReconnecting(true);
    };

    socketManager.on('connect', onConnect);
    socketManager.on('disconnect', onDisconnect as any);
    socketManager.on('connect_error', onConnectError as any);

    // Register domain handlers — each returns a cleanup function
    const cleanupMessages = registerMessageHandlers();
    const cleanupPresence = registerPresenceHandlers();
    const cleanupChats = registerChatHandlers();
    const cleanupDeviceLink = registerDeviceLinkHandlers();

    return () => {
      socketManager.off('connect', onConnect);
      socketManager.off('disconnect', onDisconnect);
      socketManager.off('connect_error', onConnectError as any);
      cleanupMessages();
      cleanupDeviceLink();
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
    (chatId: string, content: string, type = 'text', replyToId?: string) => {
      if (!socketManager.isConnected) {
        console.warn('[Socket] Cannot send — not connected');
        return null;
      }

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const chat = useChatStore.getState().chats.find((c) => c.id === chatId);

      // Both direct (Phase 1, per-device Double Ratchet) and group (Phase 2,
      // Sender Keys) chats are E2EE. Encryption needs an async key-bundle
      // fetch either way, but the caller needs tempId synchronously for the
      // optimistic UI — so we return it right away and emit once encryption
      // finishes, same as any other fire-and-forget send.
      if (chat?.type === 'direct') {
        const memberUserIds = chat.members.map((m) => m.userId);
        void encryptForMembers(memberUserIds, content)
          .then((ciphers) => {
            socketManager.emit(SOCKET_EVENTS.MESSAGE_SEND, {
              chatId,
              type,
              replyToId,
              tempId,
              isEncrypted: true,
              ciphers,
            });
          })
          .catch((err) => {
            console.error('[E2EE] Failed to encrypt message:', err);
          });
      } else if (chat?.type === 'group' || chat?.type === 'meeting') {
        // 'meeting' chats use the exact same Sender-Key group E2EE as
        // 'group' — without this branch, a meeting chat fell through to
        // the plaintext else-case below (this WAS a real bug: E2EE
        // silently didn't apply to any in-meeting text chat at all).
        const memberUserIds = chat.members.map((m) => m.userId);
        void encryptGroupMessage(chatId, memberUserIds, content)
          .then((groupCiphertext) => {
            socketManager.emit(SOCKET_EVENTS.MESSAGE_SEND, {
              chatId,
              type,
              replyToId,
              tempId,
              isEncrypted: true,
              groupCiphertext,
            });
          })
          .catch((err) => {
            console.error('[E2EE] Failed to encrypt group message:', err);
          });
      } else {
        socketManager.emit(SOCKET_EVENTS.MESSAGE_SEND, { chatId, content, type, replyToId, tempId });
      }

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

      // "Delete for me" — remove locally without waiting for server
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
                  content: prev.content ?? '',
                  type: prev.type,
                  createdAt: prev.createdAt,
                  senderId: prev.senderId,
                  senderName: prev.sender?.displayName ?? null,
                  status: prev.status,
                }
              : undefined,
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
        socket: socketManager.instance,
        isConnected,
        isReconnecting,
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
