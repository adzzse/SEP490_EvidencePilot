import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);
let nextId = 1;

// ponytail: global toasts replace the per-tab hand-rolled showToast states.
// Usage: const { toast } = useToast(); toast.success('Saved'); toast.error('Failed');
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((message, type = 'success', durationMs = 3000) => {
    const id = nextId++;
    setItems((current) => [...current, { id, message, type }]);
    timers.current.set(id, setTimeout(() => dismiss(id), durationMs));
  }, [dismiss]);

  const toast = {
    success: (message) => push(message, 'success'),
    error: (message) => push(message, 'error'),
  };

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 items-end" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={`flex items-start gap-2.5 max-w-sm rounded-xl border px-4 py-3 text-xs font-semibold shadow-lg backdrop-blur transition-all ${
              item.type === 'error'
                ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-200'
                : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-200'
            }`}
          >
            <span className={`mt-0.5 inline-flex w-4 h-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
              item.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
            }`}>
              {item.type === 'error' ? '!' : '✓'}
            </span>
            <span className="flex-1">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
              className="shrink-0 opacity-60 hover:opacity-100 transition"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export default ToastContext;
