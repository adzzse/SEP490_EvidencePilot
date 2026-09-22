import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { latestRoundTraces } from '../../../utils/instructor/evidenceRounds.js';

// rationale: strict scoping — selected section AND rounds frozen in the v2 snapshot,
// guarded by submitted content version. v1 snapshots carry no round linkage, so the
// tab reports unavailability instead of implying latest findings belong to history.
// No status filters: the instructor scans every finding of the latest round; USED
// marks findings the student already cited (studentAction ADD_CITATION).
export default function SectionEvidenceTab({ review, selectedSection }) {
  const { t } = useTranslation();

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
    const roundTraces = (review.evidenceTraces || []).filter(tr =>
      String(tr.sectionId) === String(selectedSection?.id)
      && ids.has(String(tr.roundId))
      && (version == null || tr.sectionVersion == null || tr.sectionVersion === version));
    // ponytail: show only this section's latest round — older rounds linger in
    // the snapshot and would double-count identical findings across returns.
    return { traces: latestRoundTraces(roundTraces), linked: true };
  }, [review.evidenceTraces, selectedSection, roundIds, snapshotSection?.contentVersion]);

  const visible = scoped.traces;

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
      {visible.length === 0 && (
        <p className="text-(--text-tertiary) italic">{t('instructor.review.noEvidenceTraces')}</p>
      )}
      <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1 hide-scrollbar">
        {visible.map(trace => (
          <div key={trace.id} className="space-y-2 rounded-xl border border-(--border-light) bg-(--surface-secondary) p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-black text-(--text-tertiary)">#{trace.findingIndex + 1}</span>
              <span className="flex items-center gap-1">
                {trace.studentAction === 'ADD_CITATION' && (
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{t('instructor.evidenceTrace.usedLabel')}</span>
                )}
                <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-slate-200 text-slate-700">{trace.outcome || 'UNRESOLVED'}</span>
              </span>
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
            {trace.judgment && (
              <p className="text-[10px]"><b>{t('instructor.evidenceTrace.judgmentLabel')}:</b> {trace.judgment}{trace.instructorFeedback ? ` — ${trace.instructorFeedback}` : ''}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
