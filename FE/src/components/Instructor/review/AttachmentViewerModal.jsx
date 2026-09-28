import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../index.js';

// rationale: in-app carousel for feedback attachments — replaces target=_blank
// so the instructor never leaves the review. Arrow keys + buttons navigate,
// Escape/backdrop closes (handled by Modal).
export default function AttachmentViewerModal({ attachments, index = 0, onClose, onIndex }) {
  const { t } = useTranslation();
  const items = attachments || [];
  const [current, setCurrent] = useState(index);
  useEffect(() => { setCurrent(index); }, [index]);
  const go = useCallback(delta => {
    setCurrent(prev => {
      const next = (prev + delta + items.length) % items.length;
      onIndex?.(next);
      return next;
    });
  }, [items.length, onIndex]);
  useEffect(() => {
    if (items.length <= 1) return undefined;
    const onKey = event => {
      if (event.key === 'ArrowLeft') go(-1);
      else if (event.key === 'ArrowRight') go(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, items.length]);
  const active = items[current];
  if (!active) return null;
  return (
    <Modal open onClose={onClose} title={active.texFilename || active.mimeType || ''} wide closeLabel={t('close')}>
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={items.length <= 1}
            aria-label={t('previousFinding')}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-(--border) text-(--text-secondary) disabled:opacity-30"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-[11px] font-black tabular-nums text-(--text-secondary)">{current + 1}/{items.length}</span>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={items.length <= 1}
            aria-label={t('nextFinding')}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-(--border) text-(--text-secondary) disabled:opacity-30"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        {active.url
          ? <img src={active.url} alt={active.texFilename || ''} className="max-h-[60vh] w-full rounded-xl border border-(--border) bg-white object-contain" />
          : <p className="py-8 text-center text-xs italic text-(--text-tertiary)">{active.texFilename}</p>}
      </div>
    </Modal>
  );
}
