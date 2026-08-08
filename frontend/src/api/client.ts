import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';
import { getOrCreateDeviceId } from '../services/deviceId';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach current access token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Needed so the server knows which of this account's devices is asking —
    // e.g. to resolve the right MessageCipher row for an encrypted message
    // (see messages.controller.ts's getMessages).
    config.headers['x-device-id'] = getOrCreateDeviceId();
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Token refresh ─────────────────────────────────────────────────────────────
// One shared promise for any in-flight refresh. Concurrent 401s all wait on it
// instead of each firing their own POST /auth/refresh, which would race and
// invalidate each other's single-use refresh token.

let refreshPromise: Promise<string> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    const { refreshToken, logout } = useAuthStore.getState();

    if (!refreshToken) {
      if (useAuthStore.getState().isAuthenticated) {
        logout();
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    // Start a refresh only if one isn't already running
    if (!refreshPromise) {
      refreshPromise = axios
        .post<{ accessToken: string; refreshToken: string }>(
          `${API_BASE_URL}/auth/refresh`,
          { refreshToken },
        )
        .then((res) => {
          const { accessToken, refreshToken: newRefreshToken } = res.data;
          useAuthStore.getState().setTokens(accessToken, newRefreshToken);
          return accessToken;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }

    try {
      const newToken = await refreshPromise;
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch {
      if (useAuthStore.getState().isAuthenticated) {
        logout();
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  },
);

export default api;
