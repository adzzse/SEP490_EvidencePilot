import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ open, onClose, title, children, wide, className, style, closeLabel = 'Close' }) {
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  // ponytail: portal to body — ancestors with backdrop-filter/filter/transform
  // (e.g. WorkspaceHeader's backdrop-blur-md) otherwise become the containing
  // block for `fixed` and pin the overlay to the header strip.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} style={style} className={`m-auto bg-(--surface) text-(--text-primary) border border-(--border) rounded-2xl shadow-2xl max-h-[calc(100vh-2rem)] overflow-y-auto ${wide ? 'max-w-3xl w-full' : 'max-w-lg w-full'} ${className || ''}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-(--border) shrink-0">
          <h2 className="text-base font-bold text-(--text-primary)">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
            className="w-8 h-8 flex items-center justify-center text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--surface-secondary) rounded-xl text-xl leading-none transition-colors cursor-pointer"
          >
            &times;
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}
