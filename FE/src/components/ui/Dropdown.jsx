import { useEffect, useId, useRef, useState } from 'react';

// ponytail: one shared dropdown so popup height is app-controlled
// (native <select> popups are OS-rendered — CSS cannot cap them at N rows).
// Popup shows maxVisibleRows then scrolls; keyboard: Up/Down/Enter/Escape.
// Convention: new single-select filters use this component, not <select>.
// Form fields needing native validation/IME keep <select> (see
// FE/test/dropdownConvention.test.js grandfather list). Action menus are
// plain popovers, never role=listbox.
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
  loading = false,
  emptyLabel = 'No options',
  disabledValues = [],
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const buttonRef = useRef(null);
  // True when the close was keyboard-initiated: focus returns to the button.
  // Outside-pointer closes leave focus alone (the mouse is elsewhere).
  const refocusButtonRef = useRef(false);
  const buttonId = useId();
  const selectedIndex = options.findIndex(option => String(option.value) === String(value ?? '')); 
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        refocusButtonRef.current = true;
        setOpen(false);
      }
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
      // Keyboard users land here from the button; mouse users are unaffected
      // (focusing the already-visible list is a no-op for them).
      listRef.current?.focus({ preventScroll: true });
    } else if (refocusButtonRef.current) {
      refocusButtonRef.current = false;
      buttonRef.current?.focus({ preventScroll: true });
    }
  }, [open, selectedIndex]);

  const choose = (index) => {
    const option = options[index];
    if (!option) return;
    if (disabledValues.includes(option.value)) return;
    refocusButtonRef.current = true;
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
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      refocusButtonRef.current = true;
      setOpen(false);
    } else if (event.key === 'Tab') {
      setOpen(false);
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
        ref={buttonRef}
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen(wasOpen => !wasOpen)}
        onKeyDown={onButtonKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-(--border) bg-(--surface) px-2 py-1.5 text-left text-xs outline-none focus:border-(--focus) disabled:cursor-not-allowed disabled:bg-(--surface-secondary) disabled:opacity-70"
      >
        <span className="min-w-0 flex-1 truncate text-(--text-primary)">{selected ? selected.label : (placeholder || '')}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && !disabled && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          aria-activedescendant={activeIndex >= 0 ? `${buttonId}-opt-${activeIndex}` : undefined}
          tabIndex={-1}
          ref={listRef}
          onKeyDown={onListKeyDown}
          className="absolute z-30 mt-1 max-h-40 w-full overflow-y-auto rounded-xl border border-(--border) bg-(--surface) py-1 shadow-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ maxHeight: maxVisibleRows * 32 }}
        >
          {loading && (
            <li role="option" aria-selected="false" aria-disabled="true" className="px-2 py-1.5 text-xs text-(--text-tertiary)">Loading…</li>
          )}
          {!loading && options.length === 0 && (
            <li role="option" aria-selected="false" aria-disabled="true" className="px-2 py-1.5 text-xs text-(--text-tertiary)">{emptyLabel}</li>
          )}
          {!loading && options.map((option, index) => {
            const isSelected = String(option.value) === String(value ?? '');
            const isActive = index === activeIndex;
            const isDisabled = disabledValues.includes(option.value);
            return (
              <li
                key={`${option.value}-${index}`}
                id={`${buttonId}-opt-${index}`}
                role="option"
                data-index={index}
                aria-selected={isSelected}
                aria-disabled={isDisabled || undefined}
                onClick={() => choose(index)}
                onMouseEnter={() => { if (!isDisabled) setActiveIndex(index); }}
                className={`truncate px-2 py-1.5 text-xs ${isDisabled ? 'cursor-not-allowed opacity-50 text-(--text-tertiary)' : 'cursor-pointer'} ${isActive && !isDisabled ? 'bg-(--brand-soft) text-(--brand-foreground)' : 'text-(--text-secondary)'} ${isSelected ? 'font-bold' : ''}`}
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
