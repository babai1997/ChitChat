import { SOCKET_EVENTS } from '../../constants/socket-events';
import { socketManager } from '../SocketManager';
import { useChatStore } from '../../../stores/chatStore';
import { useAuthStore } from '../../../stores/authStore';
import {
  distributeSenderKeyToNewMember,
  rekeySenderKey,
  handleIncomingDistribution,
} from '../../../services/e2eeGroupSessions';
import type { Chat } from '../../../types';

const handleChatNew = (chat: Chat) => {
  console.log('[Socket] chat:new', chat.id);
  // addChat uses upsert logic — updates if exists, inserts if not
  useChatStore.getState().upsertChat(chat);
};

// A new member joined a group — if this device already owns an active
// Sender Key chain for that chat (i.e. it's sent a group message before),
// distribute the CURRENT chain to just the new member's devices. No
// retroactive history access — matches Signal/WhatsApp's default (see
// E2EE_PLAN.md's Phase 2).
const handleChatMemberAdded = ({ chatId, newUserId }: { chatId: string; newUserId: string }) => {
  console.log('[Socket] chat:member-added', chatId, newUserId);
  if (newUserId === useAuthStore.getState().user?.id) return; // that's us — nothing to distribute to ourselves
  void distributeSenderKeyToNewMember(chatId, newUserId);
};

// A member left/was removed — every remaining Sender Key owner (including
// this device, if it has one for this chat) must rekey: a fresh chain,
// redistributed only to `remainingMemberIds`, so the removed member's
// cached old chain key can't decrypt anything sent from now on.
const handleChatMemberRemoved = ({
  chatId,
  remainingMemberIds,
}: {
  chatId: string;
  removedUserId: string;
  remainingMemberIds: string[];
}) => {
  console.log('[Socket] chat:member-removed', chatId);
  void rekeySenderKey(chatId, remainingMemberIds);
};

// Real-time push of a Sender Key distribution — see e2eeGroupSessions.ts.
const handleSenderKeyNew = (payload: {
  chatId: string;
  senderUserId: string;
  senderDeviceId: string;
  ciphertext: string;
}) => {
  console.log('[Socket] sender-key:new', payload.chatId, payload.senderUserId);
  void handleIncomingDistribution(payload);
};

// A group's name/avatar changed — without this, only the member who made
// the change sees it; everyone else was stuck with stale data until a
// full app reload forced a refetch.
const handleChatUpdated = ({
  chatId,
  name,
  avatarUrl,
}: {
  chatId: string;
  name: string | null;
  avatarUrl: string | null;
}) => {
  console.log('[Socket] chat:updated', chatId);
  useChatStore.getState().updateChat(chatId, { name, avatarUrl });
};

// Someone was promoted to admin or demoted back to member — without this,
// only the admin who made the change sees the new role; everyone else's
// member list stays stale until a full refetch.
const handleChatMemberRoleUpdated = ({
  chatId,
  userId,
  role,
}: {
  chatId: string;
  userId: string;
  role: 'admin' | 'member';
}) => {
  console.log('[Socket] chat:member-role-updated', chatId, userId, role);
  useChatStore.getState().updateMemberRole(chatId, userId, role);
};

// A contact you share a chat with changed their displayName/avatarUrl/about —
// patches every chat's embedded member snapshot for that user (see
// updateMemberProfile). Same root cause as chat:updated: profile data is
// otherwise a point-in-time copy with no update path short of a refetch.
const handleProfileUpdated = ({
  userId,
  displayName,
  avatarUrl,
  about,
}: {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  about: string;
}) => {
  console.log('[Socket] profile:updated', userId);
  useChatStore.getState().updateMemberProfile(userId, { displayName, avatarUrl, about });
};

export function registerChatHandlers(): () => void {
  socketManager.on(SOCKET_EVENTS.CHAT_NEW, handleChatNew as any);
  socketManager.on(SOCKET_EVENTS.CHAT_MEMBER_ADDED, handleChatMemberAdded as any);
  socketManager.on(SOCKET_EVENTS.CHAT_MEMBER_REMOVED, handleChatMemberRemoved as any);
  socketManager.on(SOCKET_EVENTS.SENDER_KEY_NEW, handleSenderKeyNew as any);
  socketManager.on(SOCKET_EVENTS.CHAT_UPDATED, handleChatUpdated as any);
  socketManager.on(SOCKET_EVENTS.CHAT_MEMBER_ROLE_UPDATED, handleChatMemberRoleUpdated as any);
  socketManager.on(SOCKET_EVENTS.PROFILE_UPDATED, handleProfileUpdated as any);

  return () => {
    socketManager.off(SOCKET_EVENTS.CHAT_NEW, handleChatNew as any);
    socketManager.off(SOCKET_EVENTS.CHAT_MEMBER_ADDED, handleChatMemberAdded as any);
    socketManager.off(SOCKET_EVENTS.CHAT_MEMBER_REMOVED, handleChatMemberRemoved as any);
    socketManager.off(SOCKET_EVENTS.SENDER_KEY_NEW, handleSenderKeyNew as any);
    socketManager.off(SOCKET_EVENTS.CHAT_UPDATED, handleChatUpdated as any);
    socketManager.off(SOCKET_EVENTS.CHAT_MEMBER_ROLE_UPDATED, handleChatMemberRoleUpdated as any);
    socketManager.off(SOCKET_EVENTS.PROFILE_UPDATED, handleProfileUpdated as any);
  };
}
