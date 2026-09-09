import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminTour } from '../../hooks/useAdminTour.js';

export default function TourLauncher({ steps, tourKey, autoLaunch = false, className }) {
  const { t } = useTranslation();
  const { start, active } = useAdminTour(tourKey, () => steps);
  const [autoFired, setAutoFired] = useState(false);

  useEffect(() => {
    if (autoLaunch && tourKey && !localStorage.getItem(`tour_seen_${tourKey}`) && !autoFired) {
      const timer = setTimeout(() => { start(); setAutoFired(true); }, 600);
      return () => clearTimeout(timer);
    }
  }, [autoLaunch, tourKey, autoFired, start]);

  if (autoLaunch) return null;

  return (
    <button
      onClick={start}
      className={className || "fixed bottom-4 left-4 z-40 w-9 h-9 rounded-full bg-(--surface) border border-(--border) shadow-md flex items-center justify-center text-sm font-bold text-(--text-secondary) hover:bg-(--brand-soft) hover:text-(--brand) transition-colors"}
      title={t('guide')}
      aria-label={t('guide')}
    >
      ?
    </button>
  );
}
