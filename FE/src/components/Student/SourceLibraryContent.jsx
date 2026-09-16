import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api.js';
import { prepareProjectDoiImport } from '../../utils/student/doiImport.js';
import { getSourceDownloadUrl } from '../../utils/student/sourceDownload.js';
import PaperReferencesPanel from './PaperReferencesPanel.jsx';

// ponytail: Sources body extracted from ContextPanel so the Instructor review left
// column can reuse it without duplicating logic. Owns its own UI state.
export default function SourceLibraryContent({
  sources, project, isLocked, setViewerFile, fetchSources, onOpenSourceMap,
  paperReferences = [], referencesLoading = false, referencesError = '',
  referenceSourceIds = null, canMutateReferences = false,
  onAddReference, onRemoveReference, onReferencesChanged,
  showToast, readOnly = false, compact = false,
}) {
  const { t } = useTranslation();
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');
  const [sourceMode, setSourceMode] = useState('doi');
  const [doiInput, setDoiInput] = useState('');
  const [doiErrors, setDoiErrors] = useState([]);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [attachingSourceId, setAttachingSourceId] = useState(null);
  const fileInputRef = useRef(null);

  const handleAttachPdf = async (sourceId, file) => {
    if (!file || isLocked || attachingSourceId !== null) return;
    setAttachingSourceId(sourceId);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post(`/api/documents/${sourceId}/file`, formData);
      showToast(t('pdfAttached'));
      if (fetchSources) await fetchSources();
      if (onReferencesChanged) await onReferencesChanged();
    } catch (error) {
      showToast(t('attachPdfFailed'));
    } finally {
      setAttachingSourceId(null);
    }
  };

  const handleAddSource = async () => {
    if (sourceBusy || !project) return;
    const doiRequest = sourceMode === 'doi'
      ? prepareProjectDoiImport(doiInput, project.id)
      : null;
    if (sourceMode === 'doi' && !doiRequest) return;

    setSourceBusy(true);
    try {
      if (doiRequest) {
        const response = await api.post(doiRequest.url, doiRequest.body);
        const failures = (doiRequest.dois.length === 1
          ? (response.data?.processingError
              ? [{ doi: doiRequest.dois[0], error: response.data.processingError }]
              : [])
          : (response.data?.failed || []))
          .map(item => ({ ...item, error: item.error || t('failedToAddSource') }));

        if (fetchSources) await fetchSources();
        if (failures.length > 0) {
          const succeeded = response.data?.succeeded?.length
          ?? Math.max(doiRequest.dois.length - failures.length, 0);
          setDoiErrors(failures);
          setDoiInput(failures.map(item => item.doi).filter(Boolean).join('\n'));
          showToast(t('doiImportSummary', { succeeded, failed: failures.length }));
          return;
        }

        setDoiErrors([]);
        setDoiInput('');
        setShowSourceModal(false);
        showToast(t('sourceQueued'));
        return;
      }

      const file = fileInputRef.current?.files?.[0];
      if (!file) { showToast(t('selectFile')); return; }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', project.id);
      await api.post('/api/sources', formData);
      showToast(t('sourceUploaded'));
      setShowSourceModal(false);
      if (fetchSources) await fetchSources();
    } catch (error) {
      const message = error?.response?.data?.message
        || error?.response?.data?.detail
        || t('failedToAddSource');
      if (doiRequest) {
        setDoiErrors(doiRequest.dois.map(doi => ({ doi, error: message })));
      }
      showToast(message);
    } finally {
      setSourceBusy(false);
    }
  };

  const visibleSources = (sources || []).filter(src => (src.originalFilename || '').toLowerCase().includes(sourceSearchQuery.trim().toLowerCase()));

  return (
    // ponytail: review (compact) lives inside the FilePanel scroll container, so the root
    // stays bare — padding/scroll come from the parent and no overflow-* may trap sticky.
    // Student keeps its original classes untouched.
    <div className={compact
      ? 'flex min-w-0 flex-col gap-4'
      : 'p-5 gap-6 flex flex-col min-w-0 max-w-full overflow-x-hidden animate-in fade-in duration-300'}>
      {/* ponytail: review-only sticky band mirrors the Media Asset search bar (FilePanel.jsx); student tab keeps the plain row. */}
      <div className={compact
        ? 'sticky top-0 z-10 -mx-3 flex items-center gap-2 border-b border-(--border) bg-(--surface-secondary) px-3 py-2'
        : 'flex items-center gap-2'}>
        <input type="text" value={sourceSearchQuery} onChange={event => setSourceSearchQuery(event.target.value)} placeholder={t('searchSources')}
          aria-label={t('searchSources')}
          className="min-w-0 flex-1 text-xs border border-(--border) rounded-lg px-2.5 py-2 bg-(--surface) outline-none focus:ring-1 focus:ring-indigo-500 text-(--text-primary)" />
        {!readOnly && <button type="button" onClick={() => { setDoiErrors([]); setShowSourceModal(true); }} disabled={isLocked}
          className="group shrink-0 flex items-center overflow-hidden bg-(--brand) hover:bg-(--brand-hover) disabled:opacity-40 disabled:hover:bg-(--brand) text-(--on-brand) font-bold text-xs h-8 rounded-lg shadow-sm transition-colors" title={t('insertSource')} aria-label={t('insertSource')}>
          <span className="flex items-center justify-center w-8 h-8 shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
          </span>
          <span className="max-w-0 group-hover:max-w-[140px] group-focus-visible:max-w-[140px] group-hover:pr-3 group-focus-visible:pr-3 overflow-hidden whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-all duration-200">{t('insertSource')}</span>
        </button>}
        <button type="button" onClick={onOpenSourceMap} aria-haspopup="dialog" title={t('sourceMap.title')} aria-label={t('sourceMap.title')}
          className="group shrink-0 flex items-center overflow-hidden h-8 rounded-lg border border-(--border) bg-(--surface) text-(--text-secondary) hover:text-(--brand-foreground) hover:bg-(--surface-secondary) focus-visible:ring-2 focus-visible:ring-(--brand) transition-colors">
          <span className="flex items-center justify-center w-8 h-8 shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
          </span>
          <span className="max-w-0 group-hover:max-w-[140px] group-focus-visible:max-w-[140px] group-hover:pr-2.5 group-focus-visible:pr-2.5 overflow-hidden whitespace-nowrap text-xs font-semibold opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-all duration-200">{t('sourceMap.title')}</span>
        </button>
      </div>

      {showSourceModal && (
        <div className="bg-(--surface) border border-(--border) rounded-xl p-4 shadow-lg space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-(--text-primary)">{t('addSource')}</span>
            <button onClick={() => { setShowSourceModal(false); setDoiErrors([]); }} className="text-(--text-tertiary) hover:text-(--text-primary) cursor-pointer p-1" aria-label={t('close')}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>

          <div className="flex gap-2">
            {['doi', 'file'].map(m => (
              <button key={m} onClick={() => { setSourceMode(m); setDoiErrors([]); }}
                className={`flex-1 text-xs font-bold px-2 py-1.5 rounded-lg border transition-colors cursor-pointer ${sourceMode === m ? 'bg-(--brand) text-(--on-brand) border-(--brand)' : 'bg-(--surface-secondary) text-(--text-secondary) border-(--border) hover:border-indigo-300'}`}>
                {m === 'doi' ? t('fromDOI') : t('fromFile')}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {sourceMode === 'doi' && (
              <div>
                <label htmlFor="student-doi-input" className="text-xs font-bold text-(--text-secondary) block mb-1">{t('doi')}</label>
                <textarea
                  id="student-doi-input"
                  rows={3}
                  value={doiInput}
                  onChange={event => { setDoiInput(event.target.value); setDoiErrors([]); }}
                  placeholder={t('doiBatchPlaceholder')}
                  className="w-full resize-y text-xs border border-(--border) rounded-lg px-2 py-1.5 bg-(--surface) outline-none focus:ring-1 focus:ring-indigo-500 text-(--text-primary)"
                />
                <p className="mt-1 text-[10px] leading-relaxed text-(--text-tertiary)">{t('doiBatchHint')}</p>
                {doiErrors.length > 0 && (
                  <div className="mt-2 space-y-1" role="alert">
                    {doiErrors.map((item, index) => (
                      <p key={`${item.doi}-${index}`} className="break-words rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[10px] font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
                        {item.doi}: {item.error}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
            {sourceMode === 'file' && (
              <div>
                <label className="text-xs font-bold text-(--text-secondary) block mb-1">{t('sourceFile')}</label>
                <input ref={fileInputRef} type="file" accept=".pdf,.docx" className="block text-xs text-(--text-primary) file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 dark:file:bg-indigo-900/30 file:text-indigo-700 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900/50 cursor-pointer file:cursor-pointer" />
              </div>
            )}
          </div>

          <button onClick={handleAddSource} disabled={sourceBusy || (sourceMode !== 'file' && !doiInput.trim()) || (sourceMode !== 'doi' && !fileInputRef.current?.files?.[0])} className="w-full text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 py-2 rounded-lg transition-all cursor-pointer">
            {sourceBusy ? t('working') : sourceMode === 'doi' ? t('importDoi') : t('insertSource')}
          </button>
        </div>
      )}

      <div>
        <h3 className="text-[11px] font-bold text-(--text-tertiary) tracking-widest mb-3 uppercase flex items-center gap-2"><div className="h-px bg-(--border) flex-1"></div> {t('references')} <div className="h-px bg-(--border) flex-1"></div></h3>
        <PaperReferencesPanel
          references={paperReferences}
          loading={referencesLoading}
          error={referencesError}
          canMutate={canMutateReferences && !readOnly}
          isLocked={isLocked}
          attachingId={attachingSourceId}
          onRemove={onRemoveReference}
          onAttach={handleAttachPdf}
        />
      </div>

      <div>
        <h3 className="text-[11px] font-bold text-(--text-tertiary) tracking-widest mb-3 uppercase flex items-center gap-2"><div className="h-px bg-(--border) flex-1"></div> {t('availableSource')} <div className="h-px bg-(--border) flex-1"></div></h3>
        <div className="flex flex-col gap-3">
          {visibleSources.length === 0 ? <div className="text-sm text-(--text-secondary) italic text-center p-4">{sources.length === 0 ? t('noUploadedSources') : t('sourceMap.noMatches')}</div> : (
            visibleSources.map(src => {
              const sourceDownloadUrl = getSourceDownloadUrl(src.processingError);
              return (
                <div key={src.id} onClick={() => src.fileUrl && src.fileUrl !== 'pending' ? setViewerFile({ fileUrl: `/api/documents/${src.id}/download`, fileName: src.originalFilename }) : showToast(t('fileUrlUnavailable'))} className={`bg-(--surface) border border-(--border) rounded-xl ${compact ? 'p-2.5' : 'p-3.5'} hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors cursor-pointer min-w-0`}>
                  <p className="text-sm font-bold text-(--text-primary) flex items-center gap-2 min-w-0"><svg className="w-4 h-4 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" /></svg><span className="truncate break-words">{src.originalFilename}</span></p>
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
                  {!readOnly && src.processingStatus === 'METADATA_FETCHED' && (
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
                  {!readOnly && canMutateReferences && onAddReference && !referenceSourceIds?.has(String(src.id)) && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); onAddReference(src.id); }}
                        disabled={isLocked}
                        title={t('addToReferences')}
                        className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-(--border) bg-(--surface) px-3 py-1.5 text-[11px] font-bold text-(--text-secondary) transition-colors hover:text-indigo-600 hover:border-indigo-300 focus-visible:ring-2 focus-visible:ring-(--brand) disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                      >
                        {t('addToReferences')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
