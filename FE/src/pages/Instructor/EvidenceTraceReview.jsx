import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppHeader, LoadingSkeleton, Modal, Breadcrumb } from '../../components';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';

const JUDGMENTS = ['EFFECTIVE', 'PARTIAL', 'INEFFECTIVE'];
const STUDENT_ACTIONS = ['ADD_CITATION', 'PARAPHRASE', 'QUALIFY', 'SYNTHESIZE', 'QUOTE', 'REMOVE', 'DISMISS_WITH_REASON'];
const TRACE_OUTCOMES = ['RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED', 'STALE'];

const OUTCOME_CLASSES = {
  RESOLVED: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  PARTIALLY_RESOLVED: 'bg-amber-100 text-amber-700 border border-amber-200',
  UNRESOLVED: 'bg-slate-100 text-slate-600 border border-slate-200',
  STALE: 'bg-rose-100 text-rose-700 border border-rose-200',
};

export default function EvidenceTraceReview() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [traces, setTraces] = useState([]);
  const [telemetry, setTelemetry] = useState(null);
  const [sectionFilter, setSectionFilter] = useState('');
  const [roundFilter, setRoundFilter] = useState('');
  const [judgmentFilter, setJudgmentFilter] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [error, setError] = useState('');

  const loadEvidence = useCallback(async () => {
    try {
      const [traceResponse, telemetryResponse] = await Promise.all([
        api.get(`/api/projects/${id}/evidence-traces`),
        api.get(`/api/projects/${id}/telemetry`),
      ]);
      setTraces(traceResponse.data || []);
      setTelemetry(telemetryResponse.data || null);
      setError('');
    } catch {
      setError(t('instructor.evidenceTrace.loadEvidenceTracesFailed'));
    }
  }, [id, t]);

  useEffect(() => {
    api.get(`/api/projects/${id}`)
      .then(r => setProject(r.data))
      .catch(() => setError(t('instructor.evidenceTrace.projectLoadFailed')));
  }, [id, t]);

  useEffect(() => {
    setLoading(true);
    loadEvidence().finally(() => setLoading(false));
  }, [loadEvidence]);

  const handleReview = async (traceId, judgment, instructorFeedback) => {
    setSavingId(traceId);
    try {
      const r = await api.patch(`/api/projects/${id}/evidence-traces/${traceId}/review`, {
        judgment,
        instructorFeedback: instructorFeedback || null,
      });
      setTraces(prev => prev.map(item => String(item.id) === String(traceId) ? r.data : item));
      const telemetryResponse = await api.get(`/api/projects/${id}/telemetry`);
      setTelemetry(telemetryResponse.data || null);
      setReviewing(null);
    } catch {
      setError(t('instructor.evidenceTrace.saveTraceJudgmentFailed'));
    } finally {
      setSavingId(null);
    }
  };

  const overview = telemetry?.overview || {};
  const filteredTraces = traces.filter(trace => {
    if (sectionFilter && String(trace.sectionId) !== sectionFilter) return false;
    if (roundFilter && String(trace.roundId) !== roundFilter) return false;
    if (judgmentFilter === 'PENDING') return Boolean(trace.studentAction && !trace.judgment);
    return !judgmentFilter || trace.judgment === judgmentFilter;
  });

  const percentage = value => `${Math.round((value || 0) * 100)}%`;
  const duration = milliseconds => {
    if (!milliseconds) return '—';
    const minutes = Math.round(milliseconds / 60000);
    return minutes < 60 ? `${minutes}m` : `${(minutes / 60).toFixed(1)}h`;
  };
  const judgmentLabel = judgment => t(`instructor.evidenceTrace.judgment.${JUDGMENTS.includes(judgment) ? judgment : 'UNKNOWN'}`);
  const studentActionLabel = action => t(`instructor.evidenceTrace.studentActionValue.${STUDENT_ACTIONS.includes(action) ? action : 'UNKNOWN'}`);
  const outcomeLabel = outcome => t(`instructor.evidenceTrace.outcome.${TRACE_OUTCOMES.includes(outcome) ? outcome : 'UNKNOWN'}`);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--text-primary)] font-sans">
      <AppHeader />
      <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <Breadcrumb
          items={[
            { label: t('instructor.evidenceTrace.dashboard'), path: '/instructor/dashboard' },
            { label: t('instructor.evidenceTrace.projects'), path: '/instructor/projects' },
            { label: project?.title || t('instructor.evidenceTrace.project'), path: `/instructor/projects/${id}` },
            { label: t('instructor.evidenceTrace.evidenceTraceReview') }
          ]}
        />
        <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black text-[var(--brand-foreground)]">{t('instructor.evidenceTrace.evidenceTraceReview')}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{project?.title || ''}</p>
            {error && <p className="mt-2 text-xs font-bold text-rose-600">{error}</p>}
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label={t('instructor.evidenceTrace.reviewRounds')} value={overview.reviewRounds || 0} detail={`${overview.findings || 0} ${t('instructor.evidenceTrace.findingsLabel')}`} />
          <MetricCard label={t('instructor.evidenceTrace.studentAddressed')} value={overview.addressed || 0} detail={`${percentage(overview.actionRate)} ${t('instructor.evidenceTrace.actionRate')}`} tone="indigo" />
          <MetricCard label={t('instructor.evidenceTrace.pendingInstructor')} value={overview.pendingInstructor || 0} detail={`${overview.unaddressed || 0} ${t('instructor.evidenceTrace.unaddressedLabel')}`} tone="amber" />
          <MetricCard label={t('instructor.evidenceTrace.effectiveJudgments')} value={overview.effective || 0} detail={`${percentage(overview.effectiveRate)} ${t('instructor.evidenceTrace.effectiveRate')}`} tone="emerald" />
          <MetricCard label={t('instructor.evidenceTrace.partialJudgments')} value={overview.partial || 0} detail={t('instructor.evidenceTrace.instructorJudgments')} />
          <MetricCard label={t('instructor.evidenceTrace.ineffectiveJudgments')} value={overview.ineffective || 0} detail={t('instructor.evidenceTrace.instructorJudgments')} tone="rose" />
          <MetricCard label={t('instructor.evidenceTrace.averageTimeToAction')} value={duration(overview.averageTimeToActionMs)} detail={t('instructor.evidenceTrace.roundToStudentAction')} />
        </div>

        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
          <p className="font-black">{t('instructor.evidenceTrace.traceHowItWorksTitle')}</p>
          <p className="mt-1">{t('instructor.evidenceTrace.traceHowItWorksBody')}</p>
          <p className="mt-1 text-[10px] opacity-80">{t('instructor.evidenceTrace.traceSteps')}</p>
        </div>

        <div className="mb-4 grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {t('instructor.evidenceTrace.filterBySection')}
            <select value={sectionFilter} onChange={event => { setSectionFilter(event.target.value); setRoundFilter(''); }}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs normal-case tracking-normal text-[var(--text-primary)]">
              <option value="">{t('instructor.evidenceTrace.allSections')}</option>
              {(telemetry?.sections || []).map(section => <option key={section.sectionId} value={section.sectionId}>{section.sectionTitle}</option>)}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {t('instructor.evidenceTrace.filterByRound')}
            <select value={roundFilter} onChange={event => setRoundFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs normal-case tracking-normal text-[var(--text-primary)]">
              <option value="">{t('instructor.evidenceTrace.allRounds')}</option>
              {(telemetry?.rounds || []).filter(round => !sectionFilter || String(round.sectionId) === sectionFilter).map(round => (
                <option key={round.roundId} value={round.roundId}>
                  {round.sectionTitle} · {new Date(round.runAt).toLocaleString(i18n.language)} · Δ {round.findingDelta ?? '—'}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {t('instructor.evidenceTrace.filterByJudgment')}
            <select value={judgmentFilter} onChange={event => setJudgmentFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs normal-case tracking-normal text-[var(--text-primary)]">
              <option value="">{t('instructor.evidenceTrace.allJudgments')}</option>
              <option value="PENDING">{t('instructor.evidenceTrace.pendingInstructor')}</option>
              {JUDGMENTS.map(judgment => <option key={judgment} value={judgment}>{judgmentLabel(judgment)}</option>)}
            </select>
          </label>
        </div>

        {loading ? (
          <LoadingSkeleton count={5} />
        ) : filteredTraces.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-xs text-[var(--text-tertiary)]">{t('instructor.evidenceTrace.noEvidenceTraces')}</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border)] bg-[var(--surface-secondary)]">
                  <tr className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    <th className="px-4 py-3 font-black">{t('instructor.evidenceTrace.sectionAndRound')}</th>
                    <th className="px-4 py-3 font-black">{t('instructor.evidenceTrace.originalFinding')}</th>
                    <th className="px-4 py-3 font-black">{t('instructor.evidenceTrace.studentResponse')}</th>
                    <th className="px-4 py-3 font-black">{t('instructor.evidenceTrace.aiAdvisory')}</th>
                    <th className="px-4 py-3 font-black">{t('instructor.evidenceTrace.instructorDecision')}</th>
                    <th className="px-4 py-3 font-black">{t('instructor.evidenceTrace.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredTraces.map(trace => (
                    <tr key={trace.id} className="align-top hover:bg-[var(--surface-secondary)]/40">
                      <td className="px-4 py-3 min-w-[150px]">
                        <p className="font-bold text-[var(--text-primary)]">{trace.sectionTitle || '—'}</p>
                        <p className="mt-1 font-mono text-[9px] text-[var(--text-tertiary)]">{String(trace.roundId).slice(0, 8)}</p>
                        <p className="mt-0.5 text-[9px] text-[var(--text-tertiary)]">{trace.createdAt ? new Date(trace.createdAt).toLocaleString(i18n.language) : ''}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        <p className="text-[9px] font-bold text-[var(--text-tertiary)]">#{trace.findingIndex + 1}</p>
                        <p className="mt-1 line-clamp-3 italic leading-relaxed text-[var(--text-secondary)]">“{trace.excerpt || ''}”</p>
                        {trace.suggestedAction && <p className="mt-1 text-[9px] font-bold text-indigo-600">{t('instructor.evidenceTrace.suggested')}: {studentActionLabel(trace.suggestedAction)}</p>}
                      </td>
                      <td className="px-4 py-3 max-w-[240px]">
                        {trace.studentAction
                          ? <>
                            <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">{studentActionLabel(trace.studentAction)}</span>
                            <p className="mt-1.5 line-clamp-3 leading-relaxed text-[var(--text-secondary)]">{trace.explanation}</p>
                          </>
                          : <span className="text-[var(--text-tertiary)] italic">{t('instructor.evidenceTrace.notAddressed')}</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[230px]">
                        {trace.aiRecheckJudgment
                          ? <>
                            <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">{judgmentLabel(trace.aiRecheckJudgment)}</span>
                            <p className="mt-1.5 line-clamp-3 leading-relaxed text-[var(--text-secondary)]">{trace.aiRecheckReason}</p>
                          </>
                          : <span className="text-[var(--text-tertiary)] italic">{t('instructor.evidenceTrace.aiComparisonUnavailable')}</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${OUTCOME_CLASSES[trace.outcome] || OUTCOME_CLASSES.UNRESOLVED}`}>
                          {outcomeLabel(trace.outcome)}
                        </span>
                        {trace.judgment
                          ? <>
                            <p className="mt-1 text-[9px] font-bold text-[var(--text-secondary)]">{t('instructor.evidenceTrace.judgmentLabel')}: {judgmentLabel(trace.judgment)}</p>
                            {trace.instructorFeedback && <p className="mt-1 line-clamp-2 text-[10px] text-[var(--text-secondary)]">{trace.instructorFeedback}</p>}
                          </>
                          : <p className="mt-1 text-[9px] italic text-amber-700">{trace.studentAction ? t('instructor.evidenceTrace.pendingInstructor') : t('instructor.evidenceTrace.notAddressed')}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setReviewing(trace)} disabled={savingId !== null}
                          className="rounded-lg bg-[var(--brand)] px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-40">
                          {trace.judgment ? t('instructor.evidenceTrace.viewOrUpdate') : t('instructor.evidenceTrace.reviewTrace')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {reviewing && (
        <Modal open={Boolean(reviewing)} title={t('instructor.evidenceTrace.reviewTrace')} onClose={() => setReviewing(null)}>
          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">{t('instructor.evidenceTrace.section')}</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{reviewing.sectionTitle || '—'} · #{reviewing.findingIndex + 1}</p>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t('instructor.evidenceTrace.originalFinding')}</p>
                <blockquote className="mt-1 rounded-lg border-l-2 border-amber-400 bg-[var(--surface-secondary)] p-3 text-[11px] italic leading-relaxed text-[var(--text-secondary)]">“{reviewing.excerpt || ''}”</blockquote>
                {reviewing.rationale && <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-secondary)]">{reviewing.rationale}</p>}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t('instructor.evidenceTrace.afterPassage')}</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3 text-[10px] leading-relaxed text-[var(--text-secondary)]">{reviewing.afterPassage || t('instructor.evidenceTrace.noSectionRevision')}</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] p-3 text-[10px] text-[var(--text-secondary)]">
                <p><strong>{t('instructor.evidenceTrace.studentAction')}:</strong> {reviewing.studentAction ? studentActionLabel(reviewing.studentAction) : t('instructor.evidenceTrace.notAddressed')}</p>
                {reviewing.explanation && <p className="mt-1"><strong>{t('instructor.evidenceTrace.studentExplanation')}:</strong> {reviewing.explanation}</p>}
                {reviewing.sourceTitle && <p className="mt-1"><strong>{t('instructor.evidenceTrace.sourceLabel')}:</strong> {reviewing.sourceTitle}</p>}
                {reviewing.evidenceQuote && <p className="mt-1 italic">“{reviewing.evidenceQuote}”</p>}
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-[10px] text-indigo-800">
                <p className="font-bold">{t('instructor.evidenceTrace.aiAdvisory')}: {reviewing.aiRecheckJudgment ? judgmentLabel(reviewing.aiRecheckJudgment) : t('instructor.evidenceTrace.aiComparisonUnavailable')}</p>
                {reviewing.aiRecheckReason && <p className="mt-1 leading-relaxed">{reviewing.aiRecheckReason}</p>}
              </div>
              {reviewing.instructorFeedback && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[10px] text-emerald-800">
                  <p className="font-bold">{t('instructor.evidenceTrace.currentInstructorFeedback')}</p>
                  <p className="mt-1 leading-relaxed">{reviewing.instructorFeedback}</p>
                </div>
              )}
            </div>
            <ReviewForm
              key={reviewing.id}
              saving={savingId === reviewing.id}
              initialJudgment={reviewing.judgment || ''}
              initialFeedback={reviewing.instructorFeedback || ''}
              onSave={async (judgment, feedback) => handleReview(reviewing.id, judgment, feedback)}
              onCancel={() => setReviewing(null)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

function MetricCard({ label, value, detail, tone = 'slate' }) {
  const tones = {
    slate: 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
  };
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      <p className="mt-0.5 text-[10px] opacity-75">{detail}</p>
    </div>
  );
}

function ReviewForm({ saving, initialJudgment, initialFeedback, onSave, onCancel }) {
  const { t } = useTranslation();
  const [judgment, setJudgment] = useState(initialJudgment);
  const [feedback, setFeedback] = useState(initialFeedback);
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">{t('instructor.evidenceTrace.judgmentLabel')}</span>
        <select value={judgment} onChange={e => setJudgment(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--text-primary)] outline-none">
          <option value="">{t('instructor.evidenceTrace.selectJudgment')}</option>
          {JUDGMENTS.map(j => <option key={j} value={j}>{t(`instructor.evidenceTrace.judgment.${j}`)}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">{t('instructor.evidenceTrace.instructorFeedback')}</span>
        <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={3}
          placeholder={t('instructor.evidenceTrace.instructorFeedbackPlaceholder')}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--text-secondary)] outline-none resize-y" />
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]">
          {t('cancel')}
        </button>
        <button onClick={() => judgment && onSave(judgment, feedback)} disabled={!judgment || saving}
          className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-40">
          {saving ? t('saving') : t('instructor.evidenceTrace.saveJudgment')}
        </button>
      </div>
    </div>
  );
}
