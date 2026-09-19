import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatDateTime } from '../../../utils/formatters/date.js';
import { isReferenceSectionTitle } from '../../../utils/formatters/latexHtml.js';

function confirmationFor(section) {
  if (isReferenceSectionTitle(section?.sectionTitle || section?.title)) {
    return { state: 'NOT_REQUIRED', confirmedBy: null, confirmedAt: null };
  }
  const confirmedBy = section?.confirmedByName ?? section?.handoffConfirmedByName ?? null;
  const confirmedAt = section?.confirmedAt ?? section?.handoffConfirmedAt ?? null;
  const confirmedVersion = section?.confirmedContentVersion ?? section?.handoffContentVersion;
  const currentVersion = section?.contentVersion ?? section?.version;
  const state = section?.handoffState || (
    confirmedBy || confirmedAt
      ? confirmedVersion != null && currentVersion != null && Number(confirmedVersion) !== Number(currentVersion)
        ? 'STALE'
        : 'CONFIRMED'
      : 'UNCONFIRMED'
  );
  return { state, confirmedBy, confirmedAt };
}

function stateLabel(state, t) {
  return t(state === 'CONFIRMED' ? 'handoffStateConfirmed' : state === 'STALE' ? 'handoffStateStale' : state === 'NOT_REQUIRED' ? 'handoffStateNotRequired' : 'handoffStateUnconfirmed');
}

function stateClass(state) {
  if (state === 'CONFIRMED') return 'bg-emerald-100 text-emerald-700';
  if (state === 'STALE') return 'bg-amber-100 text-amber-700';
  if (state === 'NOT_REQUIRED') return 'bg-indigo-100 text-indigo-700';
  return 'bg-slate-100 text-slate-600';
}

function Metric({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg bg-(--surface-secondary) px-2.5 py-2">
      <p className="truncate text-[10px] text-(--text-tertiary)">{label}</p>
      <p className="mt-0.5 text-sm font-black text-(--text-primary)">{value}</p>
    </div>
  );
}

export default function ReviewOverviewBlock({ review }) {
  const { t, i18n } = useTranslation();
  const { activeRequest, submissionSnapshot, sections, papers, evidenceTraces, selectedSectionId } = review;

  const { sectionRecords, selected, metrics, paperWide } = useMemo(() => {
    const snapshot = review.snapshotState === 'AVAILABLE' ? submissionSnapshot : null;
    const records = review.viewMode === 'submitted' && snapshot
      ? (snapshot.papers || []).flatMap(paper => (paper.sections || []).map(section => ({
        ...section,
        paperTitle: paper.title,
        sectionTitle: section.title,
        contentVersion: section.contentVersion,
      })))
      : (sections || []).map(section => ({
        ...section,
        paperTitle: papers?.find(paper => String(paper.id) === String(section.documentId))?.title,
      }));
    const byId = new Map(records.map(section => [String(section.id), section]));
    const current = selectedSectionId == null ? null : byId.get(String(selectedSectionId));
    const sectionIds = new Set(records.map(section => String(section.id)));
    const traces = (evidenceTraces || []).filter(trace => sectionIds.has(String(trace.sectionId)));
    return {
      sectionRecords: records,
      selected: current,
      metrics: {
        confirmed: records.filter(section => confirmationFor(section).state === 'CONFIRMED').length,
        total: records.length,
        findings: traces.length,
        pending: traces.filter(trace => trace.studentAction && !trace.judgment).length,
        unaddressed: traces.filter(trace => !trace.studentAction).length,
      },
      paperWide: {
        submittedBy: snapshot?.submittedByName || activeRequest?.studentName || null,
        submittedAt: snapshot?.submittedAt || activeRequest?.requestedAt || null,
      },
    };
  }, [activeRequest, evidenceTraces, papers, sections, selectedSectionId, submissionSnapshot, review.snapshotState, review.viewMode]);

  if (!activeRequest) return null;
  const selectedConfirmation = confirmationFor(selected || {});

  return (
    <section aria-label={t('instructor.review.reviewOverview')} className="min-w-0 space-y-4 break-words text-xs">
      <div className="space-y-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-(--text-primary)">{t('instructor.review.currentSection')}</h3>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-black text-(--text-primary)" title={selected?.sectionTitle || ''}>
            {selected?.sectionTitle || '—'}
          </p>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${stateClass(selectedConfirmation.state)}`}>
            {stateLabel(selectedConfirmation.state, t)}
          </span>
        </div>
        <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1.5 border-b border-(--border-light) pb-3 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-[10px] text-(--text-tertiary)">{t('feedbackConfirmedBy')}</dt>
            <dd className="truncate font-semibold text-(--text-primary)" title={selectedConfirmation.confirmedBy || ''}>{selectedConfirmation.confirmedBy || '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] text-(--text-tertiary)">{t('confirmationTime')}</dt>
            <dd className="font-semibold text-(--text-primary)">{formatDateTime(selectedConfirmation.confirmedAt, i18n.language)}</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-(--text-primary)">{t('instructor.review.paperWide')}</p>
        <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1.5 border-b border-(--border-light) pb-2 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-[10px] text-(--text-tertiary)">{t('instructor.review.submittedBy')}</dt>
            <dd className="truncate font-semibold text-(--text-primary)" title={paperWide.submittedBy || ''}>{paperWide.submittedBy || '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] text-(--text-tertiary)">{t('instructor.review.submittedDate')}</dt>
            <dd className="font-semibold text-(--text-primary)">{formatDate(paperWide.submittedAt, i18n.language)}</dd>
          </div>
        </dl>
        <div className="grid grid-cols-2 gap-2">
          <Metric label={t('sectionConfirmations')} value={`${metrics.confirmed} / ${metrics.total}`} />
          <Metric label={t('instructor.evidenceTrace.findingsLabel')} value={metrics.findings} />
          <Metric label={t('instructor.evidenceTrace.pendingInstructor')} value={metrics.pending} />
          <Metric label={t('instructor.evidenceTrace.unaddressedLabel')} value={metrics.unaddressed} />
        </div>
      </div>

      <details className="border-t border-(--border-light) pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-(--text-primary)">
          <span>{t('confirmationOverview')}</span>
          <span className="text-[10px] font-normal text-(--text-tertiary)">{metrics.confirmed} / {metrics.total}</span>
        </summary>
        <div className="mt-2 max-h-[34vh] space-y-2 overflow-y-auto overscroll-contain pr-1">
          {sectionRecords.length === 0 && <p className="text-(--text-tertiary)">—</p>}
          {sectionRecords.map(section => {
            const confirmation = confirmationFor(section);
            return (
              <div key={section.id} className="min-w-0 rounded-lg border border-(--border-light) bg-(--surface-secondary) px-3 py-2">
                {section.paperTitle && <p className="mb-0.5 truncate text-[9px] font-bold uppercase tracking-wide text-(--text-tertiary)" title={section.paperTitle}>{section.paperTitle}</p>}
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-semibold text-(--text-primary)" title={section.sectionTitle || section.title || ''}>{section.sectionTitle || section.title || '—'}</p>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${stateClass(confirmation.state)}`}>{stateLabel(confirmation.state, t)}</span>
                </div>
                <p className="mt-1 text-[10px] text-(--text-secondary)">
                  {t('feedbackConfirmedBy')}: <b>{confirmation.confirmedBy || '—'}</b>
                  {' · '}{t('confirmationTime')}: <b>{formatDateTime(confirmation.confirmedAt, i18n.language)}</b>
                </p>
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}
