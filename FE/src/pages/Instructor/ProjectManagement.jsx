import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader.jsx';
import api from '../../api.js';
import { commonText, instructorText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';
import StatusBadge from '../../components/StatusBadge.jsx';
import DeleteConfirm from '../../components/DeleteConfirm.jsx';

export default function ProjectManagement() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const ct = commonText[language];
  const t = instructorText[language];

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchProjects = async () => {
    setLoading(true);
    try { const r = await api.get(`/api/projects?page=${page}&size=10`); setProjects(r.data.content || []); setTotal(r.data.totalElements || 0); }
    catch { setProjects([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchProjects(); }, [page]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try { await api.post('/api/projects', { title: newTitle, description: newDescription }); setShowCreate(false); setNewTitle(''); setNewDescription(''); fetchProjects(); }
    catch { alert(t.createProjectFailed); }
    finally { setCreating(false); }
  };

  const handleUpdate = async (id) => {
    if (!editTitle.trim()) return;
    try { await api.put(`/api/projects/${id}`, { title: editTitle }); setEditId(null); setEditTitle(''); fetchProjects(); }
    catch { alert(t.updateProjectFailed); }
  };

  const handleDelete = async (id) => {
    if (!id || deletingId) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/projects/${id}`);
      await fetchProjects();
    } catch { alert(t.deleteProjectFailed); }
    finally { setDeletingId(null); }
  };

  const handlePatch = async (id, action) => {
    try { await api.patch(`/api/projects/${id}/${action}`); fetchProjects(); }
    catch { alert(t.projectActionFailed.replace('{{action}}', t[action] || action)); }
  };

  return (
    <div className="min-h-screen bg-(--page-bg) text-(--text-primary) font-sans">
      <AppHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex justify-between items-center gap-4 mb-6">
          <h1 className="text-2xl font-black text-(--brand-foreground)">{t.projects} ({total})</h1>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-(--brand) text-(--on-brand) font-bold text-xs rounded-xl hover:bg-(--brand-hover) transition-colors flex items-center gap-1 shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            {t.createProject}
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-(--surface-tertiary) rounded-xl animate-pulse" />)}</div>
        ) : projects.length === 0 ? (
          <div className="text-xs text-(--text-tertiary) italic bg-(--surface) rounded-2xl border border-(--border) p-8 text-center">{ct.noData}</div>
        ) : (
          <div className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm overflow-hidden">
            <div className="divide-y divide-(--border-light)">
              {projects.map(p => (
                <div key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 hover:bg-(--surface-secondary) transition-colors">
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
                        <p className="text-[10px] text-(--text-tertiary) font-mono mt-0.5">{p.id}</p>
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
          </div>
        )}

        <div className="flex justify-between items-center mt-4 text-xs">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 bg-(--surface) border border-(--border) rounded-lg disabled:opacity-40 font-bold text-(--text-secondary)">{ct.back}</button>
          <span className="text-(--text-tertiary) font-mono">{t.page} {page + 1}</span>
          <button disabled={(page + 1) * 10 >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 bg-(--surface) border border-(--border) rounded-lg disabled:opacity-40 font-bold text-(--text-secondary)">{ct.next}</button>
        </div>
      </main>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-(--surface) border border-(--border) rounded-xl shadow-2xl w-full max-w-md p-6 mx-4" role="dialog" aria-modal="true">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-(--text-primary)">{t.createProject}</h2>
              <button onClick={() => setShowCreate(false)} className="text-(--text-tertiary) hover:text-(--text-primary)" aria-label={ct.close}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={t.projectTitle} autoFocus className="w-full border border-(--border) bg-(--surface) text-(--text-primary) rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-(--focus) mb-3" />
            <textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder={t.descriptionOptional} rows={3} className="w-full border border-(--border) bg-(--surface) text-(--text-primary) rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-(--focus) mb-4 resize-none" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-semibold text-(--text-secondary) hover:bg-(--surface-secondary) rounded-lg transition-colors">{ct.cancel}</button>
              <button onClick={handleCreate} disabled={creating || !newTitle.trim()} className="px-4 py-2 text-sm font-bold text-(--on-brand) bg-(--brand) hover:bg-(--brand-hover) disabled:bg-(--border) rounded-lg shadow-sm transition-colors">{creating ? ct.saving : t.createProject}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
