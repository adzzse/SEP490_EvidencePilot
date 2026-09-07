export default function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center border-b border-(--border) shrink-0 -mb-px">
      {tabs.map((tab) => {
        const isActive = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`-mb-px shrink-0 rounded-t-lg px-4 py-2 text-xs font-bold transition cursor-pointer border border-b-[var(--surface)] ${
              isActive
                ? 'border border-b-(--surface) border-(--border) bg-(--surface) text-(--brand-foreground)'
                : 'border border-transparent text-(--text-secondary) hover:text-(--text-primary)'
            }`}
            aria-pressed={isActive}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[9px] font-black bg-(--surface-tertiary) text-(--text-secondary)">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
