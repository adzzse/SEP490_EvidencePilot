import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const DEFAULT_STRINGS = {
  header: 'Item permanently deleted',
  bodyTemplate: 'The item {entityName}{entityDetails} was deleted{actorPart} at {timestamp}.',
  caution: 'Caution: This action will become permanent once the countdown expires.',
  undoLabel: 'Undo',
  undoRemaining: '({seconds}s remaining)',
  dismissLabel: 'Dismiss',
};

function interpolate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (vars[key] != null ? vars[key] : match));
}

export default function useUndoDelete({ delay = 5000, onUndo } = {}) {
  const { user } = useAuth();
  const timerRef = useRef(null);
  const runRef = useRef(null);
  const undoRef = useRef(onUndo);
  const [pending, setPending] = useState(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearPending = useCallback(() => {
    clearTimer();
    runRef.current = null;
    setPending(null);
  }, [clearTimer]);

  const start = useCallback((payload, run, onUndoCb) => {
    clearPending();
    const timeoutDuration = payload.timeoutDuration || delay;
    runRef.current = run;
    undoRef.current = onUndoCb || onUndo;
    const actorName = payload.actorName
      || (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '');
    setPending({
      ...payload,
      actorName,
      timeoutDuration,
      timestamp: payload.timestamp || new Date().toLocaleString(),
      deadline: Date.now() + timeoutDuration,
    });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const r = runRef.current;
      runRef.current = null;
      setPending(null);
      if (r) r();
    }, timeoutDuration);
  }, [clearPending, delay, onUndo, user]);

  const undo = useCallback(() => {
    clearPending();
    if (undoRef.current) undoRef.current();
  }, [clearPending]);

  const dismiss = useCallback(() => {
    const r = runRef.current;
    clearPending();
    if (r) r();
  }, [clearPending]);

  useEffect(() => clearPending, [clearPending]);

  return { pending, start, undo, dismiss };
}

export function UndoToast({ pending, onUndo, onDismiss }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!pending) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [pending]);

  if (!pending) return null;

  const total = pending.timeoutDuration || 5000;
  const remaining = Math.max(0, pending.deadline - now);
  const pct = Math.min(100, Math.max(0, (remaining / total) * 100));
  const seconds = Math.ceil(remaining / 1000);

  const vars = {
    entityName: pending.entityName,
    entityDetails: pending.entityDetails ? ` (${pending.entityDetails})` : '',
    actorPart: pending.actorName ? ` by ${pending.actorName}` : '',
    timestamp: pending.timestamp,
    seconds,
  };
  const body = pending.bodyTemplate
    ? interpolate(pending.bodyTemplate, vars)
    : (pending.message || interpolate(DEFAULT_STRINGS.bodyTemplate, vars));
  const undoLabel = interpolate(pending.undoLabel || DEFAULT_STRINGS.undoLabel, vars);
  const undoLabelWithCountdown = `${undoLabel} ${interpolate(pending.undoRemaining || DEFAULT_STRINGS.undoRemaining, vars)}`.trim();

  return (
    <div role="alert" className="fixed bottom-5 right-5 z-[70] w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl animate-slide-in-right">
      <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2.5">
        <svg className="h-4 w-4 shrink-0 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span className="text-[10px] font-black uppercase tracking-wider text-red-700">{pending.header || DEFAULT_STRINGS.header}</span>
      </div>

      <div className="px-4 py-3">
        <p className="text-xs font-medium leading-relaxed text-slate-700">{body}</p>
        <p className="mt-1 text-[10px] text-slate-500">{pending.caution || DEFAULT_STRINGS.caution}</p>

        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #dc2626, #2563eb)' }}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 px-4 pb-3">
        <button type="button" onClick={onDismiss} className="text-[10px] font-bold text-slate-500 transition hover:text-slate-800">
          {pending.dismissLabel || DEFAULT_STRINGS.dismissLabel}
        </button>
        <button type="button" onClick={onUndo} className="rounded-lg bg-[#1e3a8a] px-3 py-1.5 text-[10px] font-black text-white shadow-sm transition hover:bg-[#152447]">
          {undoLabelWithCountdown}
        </button>
      </div>
    </div>
  );
}
