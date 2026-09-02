export default function ContributionGraph({ buckets = [], emptyLabel, ariaLabel }) {
  if (!buckets || buckets.length === 0) {
    return <p className="text-xs italic text-[var(--text-tertiary)]">{emptyLabel}</p>;
  }

  const max = Math.max(...buckets.map(b => b.count || 0), 0);

  return (
    <div className="w-full flex flex-col h-full min-h-[200px]" role="group" aria-label={ariaLabel}>
      <div className="flex-1 flex items-end gap-1 mb-2 relative h-40">
        {buckets.map((b, i) => {
          const count = b.count || 0;
          const percentage = (count / (max || 1)) * 100;
          return (
            <div key={`${b.label || b.date}-${i}`} className="group relative flex-1 flex flex-col justify-end h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" tabIndex={0} aria-label={`${b.label || b.date}: ${count}`}>
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
      <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] border-t border-[var(--border)] pt-2 mt-auto">
        <span>{buckets[0]?.label || buckets[0]?.date}</span>
        <span>{buckets[buckets.length - 1]?.label || buckets[buckets.length - 1]?.date}</span>
      </div>
    </div>
  );
}
