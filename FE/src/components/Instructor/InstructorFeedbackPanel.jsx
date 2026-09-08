import { useState } from 'react';
import { Modal, StatusBadge } from '../index';
import DeleteConfirm from '../ui/DeleteConfirm.jsx';
import { UndoToast } from '../ui/UndoDelete.jsx';
import { commonText, instructorText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../utils/formatters/date.js';

const ACTION_LABELS = { REVIEWED: { key: 'approve' }, RETURNED: { key: 'returnForRevision' } };

export function InstructorReviewGuide({ review, selectedSection }) {
  const { language } = useLanguage();
  const t = instructorText[language];
  const { activeGuide, checkedItems, setCheckedItems, selectedSectionId } = review;
  return <section className="space-y-4 rounded-xl border border-(--border) bg-(--surface) p-4 text-xs shadow-sm">
    <h3 className="font-bold text-(--text-primary)">{t.reviewGuide}</h3>
    {!selectedSection || !activeGuide ? <p className="text-(--text-tertiary) italic">{t.selectSectionGuide}</p> : <>
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
  const { language } = useLanguage();
  const { user } = useAuth();
  const t = instructorText[language];
  const ct = commonText[language];
  const { selectedSectionId, orderedRequests, activeRequest, activeRequestId, setActiveRequestId, feedbackItems, errorMessage, successMessage, diffEnabled, setDiffEnabled, diffOps, feedbackDraft, selectedAnchor, editingFeedbackId, updateFeedbackDraft, savingFeedback, feedbackFilter, setFeedbackFilter, activeFeedbackId, transitioningRequestId, pendingTransition, setPendingTransition, suggestions, suggestionLoading, suggestionError, suggestionRan, panelTab, setPanelTab, activeGuide, requestLocked, canReturn, canCreateRoot, handleSubmitFeedback, captureSourceSelection, handleEditFeedback, handleCancelEdit, handleDeleteFeedback, deleteReply, prepareState, handleTransitionStatus, handleGenerateSuggestions, injectIntoFeedback, pendingDelete, undoDelete, dismissDelete } = review;
  const [sectionOnly, setSectionOnly] = useState(false);
  const draftCount = feedbackItems.filter(item => String(item.requestId) === String(activeRequestId) && !item.publishedAt).length;
  const sectionFeedback = feedbackItems.filter(item => (!sectionOnly || String(item.sectionId) === String(selectedSectionId))
    && (!item.paperId || String(item.paperId) === String(review.selectedPaperId))
    && (String(item.requestId) === String(activeRequestId) || (item.threadState || 'OPEN') === 'OPEN')
    && (feedbackFilter === 'ALL' || (item.pendingState || item.threadState || 'OPEN') === feedbackFilter));
  const historyFeedback = [...feedbackItems].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return <div className="space-y-3 text-xs">
    <div className="space-y-2 rounded-xl border border-(--border) bg-(--surface) p-3 shadow-sm">
      {orderedRequests.map(req => <button type="button" key={req.id} onClick={() => setActiveRequestId(req.id)} aria-pressed={req.id === activeRequestId} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-(--brand) ${req.id === activeRequestId ? 'border-indigo-200 bg-(--brand-soft) text-(--brand-foreground)' : 'border-(--border-light) text-(--text-secondary) hover:bg-(--surface-secondary)'}`}>
        {formatDateTime(req.requestedAt, language)} · <StatusBadge status={req.status} />
      </button>)}
    </div>
    <div className="flex flex-wrap gap-2">
      {!requestLocked && <>
        {canReturn && <button type="button" disabled={savingFeedback || !!transitioningRequestId || !!pendingDelete} onClick={() => setPendingTransition({ requestId: activeRequest.id, targetStatus: 'RETURNED' })} className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-white disabled:opacity-50">{t.returnForRevision}</button>}
        <button type="button" disabled={savingFeedback || !!transitioningRequestId || !!pendingDelete} onClick={() => setPendingTransition({ requestId: activeRequest.id, targetStatus: 'REVIEWED' })} className="rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white disabled:opacity-50">{t.approve}</button>
      </>}
    </div>
    {errorMessage && <p role="alert" className="text-rose-700">{errorMessage}</p>}
    {successMessage && <p role="status" className="text-emerald-700">{successMessage}</p>}
    <label className="flex gap-2"><input type="checkbox" checked={sectionOnly} onChange={event => setSectionOnly(event.target.checked)} />{t.sectionFeedback}: {selectedSection?.sectionTitle}</label>
    {draftCount > 0 && <p>{draftCount} {t.draft}</p>}
    {feedbackItems.some(item => (item.messages || []).some(message => message.kind === 'REPLY' && message.draft)) && <p role="alert">{t.legacyReplyDraftNotice}</p>}
    <label className="flex gap-2"><input type="checkbox" checked={diffEnabled} onChange={event => setDiffEnabled(event.target.checked)} />{t.showChanges}</label>
    {diffEnabled && (diffOps ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap">{diffOps.map((op, i) => <span key={i} className={op[0] === -1 ? 'bg-rose-100 line-through' : op[0] === 1 ? 'bg-emerald-100' : ''}>{op[1]}</span>)}</pre> : <p>{t.noCheckpointBaseline}</p>)}
            <div className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm">
              <div className="flex border-b border-(--border-light)">
                {[
                  { id: 'manual', label: t.manualFeedback },
                  { id: 'ai', label: t.aiSuggestions },
                  { id: 'history', label: t.versionHistory },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setPanelTab(tab.id)}
                    className={`flex-1 px-2 py-2.5 text-[10px] font-black text-center transition-colors border-b-2 ${panelTab === tab.id ? 'text-(--brand-foreground) border-(--brand)' : 'text-(--text-tertiary) border-transparent hover:text-(--text-secondary)'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-4 sm:p-5">
                {panelTab === 'manual' && (
                  <>
                    {!selectedSectionId ? (
                      <p className="text-xs text-(--text-tertiary) italic">{t.selectSectionFeedback}</p>
                    ) : (
                      <>
                        <div className="mb-3 flex gap-1 rounded-lg border border-(--border) bg-(--surface-secondary) p-0.5 text-[10px] font-bold">
                          {[
                            ['OPEN', t.openFeedback],
                            ['DONE', t.doneFeedback],
                            ['ALL', t.allFeedback],
                          ].map(([value, label]) => (
                            <button key={value} type="button" onClick={() => setFeedbackFilter(value)}
                              className={`flex-1 rounded-md px-2 py-1.5 ${feedbackFilter === value ? 'bg-(--surface) text-(--brand-foreground) shadow-sm' : 'text-(--text-secondary)'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="space-y-3 mb-4 max-h-[46vh] overflow-y-auto pr-1 hide-scrollbar">
                          {sectionFeedback.length === 0 ? (
                            <p className="text-xs text-(--text-tertiary) italic">{t.noSectionFeedback}</p>
                          ) : sectionFeedback.map(fb => (
                            <div key={fb.id} onClick={() => onSelectFeedback(fb)}
                              className={`cursor-pointer bg-(--surface-secondary) border rounded-xl p-3 text-xs space-y-2 transition-colors ${String(activeFeedbackId) === String(fb.id) ? 'border-(--brand) ring-1 ring-(--brand)/30' : 'border-(--border-light) hover:border-(--brand)/50'}`}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="truncate text-[9px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{t.section} {fb.sectionTitle || ''}</span>
                                  {!fb.publishedAt && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{t.draft}</span>}
                                  {(fb.pendingState || fb.threadState) === 'DONE' && <span className="text-[9px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">{t.doneFeedback}</span>}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {fb.stale && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{t.sectionChanged}</span>}
                                  {fb.canEdit && (
                                    <>
                                      <button onClick={() => handleEditFeedback(fb)} className="text-(--text-tertiary) hover:text-(--brand) p-1" title={ct.edit} aria-label={ct.edit}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 13H9v-2.828l6.586-6.586z" /></svg></button>
                                      <DeleteConfirm message={t.deleteFeedbackConfirm} onConfirm={() => handleDeleteFeedback(fb.id)} triggerLabel={ct.delete} confirmLabel={ct.delete} cancelLabel={ct.cancel} className="text-(--text-tertiary) hover:text-rose-600 p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16" /></svg></DeleteConfirm>
                                    </>
                                  )}
                                </div>
                              </div>
                              {String(fb.requestId) !== String(activeRequestId) && <p className="text-xs font-semibold text-amber-700">{t.previousRoundOpen}</p>}
                              {fb.anchor?.original?.exact && <p className="text-[10px] text-(--text-tertiary) italic line-clamp-2">“{fb.anchor.original.exact}”</p>}
                              <button type="button" onClick={() => onSelectFeedback(fb)} className="text-left whitespace-pre-wrap text-sm font-medium">{fb.content}</button>
                              <details><summary className="cursor-pointer text-xs">{t.feedbackHistory}</summary>
                              <div className="space-y-2">
                                {(fb.messages || []).filter(message => message.kind === 'REPLY').map(message => {
                                  const ownDraft = message.draft && String(message.authorId) === String(user?.id);
                                  return (
                                    <div key={message.id} className={`rounded-lg p-2 ${message.draft ? 'border border-dashed border-amber-300 bg-amber-50/70 dark:bg-amber-950/20' : message.authorRole === 'STUDENT' ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-(--surface)'}`}>
                                      <div className="mb-1 flex items-center justify-between gap-2 text-[9px] font-bold text-(--text-tertiary)">
                                        <span>{message.authorName || (message.authorRole === 'STUDENT' ? t.student : t.instructor)}</span>
                                        <span className="flex shrink-0 items-center gap-1">{message.draft ? t.draft : message.publishedAt ? formatDateTime(message.publishedAt, language) : ''}
                                          {ownDraft && message.kind === 'REPLY' && <><button type="button" onClick={event => { event.stopPropagation(); deleteReply(fb.id, message.id); }} className="text-rose-600 hover:underline">{ct.delete}</button></>}
                                        </span>
                                      </div>
                                      <p className="whitespace-pre-wrap leading-relaxed text-(--text-primary)">{message.content}</p>
                                    </div>
                                  );
                                })}
                              </div>
                              </details>
                              {fb.pendingState && <p className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/20">{t.pendingState}: {fb.pendingState === 'DONE' ? t.doneFeedback : t.openFeedback}</p>}
                              {(fb.canMarkDone || fb.canReopen) && (
                                <div className="flex gap-2 border-t border-(--border-light) pt-2">
                                  {fb.canMarkDone && <button type="button" onClick={event => { event.stopPropagation(); prepareState(fb, 'DONE'); }} className="flex-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100">{t.markDone}</button>}
                                  {fb.canReopen && <button type="button" onClick={event => { event.stopPropagation(); prepareState(fb, 'OPEN'); }} className="flex-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-700 hover:bg-amber-100">{t.reopenFeedback}</button>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {!canCreateRoot ? (
                          <p className="text-xs text-(--text-tertiary) italic">{requestLocked ? t.reviewClosed : t.selectSubmittedSource}</p>
                        ) : (
                          <form onSubmit={handleSubmitFeedback} className="space-y-2 border-t border-(--border-light) pt-3">
                            <div className="flex gap-2">
                              <button type="button" onClick={captureSourceSelection} className="flex-1 rounded-lg border border-(--border) bg-(--surface-secondary) px-2 py-1.5 text-[10px] font-bold text-(--text-secondary) hover:text-(--brand-foreground)">{t.commentSelection}</button>
                              <button type="button" onClick={() => updateFeedbackDraft({ anchor: null, lineReference: '' })} className="flex-1 rounded-lg border border-(--border) bg-(--surface-secondary) px-2 py-1.5 text-[10px] font-bold text-(--text-secondary) hover:text-(--brand-foreground)">{t.wholeSection}</button>
                            </div>
                            {selectedAnchor && <p className="text-[10px] font-semibold text-(--brand)">{t.selectionReady.replace('{{from}}', selectedAnchor.from).replace('{{to}}', selectedAnchor.to)}</p>}
                            <textarea rows="3" value={feedbackDraft} onChange={e => updateFeedbackDraft({ content: e.target.value })}
                              placeholder={t.sectionFeedbackPlaceholder}
                              className="w-full px-3 py-2 bg-(--surface-secondary) border border-(--border) rounded-xl text-xs text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)" />
                            <div className="flex gap-2">
                              {editingFeedbackId && (
                                <button type="button" onClick={handleCancelEdit}
                                  className="flex-1 py-2 bg-(--surface-secondary) text-(--text-secondary) rounded-xl hover:bg-(--surface-tertiary) transition-colors text-xs font-bold">{ct.cancel}</button>
                              )}
                              <button type="submit" disabled={savingFeedback || !feedbackDraft.trim()}
                                className="flex-1 py-2 bg-(--brand) text-(--on-brand) rounded-xl hover:bg-(--brand-hover) transition-colors shadow-sm disabled:opacity-50 text-xs font-bold">
                                {savingFeedback ? ct.saving : editingFeedbackId ? t.updateFeedback : t.addFeedback}
                              </button>
                            </div>
                          </form>
                        )}
                      </>
                    )}
                  </>
                )}

                {panelTab === 'ai' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={handleGenerateSuggestions} disabled={!activeGuide || suggestionLoading || requestLocked || activeRequest?.status !== 'PENDING'}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">
                        {suggestionLoading ? t.generatingSuggestions : t.generateSuggestions}
                      </button>
                      {activeGuide && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{activeGuide.sectionType}</span>}
                    </div>
                    <p className="text-[10px] text-(--text-tertiary) italic">{t.aiGenerationNote}</p>
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
                      <p className="text-[10px] text-(--text-secondary) italic">{t.noSuggestionIssues}</p>
                    )}
                    {suggestions.length > 0 && (
                      <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {suggestions.map((suggestion, i) => (
                          <li key={i} className="border border-(--border-light) rounded-xl p-3 text-xs space-y-1">
                            <p className="font-bold text-(--text-primary) leading-relaxed">{suggestion.issue}</p>
                            {suggestion.quote && (
                              <p className="text-[10px] text-gray-400 italic leading-relaxed">"{suggestion.quote}"</p>
                            )}
                            <button type="button" onClick={() => { injectIntoFeedback(suggestion.lineReference, suggestion.actionableFix); setPanelTab('manual'); }}
                              className="text-[10px] font-black text-indigo-600 hover:underline">
                              {t.addToManualFeedback}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {panelTab === 'history' && (
                  <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1 hide-scrollbar">
                    {historyFeedback.length === 0 ? (
                      <p className="text-xs text-(--text-tertiary) italic">{t.historyEmpty}</p>
                    ) : historyFeedback.map(fb => (
                      <button type="button" key={fb.id} onClick={() => { setActiveRequestId(fb.requestId); review.setViewMode('submitted'); setFeedbackFilter('ALL'); setPanelTab('manual'); onSelectFeedback(fb); }} className="w-full bg-(--surface-secondary) border border-(--border-light) rounded-xl p-3 text-left text-xs space-y-1 hover:border-(--brand)/50">
                        <div className="flex items-center justify-between gap-2">
                          {fb.sectionTitle && <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{fb.sectionTitle}</span>}
                          {fb.createdAt && <span className="text-[9px] text-(--text-tertiary)">{formatDateTime(fb.createdAt, language)}</span>}
                        </div>
                        <p className="text-(--text-primary) leading-relaxed">{(fb.messages || []).map(message => `${message.authorName || message.authorRole}: ${message.content}`).join('\n')}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

      <Modal open={!!pendingTransition} onClose={() => { if (!transitioningRequestId) setPendingTransition(null); }}
        title={pendingTransition?.targetStatus === 'REVIEWED' ? t[ACTION_LABELS.REVIEWED.key] : t[ACTION_LABELS.RETURNED.key]}
        closeLabel={ct.close}>
        <div className="space-y-4 text-xs">
          <p className="text-(--text-secondary)">
            {pendingTransition?.targetStatus === 'REVIEWED' ? t.finalizeReviewConfirm : `${t.returnForRevision} · ${draftCount} ${t.draft}`}
          </p>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setPendingTransition(null)} disabled={!!transitioningRequestId}
              className="flex-1 py-3 bg-(--surface-secondary) hover:bg-(--surface-tertiary) text-(--text-secondary) rounded-xl transition-colors border border-(--border) disabled:opacity-50">{ct.cancel}</button>
            <button type="button" onClick={() => handleTransitionStatus(pendingTransition.requestId, pendingTransition.targetStatus)}
              disabled={!!transitioningRequestId}
              className="flex-1 py-3 bg-(--brand) text-(--on-brand) rounded-xl hover:bg-(--brand-hover) transition-colors disabled:opacity-50">{transitioningRequestId ? ct.saving : ct.confirm}</button>
          </div>
        </div>
      </Modal>
    {pendingDelete && <UndoToast pending={pendingDelete} onUndo={undoDelete} onDismiss={dismissDelete} />}
  </div>;
}
