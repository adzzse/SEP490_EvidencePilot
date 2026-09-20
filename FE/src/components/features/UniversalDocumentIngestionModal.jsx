import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../services/api.js';
import Modal from '../ui/Modal.jsx';
import UploadZone from './UploadZone.jsx';
import { useTranslation } from 'react-i18next';
import {
  ENTITY_TYPES,
  INGESTION_TABS,
  DEFAULT_PROJECT_INGESTION_TABS,
  DEFAULT_COLLECTION_INGESTION_TABS,
  API_ROUTES,
  DEFAULT_PAGE,
  MAX_BATCH_FETCH_SIZE,
  ACCEPTED_DOCUMENT_EXTENSIONS,
  STATUS_COLOR_MAP,
  DOCUMENT_PROCESSING_STATUS,
  DOCUMENT_PROCESSING_STATUSES,
} from '../../constants';

function statusColor(s) {
  return STATUS_COLOR_MAP[s] || STATUS_COLOR_MAP.DEFAULT;
}

export default function UniversalDocumentIngestionModal({
  open,
  onClose,
  entityType = ENTITY_TYPES.COLLECTION,
  entityId,
  onSuccess,
  allowedTabs,
  title,
  existingSourceIds = [],
}) {
  const { t } = useTranslation();

  // Resolve tabs according to entityType if allowedTabs is not specified
  const effectiveTabs = useMemo(() => {
    if (Array.isArray(allowedTabs) && allowedTabs.length > 0) {
      return allowedTabs;
    }
    if (entityType === ENTITY_TYPES.PROJECT) {
      return DEFAULT_PROJECT_INGESTION_TABS;
    }
    return DEFAULT_COLLECTION_INGESTION_TABS;
  }, [allowedTabs, entityType]);

  const [activeOption, setActiveOption] = useState(effectiveTabs[0] || INGESTION_TABS.DOI);

  // DOI Tab State
  const [doiInput, setDoiInput] = useState('');
  const [doiSubmitting, setDoiSubmitting] = useState(false);
  const [doiError, setDoiError] = useState('');
  const [doiBatchResult, setDoiBatchResult] = useState(null);

  // Upload Tab State
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [pendingBatchFiles, setPendingBatchFiles] = useState(null);
  const [batchFailedDetails, setBatchFailedDetails] = useState(null);

  // Choose from Collection Tab State (for Projects)
  const [collections, setCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [collectionSources, setCollectionSources] = useState([]);
  const [collectionSourcesLoading, setCollectionSourcesLoading] = useState(false);
  const [collectionSourceQuery, setCollectionSourceQuery] = useState('');
  const [selectedCollectionSourceIds, setSelectedCollectionSourceIds] = useState(() => new Set());
  const [collectionSubmitting, setCollectionSubmitting] = useState(false);
  const [collectionError, setCollectionError] = useState('');

  // Choose from Library Tab State
  const [librarySources, setLibrarySources] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [selectedLibraryIds, setSelectedLibraryIds] = useState(() => new Set());
  const [librarySubmitting, setLibrarySubmitting] = useState(false);
  const statusLabel = status => t(`status.${DOCUMENT_PROCESSING_STATUSES.includes(status) ? status : 'UNKNOWN'}`);

  // Helper to validate if a source document is already inserted/associated
  const isSourceAlreadyInserted = useCallback((doc) => {
    if (!doc) return false;
    const docIdStr = String(doc.id);

    // 1. Check against existingSourceIds prop
    if (existingSourceIds) {
      if (Array.isArray(existingSourceIds) && existingSourceIds.some(id => String(id) === docIdStr)) {
        return true;
      }
      if (existingSourceIds instanceof Set && (existingSourceIds.has(docIdStr) || existingSourceIds.has(doc.id))) {
        return true;
      }
    }

    // 2. In PROJECT context, check if doc is already associated with this project
    if (entityType === ENTITY_TYPES.PROJECT && entityId) {
      const targetProjId = String(entityId);
      if (String(doc.projectId) === targetProjId) return true;
      if (Array.isArray(doc.projectIds) && doc.projectIds.some(pid => String(pid) === targetProjId)) return true;
      // rationale: library DTO uses projects:[{id}] instead of projectIds
      if (Array.isArray(doc.projects) && doc.projects.some(p => String(p?.id) === targetProjId)) return true;
    }

    // 3. In COLLECTION context, check if doc is already associated with this collection
    if (entityType === ENTITY_TYPES.COLLECTION && entityId) {
      const targetColId = String(entityId);
      if (String(doc.collectionId) === targetColId) return true;
      if (Array.isArray(doc.collectionIds) && doc.collectionIds.some(cid => String(cid) === targetColId)) return true;
      // rationale: library DTO uses collections:[{id}]
      if (Array.isArray(doc.collections) && doc.collections.some(c => String(c?.id) === targetColId)) return true;
    }

    return false;
  }, [existingSourceIds, entityType, entityId]);

  // Reset state when modal opens or active tab changes
  useEffect(() => {
    if (open) {
      if (!effectiveTabs.includes(activeOption)) {
        setActiveOption(effectiveTabs[0] || INGESTION_TABS.DOI);
      }
      setDoiError('');
      setDoiBatchResult(null);
      setUploadError('');
      setCollectionError('');
      setLibraryError('');
      setPendingBatchFiles(null);
      setBatchFailedDetails(null);
    }
  }, [open, effectiveTabs, activeOption]);

  // Load Collections when Collection tab is active in PROJECT context
  useEffect(() => {
    if (!open || activeOption !== INGESTION_TABS.COLLECTION) return;
    let active = true;
    setCollectionsLoading(true);
    setCollectionError('');
    api.get(API_ROUTES.COLLECTIONS.BASE, { params: { page: DEFAULT_PAGE, size: MAX_BATCH_FETCH_SIZE } })
      .then(res => {
        if (!active) return;
        const list = res.data?.content || res.data || [];
        setCollections(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (active) setCollectionError(t('shared.ingestion.collectionListLoadFailed'));
      })
      .finally(() => {
        if (active) setCollectionsLoading(false);
      });
    return () => { active = false; };
  }, [open, activeOption, t]);

  // Load sources when a collection is selected
  useEffect(() => {
    if (!open || activeOption !== INGESTION_TABS.COLLECTION || !selectedCollectionId) {
      setCollectionSources([]);
      setSelectedCollectionSourceIds(new Set());
      return;
    }
    let active = true;
    setCollectionSourcesLoading(true);
    setCollectionError('');
    api.get(API_ROUTES.COLLECTIONS.SOURCES(selectedCollectionId))
      .then(res => {
        if (!active) return;
        const list = res.data?.content || res.data || [];
        const sourceList = Array.isArray(list) ? list : [];
        setCollectionSources(sourceList);

        // Pre-check any sources that are already inserted into the current project
        const alreadyInsertedIds = new Set();
        sourceList.forEach(doc => {
          if (isSourceAlreadyInserted(doc)) {
            alreadyInsertedIds.add(doc.id);
          }
        });
        setSelectedCollectionSourceIds(alreadyInsertedIds);
      })
      .catch(() => {
        if (active) setCollectionError(t('shared.ingestion.collectionSourcesLoadFailed'));
      })
      .finally(() => {
        if (active) setCollectionSourcesLoading(false);
      });
    return () => { active = false; };
  }, [open, activeOption, selectedCollectionId, isSourceAlreadyInserted, t]);

  // Load Library sources when Library tab is active
  useEffect(() => {
    if (!open || activeOption !== INGESTION_TABS.LIBRARY) return;
    let active = true;
    setLibraryLoading(true);
    setLibraryError('');

    const endpoint = entityType === ENTITY_TYPES.COLLECTION
      ? API_ROUTES.COLLECTIONS.LIBRARY_SOURCES(entityId)
      : API_ROUTES.SOURCES.BASE;

    api.get(endpoint, { params: { size: MAX_BATCH_FETCH_SIZE } })
      .then(res => {
        if (!active) return;
        const list = res.data?.content || res.data || [];
        const sourceList = Array.isArray(list) ? list : [];
        setLibrarySources(sourceList);

        // Pre-check any sources that are already inserted
        const alreadyInsertedIds = new Set();
        sourceList.forEach(doc => {
          if (isSourceAlreadyInserted(doc)) {
            alreadyInsertedIds.add(doc.id);
          }
        });
        setSelectedLibraryIds(alreadyInsertedIds);
      })
      .catch(() => {
        if (active) setLibraryError(t('shared.ingestion.libraryLoadFailed'));
      })
      .finally(() => {
        if (active) setLibraryLoading(false);
      });

    return () => { active = false; };
  }, [open, activeOption, entityType, entityId, isSourceAlreadyInserted, t]);

  // Handle DOI Ingestion
  const handleDoiBatchSubmit = async (e) => {
    e.preventDefault();
    setDoiError('');
    setDoiBatchResult(null);

    const dois = doiInput
      .split(/[\n,;]+/)
      .map(d => d.trim())
      .filter(Boolean);

    if (dois.length === 0) {
      setDoiError(t('shared.ingestion.doiRequired'));
      return;
    }

    setDoiSubmitting(true);
    try {
      const payload = entityType === ENTITY_TYPES.PROJECT
        ? { dois, projectId: entityId }
        : { dois, collectionId: entityId };

      const res = await api.post(API_ROUTES.DOCUMENTS.INGEST_DOI_BATCH, payload);

      if (res.data?.failed && res.data.failed.length > 0) {
        setDoiBatchResult(res.data);
      } else {
        setDoiInput('');
        if (onSuccess) await onSuccess();
        onClose();
      }
    } catch (err) {
      setDoiError(err.response?.data?.message || t('shared.ingestion.uploadFailed'));
    } finally {
      setDoiSubmitting(false);
    }
  };

  // Handle Multi-file Upload — re-batch failed-only slice on 207
  const handleUploadFiles = async (files) => {
    const fileList = Array.from(files || []);
    if (fileList.length === 0) return;
    setUploadingFiles(true);
    setUploadError('');
    setPendingBatchFiles(fileList);
    setBatchFailedDetails(null);

    const buildForm = (list) => {
      const fd = new FormData();
      list.forEach(f => fd.append('files', f));
      if (entityType === ENTITY_TYPES.PROJECT) fd.append('projectId', entityId);
      else fd.append('collectionId', entityId);
      return fd;
    };

    try {
      const res = await api.post(API_ROUTES.SOURCES.BATCH, buildForm(fileList));
      const failed = res.data?.failed || [];
      if (failed.length > 0) {
        setBatchFailedDetails(failed);
        const failedIdx = new Set(failed.map(f => f.index));
        const remaining = fileList.filter((_, idx) => failedIdx.has(idx));
        setPendingBatchFiles(remaining);
        if (onSuccess && res.data?.succeeded?.length > 0) await onSuccess();
      } else {
        setPendingBatchFiles(null);
        setBatchFailedDetails(null);
        if (onSuccess) await onSuccess();
        onClose();
      }
    } catch (err) {
      const failed = err.response?.data?.failed;
      if (failed && failed.length > 0) {
        setBatchFailedDetails(failed);
        const failedIdx = new Set(failed.map(f => f.index));
        const remaining = fileList.filter((_, idx) => failedIdx.has(idx));
        setPendingBatchFiles(remaining);
        if (err.response?.data?.succeeded?.length > 0 && onSuccess) await onSuccess();
      } else {
        setUploadError(err.response?.data?.message || t('shared.ingestion.uploadFailed'));
      }
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleRetryBatch = async () => {
    if (!pendingBatchFiles || pendingBatchFiles.length === 0 || !batchFailedDetails) return;
    await handleUploadFiles(pendingBatchFiles);
  };

  // Handle Adding Sources from Collection to Project
  const handleAddFromCollectionSubmit = async () => {
    if (selectedCollectionSourceIds.size === 0 || !selectedCollectionId) return;
    setCollectionSubmitting(true);
    setCollectionError('');

    // Filter to only sources not already in the project to avoid redundant API calls
    const sourceIdsToShare = Array.from(selectedCollectionSourceIds).filter(sourceId => {
      const doc = collectionSources.find(s => String(s.id) === String(sourceId));
      return !isSourceAlreadyInserted(doc);
    });

    if (sourceIdsToShare.length === 0) {
      if (onSuccess) await onSuccess();
      onClose();
      return;
    }

    // rationale: block non-ready docs before POST so a 409 never looks like success
    const notReady = sourceIdsToShare
      .map(sid => collectionSources.find(s => String(s.id) === String(sid)))
      .filter(doc => doc && !['READY', 'COMPLETED'].includes(doc.processingStatus));
    if (notReady.length > 0) {
      setCollectionError(t('shared.ingestion.sourceNotReady', {
        sources: notReady.map(d => `${d.title || d.originalFilename || d.id} (${statusLabel(d.processingStatus)})`).join(', '),
      }));
      setCollectionSubmitting(false);
      return;
    }

    const results = await Promise.allSettled(
      sourceIdsToShare.map((sourceId) =>
        api.post(API_ROUTES.COLLECTIONS.SHARE_SOURCE(selectedCollectionId, sourceId, entityId)))
    );
    const failed = sourceIdsToShare.filter((_, i) => results[i].status === 'rejected');

    setCollectionSubmitting(false);
    if (failed.length > 0) {
      const firstMsg = failed.map((_, k) => {
        const r = results[sourceIdsToShare.indexOf(failed[k])];
        return r.reason?.response?.data?.message;
      }).find(Boolean);
      const titles = new Map(collectionSources.map(s => [String(s.id), s.title || s.originalFilename || s.id]));
      setCollectionError(`${firstMsg || t('shared.ingestion.shareToProjectFailed')} ${failed.map(fid => titles.get(String(fid)) || fid).join(', ')}`);
      if (failed.length < sourceIdsToShare.length && onSuccess) await onSuccess();
      return;
    }
    // rationale: library list caches projects[] — force refetch so new share shows checked there
    setLibrarySources([]);
    setSelectedCollectionSourceIds(new Set());
    if (onSuccess) await onSuccess();
    onClose();
  };

  // Handle Adding Sources from Library
  const handleAddFromLibrarySubmit = async () => {
    if (selectedLibraryIds.size === 0) return;
    setLibrarySubmitting(true);
    setLibraryError('');

    const sourceIdsToAdd = Array.from(selectedLibraryIds).filter(sid => {
      const doc = librarySources.find(s => String(s.id) === String(sid));
      return !isSourceAlreadyInserted(doc);
    });

    if (sourceIdsToAdd.length === 0) {
      if (onSuccess) await onSuccess();
      onClose();
      return;
    }

    if (entityType === ENTITY_TYPES.COLLECTION) {
      try {
        await api.post(API_ROUTES.COLLECTIONS.BATCH_SOURCES(entityId), {
          sourceIds: sourceIdsToAdd,
        });
      } catch (err) {
        setLibraryError(err.response?.data?.message || t('shared.ingestion.libraryAddFailed'));
        setLibrarySubmitting(false);
        return;
      }
      setLibrarySubmitting(false);
      if (onSuccess) await onSuccess();
      onClose();
      return;
    }

    // Project context: share via library endpoint (works for standalone + collection docs,
    // preserves collection link so Collection tab keeps showing it checked).
    const notReady = sourceIdsToAdd
      .map(sid => librarySources.find(s => String(s.id) === String(sid)))
      .filter(doc => doc && !['READY', 'COMPLETED'].includes(doc.processingStatus));
    if (notReady.length > 0) {
      setLibraryError(t('shared.ingestion.sourceNotReady', {
        sources: notReady.map(d => `${d.title || d.originalFilename || d.id} (${statusLabel(d.processingStatus)})`).join(', '),
      }));
      setLibrarySubmitting(false);
      return;
    }

    const results = await Promise.allSettled(
      sourceIdsToAdd.map((sid) => api.post(API_ROUTES.SOURCES.SHARE_TO_PROJECT(sid, entityId)))
    );
    const failed = sourceIdsToAdd.filter((_, i) => results[i].status === 'rejected');

    setLibrarySubmitting(false);
    if (failed.length > 0) {
      const firstMsg = failed.map((fid) => {
        const r = results[sourceIdsToAdd.indexOf(fid)];
        return r.reason?.response?.data?.message;
      }).find(Boolean);
      const titles = new Map(librarySources.map(s => [String(s.id), s.title || s.originalFilename || s.id]));
      setLibraryError(`${firstMsg || t('shared.ingestion.libraryAddFailed')}: ${failed.map(fid => titles.get(String(fid)) || fid).join(', ')}`);
      if (failed.length < sourceIdsToAdd.length && onSuccess) await onSuccess();
      return;
    }
    // rationale: collection tab caches projectIds — stale checked state until refetch
    setCollectionSources([]);
    setSelectedLibraryIds(new Set());
    if (onSuccess) await onSuccess();
    onClose();
  };

  // Tab Definitions Metadata
  const TAB_METADATA = {
    [INGESTION_TABS.DOI]: {
      key: INGESTION_TABS.DOI,
      label: t('shared.ingestion.inputDoi'),
      desc: t('shared.ingestion.inputDoiDescription'),
    },
    [INGESTION_TABS.UPLOAD]: {
      key: INGESTION_TABS.UPLOAD,
      label: t('shared.ingestion.uploadDocument'),
      desc: t('shared.ingestion.uploadDocumentDescription'),
    },
    [INGESTION_TABS.COLLECTION]: {
      key: INGESTION_TABS.COLLECTION,
      label: t('shared.ingestion.chooseFromCollection'),
      desc: t('shared.ingestion.chooseFromCollectionDesc'),
    },
    [INGESTION_TABS.LIBRARY]: {
      key: INGESTION_TABS.LIBRARY,
      label: t('shared.ingestion.chooseFromLibrary'),
      desc: t('shared.ingestion.chooseFromLibraryDescription'),
    },
  };

  const filteredCollectionSources = useMemo(() => {
    if (!collectionSourceQuery.trim()) return collectionSources;
    const q = collectionSourceQuery.trim().toLowerCase();
    return collectionSources.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.originalFilename || '').toLowerCase().includes(q) ||
      (s.doi || '').toLowerCase().includes(q)
    );
  }, [collectionSources, collectionSourceQuery]);

  const filteredLibrarySources = useMemo(() => {
    if (!libraryQuery.trim()) return librarySources;
    const q = libraryQuery.trim().toLowerCase();
    return librarySources.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.originalFilename || '').toLowerCase().includes(q) ||
      (s.doi || '').toLowerCase().includes(q)
    );
  }, [librarySources, libraryQuery]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || t('shared.ingestion.addDocument')}
      closeLabel={t('close')}
    >
      <div className="space-y-4 text-xs">
        {/* Dynamic Horizontal Segmented Tab Selector */}
        <div
          className={`grid gap-2 grid-cols-1 ${
            effectiveTabs.length === 4
              ? 'sm:grid-cols-2 lg:grid-cols-4'
              : effectiveTabs.length === 3
              ? 'sm:grid-cols-3'
              : 'sm:grid-cols-2'
          }`}
          role="tablist"
          aria-label={t('shared.ingestion.addDocument')}
        >
          {effectiveTabs.map(tabKey => {
            const meta = TAB_METADATA[tabKey];
            if (!meta) return null;
            const isSelected = activeOption === tabKey;
            return (
              <button
                key={tabKey}
                id={`add-doc-tab-${tabKey}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls="add-doc-panel"
                onClick={() => setActiveOption(tabKey)}
                className={`w-full cursor-pointer rounded-xl border p-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-(--focus) ${
                  isSelected
                    ? 'bg-(--brand-soft) border-indigo-400 dark:border-indigo-600 shadow-xs'
                    : 'bg-(--surface) border-(--border) hover:border-indigo-300 hover:bg-(--surface-secondary)'
                }`}
              >
                <p className="font-bold text-(--text-primary)">{meta.label}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-(--text-tertiary)">{meta.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Input DOI Panel */}
        {activeOption === INGESTION_TABS.DOI && (
          <form onSubmit={handleDoiBatchSubmit} id="add-doc-panel" role="tabpanel" className="space-y-4">
            <p className="text-xs text-(--text-secondary)">
              {t('shared.ingestion.doiInstructions')}
            </p>
            <textarea
              rows="4"
              value={doiInput}
              onChange={e => setDoiInput(e.target.value)}
              placeholder="10.1038/s41586-020-2649-2&#10;10.1145/3313831.3376727"
              required
              className="w-full px-4 py-3 bg-(--surface-secondary) border border-(--border) rounded-xl text-(--text-primary) font-mono text-xs focus:outline-none focus:ring-2 focus:ring-(--focus) transition-colors resize-y"
            />
            {doiError && (
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
                {doiError}
              </p>
            )}
            {doiBatchResult && doiBatchResult.failed?.length > 0 && (
              <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <p className="font-bold">
                  {t('shared.ingestion.doiBatchPartial', { count: doiBatchResult.succeeded?.length || 0 })}
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  {doiBatchResult.failed.map((f, idx) => (
                    <li key={idx}><span className="font-mono">{f.doi}</span>: {f.error}</li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="submit"
              disabled={doiSubmitting || !doiInput.trim()}
              className="w-full py-3 bg-(--brand) text-(--on-brand) font-bold text-xs rounded-xl hover:bg-(--brand-hover) transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {doiSubmitting ? t('saving') : t('shared.ingestion.submitDoi')}
            </button>
          </form>
        )}

        {/* Tab 2: Upload Document Panel */}
        {activeOption === INGESTION_TABS.UPLOAD && (
          <div id="add-doc-panel" role="tabpanel" className="space-y-4">
            <p className="text-xs text-(--text-secondary)">
              {t('shared.ingestion.uploadInstructions')}
            </p>
            <UploadZone
              onUpload={handleUploadFiles}
              accept={ACCEPTED_DOCUMENT_EXTENSIONS}
              label={t('shared.ingestion.dropFiles')}
            />
            <div className="flex items-center justify-between text-xs text-(--text-tertiary) px-1">
              <span>{t('shared.ingestion.multiFileSupported')}</span>
              <label className="cursor-pointer text-(--brand) font-bold hover:underline">
                <input
                  type="file"
                  multiple
                  accept={ACCEPTED_DOCUMENT_EXTENSIONS}
                  className="hidden"
                  onChange={e => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleUploadFiles(e.target.files);
                    }
                  }}
                />
                {t('shared.ingestion.selectMultipleFiles')}
              </label>
            </div>
            {uploadingFiles && (
              <div className="p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-xs font-bold text-center animate-pulse">
                {t('shared.ingestion.uploadingFiles')}
              </div>
            )}
            {batchFailedDetails && batchFailedDetails.length > 0 && (
              <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <p className="font-bold">
                  {t('shared.ingestion.batchFailureSummary', {
                    failed: batchFailedDetails.length,
                    remaining: pendingBatchFiles?.length || 0,
                  })}
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  {batchFailedDetails.map((f) => (
                    <li key={f.index}><span className="font-mono">{f.filename}</span> [{f.errorCode}] {f.errorMessage} {f.retryable ? '' : t('shared.ingestion.notRetryable')}</li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button type="button" onClick={handleRetryBatch} disabled={uploadingFiles || !batchFailedDetails.some(f=>f.retryable)} className="px-3 py-1.5 bg-(--brand) text-(--on-brand) rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer">
                    {t('shared.ingestion.retryFailedFiles')}
                  </button>
                  <button type="button" onClick={() => { setBatchFailedDetails(null); setPendingBatchFiles(null); }} className="px-3 py-1.5 bg-(--surface) border border-(--border) rounded-lg text-xs font-bold cursor-pointer">
                    {t('shared.ingestion.commonDismiss')}
                  </button>
                </div>
              </div>
            )}
            {uploadError && (
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
                {uploadError}
              </p>
            )}
          </div>
        )}

        {/* Tab 3: Choose from Collection Panel (PROJECT Context) */}
        {activeOption === INGESTION_TABS.COLLECTION && (
          <div id="add-doc-panel" role="tabpanel" className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-(--text-secondary) mb-1.5">
                {t('shared.ingestion.selectCuratedCollection')}
              </label>
              {collectionsLoading ? (
                <div className="h-10 bg-(--surface-secondary) rounded-xl animate-pulse" />
              ) : collections.length === 0 ? (
                <p className="text-xs italic text-(--text-tertiary)">
                  {t('shared.ingestion.noCuratedCollections')}
                </p>
              ) : (
                <select
                  value={selectedCollectionId}
                  onChange={e => setSelectedCollectionId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-(--surface-secondary) border border-(--border) rounded-xl text-xs font-medium text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)"
                >
                  <option value="">{t('shared.ingestion.selectCollectionPlaceholder')}</option>
                  {collections.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.title} {c.totalSources ? t('shared.ingestion.collectionSourceCount', { count: c.totalSources }) : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedCollectionId && (
              <div className="space-y-3 pt-2 border-t border-(--border-light)">
                <div className="flex items-center justify-between">
                  <div className="relative flex-1 mr-3">
                    <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-tertiary)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                    </svg>
                    <input
                      value={collectionSourceQuery}
                      onChange={e => setCollectionSourceQuery(e.target.value)}
                      placeholder={t('shared.ingestion.searchCollectionSources')}
                      className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) py-2 pl-8 pr-3 text-xs text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)"
                    />
                  </div>
                  {filteredCollectionSources.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedCollectionSourceIds.size === filteredCollectionSources.length) {
                          setSelectedCollectionSourceIds(new Set());
                        } else {
                          setSelectedCollectionSourceIds(new Set(filteredCollectionSources.map(s => s.id)));
                        }
                      }}
                      className="text-xs font-bold text-(--brand) hover:underline shrink-0 cursor-pointer"
                    >
                      {selectedCollectionSourceIds.size === filteredCollectionSources.length
                        ? t('shared.ingestion.deselectAll')
                        : t('shared.ingestion.selectAll')}
                    </button>
                  )}
                </div>

                {collectionSourcesLoading ? (
                  <div className="space-y-2">
                    <div className="h-10 bg-(--surface-secondary) rounded-xl animate-pulse" />
                    <div className="h-10 bg-(--surface-secondary) rounded-xl animate-pulse" />
                  </div>
                ) : filteredCollectionSources.length === 0 ? (
                  <p className="p-4 text-center text-xs italic text-(--text-tertiary) bg-(--surface-secondary) rounded-xl">
                    {t('shared.ingestion.noCollectionSources')}
                  </p>
                ) : (
                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {filteredCollectionSources.map(doc => {
                      const isSelected = selectedCollectionSourceIds.has(doc.id);
                      const isAlreadyInserted = isSourceAlreadyInserted(doc);
                      return (
                        <label
                          key={doc.id}
                          className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-(--brand-soft) border-indigo-300 dark:border-indigo-700 shadow-2xs'
                              : 'bg-(--surface-secondary)/50 border-(--border) hover:bg-(--surface-secondary)'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedCollectionSourceIds(prev => {
                                const next = new Set(prev);
                                if (next.has(doc.id)) next.delete(doc.id);
                                else next.add(doc.id);
                                return next;
                              });
                            }}
                            className="mt-0.5 h-4 w-4 rounded accent-violet-600 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-xs text-(--text-primary) truncate">
                                {doc.title || doc.originalFilename || t('shared.ingestion.unnamed')}
                              </p>
                              {isAlreadyInserted && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  {entityType === ENTITY_TYPES.PROJECT
                                    ? t('shared.ingestion.inProject')
                                    : t('shared.ingestion.inCollection')}
                                </span>
                              )}
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusColor(doc.processingStatus)}`}>
                                {statusLabel(doc.processingStatus)}
                              </span>
                            </div>
                            <p className="text-[10px] text-(--text-tertiary) truncate mt-0.5">
                              {doc.originalFilename || doc.doi || t('shared.ingestion.sourceFile')}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                {collectionError && (
                  <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
                    {collectionError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleAddFromCollectionSubmit}
                  disabled={collectionSubmitting || selectedCollectionSourceIds.size === 0}
                  className="w-full py-3 bg-(--brand) text-(--on-brand) font-bold text-xs rounded-xl hover:bg-(--brand-hover) transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {collectionSubmitting
                    ? t('saving')
                    : t('shared.ingestion.shareSelectedToProject', { count: selectedCollectionSourceIds.size })}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Choose from Library Panel */}
        {activeOption === INGESTION_TABS.LIBRARY && (
          <div id="add-doc-panel" role="tabpanel" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 mr-3">
                <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-tertiary)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                </svg>
                <input
                  value={libraryQuery}
                  onChange={e => setLibraryQuery(e.target.value)}
                  placeholder={t('shared.ingestion.searchLibrarySources')}
                  className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) py-2 pl-8 pr-3 text-xs text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)"
                />
              </div>
              {filteredLibrarySources.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedLibraryIds.size === filteredLibrarySources.length) {
                      setSelectedLibraryIds(new Set());
                    } else {
                      setSelectedLibraryIds(new Set(filteredLibrarySources.map(s => s.id)));
                    }
                  }}
                  className="text-xs font-bold text-(--brand) hover:underline shrink-0 cursor-pointer"
                >
                  {selectedLibraryIds.size === filteredLibrarySources.length
                    ? t('shared.ingestion.deselectAll')
                    : t('shared.ingestion.selectAll')}
                </button>
              )}
            </div>

            {libraryLoading ? (
              <div className="space-y-2">
                <div className="h-10 bg-(--surface-secondary) rounded-xl animate-pulse" />
                <div className="h-10 bg-(--surface-secondary) rounded-xl animate-pulse" />
              </div>
            ) : filteredLibrarySources.length === 0 ? (
              <p className="p-4 text-center text-xs italic text-(--text-tertiary) bg-(--surface-secondary) rounded-xl">
                {t('shared.ingestion.noLibrarySources')}
              </p>
            ) : (
              <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
                {filteredLibrarySources.map(doc => {
                  const isSelected = selectedLibraryIds.has(doc.id);
                  const isAlreadyInserted = isSourceAlreadyInserted(doc);
                  return (
                    <label
                      key={doc.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-(--brand-soft) border-indigo-300 dark:border-indigo-700 shadow-2xs'
                          : 'bg-(--surface-secondary)/50 border-(--border) hover:bg-(--surface-secondary)'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedLibraryIds(prev => {
                            const next = new Set(prev);
                            if (next.has(doc.id)) next.delete(doc.id);
                            else next.add(doc.id);
                            return next;
                          });
                        }}
                        className="mt-0.5 h-4 w-4 rounded accent-violet-600 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-xs text-(--text-primary) truncate">
                            {doc.title || doc.originalFilename || t('shared.ingestion.unnamed')}
                          </p>
                          {isAlreadyInserted && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              {entityType === ENTITY_TYPES.PROJECT
                                ? t('shared.ingestion.inProject')
                                : t('shared.ingestion.inCollection')}
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusColor(doc.processingStatus)}`}>
                            {statusLabel(doc.processingStatus)}
                          </span>
                        </div>
                        <p className="text-[10px] text-(--text-tertiary) truncate mt-0.5">
                          {doc.originalFilename || doc.doi || t('shared.ingestion.sourceFile')}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {libraryError && (
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
                {libraryError}
              </p>
            )}

            <button
              type="button"
              onClick={handleAddFromLibrarySubmit}
              disabled={librarySubmitting || selectedLibraryIds.size === 0}
              className="w-full py-3 bg-(--brand) text-(--on-brand) font-bold text-xs rounded-xl hover:bg-(--brand-hover) transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {librarySubmitting
                ? t('saving')
                : t('shared.ingestion.addSelectedSources', { count: selectedLibraryIds.size })}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
