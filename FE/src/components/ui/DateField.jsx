import { useEffect, useRef, useState } from 'react';

export const toDisplayDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

export const parseDisplayDate = (text) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text || '');
  if (!m) return null;
  const day = Number(m[1]); const month = Number(m[2]); const year = Number(m[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

// ponytail: native date inputs render mm/dd/yyyy under some browser locales and
// CSS cannot change that, so type DD/MM/YYYY here and use the hidden native
// picker (which still enforces min/max) only for the calendar popup.
export default function DateField({ value, min, max, ariaLabel, onChange }) {
  const [text, setText] = useState(toDisplayDate(value));
  const nativeRef = useRef(null);
  useEffect(() => { setText(toDisplayDate(value)); }, [value]);
  const commit = (next) => {
    const digits = next.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setText(formatted);
    if (digits.length === 8) {
      const iso = parseDisplayDate(formatted);
      if (iso && (!min || iso >= min) && (!max || iso <= max)) onChange(iso);
    } else if (digits.length === 0) {
      onChange('');
    }
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-xl border border-(--border) bg-(--surface-secondary) px-2 py-1.5 focus-within:ring-2 focus-within:ring-(--focus)">
      <input
        type="text"
        inputMode="numeric"
        value={text}
        placeholder="DD/MM/YYYY"
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setText(toDisplayDate(value))}
        aria-label={ariaLabel}
        className="w-24 bg-transparent text-xs font-medium text-(--text-primary) placeholder:text-(--text-tertiary) focus:outline-none"
      />
      <button
        type="button"
        onClick={() => nativeRef.current?.showPicker?.()}
        aria-label={ariaLabel}
        className="text-(--text-tertiary) transition-colors hover:text-(--text-primary)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      </button>
      <input
        ref={nativeRef}
        type="date"
        value={value}
        min={min}
        max={max}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onChange(e.target.value)}
        className="absolute h-0 w-0 opacity-0"
      />
    </span>
  );
}
