import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api.js';

const VERDICT_STYLE = {
  MET: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200',
  PARTIAL: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200',
  NOT_MET: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200',
  UNVERIFIABLE: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200',
};

function findReadinessSection(readiness, sectionId) {
  return (readiness?.papers || [])
    .flatMap(paper => paper.sections || [])
    .find(section => String(section.id) === String(sectionId)) || null;
}

export default function SectionRequirementsPanel({
  project,
  selectedPaper,
  selectedSection,
  isAssigned,
  isLocked,
  isDirty,
  onHandoffChanged,
  showToast,
}) {
  const { t } = useTranslation();
  const requestRef = useRef(0);
  const [evaluation, setEvaluation] = useState(null);
  const [readinessSection, setReadinessSection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setBusy('');
    setError('');
    setEvaluation(null);
    setReadinessSection(null);
    if (!project?.id || !selectedPaper?.id || !selectedSection?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [evaluationResponse, readinessResponse] = await Promise.all([
        api.get(`/api/papers/${selectedPaper.id}/sections/${selectedSection.id}/standard-evaluation`),
        api.get(`/api/projects/${project.id}/review-readiness`),
      ]);
      if (requestId !== requestRef.current) return;
      setEvaluation(evaluationResponse.status === 204 ? null : evaluationResponse.data);
      setReadinessSection(findReadinessSection(readinessResponse.data, selectedSection.id));
    } catch (loadError) {
      if (requestId === requestRef.current) {
        setError(loadError?.response?.data?.message || t('selfCheckLoadFailed'));
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [project?.id, selectedPaper?.id, selectedSection?.id, selectedSection?.revision, isDirty, t]);

  useEffect(() => {
    load();
    return () => { requestRef.current += 1; };
  }, [load]);

  const runCheck = async () => {
    if (isDirty) return;
    const requestId = ++requestRef.current;
    setBusy('check');
    setError('');
    try {
      const response = await api.post(
        `/api/papers/${selectedPaper.id}/sections/${selectedSection.id}/standard-evaluation`,
        null,
        { timeout: 120000 },
      );
      if (requestId !== requestRef.current) return;
      setEvaluation(response.data);
      if (response.data.status === 'COMPLETED') showToast(t('selfCheckCompleted'));
    } catch (checkError) {
      if (requestId === requestRef.current) {
        setError(checkError?.response?.data?.message || t('selfCheckFailed'));
      }
    } finally {
      if (requestId === requestRef.current) setBusy('');
    }
  };

  const updateHandoff = async (confirm) => {
    if (isDirty || !readinessSection?.currentInputFingerprint) return;
    const requestId = ++requestRef.current;
    setBusy(confirm ? 'confirm' : 'revoke');
    setError('');
    try {
      const url = `/api/papers/${selectedPaper.id}/sections/${selectedSection.id}/handoff`;
      const response = confirm
        ? await api.post(url, { expectedInputFingerprint: readinessSection.currentInputFingerprint })
        : await api.delete(url);
      if (requestId !== requestRef.current) return;
      const handoff = response.data;
      setReadinessSection(previous => ({
        ...previous,
        handoffState: handoff.state,
        confirmedById: handoff.confirmedById,
        confirmedByName: handoff.confirmedByName,
        confirmedAt: handoff.confirmedAt,
        confirmedContentVersion: handoff.confirmedContentVersion,
        revision: handoff.revision,
      }));
      onHandoffChanged?.(handoff);
      showToast(t(confirm ? 'handoffConfirmed' : 'handoffRevoked'));
    } catch (handoffError) {
      if (requestId !== requestRef.current) return;
      const code = handoffError?.response?.data?.fieldErrors?.code;
      setError(code === 'HANDOFF_INPUT_CHANGED'
        ? t('handoffInputChanged')
        : handoffError?.response?.data?.message || t('handoffFailed'));
    } finally {
      if (requestId === requestRef.current) setBusy('');
    }
  };

  if (!selectedSection) {
    return <p className="py-8 text-center text-xs italic text-(--text-tertiary)">{t('selectSectionForRequirements')}</p>;
  }

  const requirements = evaluation?.requirements || [];
  const items = evaluation?.result?.items || [];
  const completed = evaluation?.status === 'COMPLETED' && !evaluation?.stale && !isDirty;
  const confirmed = readinessSection?.handoffState === 'CONFIRMED';
  const canAct = isAssigned && !isLocked && !isDirty;
  const handoffBlocked = readinessSection?.blockers?.some(code => code !== 'SECTION_CONFIRMED');

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-[11px] leading-relaxed text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-100">
        {t('selfCheckAdvisory')}
      </div>

      {isDirty && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {t('saveBeforeSelfCheck')}
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}

      {loading ? (
        <p className="py-8 text-center text-xs text-(--text-tertiary)">{t('loading')}</p>
      ) : (
        <>
          <section className="rounded-xl border border-(--border) bg-(--surface) p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-(--text-primary)">{t('sectionRequirements')}</h3>
              {requirements.length > 0 && (
                <button type="button" onClick={runCheck} disabled={!canAct || busy !== ''}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
                  {busy === 'check' ? t('checkingRequirements') : completed ? t('checkAgain') : t('checkRequirements')}
                </button>
              )}
            </div>
            {requirements.length === 0 ? (
              <p className="text-xs italic text-(--text-tertiary)">{t('requirementsNotConfigured')}</p>
            ) : (
              <ol className="space-y-2 pl-5 text-xs text-(--text-secondary)">
                {requirements.map((requirement, index) => <li key={`${requirement}-${index}`} className="list-decimal leading-relaxed">{requirement}</li>)}
              </ol>
            )}
          </section>

          {evaluation?.status === 'SYSTEM_ERROR' && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
              {t('selfCheckSystemError')}{evaluation.errorCode ? ` (${evaluation.errorCode})` : ''}
            </p>
          )}
          {evaluation?.stale && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{t('selfCheckStale')}</p>
          )}
          {completed && evaluation.result && (
            <section className="space-y-3">
              {evaluation.result.summary && <p className="rounded-xl border border-(--border) bg-(--surface) p-3 text-xs leading-relaxed text-(--text-secondary)">{evaluation.result.summary}</p>}
              {items.map((item, index) => (
                <article key={`${item.requirement}-${index}`} className={`rounded-xl border p-3 ${VERDICT_STYLE[item.verdict] || VERDICT_STYLE.UNVERIFIABLE}`}>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h4 className="text-xs font-bold leading-relaxed">{item.requirement}</h4>
                    <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black dark:bg-black/20">{t(`selfCheckVerdict${item.verdict}`)}</span>
                  </div>
                  {item.evidence && <p className="mb-1.5 border-l-2 border-current pl-2 text-[11px] italic">“{item.evidence}”</p>}
                  {item.reason && <p className="text-[11px] leading-relaxed"><strong>{t('reason')}:</strong> {item.reason}</p>}
                  {item.missing && <p className="mt-1 text-[11px] leading-relaxed"><strong>{t('missingContent')}:</strong> {item.missing}</p>}
                  {item.suggestion && <p className="mt-1 text-[11px] leading-relaxed"><strong>{t('suggestion')}:</strong> {item.suggestion}</p>}
                </article>
              ))}
              {(evaluation.result.limitations || []).length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                  <strong>{t('limitations')}:</strong>
                  <ul className="mt-1 list-disc space-y-1 pl-4">{evaluation.result.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </div>
              )}
            </section>
          )}

          <section className="rounded-xl border border-(--border) bg-(--surface) p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-(--text-primary)">{t('sectionHandoff')}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-(--text-secondary)">{confirmed ? t('handoffConfirmedDescription', { name: readinessSection.confirmedByName || '' }) : t('handoffDescription')}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${confirmed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}>
                {t(confirmed ? 'handoffStateConfirmed' : 'handoffStateUnconfirmed')}
              </span>
            </div>
            {!isAssigned && <p className="mt-2 text-[11px] text-amber-700">{t('handoffAssigneeOnly')}</p>}
            {handoffBlocked && <p className="mt-2 text-[11px] text-rose-700">{t('handoffBlocked')}</p>}
            {isAssigned && !isLocked && (
              <button type="button" onClick={() => updateHandoff(!confirmed)} disabled={!canAct || busy !== '' || !readinessSection?.currentInputFingerprint || (!confirmed && handoffBlocked)}
                className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${confirmed ? 'border border-slate-300 bg-(--surface) text-(--text-secondary) hover:bg-(--surface-secondary)' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                {busy === 'confirm' || busy === 'revoke' ? t('working') : t(confirmed ? 'revokeHandoff' : 'confirmHandoff')}
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
