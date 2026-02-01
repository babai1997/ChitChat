import React, { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import type { Message } from '../types';
import { SocketContext, SOCKET_URL } from './SocketContextShared';
import { chatApi } from '../api';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { accessToken, isAuthenticated } = useAuthStore();

  // Single useEffect for socket lifecycle management
  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      console.log('[Socket] Not authenticated or no token:', { isAuthenticated, hasToken: !!accessToken });
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Don't recreate if already connected
    if (socket?.connected) {
      console.log('[Socket] Already connected, skipping reconnection');
      return;
    }

    // Disconnect existing socket if any before creating new one
    if (socket) {
      socket.disconnect();
    }

    console.log('[Socket] Initializing connection to:', SOCKET_URL);

    const newSocket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    // Connection lifecycle handlers
    const onConnect = () => {
      console.log('🔌 Connected to WebSocket, socket ID:', newSocket.id);
      setIsConnected(true);
    };

    const onDisconnect = (reason: string) => {
      console.log('🔌 Disconnected from WebSocket:', reason);
      setIsConnected(false);
    };

    const onConnectError = (error: Error) => {
      console.error('🔌 Connection error:', error.message);
      setIsConnected(false);
    };

    // Message handlers - use getState() to avoid stale closures
    const handleNewMessage = async (message: Message) => {
      console.log('[Socket] message:new received:', message);
      const store = useChatStore.getState();
      const authStore = useAuthStore.getState();
      const currentUserId = authStore.user?.id;
      
      const existingChat = store.chats.find(c => c.id === message.chatId);
      console.log('[Socket] Existing chat found?', !!existingChat, 'ChatID:', message.chatId);

      if (existingChat) {
        console.log('[Socket] Processing message for existing chat');
        store.addMessage(message.chatId, message);
        
        const isActive = store.activeChat?.id === message.chatId;
        const isOwnMessage = message.senderId === currentUserId;
        
        let newUnreadCount = existingChat.unreadCount || 0;
        if (!isActive && !isOwnMessage) {
          newUnreadCount += 1;
        }
        
        store.updateChat(message.chatId, {
          lastMessage: {
            id: message.id,
            content: message.content,
            type: message.type,
            createdAt: message.createdAt,
            senderId: message.senderId,
            senderName: message.sender.displayName,
            status: message.status,
          },
          updatedAt: message.createdAt,
          unreadCount: newUnreadCount,
        });
      } else {
        console.log('[Socket] Chat not found in store, fetching details...');
        try {
          const newChat = await chatApi.getChat(message.chatId);
          console.log('[Socket] Chat details fetched:', newChat.id);
          const authStore = useAuthStore.getState();
          if (message.senderId !== authStore.user?.id) {
            newChat.unreadCount = (newChat.unreadCount || 0) > 0 ? newChat.unreadCount : 1;
          }
          useChatStore.getState().addChat(newChat);
          useChatStore.getState().addMessage(message.chatId, message);
          console.log('[Socket] New chat and message added to store');
        } catch (error) {
          console.error("[Socket] Failed to fetch new chat details", error);
        }
      }
    };

    const handleMessageSent = (data: { tempId: string; message: Message }) => {
      console.log('[Socket] message:sent received:', data.tempId, '->', data.message.id);
      const store = useChatStore.getState();
      store.updateMessage(data.message.chatId, data.tempId, {
        ...data.message,
        status: 'sent',
      });

      const chat = store.chats.find(c => c.id === data.message.chatId);
      if (chat && chat.lastMessage?.id === data.tempId) {
        store.updateChat(chat.id, {
          lastMessage: {
            ...chat.lastMessage,
            id: data.message.id,
            status: 'sent',
            createdAt: data.message.createdAt,
          },
        });
      }
    };

    const handleMessageDelivered = (data: { chatId: string; messageId: string; tempId?: string }) => {
      console.log('[Socket] message:delivered received:', data.chatId, data.messageId, 'tempId:', data.tempId);
      const store = useChatStore.getState();
      
      // Try updating by messageId first
      store.updateMessage(data.chatId, data.messageId, { status: 'delivered' });
      
      // Also try updating by tempId (in case message:sent hasn't processed yet)
      if (data.tempId) {
        store.updateMessage(data.chatId, data.tempId, { 
          id: data.messageId, // Update the id too
          status: 'delivered' 
        });
      }

      // Update lastMessage status - check by both messageId and tempId
      const chat = store.chats.find(c => c.id === data.chatId);
      if (chat && chat.lastMessage) {
        if (chat.lastMessage.id === data.messageId || chat.lastMessage.id === data.tempId) {
          store.updateChat(chat.id, {
            lastMessage: {
              ...chat.lastMessage,
              id: data.messageId,
              status: 'delivered',
            },
          });
        }
      }
    };

    const handleMessageRead = (data: { chatId: string; messageIds: string[] }) => {
      console.log('[Socket] message:read received:', data.chatId, data.messageIds);
      const store = useChatStore.getState();
      data.messageIds.forEach((messageId) => {
        store.updateMessage(data.chatId, messageId, { status: 'read' });
      });
      
      // Update lastMessage status if it's among the read messages
      const chat = store.chats.find(c => c.id === data.chatId);
      if (chat && chat.lastMessage && data.messageIds.includes(chat.lastMessage.id)) {
        store.updateChat(chat.id, {
          lastMessage: {
            ...chat.lastMessage,
            status: 'read',
          },
        });
      }
    };

    const handleNewChat = (chat: any) => {
      console.log('[Socket] chat:new received:', chat.id);
      useChatStore.getState().addChat(chat);
    };

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
      console.log('[Socket] users:online received:', userIds.length, 'users');
      useChatStore.getState().setOnlineUsers(userIds);
    };

    const handleError = (error: { message: string }) => {
      console.error('[Socket] error:', error.message);
    };

    const handleMessageDeleted = (data: { messageId: string; chatId: string; deleteForEveryone: boolean }) => {
      console.log('[Socket] message:deleted received:', data);
      const store = useChatStore.getState();
      
      // Update the message in the store
      store.updateMessage(data.chatId, data.messageId, {
        isDeleted: true,
        content: null, // Clear content for deleted messages
      });

      // Update last message if needed
      const chat = store.chats.find(c => c.id === data.chatId);
      if (chat && chat.lastMessage?.id === data.messageId) {
        store.updateChat(chat.id, {
          lastMessage: {
            ...chat.lastMessage,
            content: 'This message was deleted', // Placeholder for last message preview
          },
        });
      }
    };

    const handleMessageEdited = (data: { messageId: string; chatId: string; message: any }) => {
      console.log('[Socket] message:edited received:', data);
      const store = useChatStore.getState();
      
      // Update the message in the store
      store.updateMessage(data.chatId, data.messageId, {
        content: data.message.content,
        isEdited: true,
      });

      // Update last message if needed
      const chat = store.chats.find(c => c.id === data.chatId);
      if (chat && chat.lastMessage?.id === data.messageId) {
        store.updateChat(chat.id, {
          lastMessage: {
            ...chat.lastMessage,
            content: data.message.content,
          },
        });
      }
    };

    // Attach all listeners
    newSocket.on('connect', onConnect);
    newSocket.on('disconnect', onDisconnect);
    newSocket.on('connect_error', onConnectError);
    newSocket.on('message:new', handleNewMessage);
    newSocket.on('message:sent', handleMessageSent);
    newSocket.on('message:delivered', handleMessageDelivered);
    newSocket.on('message:read', handleMessageRead);
    newSocket.on('message:deleted', handleMessageDeleted);
    newSocket.on('message:edited', handleMessageEdited);
    newSocket.on('chat:new', handleNewChat);
    newSocket.on('typing:start', handleTypingStart);
    newSocket.on('typing:stop', handleTypingStop);
    newSocket.on('user:online', handleUserOnline);
    newSocket.on('user:offline', handleUserOffline);
    newSocket.on('users:online', handleUsersOnline);
    newSocket.on('error', handleError);

    console.log('[Socket] Event listeners attached');
    setSocket(newSocket);

    return () => {
      console.log('[Socket] Cleaning up socket connection');
      newSocket.off('connect', onConnect);
      newSocket.off('disconnect', onDisconnect);
      newSocket.off('connect_error', onConnectError);
      newSocket.off('message:new', handleNewMessage);
      newSocket.off('message:sent', handleMessageSent);
      newSocket.off('message:delivered', handleMessageDelivered);
      newSocket.off('message:read', handleMessageRead);
      newSocket.off('message:deleted', handleMessageDeleted);
      newSocket.off('message:edited', handleMessageEdited);
      newSocket.off('chat:new', handleNewChat);
      newSocket.off('typing:start', handleTypingStart);
      newSocket.off('typing:stop', handleTypingStop);
      newSocket.off('user:online', handleUserOnline);
      newSocket.off('user:offline', handleUserOffline);
      newSocket.off('users:online', handleUsersOnline);
      newSocket.off('error', handleError);
      newSocket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, accessToken]);

  const joinChat = useCallback((chatId: string) => {
    if (socket?.connected) {
      console.log('[Socket] Joining chat room:', chatId);
      socket.emit('chat:join', { chatId });
    }
  }, [socket]);

  const leaveChat = useCallback((chatId: string) => {
    if (socket?.connected) {
      socket.emit('chat:leave', { chatId });
    }
  }, [socket]);

  const sendMessage = useCallback(
    (chatId: string, content: string, type: string = 'text', replyToId?: string) => {
      if (socket?.connected) {
        const tempId = `temp-${Date.now()}`;
        console.log('[Socket] Sending message:', tempId);
        socket.emit('message:send', {
          chatId,
          content,
          type,
          replyToId,
          tempId,
        });
        return tempId;
      }
      console.warn('[Socket] Cannot send message - not connected');
      return null;
    },
    [socket]
  );

  const markAsRead = useCallback((chatId: string, messageIds: string[]) => {
    if (socket?.connected) {
      socket.emit('message:read', { chatId, messageIds });
    }
  }, [socket]);

  const startTyping = useCallback((chatId: string) => {
    if (socket?.connected) {
      socket.emit('typing:start', { chatId });
    }
  }, [socket]);

  const stopTyping = useCallback((chatId: string) => {
    if (socket?.connected) {
      socket.emit('typing:stop', { chatId });
    }
  }, [socket]);

  const deleteMessage = useCallback((chatId: string, messageId: string, deleteForEveryone: boolean) => {
    if (socket?.connected) {
      socket.emit('message:delete', { chatId, messageId, deleteForEveryone });
      
      // Handle "delete for me" locally immediately
      if (!deleteForEveryone) {
         const store = useChatStore.getState();
         // Remove the message from the store locally
         const currentMessages = store.messages[chatId] || [];
         const updatedMessages = currentMessages.filter(m => m.id !== messageId);
         store.setMessages(chatId, updatedMessages);
         
         // Update last message if needed
         const chat = store.chats.find(c => c.id === chatId);
         if (chat && chat.lastMessage?.id === messageId) {
           // If we deleted the last message, we should probably set it to the previous one
           // But for simplicity, let's just leave it or set meaningful text
           const newLastMsg = updatedMessages[updatedMessages.length - 1];
           if (newLastMsg) {
             store.updateChat(chatId, {
               lastMessage: {
                 id: newLastMsg.id,
                 content: newLastMsg.content,
                 type: newLastMsg.type,
                 createdAt: newLastMsg.createdAt,
                 senderId: newLastMsg.senderId,
                 senderName: newLastMsg.sender.displayName,
                 status: newLastMsg.status,
               },
             });
           } else {
             // No messages left
              store.updateChat(chatId, {
               lastMessage: undefined
             });
           }
         }
      }
    }
  }, [socket]);

  const editMessage = useCallback((chatId: string, messageId: string, content: string) => {
    if (socket?.connected) {
      socket.emit('message:edit', { chatId, messageId, content });
    }
  }, [socket]);

  return (
    <SocketContext.Provider
      value={{
        socket,
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
