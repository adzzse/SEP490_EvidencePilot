import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/layout/AppHeader.jsx';
import Breadcrumb from '../../components/layout/Breadcrumb.jsx';
import api from '../../services/api.js';
import { commonText, instructorText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';
import { PAGINATION_LIMIT } from '../../utils/constants.js';
import { formatDate } from '../../utils/formatters/date.js';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import DeleteConfirm from '../../components/ui/DeleteConfirm.jsx';

export default function ProjectManagement() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const ct = commonText[language];
  const t = instructorText[language];

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [isGridView, setIsGridView] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [search, setSearch] = useState('');

  const fetchProjects = useCallback(async (signal) => {
    setLoading(true);
    try {
      const r = await api.get(`/api/projects?page=${page}&size=${PAGINATION_LIMIT}${search ? `&search=${encodeURIComponent(search)}` : ''}`, {
        signal
      });
      setProjects(r.data.content || []);
      setTotal(r.data.totalElements || 0);
    } catch (err) {
      if (err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') {
        setProjects([]);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => fetchProjects(controller.signal), 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [fetchProjects]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await api.post('/api/projects', { title: newTitle, description: newDescription });
      setShowCreate(false);
      setNewTitle('');
      setNewDescription('');
      fetchProjects();
    } catch {
      alert(t.createProjectFailed);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id) => {
    if (!editTitle.trim()) return;
    try {
      await api.put(`/api/projects/${id}`, { title: editTitle });
      setEditId(null);
      setEditTitle('');
      fetchProjects();
    } catch {
      alert(t.updateProjectFailed);
    }
  };

  const handleDelete = async (id) => {
    if (!id || deletingId) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/projects/${id}`);
      await fetchProjects();
    } catch {
      alert(t.deleteProjectFailed);
    } finally {
      setDeletingId(null);
    }
  };

  const handlePatch = async (id, action) => {
    try {
      await api.patch(`/api/projects/${id}/${action}`);
      fetchProjects();
    } catch {
      alert(t.projectActionFailed.replace('{{action}}', t[action] || action));
    }
  };

  const totalPages = Math.ceil(total / PAGINATION_LIMIT);

  return (
    <div className="min-h-screen bg-(--page-bg) text-(--text-primary) font-sans">
      <AppHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Breadcrumb
          items={[
            { label: t.dashboard, path: '/instructor/dashboard' },
            { label: t.projects }
          ]}
        />

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <h1 className="text-2xl font-black text-(--brand-foreground)">{t.projects} ({total})</h1>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <input
              type="text"
              placeholder={ct.search || 'Search...'}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="border border-(--border) bg-(--surface) text-(--text-primary) rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-(--focus) w-48 sm:w-56"
            />
            <div className="flex items-center bg-(--surface-secondary) border border-(--border) rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setIsGridView(true)}
                className={`p-1.5 rounded-lg transition-colors ${isGridView ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
                title="Grid View"
                aria-label="Grid View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setIsGridView(false)}
                className={`p-1.5 rounded-lg transition-colors ${!isGridView ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
                title="List View"
                aria-label="List View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
            </div>
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-(--brand) text-(--on-brand) font-bold text-xs rounded-xl hover:bg-(--brand-hover) transition-colors flex items-center gap-1 shrink-0 shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              {t.createProject}
            </button>
          </div>
        </div>

        {loading ? (
          <div className={isGridView ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-36 bg-(--surface-tertiary) rounded-2xl animate-pulse" />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-xs text-(--text-tertiary) italic bg-(--surface) rounded-2xl border border-(--border) p-8 text-center">{ct.noData}</div>
        ) : isGridView ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <div
                key={p.id}
                data-testid={`project-card-${p.id}`}
                onClick={() => navigate(`/instructor/projects/${p.id}`)}
                className="bg-(--surface) border border-(--border) rounded-2xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-(--text-primary) text-base hover:text-(--brand) transition-colors line-clamp-1">{p.title}</h3>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-xs text-(--text-secondary) line-clamp-2 mb-4">{p.description || ct.noData}</p>
                </div>

                <div className="border-t border-(--border-light) pt-3">
                  <div className="flex items-center justify-between text-[11px] text-(--text-tertiary) mb-3">
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      {p.memberCount || 0} {t.members || 'Members'}
                    </span>
                    <span>{t.created}: {formatDate(p.createdAt, language)}</span>
                  </div>

                  <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => navigate(`/instructor/projects/${p.id}`)} className="text-xs text-(--brand) hover:bg-(--brand-soft) font-bold px-2.5 py-1 rounded-lg transition-colors">{t.detail}</button>
                    <button onClick={() => { setEditId(p.id); setEditTitle(p.title); }} className="text-xs text-(--brand) hover:bg-(--brand-soft) font-bold px-2.5 py-1 rounded-lg transition-colors">{ct.edit}</button>
                    <DeleteConfirm
                      message={t.deleteProjectConfirm}
                      onConfirm={() => handleDelete(p.id)}
                      triggerLabel={ct.delete}
                      confirmLabel={ct.delete}
                      cancelLabel={ct.cancel}
                      disabled={deletingId !== null}
                      className="text-xs text-rose-600 hover:bg-rose-50 font-bold px-2.5 py-1 rounded-lg transition-colors"
                    >
                      {deletingId === p.id ? ct.saving : ct.delete}
                    </DeleteConfirm>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm overflow-hidden divide-y divide-(--border-light)">
            {projects.map(p => (
              <div key={p.id} data-testid={`project-card-${p.id}`} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 hover:bg-(--surface-secondary) transition-colors">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/instructor/projects/${p.id}`)}>
                  {editId === p.id ? (
                    <div className="flex gap-2 items-center" onClick={e => e.stopPropagation()}>
                      <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="flex-1 min-w-0 border border-(--border) bg-(--surface) text-(--text-primary) rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-(--focus)" autoFocus />
                      <button onClick={() => handleUpdate(p.id)} className="text-xs font-bold text-emerald-600 hover:text-emerald-800">{ct.save}</button>
                      <button onClick={() => setEditId(null)} className="text-xs text-slate-400 hover:text-slate-600">{ct.cancel}</button>
                    </div>
                  ) : (
                    <div>
                      <h3 className="font-bold text-(--text-primary) text-sm hover:text-(--brand) transition-colors">{p.title}</h3>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <p className="text-[10px] text-(--text-secondary) flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                          {p.memberCount || 0} {t.members || 'Members'}
                        </p>
                        <p className="text-[10px] text-(--text-tertiary)">
                          {t.lastUpdated || 'Last updated'}: {formatDate(p.updatedAt || p.createdAt, language)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <StatusBadge status={p.status} />
                <div className="flex flex-wrap gap-1 sm:justify-end" onClick={e => e.stopPropagation()}>
                  <button onClick={() => navigate(`/instructor/projects/${p.id}`)} className="text-xs text-(--brand) hover:text-(--brand-hover) font-bold px-2 py-1.5">{t.detail}</button>
                  <button onClick={() => { setEditId(p.id); setEditTitle(p.title); }} className="text-xs text-(--brand) hover:text-(--brand-hover) font-bold px-2 py-1.5">{ct.edit}</button>
                  {p.status === 'ACTIVE' && <button onClick={() => handlePatch(p.id, 'archive')} className="text-xs text-amber-600 hover:text-amber-800 font-bold px-2 py-1.5">{t.archive}</button>}
                  {p.status === 'ARCHIVED' && <button onClick={() => handlePatch(p.id, 'unarchive')} className="text-xs text-(--brand) hover:text-(--brand-hover) font-bold px-2 py-1.5">{t.unarchive}</button>}
                  {p.status === 'ACTIVE' && <button onClick={() => handlePatch(p.id, 'complete')} className="text-xs text-(--brand) hover:text-(--brand-hover) font-bold px-2 py-1.5">{t.complete}</button>}
                  <DeleteConfirm
                    message={t.deleteProjectConfirm}
                    onConfirm={() => handleDelete(p.id)}
                    triggerLabel={ct.delete}
                    confirmLabel={ct.delete}
                    cancelLabel={ct.cancel}
                    disabled={deletingId !== null}
                    className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1.5"
                  >
                    {deletingId === p.id ? ct.saving : ct.delete}
                  </DeleteConfirm>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-6 text-xs">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 bg-(--surface) border border-(--border) rounded-lg disabled:opacity-40 font-bold text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors">{ct.back}</button>
            <span className="text-(--text-tertiary) font-mono font-bold">{t.page} {page + 1} {t.of} {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 bg-(--surface) border border-(--border) rounded-lg disabled:opacity-40 font-bold text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors">{ct.next}</button>
          </div>
        )}
      </main>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-(--surface) border border-(--border) rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4" role="dialog" aria-modal="true">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-(--text-primary)">{t.createProject}</h2>
              <button onClick={() => setShowCreate(false)} className="text-(--text-tertiary) hover:text-(--text-primary)" aria-label={ct.close}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={t.projectTitle} autoFocus className="w-full border border-(--border) bg-(--surface-secondary) text-(--text-primary) rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-(--focus) mb-3" />
            <textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder={t.descriptionOptional} rows={3} className="w-full border border-(--border) bg-(--surface-secondary) text-(--text-primary) rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-(--focus) mb-4 resize-none" />
            <div className="flex justify-end gap-3 font-bold">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs font-semibold text-(--text-secondary) hover:bg-(--surface-secondary) rounded-xl transition-colors">{ct.cancel}</button>
              <button onClick={handleCreate} disabled={creating || !newTitle.trim()} className="px-4 py-2 text-xs font-bold text-(--on-brand) bg-(--brand) hover:bg-(--brand-hover) disabled:opacity-50 rounded-xl shadow-sm transition-colors">{creating ? ct.saving : t.createProject}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
