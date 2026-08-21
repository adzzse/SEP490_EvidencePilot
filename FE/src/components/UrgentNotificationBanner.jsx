import { useEffect, useState } from 'react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { subscribeToNotifications } from '../notificationSocket.js';

const URGENT_ACTION = 'ADMIN_BROADCAST_URGENT';

export default function UrgentNotificationBanner() {
  const { token } = useAuth();
  const { language } = useLanguage();
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    setNotification(null);
    if (!token) return undefined;

    let cancelled = false;
    api.get('/api/notifications').then(({ data }) => {
      const latest = (data || []).find(item => !item.read && item.actionType === URGENT_ACTION);
      if (!cancelled && latest) {
        setNotification(current => !current || latest.createdAt > current.createdAt ? latest : current);
      }
    }).catch(() => {});

    const unsubscribe = subscribeToNotifications(token, incoming => {
      if (!cancelled && incoming.actionType === URGENT_ACTION) setNotification(incoming);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [token]);

  if (!notification) return null;

  const dismiss = () => {
    const id = notification.id;
    setNotification(null);
    api.patch(`/api/notifications/${id}/read`).catch(() => {});
  };

  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[100] flex items-center justify-between gap-4 bg-rose-600 px-4 py-3 text-white shadow-lg sm:px-6">
      <p className="text-sm font-semibold">
        <span className="mr-2 font-black uppercase tracking-wide">
          {language === 'vi' ? 'Khẩn cấp' : 'Urgent'}
        </span>
        {notification.message}
      </p>
      <button type="button" onClick={dismiss} className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/25" aria-label={language === 'vi' ? 'Đóng thông báo khẩn' : 'Dismiss urgent notification'}>
        {language === 'vi' ? 'Đóng' : 'Dismiss'}
      </button>
    </div>
  );
}
