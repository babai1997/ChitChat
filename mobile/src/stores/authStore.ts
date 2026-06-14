import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: string;
  phone: string | null;
  email: string | null;
  isVerified: boolean;
  profile: {
    displayName: string | null;
    avatarUrl: string | null;
    about: string | null;
  } | null;
}

interface AuthState {
  // State
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isNewUser: boolean;

  // Actions
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  setIsNewUser: (isNewUser: boolean) => void;
  login: (accessToken: string, refreshToken: string, user: User, isNewUser: boolean) => void;
  logout: () => void;
  updateProfile: (profile: Partial<User['profile']>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isNewUser: false,

      // Actions
      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken, isAuthenticated: true });
      },

      setUser: (user) => {
        set({ user });
      },

      setIsNewUser: (isNewUser) => {
        set({ isNewUser });
      },

      login: (accessToken, refreshToken, user, isNewUser) => {
        set({
          accessToken,
          refreshToken,
          user,
          isAuthenticated: true,
          isNewUser,
        });
      },

      logout: () => {
        // Clear chat data
        import('./chatStore').then(({ useChatStore }) => {
          useChatStore.getState().clearChatData();
        });

        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
          isNewUser: false,
        });
      },

      updateProfile: (profile) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: {
              ...currentUser,
              profile: {
                ...currentUser.profile,
                ...profile,
              } as User['profile'],
            },
          });
        }
      },
    }),
    {
      name: 'chitchat-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        // Note: refreshToken is intentionally NOT persisted in storage.
        // It is only kept in memory for the lifetime of the tab session.
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
