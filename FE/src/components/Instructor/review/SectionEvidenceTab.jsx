import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../../../utils/formatters/date.js';
import { latestRoundTraces } from '../../../utils/instructor/evidenceRounds.js';

// rationale: read-only — instructor scans findings; no statuses, badges or
// actions. STALE rows hidden, no pending/not-addressed/judgment UI. When the
// submission links no evidence traces (never ran, post-submit round, version
// drift, or all STALE), fall back to the submitted snapshot's citation review
// output so findings are never silently lost.
export default function SectionEvidenceTab({ review, selectedSection, submittedFindings = [], submittedFindingsStale = false }) {
  const { t, i18n } = useTranslation();

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
      // Older rounds remain in the snapshot; show the latest section round so
      // findings are not double-counted across returns.
    return { traces: latestRoundTraces(roundTraces), linked: true };
  }, [review.evidenceTraces, selectedSection, roundIds, snapshotSection?.contentVersion]);

  const visible = scoped.traces.filter(tr => tr.outcome !== 'STALE');
  const fallback = visible.length === 0 ? (submittedFindings || []) : [];

  // rationale: sealed per-origin archives win over the latest-only trace view
  // — every round of the active cycle stays visible, grouped by runner role,
  // so previous rounds never read as "gone".
  const archives = review.citationArchives || null;
  const archivedStudent = archives?.student || [];
  const archivedInstructor = archives?.instructor || [];
  const hasArchives = archivedStudent.length + archivedInstructor.length > 0;

  if (!selectedSection) return <p className="text-xs text-(--text-tertiary) italic">{t('instructor.review.selectSectionFeedback')}</p>;
  if (review.evidenceLoading) return <p role="status" className="text-xs text-(--text-tertiary)">{t('loading')}</p>;
  if (hasArchives) {
    return (
      <div className="space-y-2 text-xs">
        <ArchiveGroup
          title={t('instructor.review.fromStudent')}
          rounds={archivedStudent}
          language={i18n.language}
          t={t}
        />
        <ArchiveGroup
          title={t('instructor.review.fromInstructor')}
          rounds={archivedInstructor}
          language={i18n.language}
          t={t}
        />
      </div>
    );
  }
  if (!scoped.linked && fallback.length === 0) {
    return <p className="text-xs text-(--text-tertiary) italic">{t('instructor.review.noEvidenceForSubmission')}</p>;
  }
  if (fallback.length > 0) {
    return (
      <div className="space-y-3 text-xs">
        <p className="text-[10px] font-bold text-(--text-tertiary)">{fallback.length} {t('instructor.evidenceTrace.findingsLabel')}</p>
        <p className="text-[10px] font-semibold text-(--text-secondary)">{t('instructor.review.submittedReviewFindings')}</p>
        {submittedFindingsStale && (
          <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-200">{t('reviewStale')}</p>
        )}
        <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1 hide-scrollbar">
          {fallback.map((finding, index) => (
            <div key={finding.id || index} className="space-y-2 rounded-xl border border-(--border-light) bg-(--surface-secondary) p-3">
              <span className="text-[9px] font-black text-(--text-tertiary)">#{index + 1}</span>
              <p className="italic leading-relaxed text-(--text-secondary)">“{finding.excerpt || ''}”</p>
              {finding.rationale && <p className="leading-relaxed text-(--text-secondary)">{finding.rationale}</p>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      <p className="text-[10px] font-bold text-(--text-tertiary)">{visible.length} {t('instructor.evidenceTrace.findingsLabel')}</p>
      {visible.length === 0 && (
        <p className="text-(--text-tertiary) italic">{t('instructor.review.noEvidenceTraces')}</p>
      )}
      <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1 hide-scrollbar">
        {visible.map(trace => (
          <div key={trace.id} className="space-y-2 rounded-xl border border-(--border-light) bg-(--surface-secondary) p-3">
            <span className="text-[9px] font-black text-(--text-tertiary)">#{trace.findingIndex + 1}</span>
            <p className="italic leading-relaxed text-(--text-secondary)">“{trace.excerpt || ''}”</p>
            {trace.rationale && <p className="leading-relaxed text-(--text-secondary)">{trace.rationale}</p>}
            {trace.afterPassage && <p className="rounded bg-(--surface) p-2 italic text-(--text-secondary)">“{trace.afterPassage}”</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ArchiveGroup({ title, rounds, language, t }) {
  const [open, setOpen] = useState(true);
  if (!rounds.length) return null;
  return (
    <div className="rounded-xl border border-(--border-light) bg-(--surface) p-3">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[11px] font-black text-(--text-primary)">
          {title} · {rounds.reduce((sum, round) => sum + (round.findings || []).length, 0)}
        </span>
        <svg className={`h-3.5 w-3.5 shrink-0 text-(--text-tertiary) transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="mt-2 max-h-[46vh] space-y-3 overflow-y-auto pr-1 hide-scrollbar">
          {rounds.map(round => (
            <div key={round.roundId} className="space-y-2 rounded-lg bg-(--surface-secondary) p-2.5">
              <p className="text-[9px] font-bold text-(--text-tertiary)">
                {formatDateTime(round.createdAt, language)}
                {(round.findings || []).length > 0 && ` · ${(round.findings || []).length}`}
              </p>
              {(round.findings || []).length === 0 && (
                <p className="text-[10px] italic text-(--text-tertiary)">{t('instructor.review.noEvidenceTraces')}</p>
              )}
              {(round.findings || []).map((finding, index) => (
                <div key={finding.id || index} className="rounded-lg border border-(--border-light) bg-(--surface) p-2">
                  <p className="italic leading-relaxed text-(--text-secondary)">“{finding.excerpt || ''}”</p>
                  {finding.rationale && <p className="mt-1 leading-relaxed text-(--text-secondary)">{finding.rationale}</p>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
