import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { rememberLoginOrigin } from '../pages/loginOrigin';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { t } = useTranslation();
  const { isAuthenticated, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="animate-spin w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
          <span className="font-medium">{t('auth.protectedRoute.verifyingSession')}</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    rememberLoginOrigin(window.location.pathname, window.location.search);
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
