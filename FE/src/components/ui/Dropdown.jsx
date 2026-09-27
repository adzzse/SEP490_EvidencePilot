import { useEffect, useId, useRef, useState } from 'react';

// ponytail: one shared dropdown so popup height is app-controlled
// (native <select> popups are OS-rendered — CSS cannot cap them at N rows).
// Popup shows maxVisibleRows then scrolls; keyboard: Up/Down/Enter/Escape.
export default function Dropdown({
  value,
  options = [],
  onChange,
  disabled = false,
  placeholder,
  ariaLabel,
  testId,
  maxVisibleRows = 5,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const buttonId = useId();
  const selectedIndex = options.findIndex(option => String(option.value) === String(value ?? '')); 
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open ]);

  useEffect(() => {
    if (open) {
      setActiveIndex(selectedIndex);
      listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, selectedIndex]);

  const choose = (index) => {
    const option = options[index];
    if (!option) return;
    setOpen(false);
    if (String(option.value) !== String(value ?? '')) onChange?.(option.value);
  };

  const onButtonKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(current => Math.min(options.length - 1, (current < 0 ? selectedIndex : current) + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(current => Math.max(0, (current < 0 ? selectedIndex : current) - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(activeIndex);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={buttonId}
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen(wasOpen => !wasOpen)}
        onKeyDown={onButtonKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-xs outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-70"
      >
        <span className="min-w-0 flex-1 truncate text-slate-800">{selected ? selected.label : (placeholder || '')}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && !disabled && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          ref={listRef}
          onKeyDown={onListKeyDown}
          className="absolute z-30 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          style={{ maxHeight: maxVisibleRows * 32 }}
        >
          {options.map((option, index) => {
            const isSelected = String(option.value) === String(value ?? '');
            const isActive = index === activeIndex;
            return (
              <li
                key={`${option.value}-${index}`}
                role="option"
                data-index={index}
                aria-selected={isSelected}
                onClick={() => choose(index)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`cursor-pointer truncate px-2 py-1.5 text-xs ${isActive ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700'} ${isSelected ? 'font-bold' : ''}`}
              >
                {option.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
