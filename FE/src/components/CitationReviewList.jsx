import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const STUDENT_ACTIONS = [
  'ADD_CITATION',
  'PARAPHRASE',
  'QUALIFY',
  'SYNTHESIZE',
  'QUOTE',
  'REMOVE',
  'DISMISS_WITH_REASON',
];

const OUTCOME_CLASSES = {
  RESOLVED: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  PARTIALLY_RESOLVED: 'bg-amber-100 text-amber-700 border border-amber-200',
  UNRESOLVED: 'bg-slate-100 text-slate-600 border border-slate-200',
  STALE: 'bg-rose-100 text-rose-700 border border-rose-200',
};

export default function CitationReviewList({
  reviewSectionTitle,
  aiReview,
  aiReviewLoading,
  aiReviewProgress,
  aiReviewError,
  aiReviewStale,
  aiSourceMatches,
  aiSourcesLoading,
  aiSourcesError,
  sectionTraces,
  updatingTraceIds,
  canReviewSection,
  isLocked,
  onRunAiReview,
  onSelectReviewFinding,
  onInsertCitation,
  onRetryReviewSources,
  onStartTraceDecision,
  decideDraft,
  setDecideDraft,
  onDecideTrace,
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!decideDraft) return;
    const onKey = (e) => { if (e.key === 'Escape') setDecideDraft(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decideDraft, setDecideDraft]);
  const reviewProgressTotal = Math.max(0, Number(aiReviewProgress?.total) || 0);
  const reviewProgressCurrent = Math.min(
    reviewProgressTotal,
    Math.max(0, Number(aiReviewProgress?.current) || 0),
  );
  const reviewProgressPercent = reviewProgressTotal > 0
    ? Math.round((reviewProgressCurrent / reviewProgressTotal) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-(--border) bg-(--surface) p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-(--text-primary)">{t('citationReview')}</h3>
            <p className="mt-1 text-[11px] text-(--text-tertiary)">{reviewSectionTitle || t('selectSectionFirst')}</p>
          </div>
          <button type="button" onClick={onRunAiReview} disabled={!canReviewSection || aiReviewLoading || isLocked}
            className="shrink-0 rounded-lg bg-(--brand) px-3 py-1.5 text-xs font-bold text-(--on-brand) hover:bg-(--brand-hover) disabled:opacity-40">
            {aiReviewLoading ? t('reviewing') : t('runReview')}
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-(--text-secondary)">{t('citationReviewDescription')}</p>
      </div>

      {aiReviewError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <p>{aiReviewError.message}</p>
          <button type="button" onClick={onRunAiReview} className="mt-2 font-bold underline">{t('retry')}</button>
        </div>
      )}
      {aiReviewStale && aiReview && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
          {t('reviewStale')}
        </div>
      )}
      {aiReviewLoading && (
        <div className="rounded-xl border border-(--border) bg-(--surface) p-4 text-xs text-(--text-secondary)" role="status" aria-live="polite">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 motion-reduce:animate-none" aria-hidden="true"></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 leading-relaxed">
                  {reviewProgressTotal > 0
                    ? t('aiReviewProgress', { current: reviewProgressCurrent, total: reviewProgressTotal })
                    : t('aiAnalyzing')}
                </span>
                {reviewProgressTotal > 0 && (
                  <span className="shrink-0 font-bold tabular-nums text-indigo-700">{reviewProgressPercent}%</span>
                )}
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100"
                role={reviewProgressTotal > 0 ? 'progressbar' : undefined}
                aria-label={reviewProgressTotal > 0 ? t('aiReviewProgressLabel') : undefined}
                aria-valuemin={reviewProgressTotal > 0 ? 0 : undefined}
                aria-valuemax={reviewProgressTotal > 0 ? reviewProgressTotal : undefined}
                aria-valuenow={reviewProgressTotal > 0 ? reviewProgressCurrent : undefined}
                aria-valuetext={reviewProgressTotal > 0
                  ? t('aiReviewProgress', { current: reviewProgressCurrent, total: reviewProgressTotal })
                  : undefined}
              >
                <div
                  className={`h-full rounded-full bg-indigo-600 transition-[width] duration-300 motion-reduce:transition-none ${reviewProgressTotal > 0 ? '' : 'w-1/3 animate-pulse motion-reduce:animate-none'}`}
                  style={reviewProgressTotal > 0 ? { width: `${reviewProgressPercent}%` } : undefined}
                ></div>
              </div>
            </div>
          </div>
        </div>
      )}
      {(aiReview || sectionTraces.length > 0) && !aiReviewLoading && (
        <div className="grid grid-cols-1 gap-1.5 rounded-xl border border-(--border) bg-(--surface) p-3 text-[10px] sm:grid-cols-3">
          <span className="rounded-lg bg-emerald-50 px-2 py-1.5 font-bold text-emerald-700">
            {aiReview ? t('reviewCompletedStatus') : t('savedTraceStatus')}
          </span>
          <span className={`rounded-lg px-2 py-1.5 font-bold ${aiSourcesLoading ? 'bg-amber-50 text-amber-700' : aiSourcesError ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
            {aiSourcesLoading
              ? t('sourceMatchesLoadingStatus')
              : aiSourcesError
                ? t('sourceMatchesFailedStatus')
                : aiReview
                  ? t('sourceMatchesReadyStatus')
                  : t('sourceMatchesUnavailableStatus')}
          </span>
          <span className={`rounded-lg px-2 py-1.5 font-bold ${sectionTraces.some(trace => trace.aiRecheckedAt) ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
            {sectionTraces.some(trace => trace.aiRecheckedAt)
              ? t('aiComparisonReadyStatus')
              : t('aiComparisonPendingStatus')}
          </span>
        </div>
      )}
      {!aiReviewLoading && !aiReview && !aiReviewError && sectionTraces.length === 0 && (
        <div className="rounded-xl border border-dashed border-(--border) p-6 text-center text-xs text-(--text-tertiary)">{t('sectionNotReviewed')}</div>
      )}

      {aiReview && !aiReviewLoading && (
        <>
          {aiReview.summary && <p className="rounded-xl border border-(--border) bg-(--surface) p-3 text-xs leading-relaxed text-(--text-secondary)">{aiReview.summary}</p>}
          {(aiReview.findings || []).map((finding, index) => {
            const candidates = aiSourceMatches?.[index] || [];
            const trace = sectionTraces?.find(item => item.findingIndex === index);
            const traceUpdating = Boolean(trace && updatingTraceIds?.includes(trace.id));
            const outcome = trace?.outcome;
            const decided = Boolean(trace?.studentAction);
            const judged = Boolean(trace?.judgment);
            return (
              <div key={trace?.id || `${finding.type}-${finding.startOffset}-${finding.endOffset}`} className={`rounded-xl border bg-(--surface) p-4 shadow-sm ${outcome === 'RESOLVED' ? 'border-emerald-300' : 'border-(--border)'}`}>
                <button type="button" onClick={() => onSelectReviewFinding(finding)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className={`text-[11px] font-black ${finding.type === 'SOURCE_DISCREPANCY' ? 'text-rose-700' : 'text-indigo-700'}`}>{finding.type.replaceAll('_', ' ')}</h4>
                    <span className="flex items-center gap-1">
                      {finding.confidence && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">{finding.confidence}</span>}
                      {outcome && <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${OUTCOME_CLASSES[outcome] || OUTCOME_CLASSES.UNRESOLVED}`}>{outcome.replaceAll('_', ' ')}</span>}
                    </span>
                  </div>
                  <blockquote className="mt-2 border-l-2 border-amber-400 pl-2 text-[11px] italic leading-relaxed text-(--text-secondary)">“{finding.excerpt}”</blockquote>
                  <p className="mt-2 text-[11px] leading-relaxed text-(--text-secondary)">{finding.rationale}</p>
                  {(finding.evidence || []).length > 0 && (
                    <span className="mt-2 block space-y-1">
                      {finding.evidence.map((item, evidenceIndex) => (
                        <span key={evidenceIndex} className="block rounded-lg border border-(--border-light) bg-(--surface-secondary) p-2">
                          <span className={`text-[9px] font-bold ${item.relation === 'CONTRADICTS' ? 'text-rose-600' : item.relation === 'SUPPORTS' ? 'text-emerald-600' : 'text-slate-500'}`}>{item.relation.replaceAll('_', ' ')}</span>
                          {item.quote && <span className="mt-0.5 block text-[10px] italic leading-relaxed text-(--text-secondary)">“{item.quote}”</span>}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
                {trace?.aiRecheckJudgment && (
                  <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-[10px] text-indigo-800">
                    <p className="font-bold">{t('aiAdvisory')}: {trace.aiRecheckJudgment}</p>
                    {trace.aiRecheckReason && <p className="mt-0.5 leading-relaxed">{trace.aiRecheckReason}</p>}
                  </div>
                )}
                {trace?.judgment && (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[10px] text-emerald-800">
                    <p className="font-bold">{t('instructorJudgment')}: {trace.judgment}</p>
                    {trace.instructorFeedback && <p className="mt-0.5 leading-relaxed">{trace.instructorFeedback}</p>}
                  </div>
                )}
                <div className="mt-3 border-t border-(--border-light) pt-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-(--text-tertiary)">{t('relatedSources')}</p>
                  {aiSourcesLoading ? (
                    <p className="text-[10px] italic text-(--text-tertiary)">{t('searchingSources')}</p>
                  ) : candidates.length === 0 ? (
                    <p className="text-[10px] italic text-(--text-tertiary)">{t('noRelatedSources')}</p>
                  ) : (
                    <div className="space-y-2">
                      {candidates.map(candidate => (
                        <div key={candidate.documentChunkId} className="rounded-lg border border-(--border) bg-(--surface-secondary) p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-bold text-(--text-primary)">{candidate.title || candidate.sourceFilename}</p>
                              <p className="text-[9px] text-(--text-tertiary)">{[candidate.authors, candidate.publicationYear].filter(Boolean).join(' · ')}</p>
                            </div>
                          </div>
                          <p className="mt-1 line-clamp-3 text-[10px] italic leading-relaxed text-(--text-secondary)">“{candidate.excerpt}”</p>
                          <button type="button" onClick={() => onInsertCitation(finding, index, candidate, trace)} disabled={!trace || decided || judged || traceUpdating || !canReviewSection}
                            className="mt-2 w-full rounded bg-(--brand) px-2 py-1 text-[10px] font-bold text-(--on-brand) hover:bg-(--brand-hover) disabled:opacity-40">
                            {traceUpdating ? t('saving') : decided ? t('citationInserted') : t('insertCitation')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => onStartTraceDecision(index, trace)}
                    disabled={!trace || judged || traceUpdating || !canReviewSection}
                    className="mt-2 w-full rounded-lg border border-(--border) px-2 py-1.5 text-[10px] font-bold text-(--text-secondary) hover:bg-(--surface-secondary) disabled:opacity-40">
                    {judged ? t('traceJudgedLocked') : decided ? t('editTraceDecision') : t('recordTraceDecision')}
                  </button>
                </div>
                {decideDraft?.findingIndex === index && trace && (
                  <div className="mt-3 border-t border-(--border-light) pt-3">
                    <div className="space-y-2">
                      <label className="block">
                        <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-(--text-tertiary)">{t('studentAction')}</span>
                        <select
                          value={decideDraft.action}
                          onChange={e => setDecideDraft(prev => ({ ...prev, action: e.target.value }))}
                          className="w-full rounded-lg border border-(--border) bg-(--surface) px-2 py-1.5 text-[11px] text-(--text-primary) outline-none">
                          <option value="">{t('selectAction')}</option>
                          {STUDENT_ACTIONS.map(action => (
                            <option key={action} value={action}>{action.replaceAll('_', ' ')}</option>
                          ))}
                        </select>
                      </label>
                      {['ADD_CITATION', 'QUOTE', 'PARAPHRASE', 'SYNTHESIZE', 'QUALIFY'].includes(decideDraft.action) && candidates.length > 0 && (
                        <label className="block">
                          <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-(--text-tertiary)">{t('bindSource')}</span>
                          <select
                            value={decideDraft.sourceId}
                            onChange={e => {
                              const selected = candidates.find(c => (c.sourceId || c.documentId) === e.target.value);
                              setDecideDraft(prev => ({
                                ...prev,
                                sourceId: e.target.value,
                                chunkId: selected?.documentChunkId || '',
                                evidenceQuote: selected?.excerpt || prev.evidenceQuote,
                              }));
                            }}
                            className="w-full rounded-lg border border-(--border) bg-(--surface) px-2 py-1.5 text-[11px] text-(--text-primary) outline-none">
                            <option value="">{t('selectSource')}</option>
                            {candidates.map(candidate => (
                              <option key={candidate.documentChunkId} value={candidate.sourceId || candidate.documentId}>
                                {candidate.title || candidate.sourceFilename}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {decideDraft.sourceId && (
                        <label className="block">
                          <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-(--text-tertiary)">{t('evidenceQuote')}</span>
                          <textarea
                            value={decideDraft.evidenceQuote}
                            onChange={e => setDecideDraft(prev => ({ ...prev, evidenceQuote: e.target.value }))}
                            rows={2}
                            className="w-full rounded-lg border border-(--border) bg-(--surface) px-2 py-1.5 text-[10px] italic text-(--text-secondary) outline-none resize-y" />
                        </label>
                      )}
                      <label className="block">
                        <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-(--text-tertiary)">{t('explanation')} *</span>
                        <textarea
                          value={decideDraft.explanation}
                          onChange={e => setDecideDraft(prev => ({ ...prev, explanation: e.target.value }))}
                          maxLength={2000}
                          required
                          rows={2}
                          className="w-full rounded-lg border border-(--border) bg-(--surface) px-2 py-1.5 text-[10px] text-(--text-secondary) outline-none resize-y"
                          placeholder={t('explanationPlaceholder')} />
                        <span className="mt-0.5 block text-right text-[9px] text-(--text-tertiary)">{decideDraft.explanation.length}/2000</span>
                      </label>
                      {decideDraft.action && decideDraft.action !== 'DISMISS_WITH_REASON' && (
                        <p className="text-[9px] leading-relaxed text-amber-700">
                          {t('revisedPassageSelectionRequired')}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button type="button" disabled={!decideDraft.action || !decideDraft.explanation.trim() || traceUpdating}
                          onClick={async () => {
                            try {
                              const updated = await onDecideTrace(trace, {
                                studentAction: decideDraft.action,
                                sourceId: decideDraft.sourceId || null,
                                chunkId: decideDraft.chunkId || null,
                                evidenceQuote: decideDraft.evidenceQuote || null,
                                relation: decideDraft.relation || null,
                                explanation: decideDraft.explanation.trim(),
                              });
                              if (updated) setDecideDraft(null);
                            } catch { /* toast shown by parent */ }
                          }}
                          className="flex-1 rounded-lg bg-(--brand) px-2 py-1.5 text-[10px] font-bold text-(--on-brand) hover:bg-(--brand-hover) disabled:opacity-40">
                          {traceUpdating ? t('saving') : t('saveDecision')}
                        </button>
                        <button type="button" onClick={() => setDecideDraft(null)}
                          className="rounded-lg border border-(--border) px-2 py-1.5 text-[10px] font-bold text-(--text-secondary) hover:bg-(--surface-tertiary)">
                          {t('cancel')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {(aiReview.findings || []).length === 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">{t('noCitationFindings')}</div>
          )}
          {(aiReview.limitations || []).length > 0 && (
            <ul className="list-disc space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-4 pl-8 text-[10px] text-slate-700">
              {aiReview.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}
            </ul>
          )}
        </>
      )}
      {aiSourcesError && aiReview && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
          <p>{aiSourcesError}</p>
          <button type="button" onClick={onRetryReviewSources} className="mt-1 font-bold underline">{t('retrySourceSearch')}</button>
        </div>
      )}
    </div>
  );
}
