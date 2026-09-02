const defaultIcon = (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  </svg>
);

export default function EmptyState({ icon = defaultIcon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-(--surface) border border-dashed border-(--border) rounded-2xl">
      <span className="w-14 h-14 mb-4 rounded-2xl bg-(--brand-soft) text-(--brand-foreground) flex items-center justify-center">{icon}</span>
      <p className="text-sm font-bold text-(--text-primary)">{title}</p>
      {description && <p className="text-xs text-(--text-secondary) mt-1.5 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
