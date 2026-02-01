import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
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

// Auth guard for login pages - redirect to home if already logged in
const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();
  
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
