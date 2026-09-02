import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppHeader, LoadingSkeleton, Modal, Breadcrumb } from '../../components';
import { instructorText, commonText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';

const JUDGMENTS = ['EFFECTIVE', 'PARTIAL', 'INEFFECTIVE'];

const OUTCOME_CLASSES = {
  RESOLVED: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  PARTIALLY_RESOLVED: 'bg-amber-100 text-amber-700 border border-amber-200',
  UNRESOLVED: 'bg-slate-100 text-slate-600 border border-slate-200',
  STALE: 'bg-rose-100 text-rose-700 border border-rose-200',
};

export default function EvidenceTraceReview() {
  const { id } = useParams();
  const { language } = useLanguage();
  const ct = commonText[language];
  const t = instructorText[language];
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
      setError(t.loadEvidenceTracesFailed);
    }
  }, [id, t]);

  useEffect(() => {
    api.get(`/api/projects/${id}`)
      .then(r => setProject(r.data))
      .catch(() => setError(t.projectLoadFailed));
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
      setError(t.saveTraceJudgmentFailed);
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

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--text-primary)] font-sans">
      <AppHeader />
      <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <Breadcrumb
          items={[
            { label: t.dashboard, path: '/instructor/dashboard' },
            { label: t.projects, path: '/instructor/projects' },
            { label: project?.title || t.project, path: `/instructor/projects/${id}` },
            { label: t.evidenceTraceReview }
          ]}
        />
        <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black text-[var(--brand-foreground)]">{t.evidenceTraceReview}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{project?.title || ''}</p>
            {error && <p className="mt-2 text-xs font-bold text-rose-600">{error}</p>}
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label={t.reviewRounds} value={overview.reviewRounds || 0} detail={`${overview.findings || 0} ${t.findingsLabel}`} />
          <MetricCard label={t.studentAddressed} value={overview.addressed || 0} detail={`${percentage(overview.actionRate)} ${t.actionRate}`} tone="indigo" />
          <MetricCard label={t.pendingInstructor} value={overview.pendingInstructor || 0} detail={`${overview.unaddressed || 0} ${t.unaddressedLabel}`} tone="amber" />
          <MetricCard label={t.effectiveJudgments} value={overview.effective || 0} detail={`${percentage(overview.effectiveRate)} ${t.effectiveRate}`} tone="emerald" />
          <MetricCard label={t.partialJudgments} value={overview.partial || 0} detail={t.instructorJudgments} />
          <MetricCard label={t.ineffectiveJudgments} value={overview.ineffective || 0} detail={t.instructorJudgments} tone="rose" />
          <MetricCard label={t.averageTimeToAction} value={duration(overview.averageTimeToActionMs)} detail={t.roundToStudentAction} />
        </div>

        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
          <p className="font-black">{t.traceHowItWorksTitle}</p>
          <p className="mt-1">{t.traceHowItWorksBody}</p>
          <p className="mt-1 text-[10px] opacity-80">{t.traceSteps}</p>
        </div>

        <div className="mb-4 grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {t.filterBySection}
            <select value={sectionFilter} onChange={event => { setSectionFilter(event.target.value); setRoundFilter(''); }}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs normal-case tracking-normal text-[var(--text-primary)]">
              <option value="">{t.allSections}</option>
              {(telemetry?.sections || []).map(section => <option key={section.sectionId} value={section.sectionId}>{section.sectionTitle}</option>)}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {t.filterByRound}
            <select value={roundFilter} onChange={event => setRoundFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs normal-case tracking-normal text-[var(--text-primary)]">
              <option value="">{t.allRounds}</option>
              {(telemetry?.rounds || []).filter(round => !sectionFilter || String(round.sectionId) === sectionFilter).map(round => (
                <option key={round.roundId} value={round.roundId}>
                  {round.sectionTitle} · {new Date(round.runAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')} · Δ {round.findingDelta ?? '—'}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {t.filterByJudgment}
            <select value={judgmentFilter} onChange={event => setJudgmentFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs normal-case tracking-normal text-[var(--text-primary)]">
              <option value="">{t.allJudgments}</option>
              <option value="PENDING">{t.pendingInstructor}</option>
              {JUDGMENTS.map(judgment => <option key={judgment} value={judgment}>{judgment}</option>)}
            </select>
          </label>
        </div>

        {loading ? (
          <LoadingSkeleton count={5} />
        ) : filteredTraces.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-xs text-[var(--text-tertiary)]">{t.noEvidenceTraces}</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--border)] bg-[var(--surface-secondary)]">
                  <tr className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    <th className="px-4 py-3 font-black">{t.sectionAndRound}</th>
                    <th className="px-4 py-3 font-black">{t.originalFinding}</th>
                    <th className="px-4 py-3 font-black">{t.studentResponse}</th>
                    <th className="px-4 py-3 font-black">{t.aiAdvisory}</th>
                    <th className="px-4 py-3 font-black">{t.instructorDecision}</th>
                    <th className="px-4 py-3 font-black">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredTraces.map(trace => (
                    <tr key={trace.id} className="align-top hover:bg-[var(--surface-secondary)]/40">
                      <td className="px-4 py-3 min-w-[150px]">
                        <p className="font-bold text-[var(--text-primary)]">{trace.sectionTitle || '—'}</p>
                        <p className="mt-1 font-mono text-[9px] text-[var(--text-tertiary)]">{String(trace.roundId).slice(0, 8)}</p>
                        <p className="mt-0.5 text-[9px] text-[var(--text-tertiary)]">{trace.createdAt ? new Date(trace.createdAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US') : ''}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        <p className="text-[9px] font-bold text-[var(--text-tertiary)]">#{trace.findingIndex + 1}</p>
                        <p className="mt-1 line-clamp-3 italic leading-relaxed text-[var(--text-secondary)]">“{trace.excerpt || ''}”</p>
                        {trace.suggestedAction && <p className="mt-1 text-[9px] font-bold text-indigo-600">{t.suggested}: {trace.suggestedAction.replaceAll('_', ' ')}</p>}
                      </td>
                      <td className="px-4 py-3 max-w-[240px]">
                        {trace.studentAction
                          ? <>
                            <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">{trace.studentAction.replaceAll('_', ' ')}</span>
                            <p className="mt-1.5 line-clamp-3 leading-relaxed text-[var(--text-secondary)]">{trace.explanation}</p>
                          </>
                          : <span className="text-[var(--text-tertiary)] italic">{t.notAddressed}</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[230px]">
                        {trace.aiRecheckJudgment
                          ? <>
                            <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">{trace.aiRecheckJudgment}</span>
                            <p className="mt-1.5 line-clamp-3 leading-relaxed text-[var(--text-secondary)]">{trace.aiRecheckReason}</p>
                          </>
                          : <span className="text-[var(--text-tertiary)] italic">{t.aiComparisonUnavailable}</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${OUTCOME_CLASSES[trace.outcome] || OUTCOME_CLASSES.UNRESOLVED}`}>
                          {(trace.outcome || '—').replaceAll('_', ' ')}
                        </span>
                        {trace.judgment
                          ? <>
                            <p className="mt-1 text-[9px] font-bold text-[var(--text-secondary)]">{t.judgmentLabel}: {trace.judgment}</p>
                            {trace.instructorFeedback && <p className="mt-1 line-clamp-2 text-[10px] text-[var(--text-secondary)]">{trace.instructorFeedback}</p>}
                          </>
                          : <p className="mt-1 text-[9px] italic text-amber-700">{trace.studentAction ? t.pendingInstructor : t.notAddressed}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setReviewing(trace)} disabled={savingId !== null}
                          className="rounded-lg bg-[var(--brand)] px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-40">
                          {trace.judgment ? t.viewOrUpdate : t.reviewTrace}
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
        <Modal open={Boolean(reviewing)} title={t.reviewTrace} onClose={() => setReviewing(null)}>
          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">{t.section}</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{reviewing.sectionTitle || '—'} · #{reviewing.findingIndex + 1}</p>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t.originalFinding}</p>
                <blockquote className="mt-1 rounded-lg border-l-2 border-amber-400 bg-[var(--surface-secondary)] p-3 text-[11px] italic leading-relaxed text-[var(--text-secondary)]">“{reviewing.excerpt || ''}”</blockquote>
                {reviewing.rationale && <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-secondary)]">{reviewing.rationale}</p>}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t.afterPassage}</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3 text-[10px] leading-relaxed text-[var(--text-secondary)]">{reviewing.afterPassage || t.noSectionRevision}</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] p-3 text-[10px] text-[var(--text-secondary)]">
                <p><strong>{t.studentAction}:</strong> {reviewing.studentAction?.replaceAll('_', ' ') || t.notAddressed}</p>
                {reviewing.explanation && <p className="mt-1"><strong>{t.studentExplanation}:</strong> {reviewing.explanation}</p>}
                {reviewing.sourceTitle && <p className="mt-1"><strong>{t.sourceLabel}:</strong> {reviewing.sourceTitle}</p>}
                {reviewing.evidenceQuote && <p className="mt-1 italic">“{reviewing.evidenceQuote}”</p>}
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-[10px] text-indigo-800">
                <p className="font-bold">{t.aiAdvisory}: {reviewing.aiRecheckJudgment || t.aiComparisonUnavailable}</p>
                {reviewing.aiRecheckReason && <p className="mt-1 leading-relaxed">{reviewing.aiRecheckReason}</p>}
              </div>
              {reviewing.instructorFeedback && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[10px] text-emerald-800">
                  <p className="font-bold">{t.currentInstructorFeedback}</p>
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
  const { language } = useLanguage();
  const t = instructorText[language];
  const ct = commonText[language];
  const [judgment, setJudgment] = useState(initialJudgment);
  const [feedback, setFeedback] = useState(initialFeedback);
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">{t.judgmentLabel}</span>
        <select value={judgment} onChange={e => setJudgment(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--text-primary)] outline-none">
          <option value="">{t.selectJudgment}</option>
          {JUDGMENTS.map(j => <option key={j} value={j}>{j}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">{t.instructorFeedback}</span>
        <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={3}
          placeholder={t.instructorFeedbackPlaceholder}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--text-secondary)] outline-none resize-y" />
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]">
          {ct.cancel}
        </button>
        <button onClick={() => judgment && onSave(judgment, feedback)} disabled={!judgment || saving}
          className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-40">
          {saving ? ct.saving : t.saveJudgment}
        </button>
      </div>
    </div>
  );
}
