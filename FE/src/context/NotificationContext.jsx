import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';
import { useAuth } from './AuthContext';
import { subscribeToNotifications, subscribeToEntityEvents } from '../services/notificationSocket.js';
import { isSelfAccountChangeEvent } from '../utils/authz.js';
import { feedbackKeys } from '../services/feedbackKeys.js';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { token, user, verifySession } = useAuth();
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState(null);
  const [restReadyToken, setRestReadyToken] = useState(null);
  const requestIdRef = useRef(0);
  const notificationIdsRef = useRef(new Set());
  const entityListenersRef = useRef(new Set());

  const subscribeToEntityChanges = useCallback(handler => {
    if (typeof handler !== 'function') return () => {};
    entityListenersRef.current.add(handler);
    return () => entityListenersRef.current.delete(handler);
  }, []);

  const reload = useCallback(async ({ preserveSocket = false } = {}) => {
    const requestId = ++requestIdRef.current;
    setError(null);
    if (!preserveSocket) setRestReadyToken(null);
    if (!token) {
      notificationIdsRef.current.clear();
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
      const nextNotifications = notifRes.data || [];
      notificationIdsRef.current = new Set(nextNotifications.map(item => String(item.id)));
      setNotifications(nextNotifications);
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
      const incomingId = incoming?.id == null ? null : String(incoming.id);
      if (!incomingId || notificationIdsRef.current.has(incomingId)) return;
      notificationIdsRef.current.add(incomingId);
      setNotifications(current => [incoming, ...current]);
      if (!incoming.read) setUnreadCount(current => current + 1);
    }, { onConnected: () => { void reload({ preserveSocket: true }); } });
    return () => { cancelled = true; unsubscribe(); };
  }, [token, restReadyToken]);

  // Generic entity-change events: map {entity,id,action,projectId} -> queryClient.invalidateQueries.
  useEffect(() => {
    if (!token || restReadyToken !== token) return undefined;
    const unsubscribe = subscribeToEntityEvents(evt => {
      console.log('WS Event Received:', evt);
      if (!evt || !evt.entity) return;
      const { entity, id, action, projectId } = evt;
      entityListenersRef.current.forEach(handler => {
        try {
          Promise.resolve(handler(evt)).catch(handlerError => {
            console.warn('Entity change handler failed', handlerError);
          });
        } catch (handlerError) {
          console.warn('Entity change handler failed', handlerError);
        }
      });
      if (entity === 'USER') {
        queryClient.invalidateQueries({ queryKey: ['users'] });
        // P0b: best-effort self-revocation notice; enforcement stays server-side.
        // verifySession success is a no-op; a 401/403 flows through the global
        // api interceptor (logout + redirect). Never log out on this event alone.
        if (isSelfAccountChangeEvent(evt, user?.id)) verifySession().catch(() => {});
        return;
      }
      if (entity === 'PROJECT') {
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        if (id) queryClient.invalidateQueries({ queryKey: ['project', id] });
        return;
      }
      if (entity === 'DOCUMENT') {
        queryClient.invalidateQueries({ queryKey: ['documents'] });
        if (id) queryClient.invalidateQueries({ queryKey: ['project', id, 'documents'] });
        if (projectId) queryClient.invalidateQueries({ queryKey: ['project', projectId, 'documents'] });
        if (action === 'FAILED' || action === 'READY') {
          queryClient.invalidateQueries({ queryKey: ['extractionQueue'] });
        }
        return;
      }
      if (entity === 'FEEDBACK') {
        queryClient.invalidateQueries({ queryKey: feedbackKeys.all });
        return;
      }
      if (entity === 'COLLECTION') {
        queryClient.invalidateQueries({ queryKey: ['collections'] });
      }
      // Live update (2-way): category changes refresh collection forms, which
      // refetch their own options via subscribeToEntityChanges; collections
      // using react-query keys stay consistent through this branch.
      if (entity === 'CATEGORY') {
        queryClient.invalidateQueries({ queryKey: ['collections'] });
        queryClient.invalidateQueries({ queryKey: ['categories'] });
      }
    });
    return unsubscribe;
  }, [token, restReadyToken, queryClient, user?.id, verifySession]);

  // Phase D: reconcile anything missed while hidden/offline (sleep, network
  // drop, WS gap). React Query dedupes identical in-flight fetches, so a
  // visibility burst is cheap; per-event invalidation stays the primary path
  // and no extra coalescing layer is added (nothing measured needed it).
  useEffect(() => {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined;
    if (!token || restReadyToken !== token) return undefined;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['extractionQueue'] });
      queryClient.invalidateQueries({ queryKey: feedbackKeys.all });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [token, restReadyToken, queryClient]);

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

  const markAllRead = useCallback(async () => {
    try {
      await api.patch('/api/notifications/read-all');
      setNotifications(current => current.map(item => ({ ...item, read: true })));
      setUnreadCount(0);
      return true;
    } catch {
      console.warn('markAllNotificationsFailed');
      return false;
    }
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, error, reload, markRead, markAllRead, subscribeToEntityChanges }}>
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
