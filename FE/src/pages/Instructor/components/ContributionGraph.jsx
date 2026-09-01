export default function ContributionGraph({ dailyDeltas = [] }) {
  // Aggregate by date across all members (if multiple contributions passed) — caller should flatMap
  const map = new Map();
  for (const d of dailyDeltas) {
    const key = typeof d.date === 'string' ? d.date.slice(0,10) : new Date(d.date).toISOString().slice(0,10);
    const cur = map.get(key) || 0;
    map.set(key, cur + (d.saveCount || 0));
  }
  // Build last 371 days (53 weeks) ending today
  const today = new Date(); today.setHours(12,0,0,0);
  const cells = [];
  for (let i = 370; i >= 0; i--) {
    const dt = new Date(today); dt.setDate(today.getDate() - i);
    const key = dt.toISOString().slice(0,10);
    const count = map.get(key) || 0;
    let level = 0;
    if (count === 0) level = 0;
    else if (count <= 2) level = 1;
    else if (count <= 5) level = 2;
    else if (count <= 10) level = 3;
    else level = 4;
    cells.push({ date: key, count, level, dt });
  }
  // Group into weeks (7 rows)
  const weeks = [];
  for (let w = 0; w < 53; w++) weeks.push(cells.slice(w*7, w*7+7));

  const colors = [
    'fill-[var(--surface-tertiary)]',
    'fill-[var(--brand-soft)]',
    'fill-indigo-200',
    'fill-indigo-400',
    'fill-[var(--brand)]',
  ];

  if (dailyDeltas.length === 0) {
    return <p className="text-xs italic text-[var(--text-tertiary)]">No contribution data for graph</p>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 720 110" className="w-full min-w-[520px]" role="img" aria-label="Contribution heatmap">
          {weeks.map((week, wi) =>
            week.map((cell, di) => (
              <rect
                key={`${wi}-${di}`}
                x={wi * 13 + 10}
                y={di * 13 + 10}
                width="10"
                height="10"
                rx="2"
                className={`${colors[cell.level]} stroke-[var(--border)] transition-colors hover:stroke-[var(--brand)]`}
              >
                <title>{cell.date}: {cell.count} saves</title>
              </rect>
            ))
          )}
        </svg>
      </div>
      <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
        <span>Less</span>
        <div className="flex items-center gap-1">
          {colors.map((c, i) => <span key={i} className={`h-3 w-3 rounded-sm ${c} border border-[var(--border)]`} />)}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
