import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import api, { armProactiveRefresh } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [role, setRole] = useState(() => localStorage.getItem('role'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const verifyPromiseRef = useRef(null);
  const verifyControllerRef = useRef(null);

  const verifySession = useCallback(() => {
    if (verifyPromiseRef.current) return verifyPromiseRef.current;
    const controller = new AbortController();
    verifyControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    verifyPromiseRef.current = api.get('/api/users/profile', { signal: controller.signal })
      .then((res) => { setUser(res.data); return res.data; })
      .catch((err) => {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
          return Promise.reject(Object.assign(new Error('verify-aborted'), { response: { status: 401 } }));
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
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            setToken(null);
            setRole('');
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
    localStorage.setItem('token', newToken);
    if (newRole) {
      localStorage.setItem('role', newRole);
    }
    setToken(newToken);
    setRole(newRole || '');
    armProactiveRefresh();
    verifySession().catch(() => {});
  }, [verifySession]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    armProactiveRefresh();
    setToken(null);
    setRole('');
    setUser(null);
  }, []);

  useEffect(() => {
    const onAuthExpired = () => {
      if (!window.location.pathname.startsWith('/login')) {
        const origin = window.location.pathname + window.location.search;
        sessionStorage.setItem('login_origin', origin);
        sessionStorage.setItem('auth_expired_notice', 'Your session expired. Please sign in again.');
        logout();
      }
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
    window.addEventListener('auth:refreshed', onAuthRefreshed);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('auth:expired', onAuthExpired);
      window.removeEventListener('auth:refreshed', onAuthRefreshed);
      window.removeEventListener('storage', onStorage);
    };
  }, [logout, token, verifySession]);

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider value={{ token, role, user, isAuthenticated, loading, login, logout, verifySession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export default AuthContext;
