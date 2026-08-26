import { useTranslation } from 'react-i18next';

export default function CitationPopover({
  open,
  finding,
  candidates,
  onInsertCitation,
  onClose,
  anchor,
}) {
  if (!open || !finding) return null;
  const { t } = useTranslation();

  const popoverStyle = anchor ? {
    position: 'fixed',
    left: `${anchor.left}px`,
    top: `${anchor.top}px`,
    zIndex: 1000,
    transform: 'translateX(-50%) translateY(8px)',
  } : { display: 'none' };

  return (
    <div
      className="fixed z-[1000] pointer-events-none"
      style={popoverStyle}
      role="dialog"
      aria-label={t('citationReview')}
    >
      <div className="pointer-events-auto bg-(--surface) border border-(--border) rounded-xl shadow-2xl w-96 max-w-[calc(100vw-2rem)] p-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h4 className="text-sm font-bold text-(--text-primary)">{t('citationReview')}</h4>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1 rounded-lg hover:bg-(--surface-secondary) text-(--text-tertiary) transition-colors"
            aria-label={t('close')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] leading-relaxed">
          <p className="font-bold text-amber-800 mb-1">{t('claim')}</p>
          <p className="text-amber-900 italic">"{finding.excerpt}"</p>
        </div>

        <p className="text-[11px] text-(--text-secondary) mb-3">{finding.rationale}</p>

        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-(--text-tertiary) mb-2">{t('relatedSources')}</p>
          {candidates.length === 0 ? (
            <p className="text-[11px] italic text-(--text-tertiary)">{t('noRelatedSources')}</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {candidates.map(candidate => (
                <div key={candidate.documentChunkId} className="rounded-lg border border-(--border) bg-(--surface-secondary) p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-bold text-(--text-primary)">{candidate.title || candidate.sourceFilename}</p>
                      <p className="text-[9px] text-(--text-tertiary)">{[candidate.authors, candidate.publicationYear].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span className="text-[9px] font-bold text-indigo-600">{Number.isFinite(candidate.similarityScore) ? `${Math.round(candidate.similarityScore * 100)}%` : '--'}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10px] italic leading-relaxed text-(--text-secondary)">"{candidate.excerpt}"</p>
                  <button
                    type="button"
                    onClick={() => {
                      onInsertCitation(finding, candidate);
                      onClose();
                    }}
                    className="mt-2 w-full rounded bg-(--brand) px-2 py-1 text-[10px] font-bold text-(--on-brand) hover:bg-(--brand-hover)"
                  >
                    {t('insertCitation')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}