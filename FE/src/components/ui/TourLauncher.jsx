import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminTour } from '../../hooks/useAdminTour.js';

export default function TourLauncher({ steps, tourKey, autoLaunch = false, className }) {
  const { t } = useTranslation();
  const { start } = useAdminTour(tourKey, steps);
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
      className={className || "fixed bottom-4 left-4 z-40 w-9 h-9 rounded-full bg-(--surface) border border-(--border) shadow-md flex items-center justify-center text-(--text-secondary) hover:bg-(--brand-soft) hover:text-(--brand) transition-colors"}
      title={t('guide')}
      aria-label={t('guide')}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    </button>
  );
}
