import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingSkeleton, Modal } from '../index.js';
import FileViewerModal from '../features/FileViewerModal';
import useUndoDelete, { UndoToast } from '../ui/UndoDelete.jsx';
import DeleteConfirm from '../ui/DeleteConfirm.jsx';
import { useLanguage } from '../../context/LanguageContext';
import { commonText, instructorText } from '../../locales';
import {
  PAGINATION_LIMIT,
  DOCUMENT_PROCESSING_STATUSES,
  STATUS_COLOR_MAP,
  API_ROUTES,
} from '../../constants';
import { formatDate } from '../../utils/formatters/date.js';
import api from '../../services/api';

function statusColor(status) {
  return STATUS_COLOR_MAP[status] || STATUS_COLOR_MAP.DEFAULT;
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
  const [viewMode, setViewMode] = useState('grid');
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
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadSources = useCallback(async (options = {}) => {
    if (!options.silent) setLoading(true);
    setError('');
    try {
      const params = {
        page,
        size: PAGINATION_LIMIT,
        sort: 'createdAt,desc',
      };
      if (debouncedQuery) {
        params.q = debouncedQuery;
        params.query = debouncedQuery;
      }
      if (processingStatus) params.processingStatus = processingStatus;
      const response = await api.get(API_ROUTES.SOURCES.BASE, { params });
      const payload = response.data;
      if (Array.isArray(payload)) {
        setSources(payload);
        setTotalPages(1);
        setTotalElements(payload.length);
      } else {
        setSources(payload.content || []);
        setTotalPages(payload.totalPages || 0);
        setTotalElements(payload.totalElements || 0);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || t.sourceLibraryLoadFailed);
      setSources([]);
      setTotalPages(0);
      setTotalElements(0);
    } finally {
      if (!options.silent) setLoading(false);
    }
  }, [debouncedQuery, page, processingStatus, t.sourceLibraryLoadFailed]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const statusOptions = useMemo(() => (
    DOCUMENT_PROCESSING_STATUSES.map(status => ({
      value: status,
      label: ct.statusLabels?.[status] || status.replaceAll('_', ' '),
    }))
  ), [ct.statusLabels]);

  const usageSummary = (source) => {
    const collectionsCount = source.collections?.length || 0;
    const projectsCount = source.projects?.length || 0;
    if (collectionsCount === 0 && projectsCount === 0) {
      return t?.sourceNotUsed || 'Not used in a collection or project';
    }
    const template = t?.sourceUsageSummary || '{{collections}} collections · {{projects}} projects';
    return template
      .replace('{{collections}}', String(collectionsCount))
      .replace('{{projects}}', String(projectsCount));
  };

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

  const handleSaveTitle = async (event) => {
    event.preventDefault();
    const nextTitle = editTitle.trim();
    if (!editingSource) return;
    if (!nextTitle) {
      setEditError(t.sourceTitleRequired);
      return;
    }
    setSaving(true);
    setEditError('');
    try {
      await api.patch(API_ROUTES.SOURCES.BY_ID(editingSource.id), { title: nextTitle });
      setSources(current => current.map(item => (
        item.id === editingSource.id ? { ...item, title: nextTitle } : item
      )));
      closeEdit();
    } catch (requestError) {
      setEditError(requestError.response?.data?.message || t.sourceTitleUpdateFailed);
    } finally {
      setSaving(false);
    }
  };

  const downloadSource = async (source) => {
    setDownloadingId(source.id);
    setError('');
    try {
      const response = await api.get(API_ROUTES.DOCUMENTS.DOWNLOAD(source.id), {
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data], {
        type: source.contentType || 'application/octet-stream',
      }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = source.originalFilename || `source-${source.id}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (requestError) {
      setError(requestError.response?.data?.message || t.sourceDownloadFailed);
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
      await api.post(`/api/sources/${source.id}/retry`);
      setSources(current => current.map(item => (
        item.id === source.id
          ? { ...item, processingStatus: 'QUEUED', processingError: null }
          : item
      )));
      setExpandedErrorId(null);
      setSuccessMessage(t.sourceExtractionRetried);
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
    const template = t?.deleteSourceEverywhereConfirm || 'Delete "{{name}}" everywhere? This removes it from your source library, collections, and projects.';
    let message = template.replace('{{name}}', displayTitle(source));
    if (usageNames.length > 0) {
      const warningTemplate = t?.deleteSourceUsageWarning || 'Currently used in: {{locations}}.';
      message += `\n\n${warningTemplate.replace('{{locations}}', usageNames.join(', '))}`;
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
        await api.delete(API_ROUTES.SOURCES.BY_ID(source.id));
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
    <section aria-label={t.sourceLibrary} className="space-y-6">
      {/* Master Action Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center w-full mb-6 gap-4 border-b border-(--border) pb-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-black text-(--brand-foreground) tracking-tight">{t.sourceLibrary}</h1>
          <p className="text-xs text-(--text-tertiary) mt-1">{t.sourceLibraryDesc || 'Manage every source you uploaded and see where it is currently used.'}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          <label className="sr-only" htmlFor="source-library-search">{t.searchSourceLibrary}</label>
          <input
            id="source-library-search"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t.searchSourceLibrary}
            className="w-full sm:w-52 rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)"
          />

          <label className="sr-only" htmlFor="source-library-status">{ct.status}</label>
          <select
            id="source-library-status"
            value={processingStatus}
            onChange={event => { setProcessingStatus(event.target.value); setPage(0); }}
            className="w-full sm:w-44 rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <option value="">{t.allSourceStatuses}</option>
            {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>

          <div className="flex items-center bg-(--surface-secondary) border border-(--border) rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${viewMode === 'grid' ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
              title="Grid View"
              aria-label="Grid View"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${viewMode === 'list' ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
              title="List View"
              aria-label="List View"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>
          
          <button
            onClick={() => setShowGuide(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-(--surface) border border-(--border) rounded-xl text-xs font-bold text-(--text-secondary) hover:text-(--brand-foreground) hover:border-(--brand) transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
            {ct.guide || 'Guide'}
          </button>
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

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-36 bg-(--surface-tertiary) rounded-2xl animate-pulse" />)}
        </div>
      ) : sources.length === 0 ? (
        <EmptyState title={t.noLibrarySourcesManaged} description={t.noLibrarySourcesManagedDesc} />
      ) : viewMode === 'grid' ? (
        /* Grid View Layout (Mirroring Collections Page Cards) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {sources.map(source => {
            const usageNames = [
              ...(source.collections || []).map(item => item.name),
              ...(source.projects || []).map(item => item.name),
            ].filter(Boolean);
            const downloadable = source.processingStatus === 'READY' || source.processingStatus === 'COMPLETED';
            const previewable = canPreviewPdf(source);
            const recovery = recoveryInfo(source, t);
            const recovering = recoveringSource?.id === source.id;

            return (
              <div
                key={source.id}
                className="bg-(--surface) border border-(--border) rounded-2xl p-5 shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`rounded-md border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${statusColor(source.processingStatus)}`}>
                      {source.processingStatus === 'METADATA_FETCHED' && source.processingError
                        ? t.sourceNeedsPdfStatus
                        : ct.statusLabels?.[source.processingStatus] || source.processingStatus}
                    </span>
                    <span className="text-[10px] text-(--text-tertiary) font-mono">{formatSize(source.fileSizeBytes)}</span>
                  </div>

                  <h3 className="font-bold text-(--text-primary) text-sm line-clamp-2 leading-snug hover:text-(--brand) transition-colors">
                    {displayTitle(source)}
                  </h3>
                  <p className="text-[11px] text-(--text-tertiary) truncate mt-1">{formatDate(source.createdAt, language)}</p>

                  <div className="mt-3 p-2.5 rounded-xl bg-(--surface-secondary) border border-(--border-light)">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-(--text-tertiary)">{t.usedIn}</span>
                    <p className="text-xs font-bold text-(--text-primary) mt-0.5 truncate">{usageSummary(source)}</p>
                    {usageNames.length > 0 && (
                      <p className="text-[10px] text-(--text-tertiary) truncate mt-0.5">{usageNames.join(', ')}</p>
                    )}
                  </div>
                </div>

                <div className="border-t border-(--border-light) pt-3 mt-4">
                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                    {previewable && (
                      <button
                        type="button"
                        onClick={() => setViewerFile({
                          fileUrl: `/api/documents/${source.id}/download`,
                          fileName: source.originalFilename || displayTitle(source),
                        })}
                        disabled={recovering}
                        className="px-2.5 py-1 text-xs font-bold text-(--brand-foreground) bg-(--brand-soft) hover:bg-(--surface-tertiary) rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {t.previewSource}
                      </button>
                    )}
                    {downloadable && (
                      <button
                        type="button"
                        onClick={() => downloadSource(source)}
                        disabled={downloadingId === source.id || recovering}
                        className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {downloadingId === source.id ? t.downloadingSource : t.downloadSource}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(source)}
                      disabled={recovering}
                      className="px-2.5 py-1 text-xs font-bold text-(--text-secondary) hover:bg-(--surface-secondary) rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {ct.edit}
                    </button>
                    <DeleteConfirm
                      message={getDeleteSourceMessage(source)}
                      onConfirm={() => deleteSource(source)}
                      triggerLabel={ct.delete}
                      confirmLabel={t.deleteEverywhere}
                      cancelLabel={ct.cancel}
                      disabled={deletingId === source.id || recovering}
                      className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {deletingId === source.id ? t.deletingSource : ct.delete}
                    </DeleteConfirm>
                    {recovery && (
                      recovery.action === 'retry' ? (
                        <button
                          type="button"
                          onClick={() => retrySource(source)}
                          disabled={recovering}
                          className="px-2.5 py-1 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                        >
                          {recovering && recoveringSource?.action === 'retry' ? t.retryingSource : t.retrySource}
                        </button>
                      ) : (
                        <label className="px-2.5 py-1 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1">
                          <input
                            type="file"
                            accept=".pdf,application/pdf"
                            className="hidden"
                            disabled={recovering}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              uploadSourcePdf(source, file);
                            }}
                          />
                          {recovering && recoveringSource?.action === 'upload' ? t.uploadingSourcePdf : t.uploadSourcePdf}
                        </label>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View Layout */
        <div className="space-y-3">
          {sources.map(source => {
            const usageNames = [
              ...(source.collections || []).map(item => item.name),
              ...(source.projects || []).map(item => item.name),
            ].filter(Boolean);
            const downloadable = source.processingStatus === 'READY' || source.processingStatus === 'COMPLETED';
            const previewable = canPreviewPdf(source);
            const recovery = recoveryInfo(source, t);
            const recovering = recoveringSource?.id === source.id;
            const recoveryPanelClass = source.processingStatus === 'FAILED'
              ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100'
              : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100';

            return (
              <article
                key={source.id}
                aria-labelledby={`source-title-${source.id}`}
                className="rounded-2xl border border-(--border) bg-(--surface) p-5 shadow-xs transition-colors hover:border-(--border-strong)"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${statusColor(source.processingStatus)}`}>
                        {source.processingStatus === 'METADATA_FETCHED' && source.processingError
                          ? t.sourceNeedsPdfStatus
                          : ct.statusLabels?.[source.processingStatus] || source.processingStatus}
                      </span>
                      <span className="text-[10px] text-(--text-tertiary) font-mono">{formatSize(source.fileSizeBytes)}</span>
                      {source.originalFilename && source.title && (
                        <span className="truncate text-xs text-(--text-tertiary)">({source.originalFilename})</span>
                      )}
                    </div>

                    <h2 id={`source-title-${source.id}`} className="text-base font-bold text-(--text-primary)">
                      {displayTitle(source)}
                    </h2>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-(--text-tertiary)">
                      <span>{t.uploadedOn}: <strong className="text-(--text-secondary)">{formatDate(source.createdAt, language)}</strong></span>
                      <span>{t.usedIn}: <strong className="text-(--text-secondary)">{usageSummary(source)}</strong></span>
                    </div>

                    {usageNames.length > 0 && (
                      <p className="text-xs text-(--text-tertiary)">
                        {usageNames.join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {previewable && (
                      <button
                        type="button"
                        onClick={() => setViewerFile({
                          fileUrl: `/api/documents/${source.id}/download`,
                          fileName: source.originalFilename || displayTitle(source),
                        })}
                        disabled={recovering}
                        className="cursor-pointer rounded-xl bg-(--brand-soft) px-3 py-2 text-xs font-bold text-(--brand-foreground) transition-colors hover:bg-(--surface-tertiary) focus:outline-none focus:ring-2 focus:ring-(--focus) disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t.previewSource}
                      </button>
                    )}

                    {downloadable && (
                      <button
                        type="button"
                        onClick={() => downloadSource(source)}
                        disabled={downloadingId === source.id || recovering}
                        className="cursor-pointer rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-(--focus) disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {downloadingId === source.id ? t.downloadingSource : t.downloadSource}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openEdit(source)}
                      disabled={recovering}
                      className="cursor-pointer rounded-xl border border-(--border) bg-(--surface) px-3 py-2 text-xs font-bold text-(--text-secondary) transition-colors hover:bg-(--surface-secondary) focus:outline-none focus:ring-2 focus:ring-(--focus) disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {ct.edit}
                    </button>

                    <DeleteConfirm
                      message={getDeleteSourceMessage(source)}
                      onConfirm={() => deleteSource(source)}
                      triggerLabel={t.deleteEverywhere}
                      confirmLabel={t.deleteEverywhere}
                      cancelLabel={ct.cancel}
                      disabled={deletingId === source.id || recovering}
                      className="cursor-pointer rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
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
      )}

      {totalPages > 1 && (
        <nav aria-label={t.sourceLibraryPagination} className="flex items-center justify-center gap-3 pt-4">
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

      <Modal open={!!editingSource} onClose={closeEdit} title={t.editSourceTitle} closeLabel={ct.close}>
        <form onSubmit={handleSaveTitle} className="space-y-4">
          <p className="text-xs text-(--text-secondary)">{t.editSourceTitleDesc}</p>
          <div className="space-y-1.5">
            <label htmlFor="source-edit-title" className="text-[10px] font-black uppercase tracking-wide text-(--text-secondary)">
              {t.sourceTitle} <span className="text-rose-500">*</span>
            </label>
            <input id="source-edit-title" type="text" value={editTitle}
              onChange={event => setEditTitle(event.target.value)}
              placeholder={editingSource?.originalFilename || t.sourceTitle}
              className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2.5 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)" />
          </div>
          {editError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{editError}</p>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-(--border-light) pt-4">
            <button type="button" onClick={closeEdit} disabled={saving}
              className="cursor-pointer rounded-xl border border-(--border) px-4 py-2 text-xs font-bold text-(--text-secondary) transition-colors hover:bg-(--surface-secondary) focus:outline-none focus:ring-2 focus:ring-(--focus) disabled:cursor-not-allowed disabled:opacity-50">
              {ct.cancel}
            </button>
            <button type="submit" disabled={saving}
              className="cursor-pointer rounded-xl bg-(--brand) px-4 py-2 text-xs font-bold text-(--on-brand) shadow-sm transition-colors hover:bg-(--brand-hover) focus:outline-none focus:ring-2 focus:ring-(--focus) disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? ct.saving : ct.save}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={showGuide} onClose={() => setShowGuide(false)} title={language === 'vi' ? 'Hướng dẫn Thư viện Nguồn' : 'Source Library Guide'} closeLabel={ct.close}>
        <ol className="space-y-3 text-xs">
          {[
            language === 'vi' ? 'Quản lý tập trung toàn bộ các tài liệu và bài báo đã được tải lên hoặc nạp qua DOI trong hệ thống.' : 'Centrally manage all uploaded papers and DOI-ingested documents across your collections.',
            language === 'vi' ? 'Xem trạng thái xử lý chi tiết (READY, PROCESSING, FAILED, METADATA_FETCHED) và kích thước tệp.' : 'Track processing statuses (READY, PROCESSING, FAILED, METADATA_FETCHED) and file sizes.',
            language === 'vi' ? 'Khôi phục nhanh: Sử dụng nút Thử lại hoặc Tải PDF trực tiếp inline trên thẻ khi gặp lỗi trích xuất hoặc bị chặn.' : 'Quick recovery: Retry extraction or upload missing PDFs directly from the action bar if downloads were blocked.',
            language === 'vi' ? 'Xem nhanh nội dung PDF bằng trình xem trước tích hợp hoặc tải về máy tính bất cứ lúc nào.' : 'Preview PDF files directly with the built-in document viewer or download copies anytime.'
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-(--brand) text-(--on-brand) text-[10px] font-black flex items-center justify-center">{i + 1}</span>
              <span className="text-(--text-secondary) leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </Modal>

      {viewerFile && (
        <FileViewerModal
          fileUrl={viewerFile.fileUrl}
          fileName={viewerFile.fileName}
          onClose={() => setViewerFile(null)}
        />
      )}
      <UndoToast pending={pendingDelete} onUndo={undoDelete} onDismiss={dismissDelete} />
    </section>
  );
}
