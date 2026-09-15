import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api.js';
import SectionRequirementsPanel from './SectionRequirementsPanel.jsx';
import SourceLibraryContent from './SourceLibraryContent.jsx';
import { formatDateTime } from '../../utils/formatters/date.js';
import { PROJECT_STATUSES } from '../../constants';

const FEEDBACK_STATUSES = new Set(['PENDING', 'RETURNED', 'REVIEWED']);

export default function ContextPanel({
  compact, isOpen, width,
  activeTab, setActiveTab,
  showToast,
  // Source tab
  sources, isUploading, setIsUploading, project, setViewerFile, fetchSources, onOpenSourceMap,
  paperReferences = [], referencesLoading = false, referencesError = '', referenceSourceIds = null,
  canMutateReferences = false, onAddReference, onRemoveReference, onReferencesChanged,
  // Requirements tab
  selectedPaper, selectedSection, isAssignedSection, isSectionDirty, onHandoffChanged, pollAiJob,
  // Review tab
  feedbacks, feedbackLoading, feedbackError, onRetryFeedback, onViewFeedback, setShowSubmitReviewModal, userProjectRole,
  reviewContent, requirementsContent,
  isLocked,
}) {
  const { t, i18n } = useTranslation();

  const [confirmationRequestId, setConfirmationRequestId] = useState(null);
  const [confirmationSnapshot, setConfirmationSnapshot] = useState(null);
  const [confirmationState, setConfirmationState] = useState('');
  const [confirmationRetry, setConfirmationRetry] = useState(0);
  useEffect(() => {
    setConfirmationSnapshot(null);
    if (!confirmationRequestId) { setConfirmationState(''); return; }
    let cancelled = false;
    setConfirmationState('LOADING');
    api.get(`/api/feedback-requests/${confirmationRequestId}/submission-snapshot`)
      .then(response => {
        if (cancelled) return;
        if (response.data?.state === 'LEGACY_NO_SNAPSHOT') {
          setConfirmationState('LEGACY_NO_SNAPSHOT');
          return;
        }
        const candidate = response.data?.snapshot;
        // ponytail: accept snapshot schema v1 (sections only) and v2 (+evidence/standard refs)
        const valid = response.data?.state === 'AVAILABLE' && (candidate?.schemaVersion === 1 || candidate?.schemaVersion === 2)
          && String(candidate.projectId) === String(project?.id) && Array.isArray(candidate.papers)
          && candidate.papers.every(paper => paper.id && (typeof paper.title === 'string' || paper.title === null) && Array.isArray(paper.sections)
            && paper.sections.every(section => section.id && typeof section.title === 'string'
              && typeof section.contentTex === 'string' && Number.isInteger(section.order) && Number.isInteger(section.contentVersion)));
        if (!valid) throw new Error('Invalid submission snapshot');
        setConfirmationSnapshot(candidate);
        setConfirmationState('AVAILABLE');
      })
      .catch(() => { if (!cancelled) setConfirmationState('LOAD_ERROR'); });
    return () => { cancelled = true; };
  }, [confirmationRequestId, project?.id, confirmationRetry]);

  if (!isOpen) return null;

  const activeClass = (tab) =>
    `flex-1 py-3 text-xs font-bold uppercase tracking-wider flex flex-col justify-center items-center gap-1 transition-all relative ${activeTab === tab ? 'text-(--brand-foreground)' : 'text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--surface-secondary)'}`;
  // ponytail: Sources live in the review left column; keep the tab only for student workspaces
  const showSourceTab = !reviewContent;

  return (
    <>
      <aside data-tour="context-panel" style={{ width: compact ? 'min(24rem, calc(100vw - 3.5rem))' : width }} className="absolute inset-y-0 right-0 z-40 bg-(--surface) border-l border-(--border) flex flex-col shadow-[-8px_0_24px_-6px_rgba(0,0,0,0.25)] overflow-hidden">
        {!reviewContent && <div className="flex border-b border-(--border) bg-(--surface) relative shrink-0">
          {showSourceTab && <button data-tour="context-info-tab" onClick={() => setActiveTab('Source')} className={activeClass('Source')}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {t('sources')}
            {activeTab === 'Source' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 shadow-[0_-2px_8px_rgba(79,70,229,0.5)]"></div>}
          </button>}
          <button onClick={() => setActiveTab('Requirements')} className={activeClass('Requirements')}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
            {t('requirements')}
            {activeTab === 'Requirements' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 shadow-[0_-2px_8px_rgba(79,70,229,0.5)]"></div>}
          </button>
          <button data-tour="context-review-tab" onClick={() => setActiveTab('Review')} className={activeClass('Review')}>
            <div className="relative">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            </div>
            {t('studentFeedback.review')}
            {activeTab === 'Review' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 shadow-[0_-2px_8px_rgba(79,70,229,0.5)]"></div>}
          </button>
        </div>}

        <div className="flex-1 overflow-y-auto bg-(--surface-secondary)/50 p-4">
          {activeTab === 'Source' && showSourceTab && (
            <SourceLibraryContent
              sources={sources} project={project} isLocked={isLocked} setViewerFile={setViewerFile}
              fetchSources={fetchSources} onOpenSourceMap={onOpenSourceMap}
              paperReferences={paperReferences} referencesLoading={referencesLoading} referencesError={referencesError}
              referenceSourceIds={referenceSourceIds} canMutateReferences={canMutateReferences}
              onAddReference={onAddReference} onRemoveReference={onRemoveReference} onReferencesChanged={onReferencesChanged}
              showToast={showToast} readOnly={Boolean(reviewContent)}
            />
          )}

          {activeTab === 'Requirements' && (requirementsContent ||
            <SectionRequirementsPanel
              project={project}
              selectedPaper={selectedPaper}
              selectedSection={selectedSection}
              isAssigned={isAssignedSection}
              isLocked={isLocked}
              isDirty={isSectionDirty}
              onHandoffChanged={onHandoffChanged}
              pollAiJob={pollAiJob}
              showToast={showToast}
            />
          )}

          {activeTab === 'Review' && (reviewContent ||
            <div className="flex flex-col gap-4 animate-in fade-in duration-200">
              <div className="flex justify-between items-center mb-1 bg-(--surface) border border-(--border) rounded-xl p-3.5 shadow-sm">
                <div className="flex-1">
                  <p className="text-[10px] text-(--text-tertiary) uppercase tracking-wider font-bold flex items-center justify-between gap-2">{t('projectStatus')}
                    {userProjectRole === 'LEADER' && isLocked && <button type="button" onClick={() => setShowSubmitReviewModal(true)} className="text-[10px] font-bold normal-case tracking-normal px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer" title={t('submitReviewDescription')}>{t('viewConfirmations')}</button>}
                  </p>
                  <p className="text-sm font-bold text-(--text-primary) mt-0.5">{project?.status ? t(`status.${PROJECT_STATUSES.includes(project.status) ? project.status : 'UNKNOWN'}`) : t('unknown')}</p>
                </div>
                {userProjectRole === 'LEADER' && !isLocked && <button onClick={() => setShowSubmitReviewModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition-all" title={t('submitReviewDescription')}>{t('submitReview')}</button>}
              </div>
              <h3 className="text-[11px] font-bold text-(--text-tertiary) tracking-widest uppercase flex items-center gap-2 mt-2"><div className="h-px bg-(--border) flex-1"></div> {t('reviewHistory')} <div className="h-px bg-(--border) flex-1"></div></h3>
              <div className="space-y-4">
                {feedbackLoading && <p role="status" className="text-xs text-(--text-secondary)">{t('studentFeedback.loading')}</p>}
                {feedbackError && <div role="alert" className="text-xs text-rose-600"><p>{t('studentFeedback.loadError')}</p><button type="button" onClick={onRetryFeedback} className="mt-2 font-bold underline">{t('retry')}</button></div>}
                {!feedbackLoading && !feedbackError && feedbacks.length === 0 ? <div className="text-xs text-(--text-tertiary) italic text-center py-8">{t('noReviews')}</div> : (
                  feedbacks.map((fb, idx) => (
                    <div key={fb.id || idx} className="bg-(--surface) border border-(--border) rounded-xl shadow-sm overflow-hidden">
                      <div className="w-full text-left bg-(--surface-secondary) border-b border-(--border-light) p-3 flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 flex items-center justify-center font-bold text-xs border border-indigo-200 dark:border-indigo-800">I</div>
                          <div>
                            <p className="text-xs font-bold text-(--text-primary)">{t('instructor')}{fb.instructorName ? `: ${fb.instructorName}` : ''}</p>
                            <p className="text-[9px] text-(--text-tertiary) font-medium">{fb.requestedAt ? new Date(fb.requestedAt).toLocaleString(i18n.language === 'vi' ? 'vi-VN' : 'en-US') : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] px-2 py-0.5 rounded font-black border uppercase ${fb.status === 'PENDING' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 border-amber-200 dark:border-amber-800' : fb.status === 'RETURNED' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 border-rose-200 dark:border-rose-800' : fb.status === 'REVIEWED' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700'}`}>{t(`status.${FEEDBACK_STATUSES.has(fb.status) ? fb.status : 'UNKNOWN'}`)}</span>
                        </div>
                      </div>
                      <div className="p-3 text-xs leading-relaxed text-(--text-primary)">
                        {fb.status === 'PENDING' && <p className="text-amber-600 font-medium italic">{t('reviewPending')}</p>}
                        {fb.status === 'RETURNED' && <p className="text-rose-600 font-medium">{t('reviewReturned')}</p>}
                        {fb.status === 'REVIEWED' && <p className="text-emerald-600 font-medium">{t('reviewApproved')}</p>}
                        {fb.status === 'REJECTED' && <p className="text-rose-600 font-medium">{t('reviewRejected')}</p>}
                        <button type="button" onClick={() => onViewFeedback(fb.id || fb.requestId)} className="mt-3 rounded-md border border-(--border) px-3 py-2 font-semibold text-(--brand) hover:bg-(--brand-soft) focus-visible:ring-2 focus-visible:ring-(--brand)">{t('studentFeedback.viewFeedback')}</button>
                        {userProjectRole === 'LEADER' && <details className="mt-3" open={confirmationRequestId === (fb.id || fb.requestId)}>
                          <summary className="cursor-pointer font-semibold focus-visible:ring-2 focus-visible:ring-(--brand)" onClick={event => {
                            event.preventDefault();
                            setConfirmationSnapshot(null);
                            setConfirmationState('LOADING');
                            setConfirmationRequestId(previous => previous === (fb.id || fb.requestId) ? null : (fb.id || fb.requestId));
                          }}>{t('sectionConfirmations')}</summary>
                          {confirmationRequestId === (fb.id || fb.requestId) && <div className="mt-2 space-y-2">
                            {confirmationState === 'LOADING' && <p role="status">{t('loading')}</p>}
                            {confirmationState === 'LEGACY_NO_SNAPSHOT' && <p>{t('confirmationLegacy')}</p>}
                            {confirmationState === 'LOAD_ERROR' && <div role="alert"><p>{t('confirmationLoadFailed')}</p><button type="button" onClick={() => setConfirmationRetry(value => value + 1)} className="underline">{t('retry')}</button></div>}
                            {confirmationState === 'AVAILABLE' && confirmationSnapshot && <>
                              <p>{t('confirmationSubmittedBy')}: {confirmationSnapshot.submittedByName || '—'} · {formatDateTime(confirmationSnapshot.submittedAt)}</p>
                              {confirmationSnapshot.papers.map(paper => <div key={paper.id}>
                                <h4 className="font-bold">{paper.title || t('paper')}</h4>
                                {paper.sections.map(section => <div key={section.id} className="mt-2 border-t border-(--border) pt-2">
                                  <p className="font-semibold">{section.title}</p>
                                  <p>{t('feedbackAssignee')}: {section.assignedUserName || t('feedbackUnassigned')}</p>
                                  {section.handoffState && <p>{t(section.handoffState === 'CONFIRMED' ? 'handoffStateConfirmed' : section.handoffState === 'STALE' ? 'handoffStateStale' : 'handoffStateUnconfirmed')}</p>}
                                  <p>{t('feedbackConfirmedBy')}: {section.confirmedByName || '—'}</p>
                                  <p>{t('confirmationTime')}: {formatDateTime(section.confirmedAt)}</p>
                                </div>)}
                              </div>)}
                            </>}
                          </div>}
                        </details>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>
      </aside>
    </>
  );
}
