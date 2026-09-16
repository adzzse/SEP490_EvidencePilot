import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../index';
import SectionEvidenceTab from './review/SectionEvidenceTab.jsx';
import FeedbackThreadsTab from './review/FeedbackThreadsTab.jsx';
import ReviewOverviewBlock from './review/ReviewOverviewBlock.jsx';
import { formatDateTime } from '../../utils/formatters/date.js';

const ACTION_LABELS = { REVIEWED: 'instructor.review.approve', RETURNED: 'instructor.review.returnForRevision', REJECTED: 'instructor.review.rejectSubmission' };

export function InstructorReviewGuide({ review, selectedSection }) {
  const { t } = useTranslation();
  const { activeGuide, selectedSectionId } = review;
  const [checkedItems, setCheckedItems] = useState({});
  return <section className="space-y-4 rounded-xl border border-(--border) bg-(--surface) p-4 text-xs shadow-sm">
    <h3 className="font-bold text-(--text-primary)">{t('instructor.review.reviewGuide')}</h3>
    {!selectedSection || !activeGuide ? <p className="text-(--text-tertiary) italic">{t('instructor.review.selectSectionGuide')}</p> : <>
      <span className="inline-block rounded bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">{activeGuide.sectionType}</span>
      <p className="text-(--text-secondary) leading-relaxed">{activeGuide.guidance}</p>
      <ul className="space-y-2">
        {activeGuide.checklist.map((item, i) => {
          const key = `${selectedSectionId}-${i}`;
          const checked = !!checkedItems[key];
          return <li key={key}><label className="flex items-start gap-2 cursor-pointer text-(--text-secondary)">
            <input type="checkbox" checked={checked} onChange={() => setCheckedItems(prev => ({ ...prev, [key]: !checked }))} className="mt-0.5 accent-indigo-600" />
            <span className={checked ? 'line-through opacity-60' : ''}>{item}</span>
          </label></li>;
        })}
      </ul>
    </>}
  </section>;
}

export default function InstructorFeedbackPanel({ review, selectedSection, projectId, focusSignal = 0, composerFocusToken = 0 }) {
  const { t, i18n } = useTranslation();
  const { activeRequest, isHistoricalRound, errorMessage, successMessage, transitioningRequestId, pendingTransition, setPendingTransition, requestLocked, canReturn, handleTransitionStatus } = review;
  const [panelTab, setPanelTab] = useState('feedback');
  useEffect(() => {
    if (focusSignal > 0) setPanelTab('feedback');
  }, [focusSignal]);
  const draftCount = (review.feedbackItems || []).filter(item => String(item.requestId) === String(review.activeRequestId) && !item.publishedAt).length;
  const actionDisabled = !!transitioningRequestId;
  const actionBtn = 'min-h-11 rounded-lg px-3 py-2 text-[11px] font-bold leading-tight text-white disabled:opacity-50 flex items-center justify-center text-center';
  return <div className="space-y-3 text-xs">
    {isHistoricalRound && (
      <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 font-semibold text-amber-800">
        {t('instructor.review.historicalRoundNotice')}
      </p>
    )}
    <div className="flex flex-wrap items-stretch justify-center gap-2">
      {!requestLocked && <>
        {canReturn && <button type="button" disabled={actionDisabled} onClick={() => setPendingTransition({ requestId: activeRequest.id, targetStatus: 'RETURNED' })} className={`${actionBtn} min-w-[116px] flex-[1.2_1_116px] bg-amber-500`}>{t('instructor.review.returnForRevision')}</button>}
        <button type="button" disabled={actionDisabled} onClick={() => setPendingTransition({ requestId: activeRequest.id, targetStatus: 'REVIEWED' })} className={`${actionBtn} min-w-[76px] flex-[1_1_76px] bg-emerald-600`}>{t('instructor.review.approve')}</button>
        <button type="button" disabled={actionDisabled} onClick={() => setPendingTransition({ requestId: activeRequest.id, targetStatus: 'REJECTED' })} className={`${actionBtn} min-w-[76px] flex-[1_1_76px] bg-rose-600`}>{t('instructor.review.rejectSubmission')}</button>
      </>}
    </div>
    {errorMessage && <p role="alert" className="text-rose-700">{errorMessage}</p>}
    {successMessage && <p role="status" className="text-emerald-700">{successMessage}</p>}
    <div className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm">
      <div className="flex border-b border-(--border-light)">
        {[
          { id: 'overview', label: t('instructor.review.overviewTab') },
          { id: 'feedback', label: t('instructor.review.feedbackTab') },
          { id: 'findings', label: t('instructor.review.findingsTab') },
          { id: 'history', label: t('instructor.review.historyTab') },
        ].map(tab => (
          <button key={tab.id} onClick={() => setPanelTab(tab.id)}
            className={`flex-1 px-2 py-2.5 text-[10px] font-black text-center transition-colors border-b-2 ${panelTab === tab.id ? 'text-(--brand-foreground) border-(--brand)' : 'text-(--text-tertiary) border-transparent hover:text-(--text-secondary)'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-5">
        {panelTab === 'feedback' && (
          <FeedbackThreadsTab review={review} selectedSection={selectedSection} projectId={projectId} composerFocusToken={composerFocusToken} />
        )}

        {panelTab === 'overview' && (
          <ReviewOverviewBlock review={review} />
        )}


        {panelTab === 'findings' && (
          <SectionEvidenceTab review={review} selectedSection={selectedSection} />
        )}

        {panelTab === 'history' && (
          <ul className="space-y-1.5">
            {(review.orderedRequests || []).map(request => (
              <li key={request.id} className="flex items-center justify-between gap-2 rounded-lg border border-(--border-light) px-2.5 py-2 text-[11px]">
                <span className="font-semibold text-(--text-secondary)">
                  {request.requestedAt ? formatDateTime(request.requestedAt, i18n.language) : t('status.UNKNOWN')}
                </span>
                <span className="font-black uppercase text-(--text-tertiary)">{request.status}</span>
              </li>
            ))}
            {(review.orderedRequests || []).length === 0 && (
              <p className="py-2 text-center text-[11px] italic text-(--text-tertiary)">{t('studentFeedback.empty')}</p>
            )}
          </ul>
        )}

      </div>
    </div>

    <Modal open={!!pendingTransition} onClose={() => { if (!transitioningRequestId) setPendingTransition(null); }}
      title={t(ACTION_LABELS[pendingTransition?.targetStatus] || 'status.UNKNOWN')}
      closeLabel={t('close')}>
      <div className="space-y-4 text-xs">
        <p className="text-(--text-secondary)">
          {pendingTransition?.targetStatus === 'REVIEWED' ? t('instructor.review.finalizeReviewConfirm')
            : pendingTransition?.targetStatus === 'REJECTED' ? t('instructor.review.rejectConfirm')
              : `${t('instructor.review.returnForRevision')} · ${draftCount} ${t('instructor.review.draft')}`}
        </p>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => setPendingTransition(null)} disabled={!!transitioningRequestId}
            className="flex-1 py-3 bg-(--surface-secondary) hover:bg-(--surface-tertiary) text-(--text-secondary) rounded-xl transition-colors border border-(--border) disabled:opacity-50">{t('cancel')}</button>
          <button type="button" onClick={() => handleTransitionStatus(pendingTransition.requestId, pendingTransition.targetStatus)}
            disabled={!!transitioningRequestId}
            className="flex-1 py-3 bg-(--brand) text-(--on-brand) rounded-xl hover:bg-(--brand-hover) transition-colors disabled:opacity-50">{transitioningRequestId ? t('saving') : t('confirm')}</button>
        </div>
      </div>
    </Modal>
  </div>;
}
