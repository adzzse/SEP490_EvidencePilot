import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Modal from '../../../components/ui/Modal.jsx';
import { PageSkeleton, ErrorBlock, JsonTree } from './shared.jsx';
import ProjectAvatar from '../../../components/ui/ProjectAvatar.jsx';
import { useTranslation } from 'react-i18next';

function PapersSection({ api }) {
  const { t } = useTranslation();
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [projectId, setProjectId] = useState('');
  const [collectionId, setCollectionId] = useState('');

  const params = { page, size: 5 };
  if (q) params.q = q;
  if (projectId) params.projectId = projectId;
  if (collectionId) params.collectionId = collectionId;

  const dashboardQuery = useQuery({
    queryKey: ['adminDashboard'],
    queryFn: ({ signal }) => api.get('/api/admin/dashboard', { signal }).then(r => r.data),
  });

  const documentsQuery = useQuery({
    queryKey: ['documents', { page, q, projectId, collectionId }],
    queryFn: ({ signal }) => api.get('/api/admin/documents', { params, signal }).then(r => r.data),
    placeholderData: (prev) => prev,
  });

  const projectsQuery = useQuery({
    queryKey: ['projects', 'admin', { page: 0, size: 100 }],
    queryFn: ({ signal }) => api.get('/api/admin/projects', { params: { page: 0, size: 100 }, signal }).then(r => r.data?.content || []),
  });

  const collectionsQuery = useQuery({
    queryKey: ['adminCollections'],
    queryFn: ({ signal }) => api.get('/api/admin/collections', { signal }).then(r => Array.isArray(r.data) ? r.data : []),
  });

  const diagnosticsQuery = useQuery({
    queryKey: ['documentDiagnostics', selectedDoc?.id],
    queryFn: ({ signal }) => api.get(`/api/documents/${selectedDoc.id}/diagnostics`, { signal }).then(r => r.data),
    enabled: !!selectedDoc,
  });

  const statusBadge = (s) => {
    const styles = {
      COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      READY: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      PROCESSING: 'bg-amber-50 text-amber-700 border-amber-100',
      QUEUED: 'bg-blue-50 text-blue-700 border-blue-100',
      FAILED: 'bg-rose-50 text-rose-700 border-rose-100',
      PARTIAL: 'bg-rose-50 text-rose-700 border-rose-100',
      METADATA_FETCHED: 'bg-cyan-50 text-cyan-700 border-cyan-100',
      PDF_DOWNLOADED: 'bg-cyan-50 text-cyan-700 border-cyan-100',
      RAW_EXTRACTED: 'bg-violet-50 text-violet-700 border-violet-100'
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${styles[s] || 'bg-(--surface-secondary) text-(--text-primary) border-(--border)'}`}>
        {s || '—'}
      </span>
    );
  };

  if (dashboardQuery.isLoading || documentsQuery.isLoading) return <PageSkeleton />;
  if (dashboardQuery.error) return <ErrorBlock msg={dashboardQuery.error.message || t('admin.loadFailed')} onRetry={() => dashboardQuery.refetch()} />;
  if (!dashboardQuery.data) return <div className="p-6 text-(--text-tertiary) text-center">{t('admin.loadFailed')}</div>;

  const display = dashboardQuery.data;
  const documents = documentsQuery.data || { content: [], totalElements: 0, totalPages: 0 };
  const projects = projectsQuery.data || [];
  const collections = collectionsQuery.data || [];

  return (
    <div className="p-8 space-y-6 bg-(--page-bg)">
      {/* Header — title left, total badge right */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-(--border) pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-(--brand-foreground) tracking-tight">{t('admin.papersOverview')}</h1>
          <p className="text-(--text-secondary) text-xs mt-1">{t('admin.papersSub')}</p>
        </div>
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-(--surface) border border-(--border) text-xs font-bold text-(--text-secondary) self-start sm:self-auto">
          {t('admin.totalDocumentsInline', { count: documents.totalElements ?? 0 })}
        </span>
      </div>

      <div className="bg-(--surface) rounded-2xl shadow-sm border border-(--border) overflow-hidden">
        <div className="p-5 border-b border-(--border-light) flex flex-col lg:flex-row lg:items-center gap-3">
          <h2 className="text-lg font-bold text-(--text-primary)">{t('admin.recentDocuments')}</h2>
          <div className="flex flex-1 flex-col sm:flex-row gap-2.5 lg:justify-end">
            <input
              type="text"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder={t('admin.searchDocuments')}
              className="w-full sm:w-56 px-3 py-2 bg-(--surface-secondary) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setPage(0); }}
              aria-label={t('admin.project')}
              className="px-3 py-2 bg-(--surface-secondary) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('admin.projectAll')}</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <select
              value={collectionId}
              onChange={(e) => { setCollectionId(e.target.value); setPage(0); }}
              aria-label={t('admin.collections')}
              className="px-3 py-2 bg-(--surface-secondary) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('admin.collectionAll')}</option>
              {collections.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-(--surface-secondary) text-(--text-tertiary) font-bold uppercase border-b border-(--border-light)">
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.title')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.project')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.columnDoi')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.status')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border-light) text-(--text-primary) font-semibold">
              {documents.content.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-(--text-tertiary) font-medium">{t('admin.noPipelineData')}</td></tr>
              ) : documents.content.map(doc => (
                <tr key={doc.id} className="hover:bg-(--surface-secondary)/50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <ProjectAvatar name={doc.projectName || doc.title || doc.originalFilename || '?'} size="w-8 h-8" />
                      <div className="min-w-0">
                        <span className="font-bold text-(--text-primary) block truncate max-w-xs">{doc.title || doc.originalFilename}</span>
                        {doc.originalFilename && doc.title && <span className="text-[10px] text-(--text-tertiary) font-medium">{doc.originalFilename}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-(--text-secondary)">{doc.projectName || '—'}</td>
                  <td className="px-6 py-4 text-(--text-secondary) font-mono text-[10px]">{doc.doi || '—'}</td>
                  <td className="px-6 py-4">{statusBadge(doc.processingStatus)}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setSelectedDoc(doc)}
                      className="px-3 py-1.5 text-[10px] font-bold text-(--text-secondary) bg-(--surface-secondary) border border-(--border) rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition shadow-sm cursor-pointer"
                    >
                      {t('admin.viewDocumentDetails')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-6 py-3.5 border-t border-(--border-light) bg-(--surface-secondary)/50 text-xs font-semibold text-(--text-secondary)">
          <span>{t('admin.showingDocs', { shown: documents.content.length, total: documents.totalElements })}</span>
          {documents.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-(--border) text-(--text-secondary) hover:bg-(--surface-secondary) transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {t('admin.prev')}
              </button>
              <span>{t('admin.page')} {page + 1} / {documents.totalPages}</span>
              <button
                disabled={page + 1 >= documents.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-(--border) text-(--text-secondary) hover:bg-(--surface-secondary) transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {t('admin.next')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Diagnostics Modal — same as before, no nested modals */}
      <Modal
        open={!!selectedDoc}
        onClose={() => setSelectedDoc(null)}
        title={selectedDoc ? `${t('admin.diagnostics')} — ${selectedDoc.title || selectedDoc.originalFilename}` : t('admin.diagnostics')}
        closeLabel={t('admin.close')}
        wide
        style={{ maxWidth: '72rem' }}
      >
        {selectedDoc && (
          <span className="font-mono text-[10px] text-(--text-tertiary) block mb-4">{selectedDoc.id}</span>
        )}
        {diagnosticsQuery.isLoading && <PageSkeleton />}
        {diagnosticsQuery.error && <ErrorBlock msg={diagnosticsQuery.error.message || t('admin.loadFailed')} />}

        {diagnosticsQuery.data && (
          <div className="space-y-5">
            {diagnosticsQuery.data.processingError && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block mb-1">{t('admin.extractionError')}</span>
                <pre className="text-xs text-rose-800 whitespace-pre-wrap break-words font-mono">{diagnosticsQuery.data.processingError}</pre>
              </div>
            )}
            {diagnosticsQuery.data.openAlexError && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block mb-1">{t('admin.openAlexError')}</span>
                <pre className="text-xs text-amber-800 whitespace-pre-wrap break-words font-mono">{diagnosticsQuery.data.openAlexError}</pre>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="bg-(--surface-secondary) rounded-xl border border-(--border) p-4 min-w-0">
                <h3 className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider mb-3">{t('admin.openAlexMeta')}</h3>
                <pre className="text-xs font-mono text-(--text-primary) whitespace-pre-wrap break-words max-h-96 overflow-y-auto pr-1">
                  {diagnosticsQuery.data.openAlexRaw ? <JsonTree data={diagnosticsQuery.data.openAlexRaw} /> : t('admin.noDoi')}
                </pre>
              </div>
              <div className="bg-(--surface-secondary) rounded-xl border border-(--border) p-4 min-w-0">
                <h3 className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider mb-3">{t('admin.extractionOutput')}</h3>
                <pre className="text-xs font-mono text-(--text-primary) whitespace-pre-wrap break-words max-h-96 overflow-y-auto pr-1">
                  {diagnosticsQuery.data.extractionAvailable && diagnosticsQuery.data.extractionJson ? <JsonTree data={diagnosticsQuery.data.extractionJson} /> : t('admin.noCheckpoint')}
                </pre>
              </div>
              <div className="bg-(--surface-secondary) rounded-xl border border-(--border) p-4 min-w-0">
                <h3 className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider mb-3">{t('admin.docMeta')}</h3>
                <pre className="text-xs font-mono text-(--text-primary) whitespace-pre-wrap break-words max-h-96 overflow-y-auto pr-1">
                  <JsonTree data={{
                    id: diagnosticsQuery.data.id,
                    originalFilename: diagnosticsQuery.data.originalFilename,
                    title: diagnosticsQuery.data.title,
                    doi: diagnosticsQuery.data.doi,
                    docType: diagnosticsQuery.data.docType,
                    processingStatus: diagnosticsQuery.data.processingStatus,
                    chunkCount: diagnosticsQuery.data.chunkCount,
                    createdAt: diagnosticsQuery.data.createdAt,
                    processedAt: diagnosticsQuery.data.processedAt,
                    projectName: diagnosticsQuery.data.projectName,
                  }} />
                </pre>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export { PapersSection };
