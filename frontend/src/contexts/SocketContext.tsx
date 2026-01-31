import React, { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import type { Message } from '../types';
import { SocketContext, SOCKET_URL } from './SocketContextShared';
import { chatApi } from '../api';

// Re-export specific items if needed, but the Fast Refresh warning suggests avoiding this for non-components if mixed
// So we will NOT export them here. They should be imported from SocketContextShared.


export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const { accessToken, isAuthenticated, user } = useAuthStore();
  const { addMessage, updateMessage, setTypingUser, setUserOnline, setOnlineUsers, updateChat, addChat } = useChatStore();

  const isConnected = React.useSyncExternalStore(
    useCallback(
      (callback) => {
        if (!socket) return () => {};
        socket.on('connect', callback);
        socket.on('disconnect', callback);
        socket.on('connect_error', callback);
        return () => {
          socket.off('connect', callback);
          socket.off('disconnect', callback);
          socket.off('connect_error', callback);
        };
      },
      [socket]
    ),
    () => socket?.connected ?? false,
    () => false // Server snapshot
  );

  // Manage Socket Connection
  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      console.log('[Socket] Not authenticated or no token:', { isAuthenticated, hasToken: !!accessToken });
      return;
    }

    let isMounted = true;
    console.log('[Socket] Initializing connection to:', SOCKET_URL);

    const newSocket = io(SOCKET_URL, {
      path: '/socket.io',
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });

    // Use setTimeout to avoid synchronous setState warning
    setTimeout(() => {
      if (isMounted) {
        setSocket(newSocket);
      }
    }, 0);

    // Debug listeners for connection lifecycle
    const onConnect = () => console.log('🔌 Connected to WebSocket');
    const onDisconnect = (reason: string) => console.log('🔌 Disconnected from WebSocket:', reason);
    const onConnectError = (error: Error) => console.error('🔌 Connection error:', error.message);

    newSocket.on('connect', onConnect);
    newSocket.on('disconnect', onDisconnect);
    newSocket.on('connect_error', onConnectError);

    return () => {
      isMounted = false;
      newSocket.off('connect', onConnect);
      newSocket.off('disconnect', onDisconnect);
      newSocket.off('connect_error', onConnectError);
      newSocket.disconnect();
      setSocket(null);
    };
  }, [isAuthenticated, accessToken]);

  // Manage Application Event Listeners
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = async (message: Message) => {
        console.log('[Socket] message:new received:', message);
        const store = useChatStore.getState();
        const existingChat = store.chats.find(c => c.id === message.chatId);
        console.log('[Socket] Existing chat found:', existingChat ? 'Yes' : 'No', existingChat?.id);

        if (existingChat) {
            console.log('[Socket] Processing message for existing chat');
            addMessage(message.chatId, message);
            
            // Calculate unread count
            const isActive = store.activeChat?.id === message.chatId;
            const isOwnMessage = message.senderId === user?.id; // Use authenticated user ID
            
            let newUnreadCount = existingChat.unreadCount || 0;
            if (!isActive && !isOwnMessage) {
                 newUnreadCount += 1;
            }
            
            updateChat(message.chatId, {
              lastMessage: {
                id: message.id,
                content: message.content,
                type: message.type,
                createdAt: message.createdAt,
                senderId: message.senderId,
                senderName: message.sender.displayName,
              },
              updatedAt: message.createdAt,
              unreadCount: newUnreadCount,
            });
        } else {
             // New chat - fetch and add
            try {
                const newChat = await chatApi.getChat(message.chatId);
                // Ensure unread count is set to 1 if we just received a message and it's not active
                if (message.senderId !== user?.id) {
                    newChat.unreadCount = (newChat.unreadCount || 0) > 0 ? newChat.unreadCount : 1;
                }
                addChat(newChat);
                addMessage(message.chatId, message); 
            } catch (error) {
                console.error("Failed to fetch new chat details", error);
            }
        }
    };

    const handleMessageSent = (data: { tempId: string; message: Message }) => {
      updateMessage(data.message.chatId, data.tempId, {
        ...data.message,
        status: 'sent',
      });
    };

    const handleMessageDelivered = (data: { chatId: string; messageId: string }) => {
      updateMessage(data.chatId, data.messageId, { status: 'delivered' });
    };

    const handleMessageRead = (data: { chatId: string; messageIds: string[] }) => {
      data.messageIds.forEach((messageId) => {
        updateMessage(data.chatId, messageId, { status: 'read' });
      });
    };
    
    const handleNewChat = (chat: any) => {
        console.log('New chat received via socket:', chat);
        addChat(chat);
    };

    const handleTypingStart = (data: { chatId: string; userId: string }) => {
      setTypingUser(data.chatId, data.userId, true);
    };

    const handleTypingStop = (data: { chatId: string; userId: string }) => {
      setTypingUser(data.chatId, data.userId, false);
    };

    const handleUserOnline = (data: { userId: string }) => {
      setUserOnline(data.userId, true);
    };

    const handleUserOffline = (data: { userId: string; lastSeen?: string }) => {
      setUserOnline(data.userId, false, data.lastSeen);
    };

    const handleUsersOnline = (userIds: string[]) => {
      console.log('Initial online users list:', userIds);
      setOnlineUsers(userIds);
    };

    const handleError = (error: { message: string }) => {
      console.error('Socket error:', error.message);
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:sent', handleMessageSent);
    socket.on('message:delivered', handleMessageDelivered);
    socket.on('message:read', handleMessageRead);
    socket.on('chat:new', handleNewChat);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);
    socket.on('users:online', handleUsersOnline);
    socket.on('error', handleError);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:sent', handleMessageSent);
      socket.off('message:delivered', handleMessageDelivered);
      socket.off('message:read', handleMessageRead);
      socket.off('chat:new', handleNewChat);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
      socket.off('users:online', handleUsersOnline);
      socket.off('error', handleError);
    };
  }, [socket, addMessage, updateMessage, setTypingUser, setUserOnline, setOnlineUsers, updateChat, addChat, user]);

  const joinChat = useCallback((chatId: string) => {
    if (socket?.connected) {
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
        socket.emit('message:send', {
          chatId,
          content,
          type,
          replyToId,
          tempId,
        });
        return tempId;
      }
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

  return (
    <SocketContext.Provider value={{ 
        socket, 
        isConnected, 
        joinChat, 
        leaveChat,
        sendMessage,
        markAsRead,
        startTyping,
        stopTyping
    }}>
      {children}
    </SocketContext.Provider>
  );
};


