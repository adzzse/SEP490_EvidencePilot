import { useState } from 'react';

function EyeIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.9 5.1A10.7 10.7 0 0112 5c6.5 0 10 7 10 7a17.6 17.6 0 01-3.1 4.1M6.6 6.6A17.7 17.7 0 002 12s3.5 7 10 7c1.7 0 3.2-.3 4.5-.8" />
    </svg>
  );
}

export function PasswordInput({
  label,
  name,
  value,
  onChange,
  autoComplete,
  required = false,
  placeholder,
  inputClassName = 'w-full rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-800/80 px-4 py-2.5 pr-10 text-xs text-slate-900 dark:text-slate-100 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400',
  wrapperClassName = 'block',
  labelClassName = 'mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300',
}) {
  const [visible, setVisible] = useState(false);
  const resolvedClassName = /\bpr-\d+\b/.test(inputClassName)
    ? inputClassName
    : `${inputClassName} pr-10`;
  return (
    <label className={wrapperClassName}>
      {label && <span className={labelClassName}>{label}</span>}
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required={required}
          placeholder={placeholder}
          className={resolvedClassName}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex items-center justify-center w-9 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </label>
  );
}

export default PasswordInput;
