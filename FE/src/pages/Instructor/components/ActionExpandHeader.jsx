import { useState } from 'react';

export default function ActionExpandHeader({ title, placeholder = 'Search...', searchValue = '', onSearch, onAdd, addLabel = 'Add' }) {
  const [isAddHovered, setIsAddHovered] = useState(false);
  const hasText = searchValue && String(searchValue).trim() !== '';

  return (
    <div className="flex items-center justify-between gap-2 h-8">
      <h2 className="shrink-0 text-sm font-bold text-[var(--brand-foreground)]">{title}</h2>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-1 w-56">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--text-tertiary)]">
            {/* Bootstrap 5 bi-search — always visible */}
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0" /></svg>
          </span>
          <input
            value={searchValue}
            onChange={e => onSearch?.(e.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none px-2"
          />
          {hasText && (
            <button type="button" onClick={() => onSearch?.('')} className="shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">×</button>
          )}
        </div>
        <button
          type="button"
          onClick={onAdd}
          onMouseEnter={() => setIsAddHovered(true)}
          onMouseLeave={() => setIsAddHovered(false)}
          className={`flex shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] text-white transition-all duration-300 ease-in-out hover:bg-[var(--brand-hover)] ${isAddHovered ? 'px-3 gap-1.5 h-8' : 'w-8 h-8'}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
          {isAddHovered && <span className="whitespace-nowrap text-xs font-bold">{addLabel}</span>}
        </button>
      </div>
    </div>
  );
}
