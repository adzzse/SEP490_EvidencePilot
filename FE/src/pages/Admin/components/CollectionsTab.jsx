import { useState, useEffect, useCallback } from 'react';
import { PageSkeleton } from './shared.jsx';
import useUndoDelete, { UndoToast } from '../../../components/UndoDelete.jsx';
function CollectionsSection({ lang, api }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(0);
  const [detailCol, setDetailCol] = useState(null);
  const [toast, setToast] = useState(null);
  const { pending: pendingDelete, start: startDelete, undo: undoDelete, dismiss: dismissDelete } = useUndoDelete({ onUndo: () => fetch(new AbortController().signal) });

  useEffect(() => {
    setPage(0);
  }, [searchQuery, categoryFilter]);

  const fetch = useCallback(async (signal) => {
    setLoading(true);
    try {
      const r = await api.get('/api/admin/collections', { signal });
      setData(r.data);
    } catch (e) { /* silent */ }
    finally {
      if (!signal || !signal.aborted) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const ac = new AbortController();
    api.get('/api/admin/collection-categories?active=true', { signal: ac.signal })
      .then(r => setCategories(Array.isArray(r.data) ? r.data : []))
      .catch(() => { });
    return () => ac.abort();
  }, [api]);

  useEffect(() => {
    const ac = new AbortController();
    fetch(ac.signal);
    return () => ac.abort();
  }, [fetch]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const doDelete = async (id) => {
    try {
      await api.delete(`/api/collections/${id}`);
      showToast(lang.collectionDeleted, 'success');
      await fetch(new AbortController().signal);
    } catch (e) {
      showToast(e.response?.data?.message || lang.collectionDeleteFailed, 'error');
    }
  };

  const handleDelete = (c) => {
    setData(prev => prev.filter(x => x.id !== c.id));
    startDelete({
      entityName: c.name,
      entityDetails: c.id,
      header: lang.undoHeader,
      bodyTemplate: lang.undoBodyTemplate,
      caution: lang.undoCaution,
      undoLabel: lang.undoLabel,
      undoRemaining: lang.undoRemaining,
      dismissLabel: lang.dismissLabel,
    }, () => doDelete(c.id));
  };

  if (loading) return <PageSkeleton />;

  const displayCollections = data.map(c => ({
    id: c.id,
    name: c.name || lang.unnamedCollection,
    description: c.description || '',
    instructorEmail: c.instructorEmail || '—',
    categoryName: c.categoryName || '',
    createdAt: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—',
    active: c.active !== undefined ? c.active : true,
    documentCount: c.documentCount ?? 0
  }));

  const filteredCollections = displayCollections.filter(c => 
    (c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.instructorEmail.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (categoryFilter === '' || c.categoryName === categoryFilter)
  );

  const PAGE_SIZE = 2;
  const totalPages = Math.max(1, Math.ceil(filteredCollections.length / PAGE_SIZE));
  const pagedCollections = filteredCollections.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const totalCollections = displayCollections.length;
  const activeInstructors = new Set(displayCollections.map(c => c.instructorEmail).filter(e => e !== '—')).size;
  const totalDocuments = displayCollections.reduce((a, c) => a + c.documentCount, 0);

  const getCollectionIcon = (name) => {
    const n = name.toLowerCase();
    if (n.includes('ethics') || n.includes('machine') || n.includes('learning')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h1.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-1.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.645-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      );
    } else if (n.includes('research') || n.includes('group') || n.includes('lab') || n.includes('sci')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v1.25c0 .324.085.642.247.923l4.006 6.942a1.875 1.875 0 01.247.923v1.608a3.375 3.375 0 01-3.375 3.375h-1.5a3.375 3.375 0 01-3.375-3.375v-1.608c0-.324.085-.642.247-.923l4.006-6.942a1.875 1.875 0 01.247-.923v-1.25" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6M4 19.5h16" />
          </svg>
        </div>
      );
    } else {
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-19.5 0A2.25 2.25 0 004.5 15h15a2.25 2.25 0 002.25-2.25m-19.5 0v.225c0 1.18.91 2.164 2.09 2.201a51.964 51.964 0 009.962 0c1.18-.037 2.09-1.022 2.09-2.201V12.75M12 9.75V3.75m0 0L8.25 7.5M12 3.75l3.75 3.75" />
          </svg>
        </div>
      );
    }
  };

  return (
    <div className="p-8 space-y-6 bg-[#f8fafc]">
      {/* Title Area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1e3a8a] tracking-tight">{lang.collectionsLibrary}</h1>
          <p className="text-gray-500 text-xs mt-1">{lang.collectionsSub}</p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: Total Collections */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 block tracking-wider uppercase">Total Collections</span>
            <span className="text-2xl font-extrabold text-slate-800">{totalCollections}</span>
          </div>
        </div>

        {/* Card 2: Active Instructors */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
              </svg>
            </div>
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 block tracking-wider uppercase">Active Instructors</span>
            <span className="text-2xl font-extrabold text-slate-800">{activeInstructors}</span>
          </div>
        </div>

        {/* Card 3: Total Documents */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 block tracking-wider uppercase">Total Documents</span>
            <span className="text-2xl font-extrabold text-slate-800">{totalDocuments}</span>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Table Header and Filters */}
        <div className="px-6 py-4.5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="text-sm font-bold text-slate-800 tracking-wider uppercase">All Collections</h3>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                type="text" 
                placeholder="Search collections..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-gray-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500" 
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full sm:w-48 px-3 py-2 bg-slate-50 border border-gray-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-gray-100">
                <th className="px-6 py-3.5">Collection Name</th>
                <th className="px-6 py-3.5">Instructor</th>
                <th className="px-6 py-3.5">Documents</th>
                <th className="px-6 py-3.5">Created Date</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-slate-700 font-semibold">
              {filteredCollections.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400 font-medium">
                    No collections found
                  </td>
                </tr>
              ) : pagedCollections.map((c, index) => {
                const initial = (c.instructorEmail || '—').slice(0, 1).toUpperCase();
                const colors = ['bg-blue-500', 'bg-indigo-500', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500'];
                const avatarColor = colors[index % colors.length];
                
                return (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition">
                    {/* Collection Name */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {getCollectionIcon(c.name)}
                        <span className="font-bold text-slate-800">{c.name}</span>
                      </div>
                    </td>

                    {/* Instructor */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-6.5 h-6.5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${avatarColor}`}>
                          {initial}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-800 font-bold">
                            {c.instructorEmail.includes('admin') ? 'Admin' : 'Instructor'}
                          </span>
                          <span className="text-[10px] text-gray-400 font-semibold leading-none mt-0.5">
                            {c.instructorEmail}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Documents */}
                    <td className="px-6 py-4 text-slate-600 font-bold">
                      {c.documentCount}
                    </td>

                    {/* Created Date */}
                    <td className="px-6 py-4 text-slate-500 font-mono font-medium">
                      {c.createdAt}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${
                        c.active 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                          : 'bg-blue-50 text-blue-700 border-blue-100'
                      }`}>
                        {c.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2.5">
                        <button 
                          onClick={() => setDetailCol(c)}
                          title="View Collection Details"
                          className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 flex items-center justify-center transition shadow-sm cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => handleDelete(c)}
                          title="Delete Collection"
                          className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 flex items-center justify-center transition shadow-sm cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-100 bg-gray-50/50 text-xs font-semibold text-gray-500">
          <span>Showing {Math.min(filteredCollections.length, (page + 1) * PAGE_SIZE)} of {filteredCollections.length} collections</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span>{lang.page} {page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Collection Detail Modal Overlay */}
      {detailCol && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-150 overflow-hidden transform scale-100 transition-all duration-300">
            {/* Modal Header */}
            <div className="bg-slate-50 border-b border-gray-150 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-19.5 0A2.25 2.25 0 004.5 15h15a2.25 2.25 0 002.25-2.25m-19.5 0v.225c0 1.18.91 2.164 2.09 2.201a51.964 51.964 0 009.962 0c1.18-.037 2.09-1.022 2.09-2.201V12.75M12 9.75V3.75m0 0L8.25 7.5M12 3.75l3.75 3.75" />
                  </svg>
                </div>
                <h3 className="font-bold text-slate-800 text-sm">{detailCol.name}</h3>
              </div>
              <button 
                onClick={() => setDetailCol(null)}
                className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Instructor</span>
                  <span className="font-bold text-slate-800">{detailCol.instructorEmail}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Created Date</span>
                  <span className="font-bold text-slate-800">{detailCol.createdAt}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Documents</span>
                  <span className="font-bold text-slate-800">{detailCol.documentCount}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    detailCol.active 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                      : 'bg-blue-50 text-blue-700 border-blue-100'
                  }`}>
                    {detailCol.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Description</span>
                <p className="bg-slate-50 border border-gray-200 rounded-xl px-3 py-2 font-semibold text-slate-700 min-h-10">
                  {detailCol.description || 'No description provided.'}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-3.5 border-t border-gray-150 flex items-center justify-end">
              <button 
                onClick={() => setDetailCol(null)}
                className="px-4 py-2 bg-[#0c162e] hover:bg-[#152447] text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Toast Notification Popup */}
      {toast && (
        <div className="fixed top-4 right-4 z-55 flex items-center gap-2.5 px-4.5 py-3 rounded-2xl shadow-xl border animate-slide-in-right bg-white border-slate-100">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
            toast.type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
          }`}>
            {toast.type === 'error' ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className="text-xs font-bold text-slate-800">{toast.message}</span>
        </div>
      )}

      {pendingDelete && <UndoToast pending={pendingDelete} onUndo={undoDelete} onDismiss={dismissDelete} />}
    </div>
  );
}


export { CollectionsSection };
