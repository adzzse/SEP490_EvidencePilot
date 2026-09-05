import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const CROSSFADE = {
  type: 'spring',
  stiffness: 260,
  damping: 34,
  mass: 0.8,
};
const EASE = [0.23, 1, 0.32, 1];

const ALLOW = {
  numeric: /^[0-9]$/,
  alphanumeric: /^[0-9a-zA-Z]$/,
};

function useOtpInput({
  length = 6,
  mode = 'numeric',
  defaultValue = '',
  disabled = false,
  onChange,
  onComplete,
} = {}) {
  const allow = ALLOW[mode];

  const keep = useCallback(
    (text) =>
      text
        .split('')
        .filter((c) => allow.test(c))
        .join(''),
    [allow],
  );

  const [chars, setChars] = useState(() => {
    const seed = defaultValue
      .split('')
      .filter((c) => ALLOW[mode].test(c))
      .slice(0, length);
    return Array.from({ length }, (_, i) => seed[i] ?? '');
  });
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const charsRef = useRef(chars);
  charsRef.current = chars;
  const refs = useRef([]);

  const changed = useRef(onChange);
  changed.current = onChange;
  const completed = useRef(onComplete);
  completed.current = onComplete;

  useEffect(() => {
    setChars((prev) =>
      prev.length === length
        ? prev
        : Array.from({ length }, (_, i) => prev[i] ?? ''),
    );
    refs.current.length = length;
  }, [length]);

  const commit = useCallback((next) => {
    charsRef.current = next;
    setChars(next);
    const value = next.join('');
    changed.current?.(value);
    if (next.length > 0 && next.every((c) => c !== '')) completed.current?.(value);
  }, []);

  const focusAt = useCallback(
    (index) => {
      const el = refs.current[Math.max(0, Math.min(length - 1, index))];
      if (!el) return;
      el.focus();
      el.select();
    },
    [length],
  );

  const fillFrom = useCallback(
    (index, text) => {
      const incoming = keep(text);
      if (incoming.length === 0) return;
      const next = [...charsRef.current];
      let cursor = index;
      for (const c of incoming) {
        if (cursor >= length) break;
        next[cursor] = c;
        cursor += 1;
      }
      commit(next);
      focusAt(cursor);
    },
    [commit, focusAt, keep, length],
  );

  const getCellProps = useCallback(
    (index) => ({
      ref: (el) => {
        refs.current[index] = el;
      },
      value: chars[index] ?? '',
      disabled,
      type: 'text',
      inputMode: mode === 'numeric' ? 'numeric' : 'text',
      autoComplete: index === 0 ? 'one-time-code' : 'off',
      autoCorrect: 'off',
      autoCapitalize: 'off',
      spellCheck: false,
      onChange: (e) => {
        const previous = charsRef.current[index] ?? '';
        const raw = e.currentTarget.value;
        const trimmed =
          raw.length > 1 && previous && raw.startsWith(previous)
            ? raw.slice(previous.length)
            : raw;
        const incoming = keep(trimmed);

        if (incoming.length === 0) {
          if (raw.length === 0 && previous) {
            const next = [...charsRef.current];
            next[index] = '';
            commit(next);
          }
          e.currentTarget.value = charsRef.current[index] ?? '';
          return;
        }

        if (incoming.length === 1) {
          const next = [...charsRef.current];
          next[index] = incoming;
          e.currentTarget.value = incoming;
          commit(next);
          if (index < length - 1) focusAt(index + 1);
          return;
        }

        fillFrom(index, incoming);
      },
      onKeyDown: (e) => {
        if (e.key === 'Backspace') {
          e.preventDefault();
          const current = charsRef.current;
          const next = [...current];
          if (current[index]) {
            next[index] = '';
            commit(next);
            return;
          }
          if (index > 0) {
            next[index - 1] = '';
            commit(next);
            focusAt(index - 1);
          }
          return;
        }
        if (e.key === 'Delete') {
          e.preventDefault();
          const next = [...charsRef.current];
          next[index] = '';
          commit(next);
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          focusAt(index - 1);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          focusAt(index + 1);
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          focusAt(0);
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          focusAt(length - 1);
        }
      },
      onPaste: (e) => {
        e.preventDefault();
        const text = keep(e.clipboardData.getData('text'));
        fillFrom(text.length >= length ? 0 : index, text);
      },
      onFocus: (e) => {
        e.currentTarget.select();
        const firstEmpty = charsRef.current.findIndex((c) => c === '');
        if (firstEmpty !== -1 && firstEmpty < index) {
          focusAt(firstEmpty);
          return;
        }
        setFocusedIndex(index);
      },
      onBlur: (e) => {
        const to = e.relatedTarget;
        if (to && refs.current.includes(to)) return;
        setFocusedIndex(-1);
      },
    }),
    [chars, commit, disabled, fillFrom, focusAt, keep, length, mode],
  );

  const value = chars.join('');

  return {
    chars,
    value,
    length,
    complete: chars.length > 0 && chars.every((c) => c !== ''),
    focusedIndex,
    getCellProps,
    focusAt,
    clear: useCallback(() => {
      commit(Array.from({ length }, () => ''));
      focusAt(0);
    }, [commit, focusAt, length]),
  };
}

export function OtpInput({
  length = 6,
  mode = 'numeric',
  defaultValue = '',
  onChange,
  onComplete,
  status = 'idle',
  errorMessage = '',
  successMessage = '',
  hint = '',
  label = 'Verification code',
  groupEvery = 3,
  disabled = false,
  autoFocus = false,
  focusOnError = true,
  className = '',
  ref,
}) {
  const reduced = useReducedMotion();
  const statusId = useId();

  const { chars, focusedIndex, getCellProps, focusAt, clear } = useOtpInput({
    length,
    mode,
    defaultValue,
    disabled,
    onChange,
    onComplete,
  });

  const wasError = useRef(false);
  const error = status === 'error';
  const success = status === 'success';

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        clear();
        focusAt(0);
      },
      focus: () => focusAt(0),
    }),
    [clear, focusAt],
  );

  useEffect(() => {
    if (error && !wasError.current && focusOnError && !disabled) focusAt(0);
    wasError.current = error;
  }, [error, focusOnError, disabled, focusAt]);

  useEffect(() => {
    if (autoFocus && !disabled) focusAt(0);
  }, [autoFocus, disabled, focusAt]);

  const enter = reduced ? { duration: 0 } : { duration: 0.22, ease: EASE };
  const swap = reduced ? { duration: 0 } : CROSSFADE;
  const hasStatus =
    hint.length > 0 || errorMessage.length > 0 || successMessage.length > 0;

  const message = error ? errorMessage : success ? successMessage : hint;
  const messageTone = error
    ? 'text-rose-600 dark:text-rose-400'
    : success
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-slate-500 dark:text-slate-400';

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <motion.div
        role="group"
        aria-label={label}
        className="relative flex gap-2"
        initial={false}
        variants={{ idle: { x: 0 }, wrong: { x: [0, -5, 4, -3, 0] } }}
        animate={error && !reduced ? 'wrong' : 'idle'}
        transition={{ duration: 0.32, ease: EASE }}
      >
        {Array.from({ length }, (_, i) => {
          const char = chars[i] ?? '';
          const active = focusedIndex === i;
          const gap = groupEvery > 0 && i > 0 && i % groupEvery === 0;

          return (
            <div key={i} className={`relative h-12 w-10 ${gap ? 'ml-3' : ''}`}>
              <input
                {...getCellProps(i)}
                aria-label={`${label}, character ${i + 1} of ${length}`}
                aria-invalid={error || undefined}
                aria-describedby={hasStatus ? statusId : undefined}
                className={`h-12 w-10 rounded-[10px] border-2 text-center text-[15px] text-transparent caret-transparent outline-none transition-[background-color,border-color,box-shadow] duration-150 selection:bg-transparent focus-visible:outline-none disabled:opacity-50 ${
                  error
                    ? 'border-rose-500 bg-white dark:border-rose-400 dark:bg-zinc-900'
                    : success
                      ? 'border-emerald-500 bg-white dark:border-emerald-400 dark:bg-zinc-900'
                      : active
                        ? 'border-indigo-500 bg-white dark:border-indigo-400 dark:bg-zinc-900'
                        : char
                          ? 'border-slate-300 bg-white dark:border-slate-600 dark:bg-zinc-900'
                          : 'border-slate-200 bg-slate-100/70 dark:border-slate-700 dark:bg-zinc-800/50'
                }`}
              />

              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 grid place-items-center"
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {char ? (
                    <motion.span
                      key={char}
                      initial={
                        reduced
                          ? false
                          : {
                              opacity: 0,
                              scale: 0.97,
                              y: 10,
                              filter: 'blur(6px)',
                            }
                      }
                      animate={{
                        opacity: 1,
                        scale: 1,
                        y: 0,
                        filter: 'blur(0px)',
                      }}
                      exit={
                        reduced
                          ? { opacity: 0 }
                          : {
                              opacity: 0,
                              scale: 0.98,
                              y: -6,
                              filter: 'blur(3px)',
                            }
                      }
                      transition={enter}
                      className="col-start-1 row-start-1 font-mono text-[15px] tabular-nums text-slate-700 dark:text-slate-200"
                    >
                      {char}
                    </motion.span>
                  ) : null}
                </AnimatePresence>

                {active && !char && !disabled ? (
                  <motion.span
                    className="col-start-1 row-start-1 block h-[17px] w-[1.5px] rounded-[1px] bg-slate-700 dark:bg-slate-200"
                    initial={{ opacity: 1 }}
                    animate={
                      reduced ? { opacity: 1 } : { opacity: [1, 1, 0, 0] }
                    }
                    transition={
                      reduced
                        ? { duration: 0 }
                        : {
                            duration: 1.06,
                            times: [0, 0.5, 0.5, 1],
                            repeat: Infinity,
                            ease: 'linear',
                          }
                    }
                  />
                ) : null}
              </span>
            </div>
          );
        })}
      </motion.div>

      {hasStatus && (
        <>
          <div
            aria-hidden
            className="mt-2 grid h-4 text-[11.5px] leading-[16px]"
          >
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={status}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -3 }}
                transition={swap}
                className={`col-start-1 row-start-1 ${messageTone}`}
              >
                {message}
              </motion.span>
            </AnimatePresence>
          </div>
          <span id={statusId} role="status" className="sr-only">
            {message}
          </span>
        </>
      )}
    </div>
  );
}

export default OtpInput;
