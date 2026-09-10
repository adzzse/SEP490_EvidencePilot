import { useCallback, useEffect, useState } from 'react';

// ponytail: driver.js (+css) loads on first tour start, not with the bundle.
const loadDriver = () => Promise.all([
  import('driver.js'),
  import('driver.js/dist/driver.css'),
]).then(([mod]) => mod.driver);

export function useAdminTour(tourKey, stepsFactory) {
  const [active, setActive] = useState(false);
  const start = useCallback(() => setActive(true), []);
  const stop = useCallback(() => setActive(false), []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let instance = null;
    loadDriver().then((createDriver) => {
      if (cancelled) return;
      const raw = typeof stepsFactory === 'function' ? stepsFactory() : stepsFactory;
      const steps = raw.filter((s) => !s.element || document.querySelector(s.element));
      instance = createDriver({
        animate: true,
        showProgress: true,
        showButtons: ['next', 'previous', 'close'],
        steps,
        onDestroyed: () => {
          setActive(false);
          if (tourKey) localStorage.setItem(`tour_seen_${tourKey}`, '1');
        },
      });
      instance.drive();
    });
    return () => {
      cancelled = true;
      try {
        instance?.destroy();
      } catch {
        // ignore
      }
    };
  }, [active, tourKey, stepsFactory]);

  return { start, stop, active };
}
