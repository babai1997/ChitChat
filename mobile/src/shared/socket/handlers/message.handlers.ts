import { SOCKET_EVENTS } from '../../constants/socket-events';
import { socketManager } from '../SocketManager';
import { useChatStore } from '../../../stores/chatStore';
import { useAuthStore } from '../../../stores/authStore';
import { chatApi } from '../../../api';
import { decryptMessagesInPlace } from '../../../services/e2eeSessions';
import { setCachedPlaintext } from '../../../services/decryptedMessageCache';
import type { Message } from '../../../types';

// ─── Handlers ──────────────────────────────────────────────────────────────

const handleNewMessage = async (message: Message & { tempId?: string }) => {
  console.log('[Socket] message:new', message.id, 'tempId:', message.tempId);

  const store = useChatStore.getState();
  const currentUserId = useAuthStore.getState().user?.id;
  const existingChat = store.chats.find((c) => c.id === message.chatId);

  // decryptMessagesInPlace checks the persistent plaintext cache first and
  // writes to it on success — encryption is fully absorbed here at the
  // socket-handler boundary, so every downstream consumer (chat store,
  // MessageBubble, lastMessage previews) keeps reading `message.content`
  // exactly like it always has (see E2EE_PLAN.md's Phase 1/2).
  await decryptMessagesInPlace([message], existingChat?.type === 'group' || existingChat?.type === 'meeting');

  if (existingChat) {
    // addMessage is dedup-aware — checks both real id and tempId
    store.addMessage(message.chatId, message);

    const isActive = store.activeChat?.id === message.chatId;
    const isOwn = message.senderId === currentUserId;

    store.updateChat(message.chatId, {
      lastMessage: {
        id: message.id,
        content: message.content ?? '',
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
      // Cache-checked, so this is a no-op if it's the same message we just
      // decrypted above (the common case — a new chat's first message).
      // LastMessage has no chatId of its own, so pass the boolean form.
      if (newChat.lastMessage) {
        await decryptMessagesInPlace([newChat.lastMessage], newChat.type === 'group' || newChat.type === 'meeting');
      }
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
const handleMessageSent = async ({ tempId, message }: { tempId: string; message: Message }) => {
  console.log('[Socket] message:sent', tempId, '->', message.id);
  const store = useChatStore.getState();

  // For an encrypted message, this ack's `content`/`cipher` are null — the
  // server resolved no specific requester device for this generic DTO, and
  // the sender doesn't need to decrypt their own message anyway. The
  // optimistic temp entry already holds the real plaintext (what the user
  // just typed), so preserve it instead of overwriting it with null.
  const optimistic = (store.messages[message.chatId] || []).find((m) => m.id === tempId);
  const resolvedContent = message.isEncrypted ? (optimistic?.content ?? null) : message.content;

  // This is the ONLY moment this device ever knows both the real message id
  // and its plaintext for a message it sent — there is no cipher addressed
  // to your own device, so without caching it now, re-focusing this chat
  // screen later (chat/[id].tsx re-fetches history on every focus) would
  // have no way to ever recover this message's content again.
  if (message.isEncrypted && resolvedContent !== null) {
    await setCachedPlaintext(message.id, resolvedContent);
  }

  // replaceMessage atomically swaps tempId → realMessage (fixes duplicate bug).
  // For an encrypted ATTACHMENT, the server's own message has no
  // `attachments` (the real file only ever lives inside the encrypted
  // descriptor in `content` — see ChatInput.tsx) — keep the optimistic
  // entry's local-URI attachments so the sender's own bubble doesn't flash
  // into a "Decrypting…" state for a file this device already has in memory.
  store.replaceMessage(message.chatId, tempId, {
    ...message,
    content: resolvedContent,
    status: 'sent',
    attachments: message.attachments?.length ? message.attachments : optimistic?.attachments || [],
  });

  // Sync the lastMessage preview in the chat list
  const chat = store.chats.find((c) => c.id === message.chatId);
  if (chat?.lastMessage?.id === tempId) {
    store.updateChat(message.chatId, {
      lastMessage: {
        ...chat.lastMessage,
        content: resolvedContent ?? chat.lastMessage.content,
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
