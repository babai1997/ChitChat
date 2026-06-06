import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { LoginPage, VerifyOtpPage, SetupProfilePage, HomePage, SettingsPage } from './pages';
import { ProtectedRoute } from './components/common';
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

  // Don't render anything until the store has rehydrated from localStorage.
  // This prevents a flash where the user is sent to /login then immediately back.
  if (!hydrated) return null;

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
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
import { CallModal } from './components/call/CallModal';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SocketProvider>
        <CallProvider>
          <AppContent />
          <CallModal />
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
