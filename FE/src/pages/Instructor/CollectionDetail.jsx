import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppHeader, LoadingSkeleton, EmptyState, Modal, UploadZone } from '../../components';
import TourLauncher from '../../components/TourLauncher';
import { instructorText, commonText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useCollectionSources } from '../../hooks/useCollections';
import api from '../../api';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import useUndoDelete, { UndoToast } from '../../components/UndoDelete.jsx';
import DeleteConfirm from '../../components/DeleteConfirm.jsx';

const TABS = ['documents', 'connectedMap', 'visualizeMap', 'analyzeCollection'];
const TAB_IDS = ['documents-tab', 'connected-map-tab', 'visualize-map-tab', 'analyze-tab'];
const DEFAULT_GRAPH_SETTINGS = {
  arrows: true,
  showUnresolved: true,
  textFade: 1.1,
  nodeSize: 1,
  linkThickness: 1,
  centerForce: 0.01,
  repelForce: 70,
  linkForce: 0.06,
  linkDistance: 160,
};

function statusColor(s) {
  if (s === 'READY' || s === 'COMPLETED') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (s === 'PROCESSING' || s === 'UPLOADED' || s === 'QUEUED') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (s === 'FAILED') return 'bg-rose-100 text-rose-700 border-rose-200';
  return 'bg-gray-100 text-gray-500 border-gray-200';
}

function FileIcon({ name, className = 'w-5 h-5' }) {
  const ext = name?.split('.').pop()?.toLowerCase();
  const color = ext === 'pdf' ? 'text-rose-500' : ['doc', 'docx'].includes(ext) ? 'text-blue-500' : ext === 'tex' ? 'text-amber-500' : 'text-(--brand)';
  return <svg className={`${className} ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 3h7l5 5v13H7a2 2 0 01-2-2V5a2 2 0 012-2zm7 0v6h6M9 13h6m-6 4h6" /></svg>;
}

export default function CollectionDetail() {
  const { id } = useParams();
  const { language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
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

  const TOUR_STEPS = useMemo(() => [
    { element: '#documents-tab', popover: { title: t.documents, description: t.tourDocumentsDesc, side: 'bottom', align: 'start' } },
    { element: '#add-doc-btn', popover: { title: t.addDocument, description: t.tourAddDocumentDesc, side: 'left', align: 'center' } },
    { element: '#documents-tab', popover: { title: t.tourDocumentList, description: t.tourDocumentListDesc, side: 'right', align: 'start' } },
    { element: '#connected-map-tab', popover: { title: t.connectedMap, description: t.tourConnectedDesc, side: 'bottom', align: 'start' } },
    { element: '#visualize-map-tab', popover: { title: t.visualizeMap, description: t.tourVisualizeDesc, side: 'bottom', align: 'start' } },
    { element: '#analyze-tab', popover: { title: t.analyzeCollection, description: t.tourAnalyzeDesc, side: 'bottom', align: 'start' } },
  ], [t]);

  const [activeTab, setActiveTab] = useState(0);
  const { content: sourcesRaw, loading: srcLoading, error: srcError, refetch: refetchSources } = useCollectionSources(id);
  const [removedIds, setRemovedIds] = useState(() => new Set());
  const sources = useMemo(() => sourcesRaw.filter(s => !removedIds.has(String(s.id))), [sourcesRaw, removedIds]);
  const [selectedSource, setSelectedSource] = useState(null);

  const [collection, setCollection] = useState(null);
  const [collectionLoading, setCollectionLoading] = useState(true);

  const [addDocModal, setAddDocModal] = useState(false);
  const [addDocOption, setAddDocOption] = useState(null);

  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [editModal, setEditModal] = useState({ open: false, name: '', description: '', categoryId: '', submitting: false });
  const [graphData, setGraphData] = useState(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [selectedGraphNode, setSelectedGraphNode] = useState(null);
  const [graphSettingsOpen, setGraphSettingsOpen] = useState(false);
  const [graphSettings, setGraphSettings] = useState(() => ({ ...DEFAULT_GRAPH_SETTINGS }));
  const [graphSearch, setGraphSearch] = useState('');
  const graphRef = useRef(null);
  const networkRef = useRef(null);
  const graphRuntimeRef = useRef(null);
  const graphSettingsRef = useRef(DEFAULT_GRAPH_SETTINGS);
  const graphSearchRef = useRef('');

  useEffect(() => {
    api.get('/api/collection-categories').then(r => setCategories(r.data)).catch(() => { });
  }, []);

  useEffect(() => {
    api.get('/api/projects?page=0&size=100').then(r => setProjects(r.data?.content || [])).catch(() => { });
  }, []);

  useEffect(() => {
    api.get(`/api/collections/${id}`).then(r => setCollection(r.data)).catch(() => { }).finally(() => setCollectionLoading(false));
  }, [id]);

  const handleUpload = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('collectionId', id);
    try {
      await api.post('/api/sources', fd);
      refetchSources();
    } catch (err) {
      alert(t.uploadFailed);
    }
  };

  const handleRemoveSource = async (sourceId) => {
    const sid = String(sourceId);
    const src = sources.find(s => String(s.id) === sid);
    setRemovedIds(prev => new Set(prev).add(sid));
    startDelete({
      ...undoStrings,
      entityName: src?.title || src?.originalFilename || sourceId,
      entityDetails: sourceId,
    }, async () => {
      try {
        await api.delete(`/api/collections/${id}/sources/${sourceId}`);
        refetchSources();
      }
      catch {
        alert(t.deleteFailed);
        setRemovedIds(prev => { const n = new Set(prev); n.delete(sid); return n; });
      }
      if (selectedSource?.id === sourceId) setSelectedSource(null);
    }, () => {
      setRemovedIds(prev => { const n = new Set(prev); n.delete(sid); return n; });
      refetchSources();
    });
  };

  const handleDownloadSource = async (source) => {
    try {
      const response = await api.get(`/api/documents/${source.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = source.originalFilename || 'document';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert(t.downloadFailed);
    }
  };

  const handleDeleteCollection = async () => {
    const shared = sources.filter(s => (s.projectIds || []).length > 0);
    const msg = shared.length > 0 ? `${t.sharedDocsWarning} ${t.deleteConfirm}` : t.deleteConfirm;
    startDelete({
      ...undoStrings,
      bodyTemplate: undefined,
      message: msg,
      entityName: collection?.name || collection?.title || id,
      entityDetails: id,
    }, () => {
      api.delete(`/api/collections/${id}`).then(() => { window.location.href = '/instructor/collections'; }).catch(() => alert(t.deleteFailed));
    });
  };

  const handleEditOpen = () => {
    setEditModal({ open: true, name: collection?.name || '', description: collection?.description || '', categoryId: collection?.categoryId || '', submitting: false });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editModal.name.trim()) return;
    setEditModal(p => ({ ...p, submitting: true }));
    try {
      const res = await api.put(`/api/collections/${id}`, {
        name: editModal.name.trim(),
        description: editModal.description.trim() || null,
        categoryId: editModal.categoryId || null,
      });
      setCollection(res.data);
      setEditModal({ open: false, name: '', description: '', categoryId: '', submitting: false });
    } catch (err) {
      alert(err.response?.data?.message || t.uploadFailed);
      setEditModal(p => ({ ...p, submitting: false }));
    }
  };
  const AddDocForm = () => {
    const [doi, setDoi] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [doiError, setDoiError] = useState('');
    const [librarySources, setLibrarySources] = useState([]);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [libraryError, setLibraryError] = useState('');
    const [libraryQuery, setLibraryQuery] = useState('');
    const [addingSourceId, setAddingSourceId] = useState(null);

    useEffect(() => {
      if (addDocOption !== 'library') return undefined;

      let active = true;
      setLibraryLoading(true);
      setLibraryError('');
      api.get(`/api/collections/${id}/library-sources`, { params: { size: 100 } })
        .then(response => {
          if (active) setLibrarySources(response.data?.content || []);
        })
        .catch(() => {
          if (active) setLibraryError(t.libraryLoadFailed);
        })
        .finally(() => {
          if (active) setLibraryLoading(false);
        });

      return () => { active = false; };
    }, [addDocOption, id, t.libraryLoadFailed]);

    const handleDoiSubmit = async () => {
      setDoiError('');
      try {
        await api.post('/api/documents/ingest/doi', { doi, collectionId: id });
        refetchSources();
        return true;
      } catch (err) {
        setDoiError(err.response?.data?.message || t.uploadFailed);
        return false;
      }
    };

    if (!addDocOption) return null;

    if (addDocOption === 'doi') {
      return (
        <form onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          try {
            if (await handleDoiSubmit()) {
              setAddDocOption(null);
              setAddDocModal(false);
            }
          } finally {
            setSubmitting(false);
          }
        }} id="add-doc-panel" role="tabpanel" aria-labelledby="add-doc-tab-doi" className="space-y-4">
          <p className="text-xs text-(--text-secondary)">{t.inputDoiDescription}</p>
          <input type="text" value={doi} onChange={e => setDoi(e.target.value)} placeholder={t.doiPlaceholder} required
            className="w-full px-4 py-3 bg-(--surface-secondary) border border-(--border) rounded-xl text-(--text-primary) font-medium text-sm focus:outline-none focus:ring-2 focus:ring-(--focus) transition-colors" />
          {doiError && <p className="text-xs font-semibold text-rose-600">{doiError}</p>}
          <button type="submit" disabled={submitting || !doi.trim()}
            className="w-full py-3 bg-(--brand) text-(--on-brand) font-bold text-xs rounded-xl hover:bg-(--brand-hover) transition-colors shadow-md disabled:opacity-50">{submitting ? ct.saving : t.submitDoi}</button>
        </form>
      );
    }

    if (addDocOption === 'upload') {
      return (
        <div id="add-doc-panel" role="tabpanel" aria-labelledby="add-doc-tab-upload" className="space-y-4">
          <p className="text-xs text-(--text-secondary)">{t.uploadDocumentDescription}</p>
          <UploadZone onUpload={(f) => { handleUpload(f); }} accept=".pdf,.docx,.md,.tex" label={t.dropFiles} />
        </div>
      );
    }

    if (addDocOption === 'library') {
      const normalizedQuery = libraryQuery.trim().toLowerCase();
      const filteredSources = librarySources.filter(source =>
        !normalizedQuery || `${source.title || ''} ${source.originalFilename || source.id}`
          .toLowerCase().includes(normalizedQuery));

      const addLibrarySource = async (sourceId) => {
        setAddingSourceId(sourceId);
        setLibraryError('');
        try {
          await api.post(`/api/collections/${id}/sources/${sourceId}`);
          setLibrarySources(current => current.filter(source => source.id !== sourceId));
          await refetchSources();
        } catch (err) {
          setLibraryError(err.response?.data?.message || t.libraryAddFailed);
        } finally {
          setAddingSourceId(null);
        }
      };

      return (
        <div id="add-doc-panel" className="space-y-3" role="tabpanel" aria-labelledby="add-doc-tab-library">
          <p className="text-xs text-(--text-secondary)">{t.chooseFromLibraryDescription}</p>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-tertiary)" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
            </svg>
            <input value={libraryQuery} onChange={event => setLibraryQuery(event.target.value)}
              placeholder={t.searchLibrarySources} aria-label={t.searchLibrarySources}
              className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) py-2.5 pl-9 pr-3 text-sm text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)" />
          </div>

          {libraryError && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {libraryError}
            </p>
          )}

          {libraryLoading ? <LoadingSkeleton count={3} height="h-14" /> : libraryError ? null : filteredSources.length === 0 ? (
            <div className="rounded-xl border border-dashed border-(--border) bg-(--surface-secondary) px-4 py-8 text-center text-xs text-(--text-tertiary)">
              {librarySources.length === 0
                ? (sources.length > 0 ? t.allLibrarySourcesAdded : t.noLibrarySources)
                : t.noLibraryMatches}
            </div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {filteredSources.map(source => (
                <div key={source.id} className="flex items-center gap-3 rounded-xl border border-(--border) bg-(--surface) p-3">
                  <FileIcon name={source.originalFilename} className="h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-(--text-primary)">{source.title || source.originalFilename || source.id}</p>
                    {source.title && source.originalFilename && (
                      <p className="truncate text-[10px] text-(--text-tertiary)">{source.originalFilename}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${statusColor(source.processingStatus)}`}>
                        {ct.statusLabels?.[source.processingStatus] || source.processingStatus}
                      </span>
                      {source.fileSizeBytes && (
                        <span className="text-[10px] text-(--text-tertiary)">{(source.fileSizeBytes / 1024).toFixed(0)} KB</span>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={() => addLibrarySource(source.id)}
                    disabled={addingSourceId !== null}
                    className="shrink-0 rounded-lg bg-(--brand) px-3 py-2 text-[10px] font-bold text-(--on-brand) transition-colors hover:bg-(--brand-hover) focus:outline-none focus:ring-2 focus:ring-(--focus) disabled:cursor-not-allowed disabled:opacity-50">
                    {addingSourceId === source.id ? t.addingToCollection : t.addToCollection}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const renderDocuments = () => (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      <div className="lg:col-span-2 space-y-4">
        <button id="add-doc-btn" onClick={() => setAddDocModal(true)}
          className="w-full py-3 bg-(--brand) text-(--on-brand) font-black text-xs rounded-xl hover:bg-(--brand-hover) transition-colors shadow-sm">
          + {t.addDocument}
        </button>
        {srcLoading ? <LoadingSkeleton count={4} height="h-12" /> : srcError ? (
          <div className="p-4 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold">{srcError}</div>
        ) : sources.length === 0 ? (
          <EmptyState title={t.noDocuments} description={t.uploadDocsToCollection} />
        ) : (
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
            {sources.map(doc => (
              <button key={doc.id} onClick={() => setSelectedSource(doc)}
                className={`w-full text-left p-3 rounded-xl border text-xs transition flex items-center gap-3 ${selectedSource?.id === doc.id
                  ? 'bg-(--brand-soft) border-indigo-300 shadow-sm'
                  : 'bg-(--surface) border-(--border) hover:border-indigo-300 hover:bg-(--surface-secondary)'
                  }`}>
                <FileIcon name={doc.originalFilename} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-(--text-primary) truncate">{doc.title || doc.originalFilename || doc.id}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${statusColor(doc.processingStatus)}`}>{ct.statusLabels?.[doc.processingStatus] || doc.processingStatus}</span>
                    {doc.fileSizeBytes && <span className="text-[10px] text-(--text-tertiary)">{(doc.fileSizeBytes / 1024).toFixed(0)} KB</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lg:col-span-3 bg-(--surface) rounded-2xl border border-(--border) shadow-sm min-h-[400px]">
        {!selectedSource ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-(--text-tertiary)">
            <svg className="w-10 h-10 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
            <p className="text-xs font-semibold">{t.selectDocument}</p>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <FileIcon name={selectedSource.originalFilename} className="w-7 h-7" />
                <div>
                  <h3 className="text-base font-black text-(--text-primary)">{selectedSource.title || selectedSource.originalFilename || t.unnamed}</h3>
                  {selectedSource.title && selectedSource.originalFilename && (
                    <p className="text-[11px] text-(--text-tertiary)">{selectedSource.originalFilename}</p>
                  )}
                  <p className="text-[11px] text-(--text-tertiary) font-mono">ID: {selectedSource.id}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DeleteConfirm
                  message={t.removeSourceFromCollectionConfirm}
                  onConfirm={() => handleRemoveSource(selectedSource.id)}
                  triggerLabel={t.removeFromCollection}
                  confirmLabel={t.removeFromCollection}
                  cancelLabel={ct.cancel}
                  className="cursor-pointer rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100"
                >
                  {t.removeFromCollection}
                </DeleteConfirm>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {[
                { label: t.sourceStatus, value: selectedSource.processingStatus, badge: statusColor(selectedSource.processingStatus) },
                { label: t.sourceSize, value: selectedSource.fileSizeBytes ? `${(selectedSource.fileSizeBytes / 1024).toFixed(1)} KB` : '-' },
                { label: t.sourceType, value: selectedSource.contentType || '-' },
                { label: t.sourceCreated, value: selectedSource.createdAt ? new Date(selectedSource.createdAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US') : '-' },
              ].map(s => (
                <div key={s.label} className="p-3 bg-(--surface-secondary) rounded-xl border border-(--border-light)">
                  <p className="text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider">{s.label}</p>
                  {s.badge ? (
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded border text-[10px] font-bold ${s.badge}`}>{s.value}</span>
                  ) : (
                    <p className="mt-1 font-medium text-(--text-primary) break-words">{s.value}</p>
                  )}
                </div>
              ))}
            </div>

            {selectedSource.openAlexTopic || selectedSource.openAlexSubfield || selectedSource.openAlexField || selectedSource.openAlexDomain ? (
              <div className="space-y-3">
                {selectedSource.openAlexTopic ? (
                  <div className="p-3 bg-(--brand-soft) rounded-xl border border-indigo-100 dark:border-indigo-900">
                    <p className="text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider">{t.openAlexTopic}</p>
                    <p className="mt-1 font-semibold text-(--text-primary)">{selectedSource.openAlexTopic}</p>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  {[
                    { label: t.openAlexSubfield, value: selectedSource.openAlexSubfield },
                    { label: t.openAlexField, value: selectedSource.openAlexField },
                    { label: t.openAlexDomain, value: selectedSource.openAlexDomain },
                  ].map(s => s.value ? (
                    <div key={s.label} className="p-3 bg-(--surface-secondary) rounded-xl border border-(--border-light)">
                      <p className="text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider">{s.label}</p>
                      <p className="mt-1 font-medium text-(--text-primary) break-words">{s.value}</p>
                    </div>
                  ) : null)}
                </div>
              </div>
            ) : null}

            {selectedSource.processingStatus === 'READY' || selectedSource.processingStatus === 'COMPLETED' ? (
              <div className="pt-2 border-t border-(--border-light)">
                <p className="text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider mb-2">{t.actions}</p>
                <button type="button" onClick={() => handleDownloadSource(selectedSource)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors">
                  {t.downloadPdf} ↗
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  const renderConnectedMap = () => {
    const shared = sources.filter(s => (s.projectIds || []).length > 0);
    return (
      <div className="space-y-3">
        <p className="text-xs text-(--text-secondary) font-medium">{t.sharedDocsDesc}</p>
        {shared.length === 0 ? (
          <EmptyState title={t.noSharedDocs} description={t.shareDescription} />
        ) : (
          <div className="space-y-2">
            {shared.map(doc => (
              <div key={doc.id} className="p-3 bg-(--surface) rounded-xl border border-(--border) text-xs flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                <span className="font-bold text-(--text-primary) truncate">{doc.originalFilename || doc.id}</span>
                <span className="text-(--text-tertiary) sm:text-right">
                  {t.project}: {doc.projectIds
                    .map(pid => projects.find(p => String(p.id) === String(pid))?.title || pid)
                    .join(', ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const fetchGraph = useCallback(async () => {
    setGraphLoading(true);
    try {
      const res = await api.get(`/api/collections/${id}/citation-graph`);
      setGraphData(res.data);
    } catch { setGraphData(null); }
    finally { setGraphLoading(false); }
  }, [id]);

  const applyGraphFilters = useCallback((query, settings = graphSettingsRef.current) => {
    const runtime = graphRuntimeRef.current;
    if (!runtime) return;
    runtime.resetFocus?.();

    const normalizedQuery = query.trim().toLowerCase();
    const visibleIds = new Set();
    runtime.baseNodes.forEach(node => {
      const visible = (settings.showUnresolved || !node.unresolved)
        && (!normalizedQuery || node.searchText.includes(normalizedQuery));
      if (visible) visibleIds.add(node.id);
    });

    runtime.visibleIds = visibleIds;
    runtime.nodes.update(runtime.baseNodes.map(node => ({ id: node.id, hidden: !visibleIds.has(node.id) })));
    runtime.edges.update(runtime.baseEdges.map(edge => ({
      id: edge.id,
      hidden: !visibleIds.has(edge.from) || !visibleIds.has(edge.to),
    })));
    runtime.labelMode = null;
    runtime.refreshLabels(runtime.network.getScale());
  }, []);

  const applyGraphSettings = useCallback((settings) => {
    const runtime = graphRuntimeRef.current;
    if (!runtime) return;

    runtime.network.setOptions({
      edges: { arrows: { to: { enabled: settings.arrows, scaleFactor: 0.32 } } },
      physics: {
        forceAtlas2Based: {
          gravitationalConstant: -settings.repelForce,
          centralGravity: settings.centerForce,
          springLength: settings.linkDistance,
          springConstant: settings.linkForce,
        },
      },
    });
    runtime.nodes.update(runtime.baseNodes.map(node => ({
      id: node.id,
      size: node.baseSize * settings.nodeSize,
    })));
    runtime.edges.update(runtime.baseEdges.map(edge => ({
      id: edge.id,
      width: 0.7 * settings.linkThickness,
    })));
    runtime.labelMode = null;
    applyGraphFilters(graphSearchRef.current, settings);
  }, [applyGraphFilters]);

  const updateGraphSetting = (key, value) => {
    const next = { ...graphSettingsRef.current, [key]: value };
    graphSettingsRef.current = next;
    setGraphSettings(next);
    applyGraphSettings(next);
  };

  const updateGraphSearch = (value) => {
    graphSearchRef.current = value;
    setGraphSearch(value);
    applyGraphFilters(value);
  };

  const resetGraphSettings = () => {
    const defaults = { ...DEFAULT_GRAPH_SETTINGS };
    graphSettingsRef.current = defaults;
    setGraphSettings(defaults);
    applyGraphSettings(defaults);
  };

  const fitGraph = () => {
    graphRuntimeRef.current?.network.fit({
      animation: { duration: 300, easingFunction: 'easeInOutQuad' },
    });
  };

  useEffect(() => {
    if (activeTab === 2) fetchGraph();
  }, [activeTab, fetchGraph]);

  useEffect(() => {
    if (!graphData || !graphRef.current || graphData.nodes.length === 0) return;

    if (networkRef.current) networkRef.current.destroy();

    function nodeLabel(n) {
      if (!n.title && !n.doi) return '';
      let authorName = null;
      if (n.authors) {
        try {
          const names = JSON.parse(n.authors);
          if (names?.length) authorName = names[0].split(' ')[0].replace(/,$/, '');
        } catch { }
      }
      if (authorName) return n.publicationYear ? `${authorName}, ${n.publicationYear}` : authorName;
      if (n.title) return n.title.length > 20 ? n.title.slice(0, 18) + '…' : n.title;
      return n.doi ? n.doi.slice(0, 20) : '?';
    }

    function nodeTooltip(n) {
      const parts = [];
      if (n.title) parts.push(n.title);
      if (n.authors) {
        try {
          const names = JSON.parse(n.authors);
          if (names?.length) parts.push(t.authorsBy.replace('{{authors}}', names.join(', ')));
        } catch { }
      }
      if (n.publicationYear) parts.push(`(${n.publicationYear})`);
      if (n.citedByCount != null) parts.push(t.citedTimes.replace('{{count}}', n.citedByCount));
      if (n.doi) parts.push(`DOI: ${n.doi}`);
      if (!n.title && !n.doi) parts.push(t.unresolvedReference);
      else if (!n.hasDoi) parts.push(t.noCitationData);
      return parts.join(' · ');
    }

    const normalizedEdges = graphData.edges.map((edge, index) => {
      const citedBy = edge.type === 'CITED_BY';
      return {
        id: `citation-edge-${index}`,
        from: String(citedBy ? edge.targetId : edge.sourceId),
        to: String(citedBy ? edge.sourceId : edge.targetId),
      };
    });
    const incomingCounts = new Map();
    const neighborMap = new Map();
    normalizedEdges.forEach(edge => {
      incomingCounts.set(edge.to, (incomingCounts.get(edge.to) || 0) + 1);
      if (!neighborMap.has(edge.from)) neighborMap.set(edge.from, new Set());
      if (!neighborMap.has(edge.to)) neighborMap.set(edge.to, new Set());
      neighborMap.get(edge.from).add(edge.to);
      neighborMap.get(edge.to).add(edge.from);
    });

    const palette = isDark ? {
      source: ['#8b5cf6', '#c4b5fd', '#a78bfa', '#ddd6fe'],
      external: ['#52525b', '#a1a1aa', '#71717a', '#d4d4d8'],
      unresolved: ['#854d0e', '#fbbf24', '#a16207', '#fde68a'],
    } : {
      source: ['#7c3aed', '#5b21b6', '#8b5cf6', '#4c1d95'],
      external: ['#cbd5e1', '#64748b', '#94a3b8', '#475569'],
      unresolved: ['#fef3c7', '#d97706', '#fcd34d', '#b45309'],
    };

    const baseNodes = graphData.nodes.map(n => {
      const id = String(n.id);
      const unresolved = !n.title && !n.doi;
      const inboundCount = incomingCounts.get(id) || 0;
      const tone = palette[unresolved ? 'unresolved' : n.inCollection ? 'source' : 'external'];
      const baseSize = Math.max(n.inCollection ? 12 : 7, Math.min(24, 7 + Math.log2(inboundCount + 1) * 4.5));

      return {
        id,
        nodeData: n,
        unresolved,
        inboundCount,
        baseSize,
        label: nodeLabel(n),
        searchText: `${n.title || ''} ${n.doi || ''} ${n.authors || ''} ${n.publicationYear || ''}`.toLowerCase(),
        tone,
      };
    });

    const settings = graphSettingsRef.current;
    const nodes = new DataSet(baseNodes.map(node => ({
        id: node.id,
        label: !node.unresolved && (node.nodeData.inCollection || node.inboundCount >= 3) ? node.label : '',
        title: nodeTooltip(node.nodeData),
        color: {
          background: node.tone[0],
          border: node.tone[1],
          highlight: { background: node.tone[2], border: node.tone[3] },
          hover: { background: node.tone[2], border: node.tone[3] },
        },
        font: {
          color: isDark ? '#e4e4e7' : '#334155',
          size: 12,
          face: 'Inter, system-ui, sans-serif',
          strokeWidth: 3,
          strokeColor: isDark ? '#18181b' : '#f8fafc',
          vadjust: 14,
        },
        shape: 'dot',
        size: node.baseSize * settings.nodeSize,
        borderWidth: node.nodeData.inCollection ? 2 : 1,
        borderWidthSelected: 3,
        opacity: 1,
      })));

    const baseEdgeColor = isDark ? '#71717a' : '#94a3b8';
    const activeEdgeColor = isDark ? '#c4b5fd' : '#7c3aed';
    const baseEdgeOpacity = isDark ? 0.24 : 0.2;
    const baseEdges = normalizedEdges.map(edge => ({ ...edge, color: baseEdgeColor, activeColor: activeEdgeColor }));
    const edges = new DataSet(baseEdges.map(edge => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        color: {
          color: edge.color,
          highlight: edge.activeColor,
          hover: edge.activeColor,
          opacity: baseEdgeOpacity,
        },
        width: 0.7 * settings.linkThickness,
      })));

    const options = {
      layout: { improvedLayout: true, randomSeed: 42 },
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        stabilization: { enabled: false },
        forceAtlas2Based: {
          gravitationalConstant: -settings.repelForce,
          centralGravity: settings.centerForce,
          springLength: settings.linkDistance,
          springConstant: settings.linkForce,
          damping: 0.72,
          avoidOverlap: 0.8,
        },
      },
      nodes: {
        font: { face: 'Inter, system-ui, sans-serif' },
      },
      edges: {
        smooth: { enabled: true, type: 'continuous', roundness: 0.1 },
        color: { inherit: false },
        arrows: { to: { enabled: settings.arrows, scaleFactor: 0.32 } },
        hoverWidth: 1.5,
        selectionWidth: 2,
      },
      interaction: {
        dragNodes: true,
        dragView: true,
        zoomView: true,
        hover: true,
        hoverConnectedEdges: true,
        tooltipDelay: 220,
        keyboard: { enabled: true, bindToWindow: false },
      },
    };

    const network = new Network(graphRef.current, { nodes, edges }, options);
    networkRef.current = network;
    const nodeById = new Map(baseNodes.map(node => [node.id, node]));
    let runtime;
    const refreshLabels = (scale, focusIds = null) => {
      const mode = focusIds ? 'focus' : scale >= graphSettingsRef.current.textFade ? 'all' : 'overview';
      if (!focusIds && runtime.labelMode === mode) return;
      runtime.labelMode = focusIds ? null : mode;
      nodes.update(baseNodes.map(node => {
        const show = runtime.visibleIds.has(node.id) && !node.unresolved && (focusIds
          ? focusIds.has(node.id)
          : mode === 'all' || node.nodeData.inCollection || node.inboundCount >= 3);
        return { id: node.id, label: show ? node.label : '' };
      }));
    };
    const resetFocus = () => {
      nodes.update(baseNodes.map(node => ({ id: node.id, opacity: 1 })));
      edges.update(baseEdges.map(edge => ({
        id: edge.id,
        color: {
          color: edge.color,
          highlight: edge.activeColor,
          hover: edge.activeColor,
          opacity: baseEdgeOpacity,
        },
      })));
    };

    runtime = {
      network,
      nodes,
      edges,
      baseNodes,
      baseEdges,
      visibleIds: new Set(baseNodes.map(node => node.id)),
      labelMode: null,
      refreshLabels,
      resetFocus,
    };
    graphRuntimeRef.current = runtime;
    applyGraphFilters(graphSearchRef.current, settings);
    network.once('stabilized', () => {
      if (graphRuntimeRef.current?.network === network) {
        network.fit({ animation: { duration: 250, easingFunction: 'easeInOutQuad' } });
      }
    });

    network.on('dragEnd', ({ nodes: draggedNodes }) => {
      if (draggedNodes.length === 0) return;
      resetFocus();
      runtime.labelMode = null;
      refreshLabels(network.getScale());
    });

    network.on('hoverNode', ({ node }) => {
      const nodeId = String(node);
      const focusIds = new Set([nodeId, ...(neighborMap.get(nodeId) || [])]);
      nodes.update(baseNodes.map(item => ({ id: item.id, opacity: focusIds.has(item.id) ? 1 : 0.12 })));
      edges.update(baseEdges.map(edge => {
        const active = edge.from === nodeId || edge.to === nodeId;
        return {
          id: edge.id,
          color: {
            color: active ? edge.activeColor : edge.color,
            highlight: edge.activeColor,
            hover: edge.activeColor,
            opacity: active ? 0.82 : 0.025,
          },
        };
      }));
      refreshLabels(network.getScale(), focusIds);
    });

    network.on('blurNode', () => {
      resetFocus();
      runtime.labelMode = null;
      refreshLabels(network.getScale());
    });

    network.on('zoom', () => {
      if (network.getScale() < 0.18) network.moveTo({ scale: 0.18, duration: 0 });
      refreshLabels(network.getScale());
    });

    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const nodeData = nodeById.get(String(params.nodes[0]));
        setSelectedGraphNode(nodeData?.nodeData || null);
      } else {
        setSelectedGraphNode(null);
      }
    });

    return () => {
      network.destroy();
      if (networkRef.current === network) networkRef.current = null;
      if (graphRuntimeRef.current?.network === network) graphRuntimeRef.current = null;
    };
  }, [graphData, t, isDark, applyGraphFilters]);

  const renderVisualizeMap = () => (
    <div className="flex w-full h-[calc(100vh-3.5rem)] overflow-hidden bg-(--surface)">
      {graphLoading ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <LoadingSkeleton count={6} height="h-12" />
        </div>
      ) : !graphData || graphData.nodes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-(--text-tertiary)">
          <svg className="w-10 h-10 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10 13a5 5 0 007.54.54l2-2a5 5 0 00-7.07-7.07l-1.15 1.15m2.68 5.38a5 5 0 00-7.54-.54l-2 2a5 5 0 007.07 7.07l1.15-1.15" /></svg>
          <p className="text-xs font-semibold">{t.citationGraphEmpty}</p>
          <p className="text-[10px] mt-1">{t.visualizeDesc}</p>
        </div>
      ) : (
        <div className="flex-1 relative overflow-hidden bg-(--surface-secondary)">
          <div
            ref={graphRef}
            id="visual-map-container"
            role="region"
            tabIndex={0}
            aria-label={t.visualizeDesc}
            aria-describedby="visual-map-help"
            className="absolute inset-0 z-0 h-full w-full cursor-grab active:cursor-grabbing"
            style={{ backgroundColor: isDark ? '#18181b' : '#f8fafc' }}
          />

          <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
            <button type="button" onClick={fitGraph} title={t.graphFit} aria-label={t.graphFit}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-(--border) bg-(--surface)/90 text-(--text-secondary) shadow-sm backdrop-blur-sm transition-colors hover:bg-(--surface-secondary) hover:text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
            </button>
            <button type="button" onClick={() => setGraphSettingsOpen(open => !open)}
              title={t.graphSettings} aria-label={t.graphSettings} aria-expanded={graphSettingsOpen} aria-controls="citation-graph-settings"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-(--border) bg-(--surface)/90 text-(--text-secondary) shadow-sm backdrop-blur-sm transition-colors hover:bg-(--surface-secondary) hover:text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.38.33.72.6 1 .3.28.67.42 1.1.4H21v4h-.09c-.42-.02-.8.12-1.1.4-.28.28-.49.62-.61 1Z" /></svg>
            </button>
          </div>

          {graphSettingsOpen && (
            <aside id="citation-graph-settings" aria-label={t.graphSettings}
              className="absolute right-4 top-16 z-30 max-h-[calc(100%-5rem)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-(--border) bg-(--surface)/95 text-(--text-primary) shadow-xl backdrop-blur-md">
              <div className="sticky top-0 flex items-center justify-between border-b border-(--border-light) bg-(--surface)/95 px-4 py-3 backdrop-blur-md">
                <h3 className="text-xs font-black">{t.graphSettings}</h3>
                <button type="button" onClick={() => setGraphSettingsOpen(false)} aria-label={t.graphCloseSettings}
                  className="cursor-pointer rounded p-1 text-(--text-tertiary) hover:bg-(--surface-secondary) hover:text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="space-y-5 p-4">
                <section className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-(--text-tertiary)">{t.graphFilters}</h4>
                  <label className="block">
                    <span className="sr-only">{t.graphSearch}</span>
                    <input type="search" value={graphSearch} onChange={event => updateGraphSearch(event.target.value)}
                      placeholder={t.graphSearchPlaceholder} aria-label={t.graphSearch}
                      className="w-full rounded-lg border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs text-(--text-primary) outline-none transition focus:border-(--brand) focus:ring-2 focus:ring-(--focus)" />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-semibold text-(--text-secondary)">
                    <span>{t.graphShowUnresolved}</span>
                    <input type="checkbox" checked={graphSettings.showUnresolved} onChange={event => updateGraphSetting('showUnresolved', event.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-violet-600" />
                  </label>
                </section>

                <section className="space-y-3 border-t border-(--border-light) pt-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-(--text-tertiary)">{t.graphDisplay}</h4>
                  <label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-semibold text-(--text-secondary)">
                    <span>{t.graphArrows}</span>
                    <input type="checkbox" checked={graphSettings.arrows} onChange={event => updateGraphSetting('arrows', event.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-violet-600" />
                  </label>
                  {[
                    { key: 'textFade', label: t.graphTextFade, min: 0.25, max: 1.5, step: 0.05, value: graphSettings.textFade.toFixed(2) },
                    { key: 'nodeSize', label: t.graphNodeSize, min: 0.7, max: 1.6, step: 0.1, value: `${graphSettings.nodeSize.toFixed(1)}×` },
                    { key: 'linkThickness', label: t.graphLinkThickness, min: 0.5, max: 2.5, step: 0.1, value: `${graphSettings.linkThickness.toFixed(1)}×` },
                  ].map(control => (
                    <label key={control.key} className="block space-y-1.5">
                      <span className="flex items-center justify-between text-[11px] font-semibold text-(--text-secondary)"><span>{control.label}</span><output>{control.value}</output></span>
                      <input type="range" min={control.min} max={control.max} step={control.step} value={graphSettings[control.key]}
                        onChange={event => updateGraphSetting(control.key, Number(event.target.value))}
                        className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-(--border) accent-violet-600" />
                    </label>
                  ))}
                </section>

                <section className="space-y-3 border-t border-(--border-light) pt-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-(--text-tertiary)">{t.graphForces}</h4>
                  {[
                    { key: 'centerForce', label: t.graphCenterForce, min: 0, max: 0.05, step: 0.005, value: graphSettings.centerForce.toFixed(3) },
                    { key: 'repelForce', label: t.graphRepelForce, min: 20, max: 140, step: 5, value: graphSettings.repelForce },
                    { key: 'linkForce', label: t.graphLinkForce, min: 0.01, max: 0.15, step: 0.01, value: graphSettings.linkForce.toFixed(2) },
                    { key: 'linkDistance', label: t.graphLinkDistance, min: 80, max: 260, step: 10, value: graphSettings.linkDistance },
                  ].map(control => (
                    <label key={control.key} className="block space-y-1.5">
                      <span className="flex items-center justify-between text-[11px] font-semibold text-(--text-secondary)"><span>{control.label}</span><output>{control.value}</output></span>
                      <input type="range" min={control.min} max={control.max} step={control.step} value={graphSettings[control.key]}
                        onChange={event => updateGraphSetting(control.key, Number(event.target.value))}
                        className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-(--border) accent-violet-600" />
                    </label>
                  ))}
                </section>

                <button type="button" onClick={resetGraphSettings}
                  className="w-full cursor-pointer rounded-lg border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-bold text-(--text-secondary) transition-colors hover:text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)">
                  {t.graphReset}
                </button>
              </div>
            </aside>
          )}

          <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-(--border) bg-(--surface)/85 px-3 py-2 text-[10px] font-semibold text-(--text-secondary) shadow-sm backdrop-blur-sm">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2" style={{ background: isDark ? '#8b5cf6' : '#7c3aed', borderColor: isDark ? '#c4b5fd' : '#5b21b6' }} /> {t.sourceLegend}</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border" style={{ background: isDark ? '#52525b' : '#cbd5e1', borderColor: isDark ? '#a1a1aa' : '#64748b' }} /> {t.externalLegend}</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border" style={{ background: isDark ? '#854d0e' : '#fef3c7', borderColor: isDark ? '#fbbf24' : '#d97706' }} /> {t.unresolvedLegend}</span>
          </div>

          <p id="visual-map-help" className="pointer-events-none absolute bottom-4 right-4 z-10 hidden rounded-lg border border-(--border) bg-(--surface)/80 px-3 py-2 text-[10px] font-medium text-(--text-tertiary) backdrop-blur-sm sm:block">
            {t.graphDragHint}
          </p>
        </div>
      )}
      {selectedGraphNode && (
        <div className="w-80 max-w-[80vw] shrink-0 border-l border-(--border) bg-(--surface) p-5 space-y-3 overflow-y-auto">
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider">{ct.name}</span>
            <button onClick={() => setSelectedGraphNode(null)} className="text-(--text-tertiary) hover:text-(--text-primary) p-1" aria-label={ct.close}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
          <p className="text-sm font-semibold text-(--text-primary) break-words">{selectedGraphNode.title || (selectedGraphNode.inCollection ? t.unnamed : t.unresolvedReference)}</p>
          {selectedGraphNode.doi && (
            <div>
              <p className="text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider">DOI</p>
              <p className="text-xs font-mono text-(--brand) break-all">{selectedGraphNode.doi}</p>
            </div>
          )}
          {selectedGraphNode.authors && (
            <div>
              <p className="text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider">{t.authors}</p>
              <p className="text-xs text-(--text-secondary)">{selectedGraphNode.authors}</p>
            </div>
          )}
          {selectedGraphNode.publicationYear && (
            <div>
              <p className="text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider">{t.publicationYear}</p>
              <p className="text-xs text-(--text-secondary)">{selectedGraphNode.publicationYear}</p>
            </div>
          )}
          {selectedGraphNode.hasDoi && selectedGraphNode.citedByCount != null ? (
            <div>
              <p className="text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider">{t.sourceCitations}</p>
              <p className="text-xs text-(--text-secondary)">{t.citedTimes.replace('{{count}}', selectedGraphNode.citedByCount)}</p>
            </div>
          ) : !selectedGraphNode.hasDoi && (selectedGraphNode.title || !selectedGraphNode.inCollection) ? (
            <div>
              <p className="text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider">{t.citationData}</p>
              <p className="text-xs text-(--text-tertiary) italic">{t.noCitationData}</p>
            </div>
          ) : null}
          <div className="pt-2 border-t border-(--border-light)">
            {selectedGraphNode.inCollection ? (
              <p className="text-[10px] font-semibold text-indigo-600">{t.inCollection}</p>
            ) : selectedGraphNode.title || selectedGraphNode.doi ? (
              <p className="text-[10px] font-semibold text-(--text-tertiary)">{t.citationGraphExternal}</p>
            ) : (
              <p className="text-[10px] font-semibold text-rose-500">{t.unresolvedMetadata}</p>
            )}
            {selectedGraphNode.doi && (
              <a href={`https://doi.org/${selectedGraphNode.doi}`} target="_blank" rel="noopener noreferrer"
                className="inline-block mt-2 px-3 py-1.5 bg-(--surface-secondary) border border-(--border) rounded-lg text-xs font-bold text-(--text-secondary) hover:text-(--text-primary) transition-colors">
                {t.openDoi} ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderAnalyze = () => {
    const total = sources.length;
    const ready = sources.filter(s => s.processingStatus === 'READY' || s.processingStatus === 'COMPLETED').length;
    const failed = sources.filter(s => s.processingStatus === 'FAILED').length;
    const processing = total - ready - failed;
    const totalSize = sources.reduce((sum, s) => sum + (s.fileSizeBytes || 0), 0);
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t.totalDocuments, value: total },
          { label: t.processed, value: ready, color: 'text-emerald-700' },
          { label: t.processing, value: processing, color: 'text-amber-700' },
          { label: t.reject, value: failed, color: 'text-rose-700' },
          { label: t.collectionStats, value: totalSize > 0 ? `${(totalSize / (1024 * 1024)).toFixed(1)} MB` : '0 B' },
        ].map(stat => (
          <div key={stat.label} className="p-4 bg-(--surface) rounded-xl border border-(--border)">
            <p className="text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider">{stat.label}</p>
            <p className={`text-2xl font-black mt-1 ${stat.color || 'text-(--text-primary)'}`}>{stat.value}</p>
          </div>
        ))}
      </div>
    );
  };

  const tabContent = [renderDocuments, renderConnectedMap, renderVisualizeMap, renderAnalyze];

  return (
    <div className="min-h-screen bg-(--page-bg) text-(--text-primary)">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-2">
          <Link to="/instructor/collections" className="text-xs font-bold text-(--text-tertiary) hover:text-(--brand-foreground) transition-colors">&larr; {ct.back}</Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-(--border) pb-4">
          <div className="min-w-0">
            {collectionLoading ? (
              <div className="space-y-1">
                <div className="h-8 w-64 max-w-full bg-(--surface-tertiary) rounded-lg animate-pulse" />
                <div className="h-4 w-96 max-w-full bg-(--surface-secondary) rounded animate-pulse" />
              </div>
            ) : collection ? (
              <>
                <h1 className="text-3xl font-black text-(--brand-foreground) tracking-tight truncate">{collection.name}</h1>
                {collection.description && <p className="text-sm text-(--text-secondary) mt-1 truncate">{collection.description}</p>}
                {collection.categoryName && <span className="inline-block mt-1.5 bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-200 text-[10px] font-semibold">{collection.categoryName}</span>}
              </>
            ) : (
              <h1 className="text-3xl font-black text-(--brand-foreground) tracking-tight">{t.collectionDetail}</h1>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {collection && (
              <>
                <button onClick={handleEditOpen}
                  className="px-3 py-1.5 bg-(--surface) border border-(--border) rounded-lg text-xs font-bold text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors">{ct.edit}</button>
                <DeleteConfirm
                  message={sources.some(s => (s.projectIds || []).length > 0) ? `${t.sharedDocsWarning} ${t.deleteConfirm}` : t.deleteConfirm}
                  onConfirm={handleDeleteCollection}
                  triggerLabel={ct.delete}
                  confirmLabel={ct.delete}
                  cancelLabel={ct.cancel}
                  className="px-3 py-1.5 bg-(--surface) border border-rose-200 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  {ct.delete}
                </DeleteConfirm>
              </>
            )}
            <TourLauncher steps={TOUR_STEPS} tourKey="instructor-collection-detail"
              className="w-9 h-9 rounded-full bg-(--surface) border border-(--border) shadow-sm flex items-center justify-center text-sm font-bold text-(--text-secondary) hover:bg-(--brand-soft) hover:text-(--brand) transition-colors" />
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-6 border-b border-(--border)">
          {TABS.map((tab, i) => (
            <button key={tab} id={TAB_IDS[i]} onClick={() => setActiveTab(i)}
              className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors whitespace-nowrap ${activeTab === i ? 'bg-(--surface) text-(--brand-foreground) border border-b-(--surface) border-(--border) -mb-px' : 'text-(--text-tertiary) hover:text-(--text-primary)'
                }`}>{t[tab]}</button>
          ))}
        </div>

        {tabContent[activeTab]()}
      </main>

      <Modal open={addDocModal} onClose={() => { setAddDocModal(false); setAddDocOption(null); }} title={t.addDocument} closeLabel={ct.close}>
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="tablist" aria-label={t.addDocument}>
            {[
              { key: 'doi', label: t.inputDoi, desc: t.inputDoiDescription },
              { key: 'upload', label: t.uploadDocument, desc: t.uploadDocumentDescription },
              { key: 'library', label: t.chooseFromLibrary, desc: t.chooseFromLibraryDescription },
            ].map(opt => (
              <button key={opt.key} id={`add-doc-tab-${opt.key}`} type="button" role="tab"
                aria-controls="add-doc-panel" aria-selected={addDocOption === opt.key}
                onClick={() => setAddDocOption(opt.key)}
                className={`w-full cursor-pointer rounded-xl border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus) ${addDocOption === opt.key
                  ? 'bg-(--brand-soft) border-indigo-300 shadow-sm'
                  : 'bg-(--surface) border-(--border) hover:border-indigo-300 hover:bg-(--surface-secondary)'
                  }`}>
                <p className="font-bold text-(--text-primary)">{opt.label}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-(--text-tertiary)">{opt.desc}</p>
              </button>
            ))}
          </div>
          <AddDocForm />
        </div>
      </Modal>

      <Modal open={editModal.open} onClose={() => setEditModal(p => ({ ...p, open: false }))} title={t.editCollection} closeLabel={ct.close}>
        <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider mb-1">{t.collectionName}</label>
            <input type="text" value={editModal.name} onChange={e => setEditModal(p => ({ ...p, name: e.target.value }))} required maxLength={255}
              className="w-full px-4 py-3 bg-(--surface-secondary) border border-(--border) text-(--text-primary) rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-(--focus) transition-colors" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider mb-1">{t.collectionDescription}</label>
            <textarea value={editModal.description} onChange={e => setEditModal(p => ({ ...p, description: e.target.value }))} rows={3}
              className="w-full px-4 py-3 bg-(--surface-secondary) border border-(--border) text-(--text-primary) rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-(--focus) transition-colors resize-none" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider mb-1">{t.category}</label>
            <select value={editModal.categoryId} onChange={e => setEditModal(p => ({ ...p, categoryId: e.target.value }))}
              className="w-full px-4 py-3 bg-(--surface-secondary) border border-(--border) text-(--text-primary) rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-(--focus) transition-colors">
              <option value="">{t.noCategory}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setEditModal(p => ({ ...p, open: false }))}
              className="px-4 py-2 bg-(--surface-secondary) text-(--text-secondary) rounded-xl font-bold text-xs hover:bg-(--surface-tertiary) transition-colors">{ct.cancel}</button>
            <button type="submit" disabled={editModal.submitting || !editModal.name.trim()}
              className="px-4 py-2 bg-(--brand) text-(--on-brand) rounded-xl font-bold text-xs hover:bg-(--brand-hover) transition-colors disabled:opacity-50">{editModal.submitting ? ct.saving : ct.save}</button>
          </div>
        </form>
      </Modal>

      {pendingDelete && <UndoToast pending={pendingDelete} onUndo={undoDelete} onDismiss={dismissDelete} />}
    </div>
  );
}
