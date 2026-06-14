import { socketManager } from '../shared/socket/SocketManager';
import { SOCKET_EVENTS } from '../shared/constants/socket-events';
import { useChatStore } from '../stores/chatStore';
import * as Crypto from 'expo-crypto';

/**
 * useSocket — thin hook exposing socket action methods.
 * The socket is connected/disconnected globally by SocketProvider in _layout.tsx.
 * This hook is a pure action dispatcher — no side-effects, no subscriptions.
 */
export const useSocket = () => {
  return {
    joinChat: (chatId: string) => {
      socketManager.emit(SOCKET_EVENTS.CHAT_JOIN, { chatId });
    },

    leaveChat: (chatId: string) => {
      socketManager.emit(SOCKET_EVENTS.CHAT_LEAVE, { chatId });
    },

    sendMessage: (
      chatId: string,
      content: string,
      type = 'text',
      replyToId?: string,
      attachments?: any[],
    ) => {
      const tempId = Crypto.randomUUID();
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

    markAsRead: (chatId: string, messageIds: string[]) => {
      socketManager.emit(SOCKET_EVENTS.MESSAGE_READ, { chatId, messageIds });
    },

    startTyping: (chatId: string) => {
      socketManager.emit(SOCKET_EVENTS.TYPING_START, { chatId });
    },

    stopTyping: (chatId: string) => {
      socketManager.emit(SOCKET_EVENTS.TYPING_STOP, { chatId });
    },

    deleteMessage: (chatId: string, messageId: string, deleteForEveryone: boolean) => {
      socketManager.emit(SOCKET_EVENTS.MESSAGE_DELETE, {
        chatId,
        messageId,
        deleteForEveryone,
      });

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

    editMessage: (chatId: string, messageId: string, content: string) => {
      socketManager.emit(SOCKET_EVENTS.MESSAGE_EDIT, { chatId, messageId, content });
    },

    get isConnected() {
      return socketManager.isConnected;
    },

    get socket() {
      return socketManager.instance;
    },
  };
};
