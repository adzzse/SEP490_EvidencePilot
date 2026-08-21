import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api.js';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { subscribeToNotifications } from '../notificationSocket.js';

export default function NotificationBell({ onOpen }) {
  const { token } = useAuth();
  const { language } = useLanguage();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setNotifications([]);
    setUnreadCount(0);
    setOpen(false);
    if (!token) return undefined;

    let cancelled = false;
    api.get('/api/notifications')
      .then(({ data }) => { if (!cancelled) setNotifications(data || []); })
      .catch(() => console.warn('Failed to load notifications'));
    api.get('/api/notifications/unread-count')
      .then(({ data }) => { if (!cancelled) setUnreadCount(data?.count || 0); })
      .catch(() => console.warn('Failed to load unread count'));

    const unsubscribe = subscribeToNotifications(token, incoming => {
      if (!cancelled) {
        setNotifications(current => [incoming, ...current]);
        setUnreadCount(current => current + 1);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [token]);

  if (!token) return null;

  const toggle = () => {
    setOpen(current => {
      if (!current) onOpen?.();
      return !current;
    });
  };

  const markRead = async (id) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications(current => current.map(item => item.id === id ? { ...item, read: true } : item));
      setUnreadCount(current => Math.max(0, current - 1));
    } catch {
      console.warn(t('markNotificationFailed'));
    }
  };

  const iconButton = 'p-2 text-(--text-secondary) hover:text-(--brand-foreground) hover:bg-(--surface-secondary) rounded-lg transition-colors';

  return (
    <div className="relative shrink-0">
      <button type="button" onClick={toggle} className={`relative ${iconButton}`} title={t('notifications')} aria-label={t('notifications')} aria-expanded={open} aria-haspopup="true">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
        {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[9px] font-bold min-w-4 h-4 px-0.5 flex items-center justify-center rounded-full shadow-sm">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-1rem))] bg-(--surface) border border-(--border) rounded-xl shadow-xl z-[99999] max-h-96 overflow-y-auto">
          <div className="sticky top-0 bg-(--surface) border-b border-(--border-light) px-4 py-2.5 flex justify-between items-center">
            <span className="text-xs font-bold text-(--text-primary)">{t('notifications')}</span>
            <button type="button" onClick={() => setOpen(false)} className={iconButton} aria-label={t('close')}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
          {notifications.length === 0 ? (
            <div className="text-xs text-(--text-tertiary) italic text-center py-8">{t('noNotifications')}</div>
          ) : notifications.map(notification => (
            <button type="button" key={notification.id} onClick={() => { if (!notification.read) markRead(notification.id); }} className={`block w-full text-left px-4 py-3 border-b border-(--border-light) hover:bg-(--surface-secondary) transition-colors ${notification.read ? 'opacity-60' : 'bg-(--brand-soft)'}`}>
              <p className="text-xs font-semibold text-(--text-primary)">{notification.message || notification.title || t('notifications')}</p>
              <p className="text-[10px] text-(--text-tertiary) mt-0.5">{notification.createdAt ? new Date(notification.createdAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US') : ''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
