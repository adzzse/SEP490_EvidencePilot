import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api.js';
import Modal from '../ui/Modal.jsx';

const CHECK_KEYS = {
  PROJECT_EDITABLE: 'reviewCheckProjectEditable',
  INSTRUCTOR_ASSIGNED: 'reviewCheckInstructorAssigned',
  PAPER_PRESENT: 'reviewCheckPaperPresent',
  PAPER_READY: 'reviewCheckPaperReady',
  SECTIONS_PRESENT: 'reviewCheckSectionsPresent',
  SECTION_BODY_PRESENT: 'reviewCheckSectionBodyPresent',
  ASSIGNEE_VALID: 'reviewCheckAssigneeValid',
  SECTION_CONFIRMED: 'reviewCheckSectionConfirmed',
};

const SECTION_BLOCKER_KEYS = {
  SECTION_BODY_PRESENT: 'sectionBlockerBodyMissing',
  ASSIGNEE_VALID: 'sectionBlockerAssigneeInvalid',
  SECTION_CONFIRMED: 'sectionBlockerHandoffMissing',
};

export default function SubmissionReadinessModal({ open, onClose, projectId, dirtySectionIds, onSubmitted }) {
  const { t } = useTranslation();
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!open || !projectId) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/api/projects/${projectId}/review-readiness`);
      setReadiness(response.data);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || t('readinessLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [open, projectId, t]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!readiness?.submissionFingerprint || dirtySectionIds.length > 0) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await api.post(`/api/projects/${projectId}/reviews`, {
        expectedSubmissionFingerprint: readiness.submissionFingerprint,
      });
      await onSubmitted?.(response.data);
    } catch (submitError) {
      const code = submitError?.response?.data?.fieldErrors?.code;
      const message = code === 'SUBMISSION_INPUT_CHANGED'
        ? t('submissionInputChanged')
        : submitError?.response?.data?.message || t('submitFailed');
      if (submitError?.response?.status === 409) await load();
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const failedChecks = (readiness?.checks || []).filter(check => check.status !== 'SATISFIED');
  const canSubmit = readiness?.state === 'READY'
    && readiness?.canSubmit
    && dirtySectionIds.length === 0;

  return (
    <Modal open={open} onClose={onClose} title={t('submitReview')} closeLabel={t('close')} wide>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-(--text-secondary)">{t('submitReadinessDescription')}</p>
        {dirtySectionIds.length > 0 && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {t('unsavedSectionsBlockSubmission', { count: dirtySectionIds.length })}
          </p>
        )}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}

        {loading ? (
          <p className="py-8 text-center text-sm text-(--text-tertiary)">{t('loading')}</p>
        ) : readiness && (
          <>
            <div className={`rounded-xl border p-3 ${readiness.state === 'READY' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'}`}>
              <p className="text-sm font-bold">{t(readiness.state === 'READY' ? 'reviewReady' : 'reviewNotReady')}</p>
              {!readiness.canSubmit && <p className="mt-1 text-xs">{t('leaderSubmissionOnly')}</p>}
            </div>

            <section className="rounded-xl border border-(--border) bg-(--surface-secondary)/50 p-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-(--text-secondary)">{t('submissionChecks')}</h3>
              <ul className="space-y-2">
                {(readiness.checks || []).map(check => (
                  <li key={check.code} className="flex items-start gap-2 text-xs text-(--text-primary)">
                    <span aria-hidden="true" className={check.status === 'SATISFIED' ? 'text-emerald-600' : 'text-rose-600'}>{check.status === 'SATISFIED' ? '✓' : '✕'}</span>
                    <span>{t(CHECK_KEYS[check.code] || check.code, { defaultValue: check.message })}</span>
                  </li>
                ))}
              </ul>
            </section>

            {failedChecks.length > 0 && (
              <section className="space-y-2">
                {(readiness.papers || []).map(paper => (
                  <div key={paper.id} className="rounded-xl border border-(--border) bg-(--surface) p-3">
                    <h3 className="text-xs font-bold text-(--text-primary)">{paper.title || paper.originalFilename || t('paper')}</h3>
                    <ul className="mt-2 space-y-1.5">
                      {(paper.sections || []).map(section => (
                        <li key={section.id} className="text-[11px] text-(--text-secondary)">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{section.title}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${section.handoffState === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {t(section.handoffState === 'CONFIRMED' ? 'handoffStateConfirmed' : 'handoffStateUnconfirmed')}
                            </span>
                          </div>
                          {(section.blockers || []).length > 0 && (
                            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-rose-700 dark:text-rose-300">
                              {section.blockers.map(code => (
                                <li key={code}>{t(SECTION_BLOCKER_KEYS[code] || code)}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        <div className="flex justify-end gap-3 border-t border-(--border) pt-4">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg px-4 py-2 text-sm font-semibold text-(--text-secondary) hover:bg-(--surface-secondary) disabled:opacity-50">{t('cancel')}</button>
          <button type="button" onClick={submit} disabled={!canSubmit || submitting || loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
            {submitting ? t('working') : t('submitReview')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
