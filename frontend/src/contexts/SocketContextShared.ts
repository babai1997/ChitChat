import { createContext, useContext } from 'react';
import { Socket } from 'socket.io-client';

// Use VITE_SOCKET_URL for the backend host (e.g. http://localhost:3000).
// The namespace '/chat' is appended automatically by the SocketManager.
// Fallback to localhost:3000 for local development.
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

export interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinChat: (chatId: string) => void;
  leaveChat: (chatId: string) => void;
  sendMessage: (chatId: string, content: string, type?: string, replyToId?: string) => string | null;
  markAsRead: (chatId: string, messageIds: string[]) => void;
  startTyping: (chatId: string) => void;
  stopTyping: (chatId: string) => void;
  deleteMessage: (chatId: string, messageId: string, deleteForEveryone: boolean) => void;
  editMessage: (chatId: string, messageId: string, content: string) => void;
}

export const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocketContext = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return context;
};
