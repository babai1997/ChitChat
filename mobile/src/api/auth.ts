import api from './client';
import type { AuthResponse, TokenPair } from '../types';

export const authApi = {
  sendOtp: async (phone: string): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/auth/otp/send', { phone });
    return response.data;
  },

  verifyOtp: async (phone: string, otp: string): Promise<AuthResponse> => {
    const response = await api.post('/auth/otp/verify', { phone, otp });
    return response.data;
  },

  googleAuth: async (idToken: string): Promise<AuthResponse> => {
    const response = await api.post('/auth/google', { idToken });
    return response.data;
  },

  refreshTokens: async (refreshToken: string): Promise<TokenPair> => {
    const response = await api.post('/auth/refresh', { refreshToken });
    return response.data;
  },

  logout: async (): Promise<{ success: boolean }> => {
    const response = await api.post('/auth/logout');
    return response.data;
  },
};

export default authApi;
