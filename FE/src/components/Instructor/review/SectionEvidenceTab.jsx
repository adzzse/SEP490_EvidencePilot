import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// rationale: strict scoping — selected section AND rounds frozen in the v2 snapshot,
// guarded by submitted content version. v1 snapshots carry no round linkage, so the
// tab reports unavailability instead of implying latest findings belong to history.
const FILTERS = ['ALL', 'NEEDS_ATTENTION', 'UNADDRESSED', 'DISMISSED', 'JUDGED'];

function matchFilter(trace, filter) {
  switch (filter) {
    case 'NEEDS_ATTENTION': return Boolean(trace.studentAction) && !trace.judgment;
    case 'UNADDRESSED': return !trace.studentAction;
    case 'DISMISSED': return trace.studentAction === 'DISMISS_WITH_REASON';
    case 'JUDGED': return Boolean(trace.judgment);
    default: return true;
  }
}

export default function SectionEvidenceTab({ review, selectedSection }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('ALL');
  const [judgingId, setJudgingId] = useState(null);
  const [judgment, setJudgment] = useState('EFFECTIVE');
  const [judgeFeedback, setJudgeFeedback] = useState('');

  const snapshotSection = useMemo(() => {
    const papers = review.submissionSnapshot?.papers || [];
    for (const paper of papers) {
      const found = (paper.sections || []).find(s => String(s.id) === String(selectedSection?.id));
      if (found) return found;
    }
    return null;
  }, [review.submissionSnapshot, selectedSection]);

  const roundIds = snapshotSection?.citationReviewRoundIds;
  const scoped = useMemo(() => {
    if (!Array.isArray(roundIds) || roundIds.length === 0) return { traces: [], linked: false };
    const ids = new Set(roundIds.map(String));
    const version = snapshotSection?.contentVersion;
    return {
      traces: (review.evidenceTraces || []).filter(tr =>
        String(tr.sectionId) === String(selectedSection?.id)
        && ids.has(String(tr.roundId))
        && (version == null || tr.sectionVersion == null || tr.sectionVersion === version)),
      linked: true,
    };
  }, [review.evidenceTraces, selectedSection, roundIds, snapshotSection?.contentVersion]);

  const visible = scoped.traces.filter(tr => matchFilter(tr, filter));
  const canJudge = !review.requestLocked && review.activeRequest?.status === 'PENDING';

  if (!selectedSection) return <p className="text-xs text-(--text-tertiary) italic">{t('instructor.review.selectSectionFeedback')}</p>;
  if (review.evidenceLoading) return <p role="status" className="text-xs text-(--text-tertiary)">{t('loading')}</p>;
  if (!scoped.linked) {
    return <p className="text-xs text-(--text-tertiary) italic">{t('instructor.review.noEvidenceForSubmission')}</p>;
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap gap-2 text-[10px] font-bold">
        <span className="rounded bg-(--surface-secondary) px-2 py-1">{scoped.traces.length} {t('instructor.evidenceTrace.findingsLabel')}</span>
        <span className="rounded bg-amber-100 px-2 py-1 text-amber-700">{scoped.traces.filter(tr => tr.studentAction && !tr.judgment).length} {t('instructor.evidenceTrace.pendingInstructor')}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`rounded-md px-2 py-1 text-[10px] font-bold ${filter === f ? 'bg-(--brand-soft) text-(--brand-foreground)' : 'text-(--text-secondary) hover:bg-(--surface-secondary)'}`}>
            {t(`instructor.review.evidenceFilter.${f}`)}
          </button>
        ))}
      </div>
      {visible.length === 0 && (
        <p className="text-(--text-tertiary) italic">{t('instructor.review.noEvidenceTraces')}</p>
      )}
      <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1 hide-scrollbar">
        {visible.map(trace => (
          <div key={trace.id} className="space-y-2 rounded-xl border border-(--border-light) bg-(--surface-secondary) p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-black text-(--text-tertiary)">#{trace.findingIndex + 1}</span>
              <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-slate-200 text-slate-700">{trace.outcome || 'UNRESOLVED'}</span>
            </div>
            <p className="italic leading-relaxed text-(--text-secondary)">“{trace.excerpt || ''}”</p>
            {trace.rationale && <p className="leading-relaxed text-(--text-secondary)">{trace.rationale}</p>}
            {trace.studentAction ? (
              <div className="space-y-1 border-t border-(--border-light) pt-2">
                <p className="font-bold text-indigo-700">{trace.studentAction}</p>
                {trace.explanation && <p className="text-(--text-secondary)">{trace.explanation}</p>}
                {trace.afterPassage && <p className="rounded bg-(--surface) p-2 italic text-(--text-secondary)">“{trace.afterPassage}”</p>}
              </div>
            ) : (
              <p className="italic text-(--text-tertiary)">{t('instructor.evidenceTrace.notAddressed')}</p>
            )}
            {trace.aiRecheckJudgment && (
              <p className="text-[10px] text-(--text-secondary)">{t('instructor.evidenceTrace.aiAdvisory')}: <b>{trace.aiRecheckJudgment}</b>{trace.aiRecheckReason ? ` — ${trace.aiRecheckReason}` : ''}</p>
            )}
            {trace.judgment ? (
              <p className="text-[10px]"><b>{t('instructor.evidenceTrace.judgmentLabel')}:</b> {trace.judgment}{trace.instructorFeedback ? ` — ${trace.instructorFeedback}` : ''}</p>
            ) : canJudge && (
              judgingId === trace.id ? (
                <form className="space-y-2 border-t border-(--border-light) pt-2" onSubmit={e => { e.preventDefault(); review.submitTraceJudgment(trace.id, judgment, judgeFeedback).then(() => { setJudgingId(null); setJudgeFeedback(''); }); }}>
                  <div className="flex gap-1">
                    {['EFFECTIVE', 'PARTIAL', 'INEFFECTIVE'].map(j => (
                      <button key={j} type="button" onClick={() => setJudgment(j)}
                        className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold ${judgment === j ? 'bg-(--brand-soft) text-(--brand-foreground)' : 'bg-(--surface) text-(--text-secondary)'}`}>{j}</button>
                    ))}
                  </div>
                  <textarea rows="2" value={judgeFeedback} onChange={e => setJudgeFeedback(e.target.value)}
                    placeholder={t('instructor.review.judgmentFeedbackPlaceholder')}
                    className="w-full rounded-xl border border-(--border) bg-(--surface) px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-(--focus)" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setJudgingId(null)} className="flex-1 rounded-xl bg-(--surface) py-1.5 text-[10px] font-bold text-(--text-secondary)">{t('cancel')}</button>
                    <button type="submit" className="flex-1 rounded-xl bg-(--brand) py-1.5 text-[10px] font-bold text-(--on-brand)">{t('confirm')}</button>
                  </div>
                </form>
              ) : (
                <button type="button" onClick={() => { setJudgingId(trace.id); setJudgment('EFFECTIVE'); setJudgeFeedback(''); }}
                  className="rounded-lg bg-(--brand) px-2.5 py-1.5 text-[10px] font-bold text-white">{t('instructor.evidenceTrace.reviewTrace')}</button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
