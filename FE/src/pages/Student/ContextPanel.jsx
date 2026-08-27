import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api.js';
import { getSourceDownloadUrl } from './sourceDownload.js';

const FUNCTIONAL_TYPES = [
  { value: 'EMPIRICAL', labelKey: 'functionalTypeEmpirical' },
  { value: 'THEORETICAL', labelKey: 'functionalTypeTheoretical' },
  { value: 'METHODOLOGICAL', labelKey: 'functionalTypeMethodological' },
  { value: 'ANALYTICAL', labelKey: 'functionalTypeAnalytical' },
  { value: 'APPLIED', labelKey: 'functionalTypeApplied' },
];

const BREAKDOWN_LABELS = [
  ['semantic_alignment', 'semanticAlignment'],
  ['contextual_sufficiency', 'contextualSufficiency'],
  ['logical_restraint', 'logicalRestraint'],
];

function parseScoreBreakdown(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function FunctionalTypeDropdown({ value, onChange, className }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const selected = FUNCTIONAL_TYPES.find(t => t.value === value) || FUNCTIONAL_TYPES[0];
  return (
    <div ref={ref} className={`relative ${className || ''}`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full text-xs border border-(--border) rounded-lg px-2 py-1.5 bg-(--surface) outline-none focus:ring-1 focus:ring-indigo-500 text-(--text-primary) flex items-center justify-between gap-1">
        <span className="truncate">{selected.value}</span>
        <svg className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-(--surface) border border-(--border) rounded-lg shadow-lg max-h-48 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FUNCTIONAL_TYPES.map(type => (
            <li key={type.value}>
              <button type="button" onClick={() => { onChange(type.value); setOpen(false); }}
                className={`w-full text-left text-xs px-2 py-1.5 hover:bg-(--surface-secondary) ${type.value === selected.value ? 'font-bold text-indigo-600' : 'text-(--text-primary)'}`}>
                {t(type.labelKey)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EvidenceEvaluationCard({ match, status, breakdownOpenId, setBreakdownOpenId, children }) {
  const { t } = useTranslation();
  const breakdown = parseScoreBreakdown(match.scoreBreakdown);
  const open = breakdownOpenId === match.id;
  const statusClass = status === 'ACTIVE'
    ? 'bg-emerald-100 text-emerald-700'
    : status === 'REJECTED'
      ? 'bg-rose-100 text-rose-700'
      : status === 'INACTIVE'
        ? 'bg-slate-100 text-slate-600'
        : 'bg-amber-100 text-amber-700';
  return (
    <div className="bg-(--surface-secondary) border border-(--border) rounded p-2 text-[11px]">
      <div className="flex justify-between items-center gap-2 mb-1">
        <span className="truncate font-bold text-(--text-primary)">{match.sourceFilename}</span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${statusClass}`}>{status}</span>
      </div>
      <div className="flex gap-2 text-[9px] font-bold mb-1">
        <span className="text-indigo-600">{match.relation || 'UNKNOWN'}</span>
        {match.strengthScore != null && <span className="text-(--text-secondary)">{t('evidenceStrength')}: {match.strengthScore}/100 · {match.strengthBand}</span>}
      </div>
      <p className="text-[10px] text-(--text-secondary) line-clamp-3 italic leading-relaxed">"{match.excerpt}"</p>
      {match.explanation && <p className="text-[10px] text-indigo-600 mt-1 leading-relaxed">{match.explanation}</p>}
      {breakdown && (
        <div className="mt-1.5">
          <button onClick={() => setBreakdownOpenId(open ? null : match.id)} className="text-xs font-bold text-(--text-secondary) hover:text-(--brand) flex items-center gap-1">
            <svg className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            {t('evidenceStrengthBreakdown')}
          </button>
          {open && (
            <div className="mt-1.5 space-y-1">
              {BREAKDOWN_LABELS.map(([key, label]) => {
                const item = breakdown[key];
                if (!item || item.max == null) return null;
                const pct = item.max > 0 ? Math.round((item.earned / item.max) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-28 text-[9px] text-(--text-secondary) shrink-0">{t(label)}</span>
                    <div className="flex-1 h-1 bg-(--border) rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[9px] font-bold text-(--text-primary) shrink-0 w-12 text-right">{item.earned}/{item.max}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export default function ContextPanel({
  compact, isOpen, width,
  activeTab, setActiveTab,
  showToast,
  // Source tab
  sources, isUploading, setIsUploading, project, setViewerFile, fetchSources,
  // Feedback tab
  feedbacks, assignedSections, setShowSubmitReviewModal, userProjectRole,
  isLocked,
}) {
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [sourceMode, setSourceMode] = useState('doi');
  const [doiInput, setDoiInput] = useState('');
  const [sourceBusy, setSourceBusy] = useState(false);
  const [attachingSourceId, setAttachingSourceId] = useState(null);
  const fileInputRef = useRef(null);
  const { t, i18n } = useTranslation();
  const [expandedFeedbackId, setExpandedFeedbackId] = useState(null);
  const [feedbackDetail, setFeedbackDetail] = useState({});
  const [answerDrafts, setAnswerDrafts] = useState({});
  const [answeringId, setAnsweringId] = useState(null);
  const [answerErrors, setAnswerErrors] = useState({});

  const submitAnswer = async (item, fb) => {
    const content = (answerDrafts[item.id] || '').trim();
    if (!content) {
      setAnswerErrors(prev => ({ ...prev, [item.id]: t('answerRequired') }));
      return;
    }
    setAnsweringId(item.id);
    setAnswerErrors(prev => ({ ...prev, [item.id]: null }));
    try {
      await api.post(`/api/instructor-feedback/${item.id}/answer`, { content });
      const key = fb.id || fb.requestId;
      setFeedbackDetail(prev => ({
        ...prev,
        [key]: (prev[key] || []).map(f =>
          f.id === item.id ? { ...f, answered: true, answerContent: content } : f),
      }));
      setAnswerDrafts(prev => ({ ...prev, [item.id]: '' }));
    } catch (err) {
      setAnswerErrors(prev => ({ ...prev, [item.id]: err?.response?.data?.message || t('answerFailed') }));
    } finally {
      setAnsweringId(null);
    }
  };

  const toggleFeedbackDetail = async (fb) => {
    const id = fb.id || fb.requestId;
    if (!id) return;
    if (expandedFeedbackId === id) { setExpandedFeedbackId(null); return; }
    setExpandedFeedbackId(id);
    if (!feedbackDetail[id]) {
      try {
        const r = await api.get(`/api/feedback-requests/${id}/feedback`);
        setFeedbackDetail(prev => ({ ...prev, [id]: r.data || [] }));
      } catch { setFeedbackDetail(prev => ({ ...prev, [id]: [] })); }
    }
  };

  const handleAttachPdf = async (sourceId, file) => {
    if (!file || isLocked || attachingSourceId !== null) return;
    setAttachingSourceId(sourceId);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post(`/api/documents/${sourceId}/file`, formData);
      showToast(t('pdfAttached'));
      if (fetchSources) await fetchSources();
    } catch (error) {
      showToast(error?.response?.data?.message || t('attachPdfFailed'));
    } finally {
      setAttachingSourceId(null);
    }
  };

  if (!isOpen) return null;

  const activeClass = (tab) =>
    `flex-1 py-3 text-xs font-bold uppercase tracking-wider flex flex-col justify-center items-center gap-1 transition-all relative ${activeTab === tab ? 'text-(--brand)' : 'text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--surface-secondary)'}`;

  return (
    <>
      <aside data-tour="context-panel" style={{ width: compact ? 'min(24rem, calc(100vw - 3.5rem))' : width }} className="absolute inset-y-0 right-0 z-40 bg-(--surface) border-l border-(--border) flex flex-col shadow-[-8px_0_24px_-6px_rgba(0,0,0,0.25)] overflow-hidden">
        <div className="flex border-b border-(--border) bg-(--surface) relative shrink-0">
          <button data-tour="context-info-tab" onClick={() => setActiveTab('Source')} className={activeClass('Source')}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {t('sources')}
            {activeTab === 'Source' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 shadow-[0_-2px_8px_rgba(79,70,229,0.5)]"></div>}
          </button>
          <button data-tour="context-feedback-tab" onClick={() => setActiveTab('Feedback')} className={activeClass('Feedback')}>
            <div className="relative">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              {feedbacks.length > 0 && <span className="absolute -top-1.5 -right-2 bg-rose-500 text-white flex items-center justify-center text-[9px] w-4 h-4 rounded-full font-bold animate-pulse">{feedbacks.length}</span>}
            </div>
            {t('feedback')}
            {activeTab === 'Feedback' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 shadow-[0_-2px_8px_rgba(79,70,229,0.5)]"></div>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-(--surface-secondary)/50 p-4">
          {activeTab === 'Source' && (
            <div className="p-5 flex flex-col gap-6 animate-in fade-in duration-300">
              <button onClick={() => setShowSourceModal(true)} disabled={isLocked} className="w-full flex items-center justify-center gap-2 bg-(--brand) hover:bg-(--brand-hover) disabled:opacity-40 text-(--on-brand) font-bold text-sm py-3 px-4 rounded-xl shadow-md transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                {t('insertSource')}
              </button>

              {showSourceModal && (
                <div className="bg-(--surface) border border-(--border) rounded-xl p-4 shadow-lg space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-(--text-primary)">{t('addSource')}</span>
                    <button onClick={() => { setShowSourceModal(false); }} className="text-(--text-tertiary) hover:text-(--text-primary) cursor-pointer p-1" aria-label={t('close')}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                  </div>

                  <div className="flex gap-2">
                    {['doi', 'file'].map(m => (
                      <button key={m} onClick={() => { setSourceMode(m); }}
                        className={`flex-1 text-xs font-bold px-2 py-1.5 rounded-lg border transition-colors cursor-pointer ${sourceMode === m ? 'bg-(--brand) text-(--on-brand) border-(--brand)' : 'bg-(--surface-secondary) text-(--text-secondary) border-(--border) hover:border-indigo-300'}`}>
                        {m === 'doi' ? t('fromDOI') : t('fromFile')}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {sourceMode === 'doi' && (
                      <div>
                        <label className="text-xs font-bold text-(--text-secondary) block mb-1">{t('doi')}</label>
                        <input value={doiInput} onChange={e => setDoiInput(e.target.value)} placeholder="10.1000/xyz123" className="w-full text-xs border border-(--border) rounded-lg px-2 py-1.5 bg-(--surface) outline-none focus:ring-1 focus:ring-indigo-500 text-(--text-primary)" />
                      </div>
                    )}
                    {sourceMode === 'file' && (
                      <div>
                        <label className="text-xs font-bold text-(--text-secondary) block mb-1">{t('sourceFile')}</label>
                        <input ref={fileInputRef} type="file" accept=".pdf,.docx" className="block text-xs text-(--text-primary) file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 dark:file:bg-indigo-900/30 file:text-indigo-700 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900/50 cursor-pointer file:cursor-pointer" />
                      </div>
                    )}
                  </div>

                  <button onClick={async () => {
                    if (sourceBusy || !project) return;
                    setSourceBusy(true);
                    try {
                      if (sourceMode === 'doi') {
                        await api.post('/api/documents/ingest/doi', {
                          doi: doiInput.trim(),
                          projectId: project.id,
                        });
                        showToast(t('sourceQueued'));
                      } else {
                        const file = fileInputRef.current?.files?.[0];
                        if (!file) { showToast(t('selectFile')); setSourceBusy(false); return; }
                        const fd = new FormData(); fd.append('file', file); fd.append('projectId', project.id);
                        await api.post('/api/sources', fd);
                        showToast(t('sourceUploaded'));
                      }
                      setShowSourceModal(false); setDoiInput('');
                      if (fetchSources) fetchSources();
                    } catch { showToast(t('failedToAddSource')); }
                    finally { setSourceBusy(false); }
                  }} disabled={sourceBusy || (sourceMode !== 'file' && !doiInput.trim()) || (sourceMode !== 'doi' && !fileInputRef.current?.files?.[0])} className="w-full text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 py-2 rounded-lg transition-all cursor-pointer">
                    {sourceBusy ? t('working') : t('insertSource')}
                  </button>
                </div>
              )}

              <div>
                <h3 className="text-[11px] font-bold text-(--text-tertiary) tracking-widest mb-3 uppercase flex items-center gap-2"><div className="h-px bg-(--border) flex-1"></div> {t('availableSource')} <div className="h-px bg-(--border) flex-1"></div></h3>
                <div className="flex flex-col gap-3">
                  {sources.length === 0 ? <div className="text-sm text-(--text-secondary) italic text-center p-4">{t('noUploadedSources')}</div> : (
                    sources.map(src => {
                      const sourceDownloadUrl = getSourceDownloadUrl(src.processingError);
                      return (
                        <div key={src.id} onClick={() => src.fileUrl && src.fileUrl !== 'pending' ? setViewerFile({ fileUrl: `/api/documents/${src.id}/download`, fileName: src.originalFilename }) : showToast(t('fileUrlUnavailable'))} className="bg-(--surface) border border-(--border) rounded-xl p-3.5 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors cursor-pointer">
                          <p className="text-sm font-bold text-(--text-primary) flex items-center gap-2"><svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" /></svg>{src.originalFilename}</p>
                          {src.processingStatus === 'METADATA_FETCHED' ? (
                            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10px] leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                              <p className="font-bold">{t('metadataFetchedDescription')}</p>
                              {src.processingError && <p className="mt-1 break-words">{t('sourceDownloadFailureReason', { reason: src.processingError })}</p>}
                              {sourceDownloadUrl && (
                                <a
                                  href={sourceDownloadUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  className="mt-1.5 block break-all font-bold text-indigo-700 underline hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-200"
                                >
                                  {t('sourceDownloadLink')}: {sourceDownloadUrl}
                                </a>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-(--text-secondary) mt-1.5 line-clamp-2 leading-relaxed">{t('uploadedSourceDescription')}</p>
                          )}
                          {src.processingStatus === 'METADATA_FETCHED' && (
                            <div className="mt-3">
                              <input
                                id={`attach-pdf-${src.id}`}
                                type="file"
                                accept=".pdf,application/pdf"
                                disabled={isLocked || attachingSourceId !== null}
                                className="peer sr-only"
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = '';
                                  handleAttachPdf(src.id, file);
                                }}
                              />
                              <label
                                htmlFor={`attach-pdf-${src.id}`}
                                aria-disabled={isLocked || attachingSourceId !== null}
                                onClick={(event) => event.stopPropagation()}
                                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2 ${isLocked || attachingSourceId !== null ? 'cursor-not-allowed border-(--border) bg-(--surface-secondary) text-(--text-tertiary)' : 'cursor-pointer border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50'}`}
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 16V4m0 0L8 8m4-4 4 4M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></svg>
                                {attachingSourceId === src.id ? t('working') : t('attachPdf')}
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Feedback' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-200">
              <div className="flex justify-between items-center mb-1 bg-(--surface) border border-(--border) rounded-xl p-3.5 shadow-sm">
                <div>
                  <p className="text-[10px] text-(--text-tertiary) uppercase tracking-wider font-bold">{t('projectStatus')}</p>
                  <p className="text-sm font-bold text-(--text-primary) mt-0.5">{project?.status ? t(`status.${project.status}`, { defaultValue: project.status }) : t('unknown')}</p>
                </div>
                {userProjectRole === 'LEADER' && (project?.status === 'ASSIGNED' || project?.status === 'IN_PROGRESS' || project?.status === 'RETURNED') && <button onClick={() => setShowSubmitReviewModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition-all">{t('submitReview')}</button>}
              </div>
              <h3 className="text-[11px] font-bold text-(--text-tertiary) tracking-widest uppercase flex items-center gap-2 mt-2"><div className="h-px bg-(--border) flex-1"></div> {t('reviewHistory')} <div className="h-px bg-(--border) flex-1"></div></h3>
              <div className="space-y-4">
                {feedbacks.length === 0 ? <div className="text-xs text-(--text-tertiary) italic text-center py-8">{t('noReviews')}</div> : (
                  feedbacks.map((fb, idx) => (
                    <div key={fb.id || idx} className="bg-(--surface) border border-(--border) rounded-xl shadow-sm overflow-hidden">
                      <button type="button" className="w-full text-left bg-(--surface-secondary) border-b border-(--border-light) p-3 flex justify-between items-start cursor-pointer" onClick={() => toggleFeedbackDetail(fb)}>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 flex items-center justify-center font-bold text-xs border border-indigo-200 dark:border-indigo-800">I</div>
                          <div>
                            <p className="text-xs font-bold text-(--text-primary)">{t('instructor')}{fb.instructorName ? `: ${fb.instructorName}` : ''}</p>
                            <p className="text-[9px] text-(--text-tertiary) font-medium">{fb.requestedAt ? new Date(fb.requestedAt).toLocaleString(i18n.language === 'vi' ? 'vi-VN' : 'en-US') : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] px-2 py-0.5 rounded font-black border uppercase ${fb.status === 'PENDING' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 border-amber-200 dark:border-amber-800' : fb.status === 'RETURNED' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 border-rose-200 dark:border-rose-800' : fb.status === 'REVIEWED' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700'}`}>{t(`status.${fb.status}`, { defaultValue: fb.status })}</span>
                          <svg className={`w-3 h-3 text-(--text-tertiary) transition-transform ${expandedFeedbackId === (fb.id || fb.requestId) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                      </button>
                      <div className="p-3 text-xs leading-relaxed text-(--text-primary)">
                        {fb.status === 'PENDING' && <p className="text-amber-600 font-medium italic">{t('reviewPending')}</p>}
                        {fb.status === 'RETURNED' && <p className="text-rose-600 font-medium">{t('reviewReturned')}</p>}
                        {fb.status === 'REVIEWED' && <p className="text-emerald-600 font-medium">{t('reviewApproved')}</p>}
                        {fb.status === 'REJECTED' && <p className="text-rose-600 font-medium">{t('reviewRejected')}</p>}
                        {expandedFeedbackId === (fb.id || fb.requestId) && (
                          <div className="mt-3 space-y-2">
                            {(feedbackDetail[fb.id || fb.requestId] || []).length === 0 ? (
                              <p className="text-[10px] text-(--text-tertiary) italic">{t('noSectionFeedback')}</p>
                            ) : (
                              feedbackDetail[fb.id || fb.requestId].map(item => (
                                <div key={item.id} className="rounded-lg border border-(--border) bg-(--surface-secondary) p-2.5 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{t('sectionLabel', { name: item.sectionTitle || '' })}</span>
                                    {item.stale && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{t('sectionChanged')}</span>}
                                    {item.answered && <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{t('answered')}</span>}
                                  </div>
                                  {item.lineReference && <p className="text-[9px] text-(--text-tertiary) font-mono">{item.lineReference}</p>}
                                  <p className="text-[10px] text-(--text-primary) leading-relaxed">{item.content}</p>
                                  {item.answered && item.answerContent && (
                                    <p className="text-[9px] text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 rounded p-1.5">{t('myAnswer', { answer: item.answerContent })}</p>
                                  )}
                                  {!item.answered && fb.status === 'RETURNED'
                                    && assignedSections.some(section => String(section.id) === String(item.sectionId)) && (
                                      <div className="mt-2 space-y-1.5">
                                        <textarea
                                          value={answerDrafts[item.id] || ''}
                                          onChange={(e) => setAnswerDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                                          placeholder={t('answerPlaceholder')}
                                          aria-label={t('answerFeedback')}
                                          rows="2"
                                          className="w-full text-[10px] border border-(--border) rounded-lg px-2 py-1.5 bg-(--surface) outline-none focus:ring-1 focus:ring-indigo-500 text-(--text-primary)"
                                        />
                                        {answerErrors[item.id] && <p className="text-[9px] text-rose-600">{answerErrors[item.id]}</p>}
                                        <div className="flex justify-end">
                                          <button
                                            type="button"
                                            onClick={() => submitAnswer(item, fb)}
                                            disabled={answeringId === item.id}
                                            className="text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-2.5 py-1 rounded-lg"
                                          >
                                            {answeringId === item.id ? t('answering') : t('answerFeedback')}
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
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
