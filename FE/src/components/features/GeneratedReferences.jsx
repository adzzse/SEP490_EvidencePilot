export default function GeneratedReferences({ references = [], label, description, className = '' }) {
  if (references.length === 0) return null;

  return (
    <section aria-label={label || undefined} data-read-only="true" className={className}>
      {label && (
        <header className="mb-2">
          <h3 className="text-xs font-bold text-(--text-primary)">{label}</h3>
          {description && <p className="mt-0.5 text-[10px] text-(--text-tertiary)">{description}</p>}
        </header>
      )}
      <ol className="space-y-3 text-sm">
        {references.map(reference => (
          <li key={reference.key} className="flex gap-2 leading-relaxed">
            <span className="shrink-0 text-indigo-700">[{reference.number}]</span>
            <span>{reference.reference}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
