import { useState, useEffect, useCallback } from 'react';
import useUndoDelete, { UndoToast } from '../../../components/UndoDelete.jsx';
import DeleteConfirm from '../../../components/DeleteConfirm.jsx';
function SettingsSection({ lang, api }) {
  const [cats, setCats] = useState([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState({ id: null, name: '', description: '' });
  const [catErr, setCatErr] = useState('');
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const { pending: pendingDelete, start: startDelete, undo: undoDelete, dismiss: dismissDelete } = useUndoDelete({ onUndo: () => fetchCats(new AbortController().signal) });

  const fetchCats = useCallback(async (signal) => {
    setCatsLoading(true);
    try {
      const r = await api.get('/api/admin/collection-categories?active=true', { signal });
      setCats(r.data);
    } catch (e) { /* silent */ }
    finally {
      if (!signal || !signal.aborted) setCatsLoading(false);
    }
  }, [api]);

  const fetchConfig = useCallback(async (signal) => {
    setConfigLoading(true);
    try {
      const r = await api.get('/api/admin/config', { signal });
      setConfig(r.data);
    } catch (e) { /* silent */ }
    finally {
      if (!signal || !signal.aborted) setConfigLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const ac = new AbortController();
    fetchCats(ac.signal);
    fetchConfig(ac.signal);
    return () => ac.abort();
  }, [fetchCats, fetchConfig]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const doCatSave = async (e) => {
    e.preventDefault();
    setCatErr('');
    try {
      if (catForm.id) {
        await api.put(`/api/admin/collection-categories/${catForm.id}`, { name: catForm.name, description: catForm.description });
        showToast(lang.categoryUpdated, 'success');
      } else {
        await api.post('/api/admin/collection-categories', { name: catForm.name, description: catForm.description });
        showToast(lang.categoryCreated, 'success');
      }
      setShowCatForm(false);
      setCatForm({ id: null, name: '', description: '' });
      fetchCats(new AbortController().signal);
    } catch (err) {
      setCatErr(err.response?.data?.message || err.message);
      showToast(lang.categorySaveFailed, 'error');
    }
  };

  const doCatDelete = async (id) => {
    try {
      await api.delete(`/api/admin/collection-categories/${id}`);
      showToast(lang.categoryDeletedOk, 'success');
      fetchCats(new AbortController().signal);
    } catch (e) {
      showToast(lang.categoryDeleteFailed, 'error');
    }
  };

  const handleCatDelete = (c) => {
    setCats(prev => prev.filter(x => x.id !== c.id));
    startDelete({
      entityName: c.name,
      entityDetails: c.id,
      header: lang.undoHeader,
      bodyTemplate: lang.undoBodyTemplate,
      caution: lang.undoCaution,
      undoLabel: lang.undoLabel,
      undoRemaining: lang.undoRemaining,
      dismissLabel: lang.dismissLabel,
    }, () => doCatDelete(c.id));
  };

  const exportEnvFile = () => {
    if (!config) return;
    const content = Object.entries(config)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, '_$1').toUpperCase()}=${v}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'evidencepilot_system.env';
    link.click();
    URL.revokeObjectURL(url);
    showToast(lang.envExported, 'success');
  };

  const getConfigSecurity = (key) => {
    const k = key.toLowerCase();
    if (k.includes('jwt') || k.includes('secret') || k.includes('password')) return lang.secretLabel;
    if (k.includes('url') || k.includes('port')) return lang.internalLabel;
    return lang.publicLabel;
  };

  return (
    <div className="p-8 space-y-6 bg-[#f8fafc]">
      {/* Title Area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1e3a8a] tracking-tight">{lang.settings}</h1>
          <p className="text-gray-550 text-xs mt-1">{lang.settingsSub}</p>
        </div>
      </div>

      {/* Grid: Collection Categories (40%) + System Configuration (60%) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Card 1: Collection Categories */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between h-72 lg:col-span-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Collection Categories</h3>
              </div>
              <button
                onClick={() => { setCatForm({ id: null, name: '', description: '' }); setShowCatForm(true); }}
                className="px-3 py-1.5 border border-blue-200 hover:bg-blue-50 text-blue-600 rounded-xl text-[10px] font-extrabold transition cursor-pointer"
              >
                + Add Category
              </button>
            </div>

            {catsLoading ? (
              <div className="animate-pulse space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-6 bg-gray-200 rounded w-full" />)}</div>
            ) : cats.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-6 px-4 border border-dashed border-gray-200 rounded-xl bg-slate-50/50">
                <svg className="w-9 h-9 text-slate-300 mb-1.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span className="font-bold text-xs text-slate-800">No categories created yet</span>
                <p className="text-[10px] text-gray-400 font-semibold mt-0.5 leading-relaxed max-w-xs">Define logical groups for your research collections to improve organization.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 text-xs max-h-36 overflow-y-auto pr-1">
                {cats.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 hover:bg-slate-50/50 rounded px-1 transition">
                    <div>
                      <span className="font-bold text-slate-800">{c.name}</span>
                      {c.description && <span className="text-gray-400 ml-2 font-medium">{c.description}</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => { setCatForm({ id: c.id, name: c.name, description: c.description || '' }); setShowCatForm(true); }} className="px-2 py-1 text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer">Edit</button>
                      <DeleteConfirm
                        message={lang.confirmDeleteCategory}
                        onConfirm={() => handleCatDelete(c)}
                        triggerLabel={lang.delete}
                        confirmLabel={lang.delete}
                        cancelLabel={lang.cancel}
                        className="px-2 py-1 text-[10px] font-bold text-rose-500 bg-rose-50/30 border border-rose-105 rounded-lg hover:bg-rose-50 hover:text-rose-655 transition cursor-pointer"
                      >
                        {lang.delete}
                      </DeleteConfirm>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      {/* System Configuration Table Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden lg:col-span-3 flex flex-col" data-guide="settings-config">
        {/* Table Header and Export */}
        <div className="px-6 py-4.5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.827m11.379-8.16l1.15-.827M8.14 21.27l.707-1.03m7.45-.808l.707-1.03M12 3v1.5m0 15V21m-3.077-8.457l-.513-1.41m5.13 14.095l-.513-1.41M17.785 5.106l-.827 1.15m-8.16 11.379l-.827 1.15m2.096-14.785l-1.03.707m-.808 7.45l-1.03.707" />
              </svg>
              <h3 className="text-sm font-bold text-slate-800 tracking-wider uppercase">System Configuration</h3>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1">🔓 Read-only. Values are injected via environment variables and cannot be modified through the UI.</p>
          </div>
          <button
            onClick={exportEnvFile}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-50 border border-gray-200 hover:bg-slate-100 rounded-xl transition shadow-sm cursor-pointer"
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <span>Export Env File</span>
          </button>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto">
          {configLoading ? (
            <div className="animate-pulse space-y-2 p-6">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-6 bg-gray-200 rounded w-full" />)}</div>
          ) : !config ? (
            <div className="text-sm text-gray-400 text-center py-8">—</div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-gray-100">
                  <th className="px-6 py-3.5">Variable Name</th>
                  <th className="px-6 py-3.5">Runtime Value</th>
                  <th className="px-6 py-3.5 text-right">Security</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-slate-700 font-semibold font-mono">
                {Object.entries(config).map(([k, v]) => {
                  const secLevel = getConfigSecurity(k);
                  return (
                    <tr key={k} className="hover:bg-slate-50/50 transition">
                      <td className="px-6 py-4 text-slate-800 font-bold">
                        {k.replace(/([A-Z])/g, '_$1').toLowerCase()}
                      </td>
                      <td className="px-6 py-4 text-slate-500 select-all max-w-md truncate" title={v}>
                        {v}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${secLevel === 'SECRET'
                            ? 'bg-rose-50 text-rose-700 border-rose-100'
                            : secLevel === 'INTERNAL'
                              ? 'bg-blue-50 text-blue-700 border-blue-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          }`}>
                          {secLevel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      </div>

      {/* Collection Category Modal Overlay */}
      {showCatForm && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-gray-150 transform scale-100 transition-all duration-300">
            <h3 className="font-bold text-slate-800 text-sm mb-4">{catForm.id ? 'Edit Collection Category' : 'Add Collection Category'}</h3>
            <form onSubmit={doCatSave} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Category Name *</label>
                <input
                  placeholder="e.g. Computer Science"
                  value={catForm.name}
                  onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-gray-255 rounded-xl font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Description</label>
                <textarea
                  placeholder="Describe this category group..."
                  value={catForm.description}
                  onChange={e => setCatForm(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 border border-gray-255 rounded-xl font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs resize-none"
                />
              </div>
              {catErr && <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded">{catErr}</div>}
              <div className="flex gap-2.5 justify-end pt-2">
                <button type="button" onClick={() => setShowCatForm(false)} className="px-3.5 py-2 text-xs font-bold text-slate-605 hover:bg-slate-50 rounded-xl transition cursor-pointer">{lang.cancel}</button>
                <button type="submit" className="px-4 py-2 bg-[#0c162e] hover:bg-[#152447] text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer">{catForm.id ? 'Save Changes' : 'Add Category'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Toast Notification Popup */}
      {toast && (
        <div className="fixed top-4 right-4 z-55 flex items-center gap-2.5 px-4.5 py-3 rounded-2xl shadow-xl border animate-slide-in-right bg-white border-slate-100">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${toast.type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
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


/* ----- MAIN SHELL ----- */

/* ----- MAIN SHELL ----- */


export { SettingsSection };
