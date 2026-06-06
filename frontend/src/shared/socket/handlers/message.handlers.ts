import { SOCKET_EVENTS } from '../../constants/socket-events';
import { socketManager } from '../SocketManager';
import { useChatStore } from '../../../stores/chatStore';
import { useAuthStore } from '../../../stores/authStore';
import { chatApi } from '../../../api';
import type { Message } from '../../../types';

// ─── Handlers ──────────────────────────────────────────────────────────────

const handleNewMessage = async (message: Message & { tempId?: string }) => {
  console.log('[Socket] message:new', message.id, 'tempId:', message.tempId);

  const store = useChatStore.getState();
  const currentUserId = useAuthStore.getState().user?.id;
  const existingChat = store.chats.find((c) => c.id === message.chatId);

  if (existingChat) {
    // addMessage is dedup-aware — checks both real id and tempId
    store.addMessage(message.chatId, message);

    const isActive = store.activeChat?.id === message.chatId;
    const isOwn = message.senderId === currentUserId;

    store.updateChat(message.chatId, {
      lastMessage: {
        id: message.id,
        content: message.content,
        type: message.type,
        createdAt: message.createdAt,
        senderId: message.senderId,
        senderName: message.sender?.displayName ?? null,
        status: message.status,
      },
      updatedAt: message.createdAt,
      unreadCount: !isActive && !isOwn
        ? (existingChat.unreadCount || 0) + 1
        : existingChat.unreadCount || 0,
    });
  } else {
    // New chat we haven't loaded yet — fetch its details first
    try {
      const newChat = await chatApi.getChat(message.chatId);
      const isOwn = message.senderId === useAuthStore.getState().user?.id;
      if (!isOwn) {
        newChat.unreadCount = Math.max(newChat.unreadCount || 0, 1);
      }
      store.addChat(newChat);
      store.addMessage(message.chatId, message);
    } catch (err) {
      console.error('[Socket] Failed to fetch new chat details', err);
    }
  }
};

/**
 * message:sent — sender-only event.
 * Atomically replaces the optimistic temp entry with the confirmed real message.
 * This is the fix for the duplicate message bug.
 */
const handleMessageSent = ({ tempId, message }: { tempId: string; message: Message }) => {
  console.log('[Socket] message:sent', tempId, '->', message.id);
  const store = useChatStore.getState();

  // replaceMessage atomically swaps tempId → realMessage (fixes duplicate bug)
  store.replaceMessage(message.chatId, tempId, { ...message, status: 'sent' });

  // Sync the lastMessage preview in the chat list
  const chat = store.chats.find((c) => c.id === message.chatId);
  if (chat?.lastMessage?.id === tempId) {
    store.updateChat(message.chatId, {
      lastMessage: {
        ...chat.lastMessage,
        id: message.id,
        status: 'sent',
        createdAt: message.createdAt,
      },
    });
  }
};

const handleMessageDelivered = ({
  chatId,
  messageId,
}: {
  chatId: string;
  messageId: string;
}) => {
  console.log('[Socket] message:delivered', messageId);
  useChatStore.getState().updateMessageStatus(chatId, messageId, 'delivered');

  const store = useChatStore.getState();
  const chat = store.chats.find((c) => c.id === chatId);
  if (chat?.lastMessage?.id === messageId) {
    store.updateChat(chatId, {
      lastMessage: { ...chat.lastMessage, status: 'delivered' },
    });
  }
};

const handleMessageRead = ({
  chatId,
  messageIds,
}: {
  chatId: string;
  messageIds: string[];
}) => {
  console.log('[Socket] message:read', messageIds.length, 'messages');
  const store = useChatStore.getState();
  messageIds.forEach((id) => store.updateMessageStatus(chatId, id, 'read'));

  const chat = store.chats.find((c) => c.id === chatId);
  if (chat?.lastMessage && messageIds.includes(chat.lastMessage.id)) {
    store.updateChat(chatId, {
      lastMessage: { ...chat.lastMessage, status: 'read' },
    });
  }
};

const handleMessageDeleted = ({
  messageId,
  chatId,
}: {
  messageId: string;
  chatId: string;
  deleteForEveryone: boolean;
}) => {
  console.log('[Socket] message:deleted', messageId);
  const store = useChatStore.getState();
  store.updateMessage(chatId, messageId, { isDeleted: true, content: '' });

  const chat = store.chats.find((c) => c.id === chatId);
  if (chat?.lastMessage?.id === messageId) {
    store.updateChat(chatId, {
      lastMessage: { ...chat.lastMessage, content: 'This message was deleted' },
    });
  }
};

const handleMessageEdited = ({
  messageId,
  chatId,
  message,
}: {
  messageId: string;
  chatId: string;
  message: { content: string };
}) => {
  console.log('[Socket] message:edited', messageId);
  const store = useChatStore.getState();
  store.updateMessage(chatId, messageId, { content: message.content, isEdited: true });

  const chat = store.chats.find((c) => c.id === chatId);
  if (chat?.lastMessage?.id === messageId) {
    store.updateChat(chatId, {
      lastMessage: { ...chat.lastMessage, content: message.content },
    });
  }
};

// ─── Registration ───────────────────────────────────────────────────────────

export function registerMessageHandlers(): () => void {
  socketManager.on(SOCKET_EVENTS.MESSAGE_NEW, handleNewMessage as any);
  socketManager.on(SOCKET_EVENTS.MESSAGE_SENT, handleMessageSent as any);
  socketManager.on(SOCKET_EVENTS.MESSAGE_DELIVERED, handleMessageDelivered as any);
  socketManager.on(SOCKET_EVENTS.MESSAGE_READ_ACK, handleMessageRead as any);
  socketManager.on(SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted as any);
  socketManager.on(SOCKET_EVENTS.MESSAGE_EDITED, handleMessageEdited as any);

  return () => {
    socketManager.off(SOCKET_EVENTS.MESSAGE_NEW, handleNewMessage as any);
    socketManager.off(SOCKET_EVENTS.MESSAGE_SENT, handleMessageSent as any);
    socketManager.off(SOCKET_EVENTS.MESSAGE_DELIVERED, handleMessageDelivered as any);
    socketManager.off(SOCKET_EVENTS.MESSAGE_READ_ACK, handleMessageRead as any);
    socketManager.off(SOCKET_EVENTS.MESSAGE_DELETED, handleMessageDeleted as any);
    socketManager.off(SOCKET_EVENTS.MESSAGE_EDITED, handleMessageEdited as any);
  };
}
