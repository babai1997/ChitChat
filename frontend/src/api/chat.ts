import api from './client';
import type { Chat, Message, MessagesResponse, Profile } from '../types';

export const chatApi = {
  // Chats
  getChats: async (): Promise<Chat[]> => {
    const response = await api.get('/chats');
    return response.data;
  },

  getChat: async (chatId: string): Promise<Chat> => {
    const response = await api.get(`/chats/${chatId}`);
    return response.data;
  },

  createDirectChat: async (participantId: string): Promise<Chat> => {
    const response = await api.post('/chats/direct', { participantId });
    return response.data;
  },

  createGroup: async (name: string, memberIds: string[]): Promise<Chat> => {
    const response = await api.post('/chats/group', { name, memberIds });
    return response.data;
  },

  updateGroup: async (chatId: string, data: { name?: string; avatarUrl?: string }): Promise<Chat> => {
    const response = await api.put(`/chats/${chatId}`, data);
    return response.data;
  },

  addMember: async (chatId: string, userId: string, role?: 'admin' | 'member'): Promise<void> => {
    await api.post(`/chats/${chatId}/members`, { userId, role });
  },

  removeMember: async (chatId: string, userId: string): Promise<void> => {
    await api.delete(`/chats/${chatId}/members/${userId}`);
  },

  leaveChat: async (chatId: string): Promise<void> => {
    await api.post(`/chats/${chatId}/leave`);
  },

  markAsRead: async (chatId: string): Promise<void> => {
    await api.post(`/chats/${chatId}/read`);
  },

  // Messages
  getMessages: async (
    chatId: string,
    cursor?: string,
    limit?: number
  ): Promise<MessagesResponse> => {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    if (limit) params.append('limit', limit.toString());
    
    const response = await api.get(`/chats/${chatId}/messages?${params}`);
    return response.data;
  },

  sendMessage: async (
    chatId: string,
    content: string,
    type: string = 'text',
    replyToId?: string,
    attachments?: { filename: string; url: string; mimetype: string; size: number }[]
  ): Promise<Message> => {
    const response = await api.post(`/chats/${chatId}/messages`, {
      content,
      type,
      replyToId,
      attachments,
    });
    return response.data;
  },

  uploadAttachment: async (chatId: string, file: File): Promise<{ filename: string; url: string; mimetype: string; size: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/chats/${chatId}/messages/attachments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  markMessagesAsRead: async (chatId: string, messageIds: string[]): Promise<void> => {
    await api.post(`/chats/${chatId}/messages/read`, { messageIds });
  },
};

export const profileApi = {
  getProfile: async (): Promise<Profile> => {
    const response = await api.get('/profile');
    return response.data;
  },

  updateProfile: async (data: {
    displayName?: string;
    avatarUrl?: string;
    about?: string;
  }): Promise<Profile> => {
    const response = await api.put('/profile', data);
    return response.data;
  },

  isProfileComplete: async (): Promise<{ isComplete: boolean }> => {
    const response = await api.get('/profile/complete');
    return response.data;
  },

  uploadAvatar: async (file: File): Promise<Profile> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.put('/profile/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export const usersApi = {
  searchUsers: async (query: string): Promise<Profile[]> => {
    const response = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },

  getUser: async (userId: string): Promise<Profile> => {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  },
};

export default { chatApi, profileApi, usersApi };
