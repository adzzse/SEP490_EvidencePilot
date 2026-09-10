import { useCallback, useEffect, useState } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export function useAdminTour(tourKey, stepsFactory) {
  const [active, setActive] = useState(false);
  const start = useCallback(() => setActive(true), []);
  const stop = useCallback(() => setActive(false), []);

  useEffect(() => {
    if (!active) return;
    const raw = typeof stepsFactory === 'function' ? stepsFactory() : stepsFactory;
    const steps = raw.filter((s) => !s.element || document.querySelector(s.element));
    const d = driver({
      animate: true,
      showProgress: true,
      showButtons: ['next', 'previous', 'close'],
      steps,
      onDestroyStarted: () => {
        setActive(false);
        if (tourKey) localStorage.setItem(`tour_seen_${tourKey}`, '1');
      },
    });
    d.drive();
    return () => {
      try {
        d.destroy();
      } catch {
        // ignore
      }
    };
  }, [active, tourKey, stepsFactory]);

  return { start, stop, active };
}
