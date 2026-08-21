import { useState, useEffect, useCallback } from 'react';
import { PageSkeleton, ErrorBlock, JsonTree } from './shared.jsx';
function PapersSection({ lang, api }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [documents, setDocuments] = useState({ content: [], totalElements: 0, totalPages: 0 });
  const [documentCounts, setDocumentCounts] = useState({ processed: 0, failed: 0 });
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [diag, setDiag] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState(null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [projectId, setProjectId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [projects, setProjects] = useState([]);
  const [collections, setCollections] = useState([]);

  const fetch = useCallback(async (signal) => {
    setLoading(true);
    try {
      const [dash, docs, counts] = await Promise.all([
        api.get('/api/admin/dashboard', { signal }),
        api.get('/api/admin/documents', {
          params: { page, size: 5, q: q || undefined, projectId: projectId || undefined, collectionId: collectionId || undefined },
          signal,
        }),
        api.get('/api/admin/documents/counts', {
          params: { q: q || undefined, projectId: projectId || undefined, collectionId: collectionId || undefined },
          signal,
        }),
      ]);
      setData(dash.data);
      setDocuments(docs.data);
      setDocumentCounts(counts.data || { processed: 0, failed: 0 });
    }
    catch (e) {
      if (signal && signal.aborted) return;
      setError(e.message || lang.loadFailed);
    }
    finally {
      if (!signal || !signal.aborted) setLoading(false);
    }
  }, [api, lang.loadFailed, page, q, projectId, collectionId]);

  useEffect(() => {
    const ac = new AbortController();
    fetch(ac.signal);
    return () => ac.abort();
  }, [fetch]);

  useEffect(() => {
    const ac = new AbortController();
    api.get('/api/admin/projects', { params: { page: 0, size: 100 }, signal: ac.signal })
      .then(r => setProjects(r.data?.content || []))
      .catch(() => { });
    api.get('/api/admin/collections', { signal: ac.signal })
      .then(r => setCollections(Array.isArray(r.data) ? r.data : []))
      .catch(() => { });
    return () => ac.abort();
  }, [api]);

  const openDiagnostics = async (doc) => {
    setSelectedDoc(doc);
    setDiag(null);
    setDiagError(null);
    setDiagLoading(true);
    try {
      const r = await api.get(`/api/documents/${doc.id}/diagnostics`);
      setDiag(r.data);
    } catch (e) {
      setDiagError(e.response?.data?.message || e.message || lang.loadFailed);
    } finally {
      setDiagLoading(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorBlock msg={error} onRetry={() => fetch(new AbortController().signal)} />;
  if (!data) return <div className="p-6 text-gray-400 text-center">{lang.loadFailed}</div>;

  const display = data;

  const pageProcessed = documentCounts.processed ?? 0;
  const pageFailed = documentCounts.failed ?? 0;

  const stats = [
    { label: 'TOTAL DOCUMENTS', value: documents.totalElements ?? 0, subtext: 'all documents', barColor: 'bg-gray-400' },
    { label: 'PAPERS', value: display?.activePaperDocuments ?? 0, subtext: 'active papers', barColor: 'bg-blue-500' },
    { label: 'SOURCES', value: display?.activeSourceDocuments ?? 0, subtext: 'active sources', barColor: 'bg-emerald-500' },
    { label: 'PROCESSED', value: pageProcessed, subtext: 'processed', barColor: 'bg-amber-500' },
    { label: 'FAILED / PARTIAL', value: pageFailed, subtext: 'failed', barColor: 'bg-rose-500' }
  ];

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
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${styles[s] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
        {s || '—'}
      </span>
    );
  };

  return (
    <div className="p-8 space-y-6 bg-[#f8fafc]">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1e3a8a] tracking-tight">{lang.papersOverview}</h1>
          <p className="text-gray-500 text-xs mt-1">{lang.papersSub}</p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col justify-between h-28">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{s.label}</span>
              <div className={`h-1.5 w-8 rounded-full ${s.barColor}`} />
            </div>
            <div className="mt-2">
              <span className="text-3xl font-extrabold text-slate-800">{s.value}</span>
              <p className="text-[10px] text-gray-400 font-bold mt-0.5">{s.subtext}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Documents Main Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">{lang.recentDocuments}</h2>
          <div className="flex flex-1 flex-col sm:flex-row gap-2.5 lg:justify-end">
            <div className="relative sm:w-56">
              <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder={lang.searchDocuments}
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(0); }}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-gray-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-slate-50 border border-gray-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{lang.project}: All</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <select
              value={collectionId}
              onChange={(e) => { setCollectionId(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-slate-50 border border-gray-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Collection: All</option>
              {collections.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Documents Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-gray-100">
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.title}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.project}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">DOI</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.status}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-slate-700 font-semibold">
              {documents.content.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-medium">{lang.noPipelineData}</td></tr>
              ) : documents.content.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-6 py-4">
                    <span className="font-bold text-slate-800 block truncate max-w-xs">{doc.title || doc.originalFilename}</span>
                    {doc.originalFilename && doc.title && <span className="text-[10px] text-gray-400 font-medium">{doc.originalFilename}</span>}
                  </td>
                  <td className="px-6 py-4 text-slate-500">{doc.projectName || '—'}</td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-[10px]">{doc.doi || '—'}</td>
                  <td className="px-6 py-4">{statusBadge(doc.processingStatus)}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openDiagnostics(doc)}
                      className="px-3 py-1.5 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition shadow-sm cursor-pointer"
                    >
                      Diagnostics
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-100 bg-gray-50/50 text-xs font-semibold text-gray-500">
          <span>Showing {documents.content.length} of {documents.totalElements} documents</span>
          {documents.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {lang.prev}
              </button>
              <span>{lang.page} {page + 1} / {documents.totalPages}</span>
              <button
                disabled={page + 1 >= documents.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {lang.next}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Diagnostics Panel */}
      {selectedDoc && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-4">
            <h2 className="text-sm font-bold text-slate-800">
              Diagnostics — {selectedDoc.title || selectedDoc.originalFilename}
              <span className="ml-2 font-mono text-[10px] text-gray-400">{selectedDoc.id}</span>
            </h2>
            <button onClick={() => setSelectedDoc(null)} className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer">Close</button>
          </div>

          {diagLoading && <div className="p-8"><PageSkeleton /></div>}
          {diagError && <div className="p-4"><ErrorBlock msg={diagError} /></div>}

          {diag && (
            <div className="p-5 space-y-5">
              {diag.processingError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                  <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block mb-1">Extraction error</span>
                  <pre className="text-xs text-rose-800 whitespace-pre-wrap break-words font-mono">{diag.processingError}</pre>
                </div>
              )}
              {diag.openAlexError && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block mb-1">OpenAlex metadata error</span>
                  <pre className="text-xs text-amber-800 whitespace-pre-wrap break-words font-mono">{diag.openAlexError}</pre>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="bg-slate-50 rounded-xl border border-gray-200 p-4 min-w-0">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">OpenAlex metadata (live re-fetch)</h3>
                  <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words max-h-96 overflow-y-auto pr-1">
                    {diag.openAlexRaw ? <JsonTree data={diag.openAlexRaw} /> : 'No DOI — no OpenAlex lookup.'}
                  </pre>
                </div>
                <div className="bg-slate-50 rounded-xl border border-gray-200 p-4 min-w-0">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">System extraction output (MinIO)</h3>
                  <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words max-h-96 overflow-y-auto pr-1">
                    {diag.extractionAvailable && diag.extractionJson ? <JsonTree data={diag.extractionJson} /> : 'No extraction checkpoint stored.'}
                  </pre>
                </div>
                <div className="bg-slate-50 rounded-xl border border-gray-200 p-4 min-w-0">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Document metadata</h3>
                  <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words max-h-96 overflow-y-auto pr-1">
                    <JsonTree data={{
                      id: diag.id,
                      originalFilename: diag.originalFilename,
                      title: diag.title,
                      doi: diag.doi,
                      docType: diag.docType,
                      processingStatus: diag.processingStatus,
                      chunkCount: diag.chunkCount,
                      createdAt: diag.createdAt,
                      processedAt: diag.processedAt,
                      projectName: diag.projectName,
                    }} />
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


export { PapersSection };
