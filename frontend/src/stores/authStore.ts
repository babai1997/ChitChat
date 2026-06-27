import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Decode JWT payload and check exp — no signature verification needed here.
// Returns true when the token is missing, malformed, or past its expiry.
function isJwtExpired(token: string): boolean {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const { exp } = JSON.parse(json) as { exp?: number };
    return typeof exp !== 'number' || Date.now() >= exp * 1000;
  } catch {
    return true;
  }
}

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
      // Use sessionStorage instead of localStorage — tokens are cleared when
      // the tab/browser closes, reducing the window for XSS token theft.
      // localStorage tokens persist indefinitely and are readable by any JS on the page.
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        // Note: refreshToken is intentionally NOT persisted in storage.
        // It is only kept in memory for the lifetime of the tab session.
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      // Clear expired tokens before any component renders.
      // sessionStorage hydration is synchronous so we defer via microtask to
      // ensure `useAuthStore` is assigned before calling setState.
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken && isJwtExpired(state.accessToken)) {
          Promise.resolve().then(() => {
            useAuthStore.setState({ accessToken: null, isAuthenticated: false, user: null });
          });
        }
      },
    }
  )
);
