import { SOCKET_EVENTS } from '../../constants/socket-events';
import { socketManager } from '../SocketManager';
import { useChatStore } from '../../../stores/chatStore';

const handleTypingStart = (data: { chatId: string; userId: string }) => {
  useChatStore.getState().setTypingUser(data.chatId, data.userId, true);
};

const handleTypingStop = (data: { chatId: string; userId: string }) => {
  useChatStore.getState().setTypingUser(data.chatId, data.userId, false);
};

const handleUserOnline = (data: { userId: string }) => {
  useChatStore.getState().setUserOnline(data.userId, true);
};

const handleUserOffline = (data: { userId: string; lastSeen?: string }) => {
  useChatStore.getState().setUserOnline(data.userId, false, data.lastSeen);
};

const handleUsersOnline = (userIds: string[]) => {
  console.log('[Socket] users:online —', userIds.length, 'users online');
  useChatStore.getState().setOnlineUsers(userIds);
};

export function registerPresenceHandlers(): () => void {
  socketManager.on(SOCKET_EVENTS.TYPING_START, handleTypingStart as any);
  socketManager.on(SOCKET_EVENTS.TYPING_STOP, handleTypingStop as any);
  socketManager.on(SOCKET_EVENTS.USER_ONLINE, handleUserOnline as any);
  socketManager.on(SOCKET_EVENTS.USER_OFFLINE, handleUserOffline as any);
  socketManager.on(SOCKET_EVENTS.USERS_ONLINE, handleUsersOnline as any);

  return () => {
    socketManager.off(SOCKET_EVENTS.TYPING_START, handleTypingStart as any);
    socketManager.off(SOCKET_EVENTS.TYPING_STOP, handleTypingStop as any);
    socketManager.off(SOCKET_EVENTS.USER_ONLINE, handleUserOnline as any);
    socketManager.off(SOCKET_EVENTS.USER_OFFLINE, handleUserOffline as any);
    socketManager.off(SOCKET_EVENTS.USERS_ONLINE, handleUsersOnline as any);
  };
}
