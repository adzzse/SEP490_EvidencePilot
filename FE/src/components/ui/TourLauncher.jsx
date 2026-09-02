import { useState, useEffect } from 'react';
import { driver } from 'driver.js';
import { useTranslation } from 'react-i18next';
import 'driver.js/dist/driver.css';

const STORAGE_KEY = 'tour_seen';

export default function TourLauncher({ steps, tourKey, autoLaunch = false, className }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (autoLaunch && tourKey && !localStorage.getItem(`${STORAGE_KEY}_${tourKey}`)) {
      const timer = setTimeout(() => setShow(true), 600);
      return () => clearTimeout(timer);
    }
  }, [autoLaunch, tourKey]);

  useEffect(() => {
    if (!show) return;
    const d = driver({ steps, showProgress: true, showButtons: ['next', 'previous', 'close'],
      onDestroyed: () => {
        setShow(false);
        if (tourKey) localStorage.setItem(`${STORAGE_KEY}_${tourKey}`, '1');
      }
    });
    d.drive();
    return () => { try { d.destroy(); } catch {} };
  }, [show, steps, tourKey]);

  if (autoLaunch) return null;

  return (
    <button
      onClick={() => setShow(true)}
      className={className || "fixed bottom-4 left-4 z-40 w-9 h-9 rounded-full bg-(--surface) border border-(--border) shadow-md flex items-center justify-center text-sm font-bold text-(--text-secondary) hover:bg-(--brand-soft) hover:text-(--brand) transition-colors"}
      title={t('guide')}
      aria-label={t('guide')}
    >
      ?
    </button>
  );
}
