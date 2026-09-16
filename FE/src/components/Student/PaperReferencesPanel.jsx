import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { referenceStatusOf as statusOf } from '../../utils/paperReferences.js';

const STATUS_KEYS = {
  available: 'referenceAvailable',
  missing: 'referenceMissingPdf',
  processing: 'referenceProcessing',
};

const REFERENCE_CHECK_STATUS_KEYS = {
  READY: 'referenceCheckStatusReady',
  MISSING_FILE: 'referenceCheckStatusMissingFile',
  PROCESSING: 'referenceCheckStatusProcessing',
  UNAVAILABLE: 'referenceCheckStatusUnavailable',
  MISSING_SOURCE: 'referenceCheckStatusMissingSource',
  NEEDS_REVIEW: 'referenceCheckStatusNeedsReview',
};

export default function PaperReferencesPanel({
  references = [],
  loading = false,
  error = '',
  referenceCheck = null,
  referenceCheckLoading = false,
  referenceCheckError = '',
  onRetryReferenceCheck,
  canMutate = false,
  isLocked = false,
  attachingId = null,
  onRemove,
  onAttach,
}) {
  const { t } = useTranslation();
  const [removingId, setRemovingId] = useState(null);

  const handleRemove = async (sourceId) => {
    if (removingId !== null || !onRemove) return;
    setRemovingId(sourceId);
    try {
      await onRemove(sourceId);
    } finally {
      setRemovingId(null);
    }
  };

  const checkSummary = referenceCheck?.summary;
  const checkIssues = (referenceCheck?.items || []).filter(item =>
    item.status !== 'READY' || !item.declaredReference);
  const checkIsReady = Boolean(checkSummary?.detected)
    && (referenceCheck?.items || []).every(item => item.status === 'READY' && item.declaredReference);

  if (loading && references.length === 0) {
    return <p className="text-sm text-(--text-secondary) italic text-center p-4">{t('loading')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="break-words rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[10px] font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
          {t(error)}
        </p>
      )}
      {referenceCheckLoading && !referenceCheck && (
        <p className="text-xs text-(--text-secondary)">{t('referenceCheckRunning')}</p>
      )}
      {referenceCheckError && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[10px] font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
          <span>{t(referenceCheckError)}</span>
          {onRetryReferenceCheck && (
            <button type="button" onClick={onRetryReferenceCheck} className="shrink-0 underline cursor-pointer">
              {t('referenceCheckRetry')}
            </button>
          )}
        </div>
      )}
      {referenceCheck?.referenceSectionFound && checkSummary?.detected === 0 && (
        <section role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          <p className="font-bold">{t('referenceCheckTitle')}</p>
          <p className="mt-1">{t('referenceCheckEmpty')}</p>
        </section>
      )}
      {referenceCheck?.referenceSectionFound && checkSummary?.detected > 0 && (
        <section
          role={checkIsReady ? 'status' : 'region'}
          aria-label={t('referenceCheckTitle')}
          className={`rounded-lg border px-3 py-2 ${checkIsReady
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
            : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'}`}
        >
          <p className="text-xs font-bold">{t('referenceCheckTitle')}</p>
          {checkIsReady ? (
            <p className="mt-1 text-[11px]">{t('referenceCheckAllReady')}</p>
          ) : (
            <>
              <p className="mt-1 text-[11px]">{t('referenceCheckSummary', checkSummary)}</p>
              {(checkSummary.missingSource > 0 || checkSummary.missingFile > 0) && (
                <p className="mt-1 text-[10px]">{t('referenceCheckGuidance')}</p>
              )}
              {checkIssues.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-bold">
                    {t('referenceCheckViewIssues', { count: checkIssues.length })}
                  </summary>
                  <ol className="mt-2 space-y-2">
                    {checkIssues.map(item => (
                      <li key={`${item.index}-${item.rawText}`} className="rounded border border-current/20 p-2">
                        <p className="line-clamp-3 text-[10px]">{item.rawText}</p>
                        <span className="mt-1 inline-block text-[10px] font-bold">
                          {t(REFERENCE_CHECK_STATUS_KEYS[item.status] || 'referenceCheckStatusNeedsReview')}
                        </span>
                        {item.matchedSourceId && !item.declaredReference && (
                          <span className="ml-2 inline-block text-[10px] font-bold">
                            {t('referenceCheckNotDeclared')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </>
          )}
        </section>
      )}
      {references.length === 0 ? (
        <div className="text-sm text-(--text-secondary) italic text-center p-4">{t('noReferences')}</div>
      ) : (
        references.map((reference) => {
          const status = statusOf(reference);
          const title = reference.title || reference.citationKey;
          return (
            <div key={reference.sourceId} className="bg-(--surface) border border-(--border) rounded-xl p-3.5">
              <p className="text-sm font-bold text-(--text-primary) leading-snug">{title}</p>
              {(reference.authors || reference.publicationYear || reference.doi) && (
                <p className="text-[11px] text-(--text-secondary) mt-1 leading-relaxed">
                  {[reference.authors, reference.publicationYear, reference.doi].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                  {reference.citationKey}
                </span>
                <span
                  title={status === 'available' ? undefined : t('referenceNotRetrievable')}
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${status === 'available'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : status === 'missing'
                      ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-900/40 dark:text-slate-300'}`}
                >
                  {t(STATUS_KEYS[status])}
                </span>
              </div>
              {canMutate && (
                <div className="mt-3 flex items-center gap-2">
                  {!reference.fileAvailable && reference.canAttachFile && onAttach && (
                    <>
                      <input
                        id={`attach-reference-pdf-${reference.sourceId}`}
                        type="file"
                        accept=".pdf,application/pdf"
                        disabled={isLocked || attachingId !== null}
                        className="peer sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (file) onAttach(reference.sourceId, file);
                        }}
                      />
                      <label
                        htmlFor={`attach-reference-pdf-${reference.sourceId}`}
                        aria-disabled={isLocked || attachingId !== null}
                        className={`flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2 ${isLocked || attachingId !== null ? 'cursor-not-allowed border-(--border) bg-(--surface-secondary) text-(--text-tertiary)' : 'cursor-pointer border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50'}`}
                      >
                        {attachingId === reference.sourceId ? t('working') : t('attachPdf')}
                      </label>
                    </>
                  )}
                  {!reference.fileAvailable && !reference.canAttachFile && (
                    <p className="text-[11px] text-(--text-secondary)">{t('referenceAttachOwnerOnly')}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(reference.sourceId)}
                    disabled={isLocked || removingId !== null}
                    title={t('removeReference')}
                    aria-label={`${t('removeReference')}: ${title}`}
                    className="flex min-h-9 flex-1 items-center justify-center rounded-lg border border-(--border) bg-(--surface) px-3 py-1.5 text-[11px] font-bold text-(--text-secondary) transition-colors hover:text-rose-600 hover:border-rose-300 focus-visible:ring-2 focus-visible:ring-(--brand) disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                  >
                    {removingId === reference.sourceId ? t('working') : t('removeReference')}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
