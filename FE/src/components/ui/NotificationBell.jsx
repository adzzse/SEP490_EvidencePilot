import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNotification } from '../../context/NotificationContext';
import api from '../../services/api.js';
import { taskKey, readTask, writeTask } from '../../utils/taskState.js';
import { formatDateTime } from '../../utils/formatters/date';

// ponytail: single bell for every header. Workspace headers pass controlled
// open state + a custom item handler (deep-link inside the open workspace
// instead of navigating away); everywhere else it manages itself. Ceiling:
// one bell carries errors + notifications together. Revisit when volume
// needs separate channels (accepted single-bell until then).
export default function NotificationBell({
  onOpen,
  open: openProp,
  onOpenChange,
  onOpenNotification,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onToggleExtra,
  tourId,
  // ponytail: header error text folded into the bell (see above) — while an
  // error is present the bell rings, keeps a dot, and pins the message on top
  // of the dropdown until the error clears (next run / section switch).
  alertMessage = '',
}) {
  const { token, role, user } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { t } = useTranslation();
  const { notifications, unreadCount, markRead, markAllRead } = useNotification();
  const [internalOpen, setInternalOpen] = useState(false);
  // ponytail: the error row behaves like a notification (see above) — unread
  // (highlighted) until clicked or marked all-read; a new message re-arms it. Acknowledgment
  // is session-persisted per message so a refresh (which re-polls the same
  // failed job and re-sets the same error) does not ping again.
  const [alertRead, setAlertRead] = useState(false);
  useEffect(() => { setAlertRead(false); }, [alertMessage]);
  const readAlertsKey = taskKey(api, user?.id, 'alerts-read');
  const acknowledgeAlert = () => {
    setAlertRead(true);
    if (!alertMessage) return;
    const stored = readTask(readAlertsKey);
    const current = Array.isArray(stored) ? stored : [];
    if (!current.includes(alertMessage)) writeTask(readAlertsKey, [...current.slice(-19), alertMessage]);
  };
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const rootRef = useRef(null);

  // ponytail: no X button — outside click closes the dropdown. Accepted
  // intentional (matches the shared Dropdown dismiss behavior).
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, setOpen ]);

  if (!token) return null;

  const toggle = () => {
    setOpen(current => {
      if (!current) {
        onOpen?.();
        onToggleExtra?.();
      }
      return !current;
    });
  };

  const handleClick = async (notification) => {
    if (onOpenNotification) {
      await onOpenNotification(notification);
      return;
    }
    if (!notification.read) {
      markRead(notification.id);
    }
    const reviewAction = ['REVIEW_SUBMITTED', 'REVIEW_RETURNED', 'INSTRUCTOR_FEEDBACK_PUBLISHED', 'REVIEW_STATUS_CHANGED']
      .includes(notification.actionType);
    if (!reviewAction || !notification.entityId) {
      setOpen(false);
      return;
    }
    try {
      const { data: requests } = await api.get('/api/feedback-requests');
      const request = (requests || []).find(item => String(item.id) === String(notification.entityId));
      if (!request?.projectId) return;
      const query = new URLSearchParams({ review: request.id });
      if (notification.feedbackId) query.set('feedback', notification.feedbackId);
      navigate(role === 'STUDENT'
        ? `/student/projects/${encodeURIComponent(request.projectId)}?${query}`
        : `/instructor/requests/${encodeURIComponent(request.projectId)}?${query}`);
    } catch {
      // Reading the destination is best-effort; the notification was still handled.
    } finally {
      setOpen(false);
    }
  };

  const handleMarkRead = (id) => {
    if (onMarkNotificationRead) return onMarkNotificationRead(id);
    markRead(id);
  };

  const handleMarkAllRead = () => {
    if (onMarkAllNotificationsRead) onMarkAllNotificationsRead();
    else void markAllRead();
    if (hasAlert) acknowledgeAlert();
  };

  const iconButton = 'p-2 text-(--text-secondary) hover:text-(--brand-foreground) hover:bg-(--surface-secondary) rounded-lg transition-colors cursor-pointer';
  const hasAlert = Boolean(alertMessage);
  const storedAlerts = readTask(readAlertsKey);
  const unreadAlert = hasAlert && !alertRead && !(Array.isArray(storedAlerts) && storedAlerts.includes(alertMessage));

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button type="button" onClick={toggle} data-tour={tourId} className={`relative ${iconButton}`} title={hasAlert ? alertMessage : t('notifications')} aria-label={t('notifications')} aria-expanded={open} aria-haspopup="true">
        <svg className={`w-4 h-4 ${unreadAlert && !open ? 'animate-bell-ring motion-reduce:animate-none' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
        {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[9px] font-bold min-w-4 h-4 px-0.5 flex items-center justify-center rounded-full shadow-sm">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-1rem))] bg-(--surface) border border-(--border) rounded-2xl shadow-2xl z-[99999] max-h-96 overflow-y-auto animate-in fade-in zoom-in-95 duration-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          <div className="sticky top-0 bg-(--surface) border-b border-(--border-light) px-4 py-3 flex justify-between items-center z-10">
            <span className="text-xs font-bold text-(--text-primary)">{t('notifications')}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={handleMarkAllRead} disabled={unreadCount === 0 && !unreadAlert} className="px-2 py-1 text-[10px] font-bold text-(--brand) hover:underline disabled:opacity-40 disabled:no-underline" aria-label={t('markAllNotificationsRead')}>
                {t('markAllNotificationsRead')}
              </button>
            </div>
          </div>
          {hasAlert && (
            <button
              type="button"
              onClick={acknowledgeAlert}
              className={`block w-full text-left px-4 py-3 border-b border-(--border-light) hover:bg-(--surface-secondary) transition-colors cursor-pointer ${unreadAlert ? 'bg-(--brand-soft)' : 'opacity-60'}`}
            >
              <p className="text-xs font-semibold text-(--text-primary)">{alertMessage}</p>
            </button>
          )}
          {notifications.length === 0 && !hasAlert ? (
            <div className="text-xs text-(--text-tertiary) italic text-center py-8">{t('noNotifications')}</div>
          ) : notifications.map(notification => (
            <button
              type="button"
              key={notification.id}
              onClick={() => {
                if (!notification.read) handleMarkRead(notification.id);
                handleClick(notification);
              }}
              className={`block w-full text-left px-4 py-3 border-b border-(--border-light) hover:bg-(--surface-secondary) transition-colors cursor-pointer ${notification.read ? 'opacity-60' : 'bg-(--brand-soft)'}`}
            >
              <p className="text-xs font-semibold text-(--text-primary)">{notification.message || notification.title || t('notifications')}</p>
              <p className="text-[10px] text-(--text-tertiary) mt-0.5 font-mono">{formatDateTime(notification.createdAt, language)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
