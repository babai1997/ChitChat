import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If authenticated but profile incomplete, force redirect to setup profile
  // preventing user from accessing other pages until profile is set
  const isProfileComplete = !!user?.profile?.displayName;
  const isSetupPage = location.pathname === '/setup-profile';

  if (!isProfileComplete && !isSetupPage) {
    return <Navigate to="/setup-profile" replace />;
  }

  // If profile is already complete, prevent access to setup page (optional, but good UX)
  // Currently checking specific pages usually better in AuthGuard, but helpful here
  // We'll leave it open in case they want to edit, but primary enforcement is above.

  return <>{children}</>;
};
