import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Wait for Zustand persist to finish rehydrating from localStorage.
 * Without this, ProtectedRoute reads isAuthenticated=false before
 * localStorage is loaded and incorrectly redirects to /login.
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

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const hydrated = useHasHydrated();
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  // Render nothing until Zustand has rehydrated — prevents wrong redirects
  // when the user navigates directly to a protected URL.
  if (!hydrated) return null;

  if (!isAuthenticated) {
    // Preserve the intended URL so we can redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If authenticated but profile incomplete, force redirect to setup profile
  const isProfileComplete = !!user?.profile?.displayName;
  const isSetupPage = location.pathname === '/setup-profile';

  if (!isProfileComplete && !isSetupPage) {
    return <Navigate to="/setup-profile" replace />;
  }

  return <>{children}</>;
};
