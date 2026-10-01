import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import api, { armProactiveRefresh } from '../services/api.js';
import BanNoticeModal from '../components/ui/BanNoticeModal.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [role, setRole] = useState(() => localStorage.getItem('role'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Recoverable verification error: 'connection' (timeout/offline/abort) vs
  // 'unauthorized' (expired/invalid). Connection never clears stored auth.
  const [verifyError, setVerifyError] = useState(null);
  // P0b-ban-notice: shown after revocation with a 10s countdown. The token is
  // cleared immediately (enforcement); the modal only paces notice/redirect.
  const [banNotice, setBanNotice] = useState(false);
  const finishBanNotice = useCallback(() => setBanNotice(false), []);
  const verifyPromiseRef = useRef(null);
  const verifyControllerRef = useRef(null);
  // Generation invalidates late responses after logout/account switching.
  const verifyGenerationRef = useRef(0);

  const verifySession = useCallback(() => {
    if (verifyPromiseRef.current) return verifyPromiseRef.current;
    const generation = verifyGenerationRef.current;
    const controller = new AbortController();
    verifyControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    verifyPromiseRef.current = api.get('/api/users/profile', { signal: controller.signal })
      .then((res) => {
        if (verifyGenerationRef.current !== generation) return Promise.reject(new Error('verify-stale'));
        setUser(res.data);
        setVerifyError(null);
        return res.data;
      })
      .catch((err) => {
        if (err?.message === 'verify-stale') throw err;
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
          // Timeout/offline/unmount: connectivity failure, NOT invalid credentials.
          const aborted = new Error('verify-aborted');
          aborted.code = 'ERR_CANCELED';
          throw aborted;
        }
        throw err;
      })
      .finally(() => {
        clearTimeout(timeoutId);
        verifyPromiseRef.current = null;
        verifyControllerRef.current = null;
      });
    return verifyPromiseRef.current;
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedRole = localStorage.getItem('role');
    let cancelled = false;
    if (storedToken) {
      setToken(storedToken);
      setRole(storedRole || '');
      verifySession()
        .catch((err) => {
          if (cancelled) return;
          if (err?.message === 'verify-stale') return;
          if (err?.code === 'ERR_CANCELED' || err?.message === 'verify-aborted') {
            setVerifyError('connection');
            return;
          }
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            // A banned account must see the countdown notice, not a silent logout.
            if (err?.response?.data?.code === 'ACCOUNT_BANNED') {
              window.dispatchEvent(new CustomEvent('auth:revoked'));
              return;
            }
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            setToken(null);
            setRole('');
            setVerifyError('unauthorized');
          } else if (status) {
            setVerifyError('connection');
          } else if (!err?.response) {
            setVerifyError('connection');
          }
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else {
      setLoading(false);
    }
    return () => {
      cancelled = true;
      verifyControllerRef.current?.abort();
      verifyPromiseRef.current = null;
    };
  }, [verifySession]);

  const login = useCallback((newToken, newRole) => {
    verifyGenerationRef.current += 1;
    localStorage.setItem('token', newToken);
    if (newRole) {
      localStorage.setItem('role', newRole);
    }
    setToken(newToken);
    setRole(newRole || '');
    setVerifyError(null);
    armProactiveRefresh();
    verifySession().catch(() => {});
  }, [verifySession]);

  const logout = useCallback(() => {
    // Invalidate late verify/refresh responses before clearing state.
    verifyGenerationRef.current += 1;
    verifyControllerRef.current?.abort();
    verifyPromiseRef.current = null;
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    armProactiveRefresh();
    setToken(null);
    setRole('');
    setUser(null);
    setVerifyError(null);
  }, []);

  // Bounded recovery: deduped via verifySession single-flight, so repeated
  // retry clicks share one request instead of fanning out.
  const retryVerification = useCallback(() => {
    setVerifyError(null);
    setLoading(true);
    return verifySession().finally(() => setLoading(false));
  }, [verifySession]);

  useEffect(() => {
    const onAuthExpired = () => {
      if (!window.location.pathname.startsWith('/login')) {
        const origin = window.location.pathname + window.location.search;
        sessionStorage.setItem('login_origin', origin);
        sessionStorage.setItem('auth_expired_notice', 'Your session expired. Please sign in again.');
        logout();
      }
    };
    const onAuthRevoked = () => {
      sessionStorage.setItem('auth_expired_notice', 'Your account is no longer active.');
      onAuthExpired();
      // onAuthExpired skips logout on /login; a ban must always clear the token.
      logout();
      setBanNotice(true);
    };
    const onAuthRefreshed = (e) => {
      setToken(e.detail?.token ?? null);
      setUser(e.detail?.user ?? null);
      if (e.detail?.user?.role) setRole(e.detail.user.role);
    };
    const onStorage = (e) => {
      if (e.storageArea !== localStorage) return;
      if (e.key === 'token') {
        setToken(e.newValue);
        armProactiveRefresh();
        if (!e.newValue) {
          setRole('');
          setUser(null);
        } else if (!token) {
          setRole(localStorage.getItem('role') || '');
          verifySession().catch(() => {});
        }
      } else if (e.key === 'role') {
        setRole(e.newValue || '');
      }
    };
    window.addEventListener('auth:expired', onAuthExpired);
    window.addEventListener('auth:revoked', onAuthRevoked);
    window.addEventListener('auth:refreshed', onAuthRefreshed);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('auth:expired', onAuthExpired);
      window.removeEventListener('auth:revoked', onAuthRevoked);
      window.removeEventListener('auth:refreshed', onAuthRefreshed);
      window.removeEventListener('storage', onStorage);
    };
  }, [logout, token, verifySession]);

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider value={{ token, role, user, isAuthenticated, loading, login, logout, verifySession, verifyError, retryVerification }}>
      {children}
      <BanNoticeModal open={banNotice} onDone={finishBanNotice} />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export default AuthContext;
