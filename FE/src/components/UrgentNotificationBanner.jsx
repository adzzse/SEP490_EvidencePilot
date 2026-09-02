import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';

const URGENT_ACTION = 'ADMIN_BROADCAST_URGENT';

export default function UrgentNotificationBanner() {
  const { language } = useLanguage();
  const { notifications, markRead } = useNotification();
  const notification = notifications.find(item => !item.read && item.actionType === URGENT_ACTION);

  if (!notification) return null;

  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[100] flex items-center justify-between gap-4 bg-rose-600 px-4 py-3 text-white shadow-lg sm:px-6">
      <p className="text-sm font-semibold">
        <span className="mr-2 font-black uppercase tracking-wide">
          {language === 'vi' ? 'Khẩn cấp' : 'Urgent'}
        </span>
        {notification.message}
      </p>
      <button type="button" onClick={() => markRead(notification.id)} className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/25" aria-label={language === 'vi' ? 'Đóng thông báo khẩn' : 'Dismiss urgent notification'}>
        {language === 'vi' ? 'Đóng' : 'Dismiss'}
      </button>
    </div>
  );
}
