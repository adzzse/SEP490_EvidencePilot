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
  const [restReadyToken, setRestReadyToken] = useState(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setError(null);
    setRestReadyToken(null);
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      return false;
    }
    try {
      const [notifRes, unreadRes] = await Promise.all([
        api.get('/api/notifications'),
        api.get('/api/notifications/unread-count'),
      ]);
      if (requestId !== requestIdRef.current) return false;
      setNotifications(notifRes.data || []);
      setUnreadCount(unreadRes.data?.count || 0);
      setRestReadyToken(token);
      return true;
    } catch (e) {
      if (requestId !== requestIdRef.current) return false;
      const status = e?.response?.status;
      if (status === 503) {
        console.warn('Notifications degraded: 503 — WS will not connect');
      } else {
        console.warn('Failed to load notifications', e);
      }
      setError(e);
      setNotifications([]);
      setUnreadCount(0);
      return false;
    }
  }, [token]);

  // Isolated REST fetch — never touches AuthContext isLoading, never forces logout
  useEffect(() => {
    reload();
    return () => { requestIdRef.current += 1; };
  }, [reload]);

  // Isolated WS subscribe — gated by REST 503
  useEffect(() => {
    if (!token || restReadyToken !== token) return undefined;
    let cancelled = false;
    const unsubscribe = subscribeToNotifications(token, incoming => {
      if (cancelled) return;
      setNotifications(current => [incoming, ...current]);
      setUnreadCount(current => current + 1);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [token, restReadyToken]);

  const markRead = useCallback(async (id) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications(current => current.map(item => item.id === id ? { ...item, read: true } : item));
      setUnreadCount(current => Math.max(0, current - 1));
      return true;
    } catch {
      console.warn('markNotificationFailed');
      return false;
    }
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, error, reload, markRead }}>
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
