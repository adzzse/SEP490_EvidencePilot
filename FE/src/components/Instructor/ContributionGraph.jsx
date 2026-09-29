export default function ContributionGraph({ buckets = [], emptyLabel, ariaLabel }) {
  if (!buckets || buckets.length === 0) {
    return <p className="text-xs italic text-[var(--text-tertiary)]">{emptyLabel}</p>;
  }

  const max = Math.max(...buckets.map(b => b.count || 0), 0);

  return (
    <div className="w-full overflow-x-auto" role="group" aria-label={ariaLabel}>
      <div className="relative mb-2 flex h-28 items-end gap-1">
        {buckets.map((b, i) => {
          const count = b.count || 0;
          const percentage = (count / (max || 1)) * 100;
          return (
            <div key={`${b.label || b.date}-${i}`} className="group relative flex h-full min-w-6 max-w-8 flex-1 flex-col justify-end focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" tabIndex={0} aria-label={`${b.label || b.date}: ${count}`}>
              <div
                className="w-full bg-[var(--brand)] rounded-t-sm transition-all hover:bg-[var(--brand-hover)]"
                style={{ height: `${percentage}%`, minHeight: count > 0 ? '4px' : '0' }}
              />
              <div className="opacity-0 group-hover:opacity-100 group-focus:opacity-100 absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none whitespace-nowrap bg-slate-800 text-white text-[10px] px-2 py-1 rounded shadow-lg transition-opacity">
                {b.label || b.date}: {count}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--text-tertiary)]">
        {buckets.map((b, i) => (
          <span key={`${b.label || b.date}-${i}`} className="min-w-6 max-w-8 flex-1 truncate text-center" title={b.label || b.date}>
            {(b.label || b.date).slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}
