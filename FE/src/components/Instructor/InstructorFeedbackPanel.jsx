import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../index';
import DeleteConfirm from '../ui/DeleteConfirm.jsx';
import { UndoToast } from '../ui/UndoDelete.jsx';
import SectionEvidenceTab from './review/SectionEvidenceTab.jsx';
import SectionStandardsTab from './review/SectionStandardsTab.jsx';
import ReviewOverviewBlock from './review/ReviewOverviewBlock.jsx';

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

export default function InstructorFeedbackPanel({ review, selectedSection, onSelectFeedback }) {
  const { t } = useTranslation();
  const { selectedSectionId, activeRequest, activeRequestId, isHistoricalRound, feedbackItems, errorMessage, successMessage, feedbackDraft, selectedAnchor, editingFeedbackId, updateFeedbackDraft, savingFeedback, activeFeedbackId, transitioningRequestId, pendingTransition, setPendingTransition, suggestions, suggestionLoading, suggestionError, suggestionRan, activeGuide, requestLocked, canReturn, canCreateRoot, handleSubmitFeedback, captureSourceSelection, handleEditFeedback, handleCancelEdit, handleDeleteFeedback, prepareState, handleTransitionStatus, handleGenerateSuggestions, pendingDelete, undoDelete, dismissDelete } = review;
  const [sectionOnly, setSectionOnly] = useState(false);
  const [feedbackFilter, setFeedbackFilter] = useState('OPEN');
  const [panelTab, setPanelTab] = useState('manual');
  useEffect(() => {
    if (review.feedbackFocusToken > 0) {
      setFeedbackFilter('ALL');
      setPanelTab('manual');
    }
  }, [review.feedbackFocusToken]);
  const draftCount = feedbackItems.filter(item => String(item.requestId) === String(activeRequestId) && !item.publishedAt).length;
  const sectionFeedback = feedbackItems.filter(item => (!sectionOnly || String(item.sectionId) === String(selectedSectionId))
    && (!item.paperId || String(item.paperId) === String(review.selectedPaperId))
    && (String(item.requestId) === String(activeRequestId) || (item.threadState || 'OPEN') === 'OPEN')
    && (feedbackFilter === 'ALL' || (item.pendingState || item.threadState || 'OPEN') === feedbackFilter));
  const actionDisabled = savingFeedback || !!transitioningRequestId || !!pendingDelete;
  const actionBtn = 'min-h-11 rounded-lg px-3 py-2 text-[11px] font-bold leading-tight text-white disabled:opacity-50 flex items-center justify-center text-center';
  return <div className="space-y-3 text-xs">
    {isHistoricalRound && (
      <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 font-semibold text-amber-800">
        {t('instructor.review.historicalRoundNotice')}
      </p>
    )}
    <div className="inline-flex flex-wrap rounded-lg border border-(--border) bg-(--surface) p-0.5">
      {[
        ['submitted', t('instructor.review.submittedVersion')],
        ['working', t('instructor.review.workingCopy')],
      ].map(([mode, label]) => (
        <button key={mode} type="button" aria-pressed={review.viewMode === mode} onClick={() => review.setViewMode(mode)}
          className={`rounded-md px-3 py-1.5 font-semibold focus-visible:ring-2 focus-visible:ring-(--brand) ${review.viewMode === mode ? 'bg-(--brand-soft) text-(--brand-foreground)' : 'text-(--text-secondary) hover:bg-(--surface-secondary)'}`}>
          {label}
        </button>
      ))}
    </div>
    <div className="flex flex-wrap items-stretch justify-center gap-2">
      {!requestLocked && <>
        {canReturn && <button type="button" disabled={actionDisabled} onClick={() => setPendingTransition({ requestId: activeRequest.id, targetStatus: 'RETURNED' })} className={`${actionBtn} min-w-[116px] flex-[1.2_1_116px] bg-amber-500`}>{t('instructor.review.returnForRevision')}</button>}
        <button type="button" disabled={actionDisabled} onClick={() => setPendingTransition({ requestId: activeRequest.id, targetStatus: 'REVIEWED' })} className={`${actionBtn} min-w-[76px] flex-[1_1_76px] bg-emerald-600`}>{t('instructor.review.approve')}</button>
        <button type="button" disabled={actionDisabled} onClick={() => setPendingTransition({ requestId: activeRequest.id, targetStatus: 'REJECTED' })} className={`${actionBtn} min-w-[76px] flex-[1_1_76px] bg-rose-600`}>{t('instructor.review.rejectSubmission')}</button>
      </>}
    </div>
    {errorMessage && <p role="alert" className="text-rose-700">{errorMessage}</p>}
    {successMessage && <p role="status" className="text-emerald-700">{successMessage}</p>}
    {draftCount > 0 && <p>{draftCount} {t('instructor.review.draft')}</p>}
    <div className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm">
      <div className="flex border-b border-(--border-light)">
        {[
          { id: 'manual', label: t('instructor.review.manualFeedback') },
          { id: 'overview', label: t('instructor.review.overviewTab') },
          { id: 'evidence', label: t('instructor.review.evidenceTab') },
          { id: 'standards', label: t('instructor.review.standardsTab') },
          { id: 'ai', label: t('instructor.review.aiSuggestionTab') },
        ].map(tab => (
          <button key={tab.id} onClick={() => setPanelTab(tab.id)}
            className={`flex-1 px-2 py-2.5 text-[10px] font-black text-center transition-colors border-b-2 ${panelTab === tab.id ? 'text-(--brand-foreground) border-(--brand)' : 'text-(--text-tertiary) border-transparent hover:text-(--text-secondary)'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-5">
        {panelTab === 'manual' && (!selectedSectionId ? (
          <p className="text-xs text-(--text-tertiary) italic">{t('instructor.review.selectSectionFeedback')}</p>
        ) : (
          <>
            <label className="mb-3 flex gap-2"><input type="checkbox" checked={sectionOnly} onChange={event => setSectionOnly(event.target.checked)} />{t('instructor.review.sectionFeedback')}: {selectedSection?.sectionTitle}</label>
            <div className="mb-3 flex gap-1 rounded-lg border border-(--border) bg-(--surface-secondary) p-0.5 text-[10px] font-bold">
              {[
                ['OPEN', t('instructor.review.openFeedback')],
                ['DONE', t('instructor.review.doneFeedback')],
                ['ALL', t('instructor.review.allFeedback')],
              ].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFeedbackFilter(value)}
                  className={`flex-1 rounded-md px-2 py-1.5 ${feedbackFilter === value ? 'bg-(--surface) text-(--brand-foreground) shadow-sm' : 'text-(--text-secondary)'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="mb-4 max-h-[46vh] space-y-3 overflow-y-auto pr-1 hide-scrollbar">
              {sectionFeedback.length === 0 ? (
                <p className="text-xs text-(--text-tertiary) italic">{t('instructor.review.noSectionFeedback')}</p>
              ) : sectionFeedback.map(feedback => (
                <div key={feedback.id} onClick={() => onSelectFeedback(feedback)}
                  className={`cursor-pointer space-y-2 rounded-xl border bg-(--surface-secondary) p-3 text-xs transition-colors ${String(activeFeedbackId) === String(feedback.id) ? 'border-(--brand) ring-1 ring-(--brand)/30' : 'border-(--border-light) hover:border-(--brand)/50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-black text-indigo-600 dark:bg-indigo-900/30">{t('section')} {feedback.sectionTitle || ''}</span>
                      {!feedback.publishedAt && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">{t('instructor.review.draft')}</span>}
                      {(feedback.pendingState || feedback.threadState) === 'DONE' && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">{t('instructor.review.doneFeedback')}</span>}
                    </div>
                    {feedback.canEdit && <div className="flex items-center gap-1.5">
                      <button type="button" onClick={event => { event.stopPropagation(); handleEditFeedback(feedback); }} className="p-1 text-(--text-tertiary) hover:text-(--brand)" title={t('instructor.review.edit')} aria-label={t('instructor.review.edit')}>✎</button>
                      <DeleteConfirm message={t('instructor.review.deleteFeedbackConfirm')} onConfirm={() => handleDeleteFeedback(feedback.id)} triggerLabel={t('delete')} confirmLabel={t('delete')} cancelLabel={t('cancel')} className="p-1 text-(--text-tertiary) hover:text-rose-600">×</DeleteConfirm>
                    </div>}
                  </div>
                  {String(feedback.requestId) !== String(activeRequestId) && <p className="font-semibold text-amber-700">{t('instructor.review.previousRoundOpen')}</p>}
                  {feedback.anchor?.original?.exact && <p className="line-clamp-2 text-[10px] italic text-(--text-tertiary)">“{feedback.anchor.original.exact}”</p>}
                  <button type="button" onClick={() => onSelectFeedback(feedback)} className="text-left text-sm font-medium whitespace-pre-wrap">{feedback.content}</button>
                  {feedback.pendingState && <p className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/20">{t('instructor.review.pendingState')}: {feedback.pendingState === 'DONE' ? t('instructor.review.doneFeedback') : t('instructor.review.openFeedback')}</p>}
                  {(feedback.canMarkDone || feedback.canReopen) && <div className="flex gap-2 border-t border-(--border-light) pt-2">
                    {feedback.canMarkDone && <button type="button" onClick={event => { event.stopPropagation(); prepareState(feedback, 'DONE'); }} className="flex-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100">{t('instructor.review.markDone')}</button>}
                    {feedback.canReopen && <button type="button" onClick={event => { event.stopPropagation(); prepareState(feedback, 'OPEN'); }} className="flex-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-700 hover:bg-amber-100">{t('instructor.review.reopenFeedback')}</button>}
                  </div>}
                </div>
              ))}
            </div>
            {!canCreateRoot ? (
              <p className="text-xs text-(--text-tertiary) italic">{requestLocked ? t('instructor.review.reviewClosed') : t('instructor.review.selectSubmittedSource')}</p>
            ) : (
              <form onSubmit={handleSubmitFeedback} className="space-y-2 border-t border-(--border-light) pt-3">
                <div className="flex gap-2">
                  <button type="button" onClick={captureSourceSelection} className="flex-1 rounded-lg border border-(--border) bg-(--surface-secondary) px-2 py-1.5 text-[10px] font-bold text-(--text-secondary) hover:text-(--brand-foreground)">{t('instructor.review.commentSelection')}</button>
                  <button type="button" onClick={() => updateFeedbackDraft({ anchor: null, lineReference: '' })} className="flex-1 rounded-lg border border-(--border) bg-(--surface-secondary) px-2 py-1.5 text-[10px] font-bold text-(--text-secondary) hover:text-(--brand-foreground)">{t('instructor.review.wholeSection')}</button>
                </div>
                {selectedAnchor && <p className="text-[10px] font-semibold text-(--brand)">{t('instructor.review.selectionReady', { from: selectedAnchor.from, to: selectedAnchor.to })}</p>}
                <textarea rows="3" value={feedbackDraft} onChange={event => updateFeedbackDraft({ content: event.target.value })}
                  placeholder={t('instructor.review.sectionFeedbackPlaceholder')}
                  className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)" />
                <div className="flex gap-2">
                  {editingFeedbackId && <button type="button" onClick={handleCancelEdit} className="flex-1 rounded-xl bg-(--surface-secondary) py-2 text-xs font-bold text-(--text-secondary) hover:bg-(--surface-tertiary)">{t('cancel')}</button>}
                  <button type="submit" disabled={savingFeedback || !feedbackDraft.trim()} className="flex-1 rounded-xl bg-(--brand) py-2 text-xs font-bold text-(--on-brand) shadow-sm hover:bg-(--brand-hover) disabled:opacity-50">
                    {savingFeedback ? t('saving') : editingFeedbackId ? t('instructor.review.updateFeedback') : t('instructor.review.addFeedback')}
                  </button>
                </div>
              </form>
            )}
          </>
        ))}

        {panelTab === 'overview' && (
          <ReviewOverviewBlock review={review} />
        )}


        {panelTab === 'evidence' && (
          <SectionEvidenceTab review={review} selectedSection={selectedSection} />
        )}

        {panelTab === 'standards' && (
          <SectionStandardsTab review={review} selectedSection={selectedSection} />
        )}

        {panelTab === 'ai' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button onClick={handleGenerateSuggestions} disabled={!activeGuide || suggestionLoading || requestLocked || activeRequest?.status !== 'PENDING'}
                className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {suggestionLoading ? t('instructor.review.generatingSuggestions') : t('instructor.review.generateSuggestions')}
              </button>
              {activeGuide && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{activeGuide.sectionType}</span>}
            </div>
            <p className="text-[10px] text-(--text-tertiary) italic">{t('instructor.review.aiGenerationNote')}</p>
            {suggestionError && (
              <p className="text-[10px] font-bold text-rose-600">{suggestionError}</p>
            )}
            {suggestionLoading && (
              <div className="space-y-2" aria-busy="true">
                <div className="h-14 bg-(--surface-secondary) animate-pulse rounded-xl" />
                <div className="h-14 bg-(--surface-secondary) animate-pulse rounded-xl" />
              </div>
            )}
            {suggestionRan && !suggestionLoading && suggestions.length === 0 && (
              <p className="text-[10px] text-(--text-secondary) italic">{t('instructor.review.noSuggestionIssues')}</p>
            )}
            {suggestions.length > 0 && (
              <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {suggestions.map((suggestion, i) => (
                  <li key={i} className="border border-(--border-light) rounded-xl p-3 text-xs space-y-1">
                    <p className="font-bold text-(--text-primary) leading-relaxed">{suggestion.issue}</p>
                    {suggestion.quote && (
                      <p className="text-[10px] text-gray-400 italic leading-relaxed">"{suggestion.quote}"</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
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
    {pendingDelete && <UndoToast pending={pendingDelete} onUndo={undoDelete} onDismiss={dismissDelete} />}
  </div>;
}
