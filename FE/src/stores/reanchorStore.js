import { useSyncExternalStore } from 'react';

// Global "re-anchoring Thread X" state. It must survive panel unmounts,
// Preview↔LaTeX flips, and section navigation — so it lives in a module
// store, not in FeedbackPanel/ThreadCard local state. The editor banner and
// the composer's selection capture both read this to decide whether a text
// selection creates a new thread or relocates Thread X.
let pending = null;
const listeners = new Set();

function emit() {
  listeners.forEach(listener => listener());
}

export function requestReanchor(selection) {
  pending = selection;
  emit();
}

export function clearReanchor() {
  pending = null;
  emit();
}

export function getPendingReanchor() {
  return pending;
}

export function usePendingReanchor() {
  return useSyncExternalStore(
    subscribe => {
      listeners.add(subscribe);
      return () => listeners.delete(subscribe);
    },
    () => pending,
  );
}
