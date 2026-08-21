import { useId } from 'react';

export default function DeleteConfirm({ message, onConfirm, triggerLabel, confirmLabel, cancelLabel, disabled, className = '', children }) {
  const id = useId();
  const anchorName = `--delete-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        disabled={disabled}
        title={triggerLabel}
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
        className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus) focus-visible:ring-offset-2`}
        style={{ anchorName }}
      >
        {children}
      </button>
      <div
        id={id}
        popover="auto"
        role="alertdialog"
        aria-label={message}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
        className="fixed z-50 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border border-(--border) bg-(--surface) p-3 text-left shadow-xl"
        style={{
          positionAnchor: anchorName,
          top: 'calc(anchor(bottom) + 0.5rem)',
          left: 'max(0.75rem, calc(anchor(right) - 16rem))',
          right: 'auto',
          bottom: 'auto',
          margin: 0,
        }}
      >
        <p className="whitespace-pre-line text-xs font-semibold leading-relaxed text-(--text-primary)">{message}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            className="rounded-lg px-3 py-1.5 text-[10px] font-bold text-(--text-secondary) transition hover:bg-(--surface-secondary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus)"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            onClick={onConfirm}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
