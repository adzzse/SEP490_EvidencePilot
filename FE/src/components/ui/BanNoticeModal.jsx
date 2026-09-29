import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// P0b-ban-notice: 5s countdown shown after the account is revoked.
// Enforcement is immediate (token cleared before this renders); the countdown
// only paces the notice/redirect, never the ban itself.
export const BAN_NOTICE_SECONDS = 5;

export default function BanNoticeModal({ open, onDone }) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(BAN_NOTICE_SECONDS);

  useEffect(() => {
    if (!open) return undefined;
    setRemaining(BAN_NOTICE_SECONDS);
    const timer = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onDone?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [open, onDone]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="ban-notice-title">
      <div className="w-full max-w-sm rounded-2xl bg-(--surface) border border-(--border) p-6 shadow-xl text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-(--danger-soft) text-(--danger) flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
        </div>
        <h2 id="ban-notice-title" className="mt-3 text-base font-bold text-(--text-primary)">
          {t('auth.banned.title')}
        </h2>
        <p className="mt-1.5 text-sm text-(--text-secondary)">
          {t('auth.banned.message')}
        </p>
        <p className="mt-2 text-xs font-semibold text-(--text-tertiary)" aria-live="polite">
          {t('auth.banned.countdown', { s: remaining })}
        </p>
        <div className="mt-3 h-1.5 rounded-full bg-(--surface-tertiary) overflow-hidden">
          <div
            className="h-full bg-(--danger) transition-all duration-1000 ease-linear"
            style={{ width: `${(remaining / BAN_NOTICE_SECONDS) * 100}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => onDone?.()}
          className="mt-4 w-full py-2.5 px-4 bg-(--brand) hover:bg-(--brand-hover) text-white rounded-xl text-xs font-bold transition cursor-pointer"
        >
          {t('auth.banned.dismiss')}
        </button>
      </div>
    </div>
  );
}
