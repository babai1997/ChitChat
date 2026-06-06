import { SOCKET_EVENTS } from '../../constants/socket-events';
import { socketManager } from '../SocketManager';
import { useChatStore } from '../../../stores/chatStore';
import type { Chat } from '../../../types';

const handleChatNew = (chat: Chat) => {
  console.log('[Socket] chat:new', chat.id);
  // addChat uses upsert logic — updates if exists, inserts if not
  useChatStore.getState().upsertChat(chat);
};

export function registerChatHandlers(): () => void {
  socketManager.on(SOCKET_EVENTS.CHAT_NEW, handleChatNew as any);

  return () => {
    socketManager.off(SOCKET_EVENTS.CHAT_NEW, handleChatNew as any);
  };
}
