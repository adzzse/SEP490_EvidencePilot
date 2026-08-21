import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingSkeleton, Modal } from '../../components';
import FileViewerModal from '../../components/FileViewerModal';
import useUndoDelete, { UndoToast } from '../../components/UndoDelete.jsx';
import DeleteConfirm from '../../components/DeleteConfirm.jsx';
import { useLanguage } from '../../context/LanguageContext';
import { commonText, instructorText } from '../../locales';
import api from '../../api';

const PAGE_SIZE = 10;
const PROCESSING_STATUSES = [
  'PENDING_UPLOAD', 'UPLOADED', 'METADATA_FETCHED', 'PDF_DOWNLOADED', 'QUEUED',
  'PROCESSING', 'RAW_EXTRACTED', 'READY', 'COMPLETED', 'PARTIAL', 'FAILED',
];

function statusColor(status) {
  if (status === 'READY' || status === 'COMPLETED') return 'border-emerald-200 bg-emerald-100 text-emerald-700';
  if (status === 'FAILED') return 'border-rose-200 bg-rose-100 text-rose-700';
  if (status === 'PARTIAL' || status === 'METADATA_FETCHED') return 'border-amber-200 bg-amber-100 text-amber-700';
  return 'border-slate-200 bg-slate-100 text-slate-600';
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayTitle(source) {
  return source.title || source.originalFilename || source.id;
}

function initialTitle(source) {
  if (source.title) return source.title;
  return (source.originalFilename || '').replace(/\.[^.]+$/, '');
}

function canPreviewPdf(source) {
  const contentType = (source.contentType || '').toLowerCase();
  const filename = source.originalFilename || '';
  return Number(source.fileSizeBytes) > 0
    && (contentType.includes('pdf') || /\.pdf$/i.test(filename));
}

function sourceErrorCode(source) {
  if (/not a valid PDF|HTML bot-block page/i.test(source.processingError || '')) {
    return 'UPSTREAM_PDF_BLOCKED';
  }
  const httpMatch = source.processingError?.match(/\bHTTP\s+(\d{3})\b/i);
  if (httpMatch) return `HTTP ${httpMatch[1]}`;
  return source.processingStatus === 'METADATA_FETCHED' ? 'PDF_REQUIRED' : 'EXTRACTION_FAILED';
}

function recoveryInfo(source, t) {
  const errorCode = sourceErrorCode(source);
  if (source.processingStatus === 'FAILED') {
    let description = t.sourceExtractionFailedDesc;
    if (errorCode === 'HTTP 503') description = t.sourceExtractionUnavailable;
    else if (/timed?\s*out|timeout/i.test(source.processingError || '')) description = t.sourceExtractionTimedOut;
    return {
      action: 'retry',
      code: errorCode,
      title: t.sourceExtractionFailed,
      description,
    };
  }
  if (source.processingStatus === 'METADATA_FETCHED' && source.processingError) {
    const automaticDownloadBlocked = errorCode === 'UPSTREAM_PDF_BLOCKED'
      || /^HTTP (403|429|503)$/.test(errorCode);
    return {
      action: 'upload',
      code: errorCode,
      title: t.sourceNeedsPdf,
      description: automaticDownloadBlocked
        ? t.sourceAutomaticDownloadBlocked
        : t.sourceManualUploadRequired,
    };
  }
  return null;
}

export default function SourceLibraryPanel() {
  const { language } = useLanguage();
  const t = instructorText[language];
  const ct = commonText[language];
  const { pending: pendingDelete, start: startDelete, undo: undoDelete, dismiss: dismissDelete } = useUndoDelete();
  const undoStrings = {
    header: t.undoHeader,
    bodyTemplate: t.undoBodyTemplate,
    caution: t.undoCaution,
    undoLabel: t.undoLabel,
    undoRemaining: t.undoRemaining,
    dismissLabel: t.dismissLabel,
  };
  const [sources, setSources] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [expandedErrorId, setExpandedErrorId] = useState(null);
  const [recoveringSource, setRecoveringSource] = useState(null);
  const [editingSource, setEditingSource] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [viewerFile, setViewerFile] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = setTimeout(() => setSuccessMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const loadSources = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/sources', {
        params: {
          page,
          size: PAGE_SIZE,
          sort: 'createdAt,desc',
          q: debouncedQuery || undefined,
          processingStatus: processingStatus || undefined,
        },
      });
      setSources(response.data?.content || []);
      setTotalPages(response.data?.totalPages || 0);
      setTotalElements(response.data?.totalElements || 0);
    } catch (requestError) {
      if (!silent) {
        setSources([]);
        setTotalPages(0);
        setTotalElements(0);
      }
      setError(requestError.response?.data?.message || t.sourceLibraryLoadFailed);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [debouncedQuery, page, processingStatus, t.sourceLibraryLoadFailed]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const usageSummary = useCallback((source) => {
    const parts = [];
    if (source.collections?.length) {
      parts.push(t.collectionUsageCount.replace('{{count}}', source.collections.length));
    }
    if (source.projects?.length) {
      parts.push(t.projectUsageCount.replace('{{count}}', source.projects.length));
    }
    return parts.join(' · ') || t.sourceNotUsed;
  }, [t.collectionUsageCount, t.projectUsageCount, t.sourceNotUsed]);

  const statusOptions = useMemo(() => PROCESSING_STATUSES.map(status => ({
    value: status,
    label: status === 'METADATA_FETCHED'
      ? t.sourceNeedsPdfStatus
      : ct.statusLabels?.[status] || status.replaceAll('_', ' '),
  })), [ct.statusLabels, t.sourceNeedsPdfStatus]);

  const openEdit = (source) => {
    setEditingSource(source);
    setEditTitle(initialTitle(source));
    setEditError('');
  };

  const closeEdit = () => {
    if (saving) return;
    setEditingSource(null);
    setEditTitle('');
    setEditError('');
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    const title = editTitle.trim();
    if (!editingSource || !title || saving) return;
    setSaving(true);
    setEditError('');
    try {
      const response = await api.put(`/api/sources/${editingSource.id}`, { title });
      setSources(current => current.map(source => (
        source.id === editingSource.id ? response.data : source
      )));
      setEditingSource(null);
      setEditTitle('');
      setEditError('');
    } catch (requestError) {
      setEditError(requestError.response?.data?.message || t.sourceUpdateFailed);
    } finally {
      setSaving(false);
    }
  };

  const downloadSource = async (source) => {
    setDownloadingId(source.id);
    setError('');
    try {
      const response = await api.get(`/api/documents/${source.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = source.originalFilename || 'source';
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.message || t.downloadFailed);
    } finally {
      setDownloadingId(null);
    }
  };

  const retrySource = async (source) => {
    if (recoveringSource) return;
    setRecoveringSource({ id: source.id, action: 'retry' });
    setError('');
    setSuccessMessage('');
    try {
      await api.post(`/api/documents/${source.id}/re-extract`);
      setSources(current => current.map(item => (
        item.id === source.id
          ? { ...item, processingStatus: 'QUEUED', processingError: null }
          : item
      )));
      setExpandedErrorId(null);
      setSuccessMessage(t.sourceRetryQueued);
      await loadSources({ silent: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || t.sourceRetryFailed);
    } finally {
      setRecoveringSource(null);
    }
  };

  const uploadSourcePdf = async (source, file) => {
    if (!file || recoveringSource) return;
    if (!file.name?.toLowerCase().endsWith('.pdf')) {
      setError(t.sourcePdfOnly);
      return;
    }
    setRecoveringSource({ id: source.id, action: 'upload' });
    setError('');
    setSuccessMessage('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post(`/api/documents/${source.id}/file`, formData);
      setSources(current => current.map(item => (
        item.id === source.id
          ? { ...item, processingStatus: 'QUEUED', processingError: null }
          : item
      )));
      setExpandedErrorId(null);
      setSuccessMessage(t.sourcePdfUploaded);
      await loadSources({ silent: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || t.sourcePdfUploadFailed);
    } finally {
      setRecoveringSource(null);
    }
  };

  const getDeleteSourceMessage = (source) => {
    const usageNames = [
      ...(source.collections || []).map(item => item.name),
      ...(source.projects || []).map(item => item.name),
    ].filter(Boolean);
    let message = t.deleteSourceEverywhereConfirm.replace('{{name}}', displayTitle(source));
    if (usageNames.length > 0) {
      message += `\n\n${t.deleteSourceUsageWarning.replace('{{locations}}', usageNames.join(', '))}`;
    }
    return message;
  };

  const deleteSource = async (source) => {
    const message = getDeleteSourceMessage(source);
    const sid = String(source.id);
    setSources(prev => prev.filter(s => String(s.id) !== sid));
    startDelete({
      ...undoStrings,
      bodyTemplate: undefined,
      message,
      entityName: displayTitle(source),
      entityDetails: source.id,
    }, async () => {
      setDeletingId(source.id);
      setError('');
      try {
        await api.delete(`/api/sources/${source.id}`);
        if (sources.length === 1 && page > 0) {
          setPage(current => current - 1);
        } else {
          await loadSources();
        }
      } catch (requestError) {
        setError(requestError.response?.data?.message || t.sourceDeleteFailed);
        await loadSources();
      } finally {
        setDeletingId(null);
      }
    }, () => { loadSources(); });
  };

  return (
    <section aria-labelledby="source-library-tab" className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-(--border) bg-(--surface) p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black text-(--brand-foreground)">{t.sourceLibrary}</p>
          <p className="mt-1 text-xs text-(--text-tertiary)">{t.sourceLibraryDesc}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <label className="sr-only" htmlFor="source-library-search">{t.searchSourceLibrary}</label>
          <input id="source-library-search" type="search" value={query}
            onChange={event => setQuery(event.target.value)} placeholder={t.searchSourceLibrary}
            className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus) sm:w-56" />
          <label className="sr-only" htmlFor="source-library-status">{ct.status}</label>
          <select id="source-library-status" value={processingStatus}
            onChange={event => { setProcessingStatus(event.target.value); setPage(0); }}
            className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus) sm:w-44">
            <option value="">{t.allSourceStatuses}</option>
            {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700">
          {error}
        </div>
      )}
      {successMessage && (
        <div role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-700">
          {successMessage}
        </div>
      )}

      {loading ? <LoadingSkeleton count={5} height="h-24" /> : sources.length === 0 ? (
        <EmptyState title={t.noLibrarySourcesManaged} description={t.noLibrarySourcesManagedDesc} />
      ) : (
        <>
          <div className="flex items-center justify-between text-[11px] font-semibold text-(--text-tertiary)">
            <span>{t.sourceLibraryCount.replace('{{count}}', totalElements)}</span>
            <span>{t.page} {page + 1} {t.of} {Math.max(totalPages, 1)}</span>
          </div>
          <div role="list" className="space-y-3">
            {sources.map(source => {
              const usageNames = [
                ...(source.collections || []).map(item => item.name),
                ...(source.projects || []).map(item => item.name),
              ].filter(Boolean);
              const downloadable = source.processingStatus === 'READY' || source.processingStatus === 'COMPLETED';
              const previewable = canPreviewPdf(source);
              const recovery = recoveryInfo(source, t);
              const recovering = recoveringSource?.id === source.id;
              const recoveryPanelClass = recovery?.action === 'retry'
                ? 'border-rose-200 bg-rose-50 text-rose-900'
                : 'border-amber-200 bg-amber-50 text-amber-900';
              return (
                <article key={source.id} role="listitem"
                  className="rounded-2xl border border-(--border) bg-(--surface) p-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--brand-soft) text-(--brand-foreground)" aria-hidden="true">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 0v5h5M9 13h6M9 17h6" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-black text-(--text-primary)">{displayTitle(source)}</h2>
                        <p className="mt-0.5 truncate text-[11px] text-(--text-tertiary)">{source.originalFilename || '—'}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusColor(source.processingStatus)}`}>
                            {source.processingStatus === 'METADATA_FETCHED' && source.processingError
                              ? t.sourceNeedsPdfStatus
                              : ct.statusLabels?.[source.processingStatus] || source.processingStatus}
                          </span>
                          <span className="text-[10px] text-(--text-tertiary)">{formatSize(source.fileSizeBytes)}</span>
                          <span className="text-[10px] text-(--text-tertiary)">
                            {source.createdAt ? new Date(source.createdAt).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US') : '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 lg:w-72">
                      <p className="text-[10px] font-black uppercase tracking-wider text-(--text-tertiary)">{t.usedIn}</p>
                      <p className="mt-1 text-xs font-bold text-(--text-secondary)">{usageSummary(source)}</p>
                      {usageNames.length > 0 && (
                        <p className="mt-1 truncate text-[10px] text-(--text-tertiary)" title={usageNames.join(', ')}>
                          {usageNames.join(', ')}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      {previewable && (
                        <button type="button"
                          onClick={() => setViewerFile({
                            fileUrl: `/api/documents/${source.id}/download`,
                            fileName: source.originalFilename || displayTitle(source),
                          })}
                          disabled={recovering}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-(--border) bg-(--brand-soft) px-3 py-2 text-[11px] font-bold text-(--brand-foreground) transition-colors hover:bg-(--surface-tertiary) focus:outline-none focus:ring-2 focus:ring-(--focus) disabled:cursor-not-allowed disabled:opacity-50">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                            <circle cx="12" cy="12" r="2.5" strokeWidth="2" />
                          </svg>
                          {t.previewSource}
                        </button>
                      )}
                      {downloadable && (
                        <button type="button" onClick={() => downloadSource(source)} disabled={downloadingId === source.id || recovering}
                          className="cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-(--focus) disabled:cursor-not-allowed disabled:opacity-50">
                          {downloadingId === source.id ? t.downloadingSource : t.downloadSource}
                        </button>
                      )}
                      <button type="button" onClick={() => openEdit(source)} disabled={recovering}
                        className="cursor-pointer rounded-lg border border-(--border) bg-(--surface-secondary) px-3 py-2 text-[11px] font-bold text-(--text-secondary) transition-colors hover:bg-(--surface-tertiary) focus:outline-none focus:ring-2 focus:ring-(--focus) disabled:cursor-not-allowed disabled:opacity-50">
                        {ct.edit}
                      </button>
                      <DeleteConfirm message={getDeleteSourceMessage(source)} onConfirm={() => deleteSource(source)} triggerLabel={t.deleteEverywhere} confirmLabel={t.deleteEverywhere} cancelLabel={ct.cancel} disabled={deletingId === source.id || recovering}
                        className="cursor-pointer rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-(--focus) disabled:cursor-not-allowed disabled:opacity-50">
                        {deletingId === source.id ? t.deletingSource : t.deleteEverywhere}
                      </DeleteConfirm>
                    </div>
                  </div>

                  {recovery && (
                    <div className={`mt-4 rounded-xl border p-3.5 ${recoveryPanelClass}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-black">{recovery.title}</p>
                          <p className="mt-1 text-[11px] leading-relaxed opacity-90">{recovery.description}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                            <span className="font-bold">
                              {t.sourceErrorCode}: <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono">{recovery.code}</code>
                            </span>
                            {source.processingError && (
                              <button type="button"
                                aria-expanded={expandedErrorId === source.id}
                                aria-controls={`source-error-${source.id}`}
                                onClick={() => setExpandedErrorId(current => current === source.id ? null : source.id)}
                                className="cursor-pointer font-bold underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-(--focus)">
                                {expandedErrorId === source.id ? t.hideErrorDetails : t.showErrorDetails}
                              </button>
                            )}
                          </div>
                          {expandedErrorId === source.id && source.processingError && (
                            <p id={`source-error-${source.id}`} className="mt-2 break-all rounded-lg border border-current/15 bg-white/60 p-2 font-mono text-[10px] leading-relaxed">
                              {source.processingError}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 sm:self-start">
                          {recovery.action === 'retry' ? (
                            <button type="button" onClick={() => retrySource(source)} disabled={!!recoveringSource}
                              className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-(--brand) px-4 py-2 text-[11px] font-black text-(--on-brand) shadow-sm transition-colors hover:bg-(--brand-hover) focus:outline-none focus:ring-2 focus:ring-(--focus) disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                              <svg className={`h-4 w-4 ${recovering ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h5M20 20v-5h-5M5.6 15A7 7 0 0 0 18 17M18.4 9A7 7 0 0 0 6 7" />
                              </svg>
                              {recovering && recoveringSource?.action === 'retry' ? t.retryingSource : t.retrySource}
                            </button>
                          ) : (
                            <>
                              <input id={`source-library-pdf-${source.id}`} type="file"
                                accept=".pdf,application/pdf" className="peer sr-only"
                                disabled={!!recoveringSource}
                                onChange={event => {
                                  const file = event.target.files?.[0];
                                  event.target.value = '';
                                  uploadSourcePdf(source, file);
                                }} />
                              <label htmlFor={`source-library-pdf-${source.id}`} aria-disabled={!!recoveringSource}
                                className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-(--brand) px-4 py-2 text-[11px] font-black text-(--on-brand) shadow-sm transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-(--focus) sm:w-auto ${recoveringSource ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-(--brand-hover)'}`}>
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 16V4m0 0L8 8m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                                </svg>
                                {recovering && recoveringSource?.action === 'upload' ? t.uploadingSourcePdf : t.uploadSourcePdf}
                              </label>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {totalPages > 1 && (
            <nav aria-label={t.sourceLibraryPagination} className="flex items-center justify-center gap-3 pt-2">
              <button type="button" onClick={() => setPage(current => Math.max(0, current - 1))} disabled={page === 0 || loading}
                className="cursor-pointer rounded-lg border border-(--border) bg-(--surface) px-4 py-2 text-xs font-bold text-(--text-secondary) transition-colors hover:bg-(--surface-secondary) focus:outline-none focus:ring-2 focus:ring-(--focus) disabled:cursor-not-allowed disabled:opacity-50">
                {t.prev}
              </button>
              <span className="text-xs font-semibold text-(--text-tertiary)">{page + 1} / {totalPages}</span>
              <button type="button" onClick={() => setPage(current => Math.min(totalPages - 1, current + 1))} disabled={page + 1 >= totalPages || loading}
                className="cursor-pointer rounded-lg border border-(--border) bg-(--surface) px-4 py-2 text-xs font-bold text-(--text-secondary) transition-colors hover:bg-(--surface-secondary) focus:outline-none focus:ring-2 focus:ring-(--focus) disabled:cursor-not-allowed disabled:opacity-50">
                {t.next}
              </button>
            </nav>
          )}
        </>
      )}

      {viewerFile && (
        <FileViewerModal
          fileUrl={viewerFile.fileUrl}
          fileName={viewerFile.fileName}
          onClose={() => setViewerFile(null)}
        />
      )}

      <Modal open={!!editingSource} onClose={closeEdit} title={t.editSourceTitle} closeLabel={ct.close}>
        <form onSubmit={saveEdit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label htmlFor="source-title" className="text-[10px] font-black uppercase tracking-wide text-(--text-secondary)">
              {t.sourceTitle} <span className="text-rose-500">*</span>
            </label>
            <input id="source-title" value={editTitle} onChange={event => setEditTitle(event.target.value)}
              maxLength={255} required autoFocus placeholder={t.sourceTitlePlaceholder}
              className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-3 font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)" />
            <p className="text-[10px] text-(--text-tertiary)">{editingSource?.originalFilename}</p>
          </div>
          {editError && <p role="alert" className="text-xs font-semibold text-rose-600">{editError}</p>}
          <div className="flex gap-3 border-t border-(--border-light) pt-4 font-bold">
            <button type="button" onClick={closeEdit} disabled={saving}
              className="flex-1 cursor-pointer rounded-xl border border-(--border) bg-(--surface-secondary) py-3 text-(--text-secondary) transition-colors hover:bg-(--surface-tertiary) disabled:cursor-not-allowed disabled:opacity-50">
              {ct.cancel}
            </button>
            <button type="submit" disabled={saving || !editTitle.trim()}
              className="flex-1 cursor-pointer rounded-xl bg-(--brand) py-3 text-(--on-brand) shadow-md transition-colors hover:bg-(--brand-hover) disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? ct.saving : ct.save}
            </button>
          </div>
        </form>
      </Modal>

      {pendingDelete && <UndoToast pending={pendingDelete} onUndo={undoDelete} onDismiss={dismissDelete} />}
    </section>
  );
}
