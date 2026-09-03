import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../services/api.js';
import Modal from '../ui/Modal.jsx';
import UploadZone from './UploadZone.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { instructorText, commonText } from '../../locales';
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
  const { language } = useLanguage();
  const t = instructorText[language];
  const ct = commonText[language];

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
    }

    // 3. In COLLECTION context, check if doc is already associated with this collection
    if (entityType === ENTITY_TYPES.COLLECTION && entityId) {
      const targetColId = String(entityId);
      if (String(doc.collectionId) === targetColId) return true;
      if (Array.isArray(doc.collectionIds) && doc.collectionIds.some(cid => String(cid) === targetColId)) return true;
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
        if (active) setCollectionError(language === 'vi' ? 'Không thể tải danh sách bộ sưu tập.' : 'Failed to load collections.');
      })
      .finally(() => {
        if (active) setCollectionsLoading(false);
      });
    return () => { active = false; };
  }, [open, activeOption, language]);

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
        if (active) setCollectionError(language === 'vi' ? 'Không thể tải danh sách tài liệu từ bộ sưu tập này.' : 'Failed to load documents from this collection.');
      })
      .finally(() => {
        if (active) setCollectionSourcesLoading(false);
      });
    return () => { active = false; };
  }, [open, activeOption, selectedCollectionId, language, isSourceAlreadyInserted]);

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
        if (active) setLibraryError(t.libraryLoadFailed || (language === 'vi' ? 'Không thể tải thư viện nguồn.' : 'Could not load your source library.'));
      })
      .finally(() => {
        if (active) setLibraryLoading(false);
      });

    return () => { active = false; };
  }, [open, activeOption, entityType, entityId, t.libraryLoadFailed, language, isSourceAlreadyInserted]);

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
      setDoiError(language === 'vi' ? 'Vui lòng nhập ít nhất một DOI' : 'Please enter at least one DOI');
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
      setDoiError(err.response?.data?.message || t.uploadFailed);
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
        setUploadError(err.response?.data?.message || t.uploadFailed);
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

    let successCount = 0;
    let failCount = 0;

    await Promise.allSettled(
      sourceIdsToShare.map(async (sourceId) => {
        try {
          await api.post(API_ROUTES.COLLECTIONS.SHARE_SOURCE(selectedCollectionId, sourceId, entityId));
          successCount += 1;
        } catch {
          failCount += 1;
        }
      })
    );

    setCollectionSubmitting(false);
    if (failCount > 0 && successCount === 0) {
      setCollectionError(language === 'vi' ? 'Không thể chia sẻ tài liệu vào đồ án.' : 'Failed to share documents to project.');
    } else {
      if (onSuccess) await onSuccess();
      onClose();
    }
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

    try {
      if (entityType === ENTITY_TYPES.COLLECTION) {
        await api.post(API_ROUTES.COLLECTIONS.BATCH_SOURCES(entityId), {
          sourceIds: sourceIdsToAdd,
        });
      } else {
        // Project Context: share selected library sources to project
        await Promise.allSettled(
          sourceIdsToAdd.map(async (sid) => {
            const src = librarySources.find(s => String(s.id) === String(sid));
            const colId = src?.collectionId || src?.collections?.[0]?.id;
            if (colId) {
              await api.post(API_ROUTES.COLLECTIONS.SHARE_SOURCE(colId, sid, entityId));
            }
          })
        );
      }
      if (onSuccess) await onSuccess();
      onClose();
    } catch (err) {
      setLibraryError(err.response?.data?.message || t.libraryAddFailed || 'Failed to add selected sources');
    } finally {
      setLibrarySubmitting(false);
    }
  };

  // Tab Definitions Metadata
  const TAB_METADATA = {
    [INGESTION_TABS.DOI]: {
      key: INGESTION_TABS.DOI,
      label: t.inputDoi || 'Input DOI',
      desc: t.inputDoiDescription || 'Add documents by Digital Object Identifier',
    },
    [INGESTION_TABS.UPLOAD]: {
      key: INGESTION_TABS.UPLOAD,
      label: t.uploadDocument || 'Upload Document',
      desc: t.uploadDocumentDescription || 'Upload files directly from your computer',
    },
    [INGESTION_TABS.COLLECTION]: {
      key: INGESTION_TABS.COLLECTION,
      label: t.chooseFromCollection || (language === 'vi' ? 'Chọn từ Bộ sưu tập' : 'Choose from Collection'),
      desc: t.chooseFromCollectionDesc || (language === 'vi' ? 'Chia sẻ từ các bộ sưu tập' : 'Share sources from your collections'),
    },
    [INGESTION_TABS.LIBRARY]: {
      key: INGESTION_TABS.LIBRARY,
      label: t.chooseFromLibrary || 'Choose from Library',
      desc: t.chooseFromLibraryDescription || 'Reuse already uploaded sources',
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
      title={title || t.addDocument || (language === 'vi' ? 'Thêm tài liệu' : 'Add Document')}
      closeLabel={ct.close || 'Close'}
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
          aria-label={t.addDocument}
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
              {language === 'vi'
                ? 'Nhập một hoặc nhiều mã DOI (phân tách bằng dấu phẩy, chấm phẩy hoặc xuống dòng):'
                : 'Enter one or multiple DOIs (separated by commas, semicolons, or newlines):'}
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
                  {language === 'vi'
                    ? `Đã nạp thành công ${doiBatchResult.succeeded?.length || 0} DOI. Một số DOI gặp lỗi:`
                    : `Successfully ingested ${doiBatchResult.succeeded?.length || 0} DOIs. Some failed:`}
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
              {doiSubmitting ? (ct.saving || 'Saving...') : (t.submitDoi || 'Fetch & Ingest')}
            </button>
          </form>
        )}

        {/* Tab 2: Upload Document Panel */}
        {activeOption === INGESTION_TABS.UPLOAD && (
          <div id="add-doc-panel" role="tabpanel" className="space-y-4">
            <p className="text-xs text-(--text-secondary)">
              {language === 'vi'
                ? 'Kéo thả hoặc chọn một hoặc nhiều tệp PDF / DOCX / TeX để tải lên:'
                : 'Drag & drop or select multiple PDF / DOCX / TeX files to upload:'}
            </p>
            <UploadZone
              onUpload={handleUploadFiles}
              accept={ACCEPTED_DOCUMENT_EXTENSIONS}
              label={t.dropFiles || 'Drop document files here or click to browse'}
            />
            <div className="flex items-center justify-between text-xs text-(--text-tertiary) px-1">
              <span>{language === 'vi' ? 'Hỗ trợ tải lên nhiều tệp cùng lúc' : 'Multi-file batch upload supported'}</span>
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
                {language === 'vi' ? 'Chọn nhiều tệp...' : 'Select multiple files...'}
              </label>
            </div>
            {uploadingFiles && (
              <div className="p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-xs font-bold text-center animate-pulse">
                {language === 'vi' ? 'Đang tải lên các tệp...' : 'Uploading files...'}
              </div>
            )}
            {batchFailedDetails && batchFailedDetails.length > 0 && (
              <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <p className="font-bold">{batchFailedDetails.length} file(s) failed — {pendingBatchFiles?.length || 0} remaining in queue</p>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  {batchFailedDetails.map((f) => (
                    <li key={f.index}><span className="font-mono">{f.filename}</span> [{f.errorCode}] {f.errorMessage} {f.retryable ? '' : '(not retryable)'}</li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button type="button" onClick={handleRetryBatch} disabled={uploadingFiles || !batchFailedDetails.some(f=>f.retryable)} className="px-3 py-1.5 bg-(--brand) text-(--on-brand) rounded-lg text-xs font-bold disabled:opacity-50">Retry Failed</button>
                  <button type="button" onClick={() => { setBatchFailedDetails(null); setPendingBatchFiles(null); }} className="px-3 py-1.5 bg-(--surface) border border-(--border) rounded-lg text-xs font-bold">Dismiss</button>
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
                {language === 'vi' ? 'Chọn Bộ sưu tập nguồn:' : 'Select Curated Collection:'}
              </label>
              {collectionsLoading ? (
                <div className="h-10 bg-(--surface-secondary) rounded-xl animate-pulse" />
              ) : collections.length === 0 ? (
                <p className="text-xs italic text-(--text-tertiary)">
                  {language === 'vi' ? 'Chưa có bộ sưu tập nào.' : 'No curated collections found.'}
                </p>
              ) : (
                <select
                  value={selectedCollectionId}
                  onChange={e => setSelectedCollectionId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-(--surface-secondary) border border-(--border) rounded-xl text-xs font-medium text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)"
                >
                  <option value="">{language === 'vi' ? '-- Chọn bộ sưu tập --' : '-- Select a collection --'}</option>
                  {collections.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.title} {c.totalSources ? `(${c.totalSources} sources)` : ''}
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
                      placeholder={language === 'vi' ? 'Tìm trong bộ sưu tập...' : 'Search collection sources...'}
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
                        ? (language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect all')
                        : (language === 'vi' ? 'Chọn tất cả' : 'Select all')}
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
                    {language === 'vi' ? 'Không có tài liệu nào trong bộ sưu tập này.' : 'No sources available in this collection.'}
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
                                {doc.title || doc.originalFilename || t.unnamed || 'Unnamed Document'}
                              </p>
                              {isAlreadyInserted && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  {entityType === ENTITY_TYPES.PROJECT
                                    ? (language === 'vi' ? 'Đã có trong đồ án' : 'In project')
                                    : (language === 'vi' ? 'Đã có trong bộ sưu tập' : 'In collection')}
                                </span>
                              )}
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusColor(doc.processingStatus)}`}>
                                {ct.statusLabels?.[doc.processingStatus] || doc.processingStatus}
                              </span>
                            </div>
                            <p className="text-[10px] text-(--text-tertiary) truncate mt-0.5">
                              {doc.originalFilename || doc.doi || 'Source File'}
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
                    ? (ct.saving || 'Saving...')
                    : `${language === 'vi' ? 'Chia sẻ' : 'Share'} (${selectedCollectionSourceIds.size}) ${language === 'vi' ? 'tài liệu vào đồ án' : 'sources to project'}`}
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
                  placeholder={t.searchLibrarySources || (language === 'vi' ? 'Tìm tài liệu trong thư viện...' : 'Search uploaded sources...')}
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
                    ? (language === 'vi' ? 'Bỏ chọn tất cả' : 'Deselect all')
                    : (language === 'vi' ? 'Chọn tất cả' : 'Select all')}
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
                {t.noLibrarySources || (language === 'vi' ? 'Thư viện nguồn của bạn đang trống.' : 'Your source library is empty.')}
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
                            {doc.title || doc.originalFilename || t.unnamed || 'Unnamed Document'}
                          </p>
                          {isAlreadyInserted && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              {entityType === ENTITY_TYPES.PROJECT
                                ? (language === 'vi' ? 'Đã có trong đồ án' : 'In project')
                                : (language === 'vi' ? 'Đã có trong bộ sưu tập' : 'In collection')}
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusColor(doc.processingStatus)}`}>
                            {ct.statusLabels?.[doc.processingStatus] || doc.processingStatus}
                          </span>
                        </div>
                        <p className="text-[10px] text-(--text-tertiary) truncate mt-0.5">
                          {doc.originalFilename || doc.doi || 'Source File'}
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
                ? (ct.saving || 'Saving...')
                : `${language === 'vi' ? 'Thêm' : 'Add'} (${selectedLibraryIds.size}) ${language === 'vi' ? 'tài liệu đã chọn' : 'selected sources'}`}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
