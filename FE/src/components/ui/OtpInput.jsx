import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

function digitsOnly(value, length) {
  return String(value ?? '').replace(/\D/g, '').slice(0, length);
}

export function OtpInput({
  length = 6,
  defaultValue = '',
  onChange,
  onComplete,
  status = 'idle',
  errorMessage = '',
  successMessage = '',
  hint = '',
  label = 'Verification code',
  disabled = false,
  autoFocus = false,
  focusOnError = true,
  className = '',
  ref,
}) {
  const [value, setValue] = useState(() => digitsOnly(defaultValue, length));
  const [focused, setFocused] = useState(false);
  const [selectionStart, setSelectionStart] = useState(value.length);
  const inputRef = useRef(null);
  const completedValueRef = useRef(null);
  const statusId = useId();
  const error = status === 'error';
  const success = status === 'success';

  const focus = useCallback(() => inputRef.current?.focus(), []);
  const commit = useCallback((nextValue) => {
    const rawValue = String(nextValue ?? '');
    const rawDigits = rawValue.replace(/\D/g, '');
    const next = rawDigits.slice(0, length);
    setValue(next);
    onChange?.(next);
    if (/[^\d\s-]/.test(rawValue) || rawDigits.length !== length) {
      completedValueRef.current = null;
    } else if (completedValueRef.current !== next) {
      completedValueRef.current = next;
      onComplete?.(next);
    }
    return next;
  }, [length, onChange, onComplete]);
  const clear = useCallback(() => {
    commit('');
    setSelectionStart(0);
    focus();
  }, [commit, focus]);

  useImperativeHandle(ref, () => ({ clear, focus }), [clear, focus]);

  useEffect(() => {
    if (error && focusOnError && !disabled) focus();
  }, [disabled, error, focus, focusOnError]);

  const hasStatus = Boolean(hint || errorMessage || successMessage);
  const message = error ? errorMessage : success ? successMessage : hint;
  const messageTone = error
    ? 'text-rose-600 dark:text-rose-400'
    : success
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-slate-500 dark:text-slate-400';
  const activeIndex = Math.min(selectionStart, Math.max(0, length - 1));

  return (
    <div className={`inline-flex w-fit flex-col ${className}`}>
      <div className="relative">
        <div
          data-otp-visual
          aria-hidden="true"
          onClick={focus}
          className={`flex items-center gap-2 ${error ? 'animate-[otpShake_0.32s_cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none' : ''}`}
        >
          {Array.from({ length }, (_, index) => {
            const char = value[index];
            const active = focused && !disabled && index === activeIndex;
            const tone = error
              ? 'border-rose-500 bg-white dark:border-rose-400 dark:bg-zinc-900'
              : success
                ? 'border-emerald-500 bg-white dark:border-emerald-400 dark:bg-zinc-900'
                : active
                  ? 'border-indigo-500 bg-white ring-2 ring-indigo-500/20 dark:border-indigo-400 dark:bg-zinc-900 dark:ring-indigo-400/20'
                  : char
                    ? 'border-slate-300 bg-white dark:border-slate-600 dark:bg-zinc-900'
                    : 'border-slate-200 bg-slate-100/70 dark:border-slate-700 dark:bg-zinc-800/50';

            return (
              <div
                key={index}
                data-otp-cell
                data-active={active || undefined}
                className={`relative flex h-12 w-10 items-center justify-center overflow-hidden rounded-[10px] border-2 font-mono text-[15px] tabular-nums text-slate-700 transition-[background-color,border-color,box-shadow,opacity] duration-150 motion-reduce:transition-none dark:text-slate-200 ${index === 3 ? 'ml-3' : ''} ${disabled ? 'opacity-50' : ''} ${tone}`}
              >
                {char && (
                  <span
                    key={`${index}-${char}`}
                    className="animate-[otpDigitEnter_0.22s_cubic-bezier(0.23,1,0.32,1)_both] motion-reduce:animate-none"
                  >
                    {char}
                  </span>
                )}
                {active && !char && (
                  <span className="absolute h-[17px] w-[1.5px] rounded-[1px] bg-slate-700 animate-[otpCaret_1.06s_linear_infinite] motion-reduce:animate-none dark:bg-slate-200" />
                )}
              </div>
            );
          })}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={length}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-label={label}
          aria-invalid={error || undefined}
          aria-describedby={hasStatus ? statusId : undefined}
          onFocus={(event) => {
            setFocused(true);
            setSelectionStart(event.currentTarget.selectionStart ?? value.length);
          }}
          onBlur={() => setFocused(false)}
          onSelect={(event) => setSelectionStart(event.currentTarget.selectionStart ?? value.length)}
          onChange={(event) => {
            const next = commit(event.currentTarget.value);
            setSelectionStart(Math.min(event.currentTarget.selectionStart ?? next.length, next.length));
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text');
            const digits = digitsOnly(pasted, length);
            if (digits !== pasted || digits.length === length) {
              event.preventDefault();
              commit(pasted);
              setSelectionStart(digits.length);
            }
          }}
          className="absolute inset-0 z-10 h-12 w-full cursor-text opacity-0 disabled:cursor-not-allowed"
        />
      </div>

      {hasStatus && (
        <p
          key={`${status}-${message}`}
          id={statusId}
          role="status"
          className={`mt-2 h-4 animate-[otpStatusEnter_0.2s_ease-out_both] text-[11.5px] leading-[16px] motion-reduce:animate-none ${messageTone}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

export default OtpInput;
