import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const CARD_W = 340;
const CARD_MAX_H = 420;

const TYPE_STYLES = {
  UNSUBSTANTIATED_CLAIM: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  SOURCE_DISCREPANCY: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
};

function hasNoEvidence(finding) {
  const evidence = finding?.evidence || [];
  return evidence.length === 0 || evidence.every(item => item.relation === 'NOT_FOUND');
}

export default function InlineCitationCard({
  open,
  finding,
  candidates = [],
  onInsertCitation,
  onClose,
  anchor,
}) {
  const { t } = useTranslation();
  const cardRef = useRef(null);
  const [sourcesOpen, setSourcesOpen] = useState(true);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onMouseDown = (e) => {
      if (cardRef.current && !cardRef.current.contains(e.target)) onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open, onClose]);

  // Scroll anywhere outside the card closes instantly — no coordinate
  // recalculation (jitter rule). Scrolling inside the card body is allowed.
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!cardRef.current?.contains(e.target)) onClose();
    };
    window.addEventListener('scroll', close, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', close, { capture: true });
  }, [open, onClose]);

  if (!open || !finding || !anchor) return null;

  const style = (() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    let left = anchor.left - CARD_W / 2;
    left = Math.max(12, Math.min(left, w - CARD_W - 12));
    let top = anchor.bottom != null ? anchor.bottom + 10 : anchor.top;
    // Flip above when it would overflow the bottom edge.
    if (top + CARD_MAX_H > h - 12) top = Math.max(12, (anchor.top ?? top) - CARD_MAX_H - 14);
    return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
  })();

  const typeLabel = (finding.type || '').replaceAll('_', ' ');
  const badgeClass = TYPE_STYLES[finding.type]
    || 'bg-slate-100 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';

  return createPortal(
    <div
      ref={cardRef}
      role="dialog"
      aria-label={t('citationReview')}
      className="fixed z-[9999] rounded-xl border border-(--border) bg-(--surface) shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      style={{ ...style, width: `${CARD_W}px`, maxHeight: `${CARD_MAX_H}px`, transform: 'translateZ(0)' }}
    >
      <div className="flex items-start justify-between gap-2 px-3 py-2.5 border-b border-(--border-light) bg-(--surface-secondary)">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${badgeClass}`}>
            {typeLabel}
          </span>
          {finding.confidence && (
            <span className="shrink-0 rounded-full bg-(--surface-tertiary) px-1.5 py-0.5 text-[9px] font-bold text-(--text-secondary) border border-(--border)">
              {String(finding.confidence).toLowerCase()}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="shrink-0 rounded p-0.5 text-(--text-tertiary) hover:bg-(--surface-tertiary) hover:text-(--text-primary) transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: `${CARD_MAX_H - 44}px` }}>
        {hasNoEvidence(finding) && (
          <div className="mx-3 mt-2.5 flex items-start gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-(--surface-secondary) px-2.5 py-2 text-[10px] leading-relaxed text-(--text-secondary)">
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--text-tertiary)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <span>{t('noEvidenceInSources') || 'No evidence found in project sources.'}</span>
          </div>
        )}
        <blockquote className="mx-3 mt-2.5 border-l-2 border-amber-400 pl-2 text-[11px] italic leading-relaxed text-(--text-secondary)">
          "{finding.excerpt}"
        </blockquote>
        {finding.rationale && (
          <p className="mx-3 mt-2 text-[11px] leading-relaxed text-(--text-primary)">{finding.rationale}</p>
        )}

        {(finding.evidence || []).length > 0 && (
          <div className="mx-3 mt-2 space-y-1">
            {finding.evidence.map((item, i) => (
              <p key={i} className="text-[10px] font-bold">
                <span className={item.relation === 'CONTRADICTS' ? 'text-rose-600' : item.relation === 'SUPPORTS' ? 'text-emerald-600' : 'text-(--text-tertiary)'}>
                  {(item.relation || '').replaceAll('_', ' ')}
                </span>
                {item.quote && <span className="ml-1 font-normal italic text-(--text-secondary)">"{item.quote}"</span>}
              </p>
            ))}
          </div>
        )}

        <div className="mx-3 my-2.5 rounded-lg border border-(--border) bg-(--surface-secondary)/60">
          <button
            type="button"
            onClick={() => setSourcesOpen(o => !o)}
            className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-(--text-tertiary) hover:text-(--text-primary) transition-colors cursor-pointer"
            aria-expanded={sourcesOpen}
          >
            <span>{t('relatedSources')} ({candidates.length})</span>
            <svg className={`w-2.5 h-2.5 transition-transform ${sourcesOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
          </button>
          {sourcesOpen && (
            <div className="max-h-44 space-y-1.5 overflow-y-auto custom-scrollbar px-2 pb-2">
              {candidates.length === 0 ? (
                <p className="py-2 text-center text-[10px] italic text-(--text-tertiary)">{t('noRelatedSources')}</p>
              ) : candidates.map(candidate => (
                <div key={candidate.documentChunkId} className="rounded-lg border border-(--border) bg-(--surface) p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-bold text-(--text-primary)">{candidate.title || candidate.sourceFilename}</p>
                      <p className="truncate text-[9px] text-(--text-tertiary)">{[candidate.authors, candidate.publicationYear].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span className="shrink-0 rounded bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 text-[9px] font-bold text-indigo-600">
                      {Number.isFinite(candidate.similarityScore) ? `${Math.round(candidate.similarityScore * 100)}%` : '--'}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10px] italic leading-relaxed text-(--text-secondary)">"{candidate.excerpt}"</p>
                  <button
                    type="button"
                    onClick={() => onInsertCitation(finding, candidate)}
                    disabled={!candidate.citationKey}
                    title={candidate.citationKey ? `\\cite{${candidate.citationKey}}` : t('noRelatedSources')}
                    className="mt-1.5 w-full rounded bg-(--brand) px-2 py-1 text-[10px] font-bold text-(--on-brand) hover:bg-(--brand-hover) disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {t('insertCitation')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
