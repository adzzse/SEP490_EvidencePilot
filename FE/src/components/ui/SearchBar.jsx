import { useEffect, useState } from 'react';

function SearchIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
    </svg>
  );
}

// ponytail: single shared search input — 300ms debounce (mirrors SourceLibraryPanel),
// icon + focus-ring tokens standardized so every admin tab behaves the same.
export default function SearchBar({
  value,
  onChange,
  onDebouncedChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className = 'w-full sm:w-52',
  id,
}) {
  const [internal, setInternal] = useState(value ?? '');
  const controlled = value !== undefined;

  useEffect(() => {
    if (controlled) return undefined;
    const timer = setTimeout(() => onDebouncedChange?.(internal.trim()), debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [internal, debounceMs]);

  useEffect(() => {
    if (!controlled) return undefined;
    const timer = setTimeout(() => onDebouncedChange?.(value.trim()), debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-(--text-tertiary)" aria-hidden="true">
        <SearchIcon />
      </span>
      <input
        id={id}
        type="search"
        value={controlled ? value : internal}
        onChange={(e) => (controlled ? onChange?.(e.target.value) : setInternal(e.target.value))}
        placeholder={placeholder}
        className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) pl-9 pr-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)"
      />
    </div>
  );
}
