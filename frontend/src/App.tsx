import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { resolvePostLoginRedirect } from './utils/postLoginRedirect';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { LoginPage, VerifyOtpPage, SetupProfilePage, HomePage, SettingsPage, LinkedDevicesPage, MeetingJoinPage, DocsPage } from './pages';
import { ProtectedRoute, DeviceLinkApprovalModal } from './components/common';
import { useAuthStore } from './stores';
import { SocketProvider } from './contexts/SocketContext';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Wait for Zustand persist to finish reading from localStorage.
 * Without this, guards run before `isAuthenticated` is populated,
 * causing the router to show the wrong page on direct URL navigation.
 */
function useHasHydrated() {
  const [hydrated, setHydrated] = useState(
    () => useAuthStore.persist.hasHydrated()
  );

  useEffect(() => {
    if (hydrated) return;
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [hydrated]);

  return hydrated;
}

// Auth guard for login pages - redirect to home if already logged in
const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const hydrated = useHasHydrated();
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  // Don't render anything until the store has rehydrated from localStorage.
  // This prevents a flash where the user is sent to /login then immediately back.
  if (!hydrated) return null;

  if (isAuthenticated) {
    // isAuthenticated flips true the instant login() runs, which can win the
    // race against LoginPage/VerifyOtpPage's OWN post-login navigate() call —
    // this component re-renders and unmounts the login page before that call
    // ever takes effect. Resolving the same redirect target here (instead of
    // hardcoding '/') means whichever one "wins" lands in the same place, so
    // a shared meeting link isn't lost regardless of execution order.
    return <Navigate to={resolvePostLoginRedirect(location.state)} replace />;
  }

  return <>{children}</>;
};


const AppContent = () => {
    return (
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route 
            path="/login" 
            element={
              <AuthGuard>
                <LoginPage />
              </AuthGuard>
            } 
          />
          <Route
            path="/verify-otp"
            element={
              <AuthGuard>
                <VerifyOtpPage />
              </AuthGuard>
            }
          />
          <Route path="/docs" element={<DocsPage />} />

          {/* Protected routes */}
          <Route 
            path="/setup-profile" 
            element={
              <ProtectedRoute>
                <SetupProfilePage />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/linked-devices"
            element={
              <ProtectedRoute>
                <LinkedDevicesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/meet/:slug"
            element={
              <ProtectedRoute>
                <MeetingJoinPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
};

import { CallProvider } from './contexts/CallContext';
import { CallModal, ScreenShareOverlay } from './components/call/CallModal';
import { useSocketContext } from './contexts/SocketContextShared';

function ReconnectBanner() {
  const { isReconnecting } = useSocketContext();
  if (!isReconnecting) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#2a3942', color: '#e9edef',
      fontSize: 13, textAlign: 'center', padding: '6px 12px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f0a500', display: 'inline-block', animation: 'pulse 1.2s ease-in-out infinite' }} />
      Reconnecting…
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SocketProvider>
        <CallProvider>
          <ReconnectBanner />
          <AppContent />
          <CallModal />
          <ScreenShareOverlay />
          <DeviceLinkApprovalModal />
          {/* Toast notifications */}
          <Toaster
              position="top-center"
              toastOptions={{
              duration: 3000,
              style: {
                  background: '#202C33',
                  color: '#E9EDEF',
                  borderRadius: '8px',
              },
              success: {
                  iconTheme: {
                  primary: '#25D366',
                  secondary: '#fff',
                  },
              },
              error: {
                  iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                  },
              },
              }}
          />
        </CallProvider>
      </SocketProvider>
    </QueryClientProvider>
  );
}

export default App;
