import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { buildSourceGroups, hasNoEvidence } from './citationReviewPopover.js';

const CARD_W = 340;
const CARD_MAX_H = 440;

const TYPE_STYLES = {
  UNSUBSTANTIATED_CLAIM: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  SOURCE_DISCREPANCY: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
};

const CONFIDENCE_KEYS = {
  HIGH: 'confidenceHigh',
  MEDIUM: 'confidenceMedium',
  LOW: 'confidenceLow',
};

const RELATION_KEYS = {
  SUPPORTS: 'relationSupports',
  CONTRADICTS: 'relationContradicts',
  NOT_FOUND: 'relationNotFound',
};

const RELATION_STYLES = {
  SUPPORTS: 'text-emerald-700 dark:text-emerald-300',
  CONTRADICTS: 'text-rose-700 dark:text-rose-300',
  NOT_FOUND: 'text-(--text-tertiary)',
};

export default function InlineCitationCard({
  open,
  finding,
  findingIndex = 0,
  findingCount = 0,
  candidates = [],
  sources = [],
  review,
  sourcesLoading = false,
  sourcesError = '',
  isStale = false,
  canInsertCitation = true,
  onInsertCitation,
  onOpenPassage,
  onPrevious,
  onNext,
  onClose,
  anchor,
}) {
  const { t, i18n } = useTranslation();
  const cardRef = useRef(null);
  const noEvidence = hasNoEvidence(finding);
  const sourceGroups = buildSourceGroups(finding?.evidence, candidates, sources);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft' && findingCount > 1) {
        event.preventDefault();
        onPrevious?.();
      } else if (event.key === 'ArrowRight' && findingCount > 1) {
        event.preventDefault();
        onNext?.();
      }
    };
    const onMouseDown = (event) => {
      if (cardRef.current && !cardRef.current.contains(event.target)) onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [findingCount, onClose, onNext, onPrevious, open]);

  useEffect(() => {
    if (open) cardRef.current?.focus({ preventScroll: true });
  }, [finding, open]);

  // Scrolling outside the card closes it; scrolling its body remains available.
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!cardRef.current?.contains(event.target)) onClose();
    };
    window.addEventListener('scroll', close, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', close, { capture: true });
  }, [open, onClose]);

  if (!open || !finding || !anchor) return null;

  const dimensions = (() => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const width = Math.min(CARD_W, Math.max(0, viewportWidth - 24));
    const maxHeight = Math.min(CARD_MAX_H, Math.max(0, viewportHeight - 24));
    let left = anchor.left - width / 2;
    left = Math.max(12, Math.min(left, viewportWidth - width - 12));
    let top = anchor.bottom != null ? anchor.bottom + 10 : anchor.top;
    if (top + maxHeight > viewportHeight - 12) {
      top = Math.max(12, (anchor.top ?? top) - maxHeight - 14);
    }
    return { left, top, width, maxHeight };
  })();

  const typeLabel = finding.type === 'SOURCE_DISCREPANCY'
    ? t('citationFindingDiscrepancy')
    : noEvidence
      ? t('citationFindingNoEvidence')
      : t('citationFindingNeedsReview');
  const badgeClass = TYPE_STYLES[finding.type]
    || 'bg-slate-100 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  const confidence = t(CONFIDENCE_KEYS[finding.confidence] || 'unknown');
  const reviewedDate = review?.reviewedAt ? new Date(review.reviewedAt) : null;
  const reviewedAt = reviewedDate && !Number.isNaN(reviewedDate.getTime())
    ? reviewedDate.toLocaleString(i18n.language === 'vi' ? 'vi-VN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '';

  const renderPassage = (passage, group) => {
    const candidate = passage.candidate;
    const similarity = Number.isFinite(candidate?.similarityScore)
      ? Math.round(candidate.similarityScore * 100)
      : null;
    return (
      <div key={passage.key} className="rounded-lg border border-(--border) bg-(--surface-secondary) p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {passage.relation && (
            <span className={`text-[10px] font-black uppercase tracking-wide ${RELATION_STYLES[passage.relation] || 'text-(--text-tertiary)'}`}>
              {t(RELATION_KEYS[passage.relation] || 'unknown')}
            </span>
          )}
          {similarity != null && (
            <span
              title={t('retrievalSimilarityHelp')}
              className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
            >
              {t('retrievalSimilarity', { score: similarity })}
            </span>
          )}
        </div>
        {passage.excerpt && (
          <p className="mt-1.5 line-clamp-3 text-[11px] italic leading-relaxed text-(--text-secondary)">“{passage.excerpt}”</p>
        )}
        <div className={`mt-2 grid gap-1.5 ${candidate ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button
            type="button"
            onClick={() => onOpenPassage?.({
              documentId: passage.documentId,
              chunkId: passage.chunkId,
              quote: passage.quote || passage.excerpt,
              fileName: group.sourceFilename || group.title,
            })}
            disabled={!onOpenPassage || !passage.documentId || !passage.chunkId}
            className="rounded border border-(--border) bg-(--surface) px-2 py-1.5 text-[11px] font-bold text-(--text-primary) transition-colors hover:bg-(--surface-tertiary) focus-visible:ring-2 focus-visible:ring-(--brand) disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {t('openPassage')}
          </button>
          {candidate && (
            <button
              type="button"
              onClick={() => onInsertCitation(finding, candidate)}
              disabled={!canInsertCitation || !candidate.citationKey}
              title={!canInsertCitation ? t('saveReadOnly') : candidate.citationKey ? `\\cite{${candidate.citationKey}}` : t('noRelatedSources')}
              className="rounded bg-(--brand) px-2 py-1.5 text-[11px] font-bold text-(--on-brand) transition-colors hover:bg-(--brand-hover) focus-visible:ring-2 focus-visible:ring-(--brand) focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              {t('insertCitation')}
            </button>
          )}
        </div>
      </div>
    );
  };

  return createPortal(
    <div
      ref={cardRef}
      role="dialog"
      tabIndex={-1}
      aria-label={t('citationReview')}
      className="fixed z-[9999] flex flex-col overflow-hidden rounded-xl border border-(--border) bg-(--surface) shadow-2xl outline-none animate-in fade-in zoom-in-95 duration-100 motion-reduce:animate-none"
      style={{
        left: `${Math.round(dimensions.left)}px`,
        top: `${Math.round(dimensions.top)}px`,
        width: `${dimensions.width}px`,
        maxHeight: `${dimensions.maxHeight}px`,
        transform: 'translateZ(0)',
      }}
    >
      <div className="border-b border-(--border-light) bg-(--surface-secondary) px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1" aria-label={`${findingIndex + 1}/${findingCount}`}>
            <button
              type="button"
              onClick={onPrevious}
              disabled={findingCount <= 1}
              aria-label={t('previousFinding')}
              className="rounded p-1 text-(--text-secondary) transition-colors hover:bg-(--surface-tertiary) hover:text-(--text-primary) focus-visible:ring-2 focus-visible:ring-(--brand) disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="min-w-10 text-center text-[11px] font-black tabular-nums text-(--text-secondary)">{findingIndex + 1}/{findingCount}</span>
            <button
              type="button"
              onClick={onNext}
              disabled={findingCount <= 1}
              aria-label={t('nextFinding')}
              className="rounded p-1 text-(--text-secondary) transition-colors hover:bg-(--surface-tertiary) hover:text-(--text-primary) focus-visible:ring-2 focus-visible:ring-(--brand) disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="shrink-0 rounded p-1 text-(--text-tertiary) transition-colors hover:bg-(--surface-tertiary) hover:text-(--text-primary) focus-visible:ring-2 focus-visible:ring-(--brand) cursor-pointer"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${badgeClass}`}>
            {typeLabel}
          </span>
          {finding.confidence && (
            <span className="rounded-full border border-(--border) bg-(--surface-tertiary) px-2 py-0.5 text-[10px] font-bold text-(--text-secondary)">
              {t('findingConfidence', { level: confidence })}
            </span>
          )}
        </div>
        {(review?.sectionVersion != null || reviewedAt) && (
          <p className="mt-1.5 text-[10px] font-medium text-(--text-tertiary)">
            {review?.sectionVersion != null && t('versionLabel', { version: review.sectionVersion })}
            {review?.sectionVersion != null && reviewedAt && ' · '}
            {reviewedAt}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        {isStale && (
          <div className="mx-3 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-200">
            {t('reviewStale')}
          </div>
        )}
        {noEvidence && (
          <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-slate-300 bg-(--surface-secondary) px-2.5 py-2 text-[11px] leading-relaxed text-(--text-secondary) dark:border-slate-700">
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--text-tertiary)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <span>{t('noEvidenceInSources')}</span>
          </div>
        )}

        <section className="mx-3 mt-3">
          <h3 className="text-[10px] font-black uppercase tracking-wider text-(--text-tertiary)">{t('flaggedExcerpt')}</h3>
          <blockquote className="mt-1.5 rounded-r-lg border-l-2 border-amber-400 bg-(--surface-secondary) px-2.5 py-2 text-[12px] italic leading-relaxed text-(--text-secondary)">
            “{finding.excerpt}”
          </blockquote>
        </section>

        {finding.rationale && (
          <section className="mx-3 mt-3">
            <h3 className="text-[10px] font-black uppercase tracking-wider text-(--text-tertiary)">{t('reviewConclusion')}</h3>
            <p className="mt-1.5 text-[12px] leading-relaxed text-(--text-primary)">{finding.rationale}</p>
          </section>
        )}

        <section className="mx-3 my-3">
          <h3 className="text-[10px] font-black uppercase tracking-wider text-(--text-tertiary)">
            {t('sourceEvidence')} ({sourceGroups.length})
          </h3>
          {sourcesLoading && (
            <p role="status" className="mt-1.5 flex items-center gap-1.5 text-[11px] text-(--text-secondary)">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 motion-reduce:animate-none" aria-hidden="true"></span>
              {t('searchingRelatedSources')}
            </p>
          )}
          {sourcesError && (
            <p role="alert" className="mt-1.5 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] leading-relaxed text-rose-700 dark:border-rose-800 dark:bg-rose-900/25 dark:text-rose-200">{sourcesError}</p>
          )}
          {!sourcesLoading && sourceGroups.length === 0 && (
            <p className="mt-1.5 rounded-lg border border-(--border) bg-(--surface-secondary) py-3 text-center text-[11px] italic text-(--text-tertiary)">{t('noRelatedSources')}</p>
          )}
          <div className="mt-1.5 space-y-2">
            {sourceGroups.map(group => {
              const usedInConclusion = group.evidencePassages.some(passage => passage.relation !== 'NOT_FOUND');
              const checkedInReview = group.evidencePassages.length > 0;
              return (
                <article key={group.key} className="rounded-lg border border-(--border) bg-(--surface) p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-bold text-(--text-primary)">{group.title || group.sourceFilename || t('unknown')}</p>
                      <p className="truncate text-[10px] text-(--text-tertiary)">{[group.authors, group.publicationYear].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                      usedInConclusion
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : checkedInReview
                          ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    }`}>
                      {t(usedInConclusion ? 'usedInConclusion' : checkedInReview ? 'checkedInReview' : 'relatedSource')}
                    </span>
                  </div>
                  {group.evidencePassages.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {group.evidencePassages.map(passage => renderPassage(passage, group))}
                    </div>
                  )}
                  {group.relatedPassages.length > 0 && (
                    group.evidencePassages.length > 0 ? (
                      <details className="mt-2 text-[11px] text-(--text-secondary)">
                        <summary className="rounded py-1 font-bold text-(--text-primary) focus-visible:ring-2 focus-visible:ring-(--brand) cursor-pointer">
                          {t('otherRelatedPassages', { count: group.relatedPassages.length })}
                        </summary>
                        <div className="mt-1 space-y-1.5">
                          {group.relatedPassages.map(passage => renderPassage(passage, group))}
                        </div>
                      </details>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        {group.relatedPassages.map(passage => renderPassage(passage, group))}
                      </div>
                    )
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {(review?.limitations || []).length > 0 && (
          <details className="mx-3 mb-3 rounded-lg border border-(--border) bg-(--surface-secondary) px-2.5 py-2 text-[11px] text-(--text-secondary)">
            <summary className="font-bold text-(--text-primary) focus-visible:ring-2 focus-visible:ring-(--brand) cursor-pointer">
              {t('reviewLimitations')} ({review.limitations.length})
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed">
              {review.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}
            </ul>
          </details>
        )}
      </div>
    </div>,
    document.body,
  );
}
