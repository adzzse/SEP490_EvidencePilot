import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../api.js';
import { useAuth } from './AuthContext';
import { subscribeToNotifications } from '../notificationSocket.js';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState(null);
  const restFailedRef = useRef(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setError(null);
    restFailedRef.current = false;
    try {
      const [notifRes, unreadRes] = await Promise.all([
        api.get('/api/notifications'),
        api.get('/api/notifications/unread-count'),
      ]);
      setNotifications(notifRes.data || []);
      setUnreadCount(unreadRes.data?.count || 0);
      restFailedRef.current = false;
    } catch (e) {
      const status = e?.response?.status;
      if (status === 503) {
        console.warn('Notifications degraded: 503 — WS will not connect');
      } else {
        console.warn('Failed to load notifications', e);
      }
      setError(e);
      setNotifications([]);
      setUnreadCount(0);
      restFailedRef.current = true;
    }
  }, [token]);

  // Isolated REST fetch — never touches AuthContext isLoading, never forces logout
  useEffect(() => {
    setNotifications([]);
    setUnreadCount(0);
    setError(null);
    restFailedRef.current = false;
    if (!token) return undefined;
    let cancelled = false;
    // Fire degraded fetch
    api.get('/api/notifications')
      .then(({ data }) => { if (!cancelled) { setNotifications(data || []); restFailedRef.current = false; } })
      .catch((e) => {
        if (cancelled) return;
        const status = e?.response?.status;
        if (status === 503) console.warn('Notifications degraded: 503');
        else console.warn('Failed to load notifications', e);
        setError(e);
        setNotifications([]);
        restFailedRef.current = true;
      });
    api.get('/api/notifications/unread-count')
      .then(({ data }) => { if (!cancelled) { setUnreadCount(data?.count || 0); } })
      .catch((e) => {
        if (cancelled) return;
        if (e?.response?.status !== 503) console.warn('Failed to load unread count', e);
        setUnreadCount(0);
      });
    return () => { cancelled = true; };
  }, [token]);

  // Isolated WS subscribe — gated by REST 503
  useEffect(() => {
    if (!token) return undefined;
    if (restFailedRef.current) {
      console.warn('WS gated: REST failed, skip connect');
      return undefined;
    }
    // Check current error state before connecting
    if (error && error?.response?.status === 503) return undefined;
    let cancelled = false;
    const unsubscribe = subscribeToNotifications(token, incoming => {
      if (cancelled) return;
      setNotifications(current => [incoming, ...current]);
      setUnreadCount(current => current + 1);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [token, error]);

  const markRead = useCallback(async (id) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications(current => current.map(item => item.id === id ? { ...item, read: true } : item));
      setUnreadCount(current => Math.max(0, current - 1));
    } catch {
      console.warn('markNotificationFailed');
    }
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, error, reload, setNotifications, setUnreadCount, markRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}

export default NotificationContext;
