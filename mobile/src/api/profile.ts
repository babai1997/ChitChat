import api from './client';
import type { Profile, UserWithProfile } from '../types';

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

  uploadAvatar: async (uri: string, filename: string, type: string): Promise<Profile> => {
    const formData = new FormData();
    // React Native FormData requires { uri, name, type } for file uploads
    formData.append('file', {
      uri,
      name: filename,
      type,
    } as any);

    const response = await api.put('/profile/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export const usersApi = {
  searchUsers: async (query: string): Promise<UserWithProfile[]> => {
    const response = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },

  getUser: async (userId: string): Promise<UserWithProfile> => {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  },
};
