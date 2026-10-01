import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { rememberLoginOrigin } from '../pages/loginOrigin';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { t } = useTranslation();
  const { isAuthenticated, user, role, loading, verifyError, retryVerification } = useAuth();

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

  // Bounded recovery: a transient verification failure keeps the token and
  // the existing content; a dismissible banner offers one deduped retry
  // instead of an indefinite spinner or an automatic logout.
  if (verifyError === 'connection' && !user) {
    return (
      <>
        {children}
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 shadow-lg">
          <span className="font-medium">{t('auth.protectedRoute.connectionInterrupted')}</span>
          <button
            type="button"
            onClick={() => retryVerification?.()}
            className="rounded-lg border border-amber-600 px-3 py-1 text-xs font-medium text-amber-700"
          >
            {t('auth.protectedRoute.retryVerification')}
          </button>
        </div>
      </>
    );
  }

  return children;
}
