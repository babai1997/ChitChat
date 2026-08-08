import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { socketManager } from '../shared/socket/SocketManager';
import { registerMessageHandlers } from '../shared/socket/handlers/message.handlers';
import { registerPresenceHandlers } from '../shared/socket/handlers/presence.handlers';
import { registerChatHandlers } from '../shared/socket/handlers/chat.handlers';
import { registerDeviceLinkHandlers } from '../shared/socket/handlers/deviceLink.handlers';
import { SOCKET_EVENTS } from '../shared/constants/socket-events';
import { useChatStore } from '../stores/chatStore';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { registerCallPushToken, subscribeToCallPushTokenRefresh } from '../services/callPush';
import { registerE2eeDevice } from '../services/e2ee';
import { encryptForMembers } from '../services/e2eeSessions';
import { encryptGroupMessage, fetchAndApplyPendingDistributions } from '../services/e2eeGroupSessions';
import { getOrCreateDeviceId } from '../services/deviceId';
import { getMessaging, onMessage as fcmOnMessage } from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import {
  displayMessageNotification,
  clearChatNotifications,
  sendQuickReply,
  type MessagePushData,
} from '../services/messagePushNotification';
import type { MessageType } from '../types';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error('EXPO_PUBLIC_API_URL is not set. Add it to your .env file.');
}

// ── Context type ────────────────────────────────────────────────────────────

interface SocketContextType {
  isConnected: boolean;
  isReconnecting: boolean;
  joinChat: (chatId: string) => void;
  leaveChat: (chatId: string) => void;
  sendMessage: (
    chatId: string,
    content: string,
    type?: string,
    replyToId?: string,
    attachments?: any[],
    customTempId?: string,
    replyToPreview?: { id: string; content: string | null; type: MessageType; isDeleted: boolean; senderName: string },
  ) => string | null;
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
  const [isReconnecting, setIsReconnecting] = useState(false);
  const { accessToken, isAuthenticated } = useAuthStore();
  // Tracks which chat the user is currently viewing — used to suppress
  // foreground push notifications for the chat they're already reading.
  const activeChatIdRef = useRef<string | null>(null);

  // Connect / disconnect based on auth state
  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      socketManager.disconnect();
      setIsConnected(false);
      setIsReconnecting(false);
      return;
    }

    // deviceId is read from AsyncStorage, so connect() itself has to wait for
    // it — but everything below (event listeners, handler registration) is
    // safe to register synchronously first: SocketManager.on() just queues
    // handlers until a socket exists, and connect() re-attaches all queued
    // handlers once it actually opens the connection.
    void getOrCreateDeviceId().then((deviceId) => {
      socketManager.connect(API_URL, accessToken, deviceId);
    });

    // Register this device for call wake-up push notifications (Android FCM
    // for now — see docs/CALL_NOTIFICATIONS_PLAN.md). Idempotent upsert, safe to
    // call on every reconnect/token-refresh.
    void registerCallPushToken();
    const unsubscribeTokenRefresh = subscribeToCallPushTokenRefresh();
    void registerE2eeDevice();
    // Catches up on any Sender Key distribution this device missed while
    // offline (or never got a real-time SENDER_KEY_NEW push for) — see
    // e2eeGroupSessions.ts. Safe to call on every (re)connect: reapplying an
    // already-known chain is a no-op.
    void fetchAndApplyPendingDistributions();

    const onConnect = () => { setIsConnected(true); setIsReconnecting(false); };
    const onDisconnect = (reason: unknown) => {
      setIsConnected(false);
      const intentional = reason === 'io client disconnect' || reason === 'io server disconnect';
      setIsReconnecting(!intentional);
    };
    const onConnectError = (err: Error) => {
      console.error('[Socket] Connection error:', err.message);
      setIsConnected(false);
      setIsReconnecting(true);
    };

    socketManager.on('connect', onConnect);
    socketManager.on('disconnect', onDisconnect);
    socketManager.on('connect_error', onConnectError as any);

    // Register domain handlers — each returns a cleanup fn
    const cleanupMessages = registerMessageHandlers();
    const cleanupPresence = registerPresenceHandlers();
    const cleanupChats = registerChatHandlers();
    const cleanupDeviceLink = registerDeviceLinkHandlers();

    return () => {
      socketManager.off('connect', onConnect);
      socketManager.off('disconnect', onDisconnect);
      socketManager.off('connect_error', onConnectError as any);
      cleanupMessages();
      cleanupPresence();
      cleanupChats();
      cleanupDeviceLink();
      unsubscribeTokenRefresh();
    };
  }, [isAuthenticated, accessToken]);

  // ── Action methods ─────────────────────────────────────────────────────────

  const joinChat = useCallback((chatId: string) => {
    socketManager.emit(SOCKET_EVENTS.CHAT_JOIN, { chatId });
    activeChatIdRef.current = chatId;
    // Opening a chat is the mobile equivalent of "reading" it — clear any
    // stacked message notifications for it, same as WhatsApp does.
    void clearChatNotifications(chatId);
  }, []);

  const leaveChat = useCallback((chatId: string) => {
    // Do NOT emit CHAT_LEAVE to the server — it would call socket.leave() and
    // remove this socket from the room, breaking real-time MESSAGE_NEW delivery
    // and badge updates for that chat until the next reconnect.
    // handleConnection on the server already joins all rooms on connect;
    // rooms are only cleaned up on disconnect (handled by socket.io automatically).
    if (activeChatIdRef.current === chatId) activeChatIdRef.current = null;
  }, []);

  // ── Foreground push notifications for chat messages ────────────────────────
  useEffect(() => {
    // FCM delivers foreground messages to onMessage — FCM will NOT auto-display
    // them, so we display via Notifee. Skip if the user is already in that chat.
    const unsubFcm = fcmOnMessage(getMessaging(), async (remoteMessage) => {
      if (remoteMessage.data?.kind !== 'message') return;
      const chatId = String(remoteMessage.data?.chatId ?? '');
      if (chatId && activeChatIdRef.current === chatId) return;
      const data: MessagePushData = {
        messageId: String(remoteMessage.data?.messageId ?? ''),
        chatId,
        chatName: String(remoteMessage.data?.chatName ?? remoteMessage.data?.senderName ?? ''),
        senderId: String(remoteMessage.data?.senderId ?? ''),
        senderName: String(remoteMessage.data?.senderName ?? ''),
        messageType: (remoteMessage.data?.messageType as MessagePushData['messageType']) ?? 'text',
        content: String(remoteMessage.data?.content ?? ''),
      };
      await displayMessageNotification(data);
    });

    // Notifee foreground event — navigate on tap, or send a quick reply typed
    // directly into the notification's Reply action.
    const unsubNotifee = notifee.onForegroundEvent(async ({ type, detail }) => {
      if (detail.notification?.data?.kind !== 'message') return;
      const chatId = detail.notification?.data?.chatId as string | undefined;
      if (!chatId) return;

      if (type === EventType.PRESS) {
        router.push(`/chat/${chatId}`);
        return;
      }

      if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'reply') {
        const text = detail.input;
        if (text) {
          // Sent over plain HTTP (same path as the background quick-reply) so
          // the app doesn't need this chat mounted — the resulting message.created
          // event still reaches this device's own socket and updates the store
          // normally, same as any other incoming message.
          await sendQuickReply(chatId, text);
        }
      }
    });

    return () => {
      unsubFcm();
      unsubNotifee();
    };
  }, []);

  const sendMessage = useCallback(
    (
      chatId: string,
      content: string,
      type = 'text',
      replyToId?: string,
      attachments?: any[],
      customTempId?: string,
      replyToPreview?: { id: string; content: string | null; type: MessageType; isDeleted: boolean; senderName: string },
    ) => {
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
          // Populate the quote from what the caller already has locally —
          // otherwise it only appears once the real message round-trips back.
          replyTo: replyToPreview || null,
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

      // Both direct (Phase 1, per-device Double Ratchet) and group (Phase 2,
      // Sender Keys) chats are E2EE. Encryption needs an async key-bundle
      // fetch either way — the optimistic update above already happened
      // synchronously, so this just delays the actual wire send, same as
      // any other fire-and-forget emit.
      const chat = store.chats.find((c) => c.id === chatId);
      if (chat?.type === 'direct') {
        const memberUserIds = chat.members.map((m) => m.userId);
        void encryptForMembers(memberUserIds, content)
          .then((ciphers) => {
            socketManager.emit(SOCKET_EVENTS.MESSAGE_SEND, {
              tempId,
              chatId,
              type,
              replyToId,
              attachments,
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
              tempId,
              chatId,
              type,
              replyToId,
              attachments,
              isEncrypted: true,
              groupCiphertext,
            });
          })
          .catch((err) => {
            console.error('[E2EE] Failed to encrypt group message:', err);
          });
      } else {
        socketManager.emit(SOCKET_EVENTS.MESSAGE_SEND, {
          tempId,
          chatId,
          content,
          type,
          replyToId,
          attachments,
        });
      }
      return tempId;
    },
    [],
  );

  const markAsRead = useCallback((chatId: string, messageIds: string[]) => {
    socketManager.emit(SOCKET_EVENTS.MESSAGE_READ, { chatId, messageIds });
    const store = useChatStore.getState();
    const chat = store.chats.find((c) => c.id === chatId);
    if (chat && (chat.unreadCount || 0) > 0) {
      store.updateChat(chatId, { unreadCount: 0 });
    }
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
                  content: prev.content ?? '',
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

// ── Hook ─────────────────────────────────────────────────────────────────────

export const useSocketContext = (): SocketContextType => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocketContext must be used within a SocketProvider');
  return ctx;
};
