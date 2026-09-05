import { useEffect, useState } from 'react';
import api from '../../services/api';

const formatCount = (value) => (
  Number.isFinite(Number(value)) ? Intl.NumberFormat().format(Number(value)) : '—'
);

export default function StatsSection({ t }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let active = true;
    api.get('/api/public/stats')
      .then(({ data }) => { if (active) setStats(data); })
      .catch(() => { if (active) setStats({}); });
    return () => { active = false; };
  }, []);

  const items = [
    { label: t.stats.usersLabel, value: stats?.totalUsers },
    { label: t.stats.projectsLabel, value: stats?.totalProjects },
    { label: t.stats.sourcesLabel, value: stats?.totalSources ?? stats?.totalDocuments },
  ];

  return (
    <section className="relative z-10 border-y border-(--border-light) bg-(--surface) py-5 sm:py-6" aria-labelledby="platform-stats-heading">
      <h2 id="platform-stats-heading" className="sr-only">{t.stats.heading}</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-3 max-w-4xl mx-auto px-3 sm:px-6" aria-live="polite" aria-busy={!stats}>
        {items.map((item, index) => (
          <div
            key={index}
            className={`min-w-0 px-2 sm:px-8 py-1 text-center ${index ? 'border-l border-(--border-light)' : ''}`}
          >
            <dd className="text-2xl sm:text-3xl font-extrabold tracking-tight text-(--brand-foreground)">
              {formatCount(item.value)}
            </dd>
            <dt className="mt-1 text-xs font-semibold leading-snug text-(--text-secondary)">{item.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
