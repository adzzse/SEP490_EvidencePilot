import { useState, useEffect, useCallback } from 'react';
import { driver } from 'driver.js';
import { ErrorBlock } from './shared.jsx';
import Modal from '../../../components/Modal.jsx';
import useUndoDelete, { UndoToast } from '../../../components/UndoDelete.jsx';
function UsersSection({ lang, api }) {
  const [users, setUsers] = useState({ content: [], page: 0, totalElements: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const { pending: pendingDelete, start: startDelete, undo: undoDelete, dismiss: dismissDelete } = useUndoDelete({ onUndo: () => fetch(page) });
  const [detailUser, setDetailUser] = useState(null);
  const [loadingAction, setLoadingAction] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', firstName: '', lastName: '', studentCode: '', role: 'STUDENT' });
  const [createErr, setCreateErr] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importState, setImportState] = useState({ loading: false, error: '', result: null });

  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetch = useCallback(async (p, signal) => {
    setLoading(true); setError(null);
    try {
      const params = { page: p, size: 5 };
      if (q.trim()) params.q = q.trim();
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;
      const r = await api.get('/api/admin/users', { params, signal });
      setUsers(r.data);
    } catch (e) {
      if (signal && signal.aborted) return;
      setError(e.message || lang.loadFailed);
    } finally {
      if (!signal || !signal.aborted) setLoading(false);
    }
  }, [api, q, roleFilter, statusFilter, lang.loadFailed]);

  useEffect(() => {
    const ac = new AbortController();
    fetch(page, ac.signal);
    return () => ac.abort();
  }, [fetch, page]);

  useEffect(() => {
    setPage(0);
  }, [q, roleFilter, statusFilter]);

  const startProcessGuide = () => {
    setTimeout(() => {
      const d = driver({
        animate: true, showProgress: true,
        steps: [
          { popover: { title: lang.processGuide, description: lang.guideUsersDesc, side: 'center' } },
          { element: '[data-guide="create-btn"]', popover: { title: lang.createUser, description: lang.guideUsersCreate, side: 'bottom' } },
          { element: '[data-guide="import-btn"]', popover: { title: lang.importUsers, description: lang.guideUsersImport, side: 'bottom' } },
          { element: '[data-guide="table"]', popover: { title: lang.userAccounts, description: lang.guideUsersTable, side: 'left' } },
          { element: '[data-guide="action-ban"]', popover: { title: lang.actions, description: lang.guideUsersActions, side: 'left' } },
          { popover: { title: lang.done, description: lang.guideUsersDone, side: 'center' } },
        ],
      }).drive();
    }, 300);
  };

  const toggleStatus = async (u) => {
    const ns = u.accountStatus === 'ACTIVE' ? 'BANNED' : 'ACTIVE';
    setLoadingAction(p => ({ ...p, [u.id]: true }));
    try {
      await api.patch(`/api/admin/users/${u.id}/status`, { status: ns });
      setUsers(prev => ({ ...prev, content: prev.content.map(x => x.id === u.id ? { ...x, accountStatus: ns } : x) }));
    }
    catch (e) { setError(e.message); }
    finally { setLoadingAction(p => ({ ...p, [u.id]: false })); }
  };

  const doDelete = async (id) => {
    try {
      await api.delete(`/api/admin/users/${id}`);
      setUsers(prev => ({ ...prev, content: prev.content.filter(x => x.id !== id) }));
    }
    catch (e) { setError(e.message); }
  };

  const handleDelete = (u) => {
    setUsers(prev => ({ ...prev, content: prev.content.filter(x => x.id !== u.id) }));
    startDelete({
      entityName: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
      entityDetails: u.email,
      header: lang.undoHeaderUser,
      bodyTemplate: lang.undoBodyTemplateUser,
      caution: lang.undoCaution,
      undoLabel: lang.undoLabel,
      undoRemaining: lang.undoRemaining,
      dismissLabel: lang.dismissLabel,
    }, () => doDelete(u.id));
  };

  const doCreate = async (e) => {
    e.preventDefault(); setCreateErr('');
    try {
      const { studentCode, ...base } = createForm;
      await api.post('/api/admin/users', createForm.role === 'STUDENT' ? { ...base, studentCode } : base);
      setShowCreate(false);
      setCreateForm({ email: '', firstName: '', lastName: '', studentCode: '', role: 'STUDENT' });
      fetch(0);
    }
    catch (err) { setCreateErr(err.response?.data?.message || err.message); }
  };

  const doImport = async (e) => {
    e.preventDefault();
    if (!importFile) return;
    setImportState({ loading: true, error: '', result: null });
    try {
      if (!importFile.name.toLowerCase().endsWith('.json')) throw new Error(lang.jsonFileRequired);
      const payload = await importFile.text();
      const { data } = await api.post('/api/admin/users/import', payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      setImportState({ loading: false, error: '', result: data });
      fetch(0);
    } catch (err) {
      const result = err.response?.data?.errors ? err.response.data : null;
      const error = result ? '' : err.response?.data?.message || err.message;
      setImportState({ loading: false, error, result });
    }
  };

  return (
    <div className="p-8 space-y-6 bg-[#f8fafc]">
      {/* Title area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1e3a8a] tracking-tight">{lang.userAccounts}</h1>
          <p className="text-gray-500 text-xs mt-1">{lang.usersSub}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={startProcessGuide} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{lang.processGuide}</span>
          </button>
          <button data-guide="import-btn" onClick={() => { setImportFile(null); setShowImport(true); setImportState({ loading: false, error: '', result: null }); }}
            className="px-4 py-2 text-xs font-bold text-[#1e3a8a] bg-white border border-blue-200 hover:bg-blue-50 rounded-xl transition shadow-sm">
            {lang.importUsers}
          </button>
          <button data-guide="create-btn" onClick={() => setShowCreate(true)} 
            className="px-4 py-2 text-xs font-bold text-white bg-[#0c162e] hover:bg-[#152447] rounded-xl transition shadow-sm">
            {lang.createUser}
          </button>
        </div>
      </div>

      {/* Search & Filters container */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center">
        {/* Search Input */}
        <div className="w-full sm:flex-1 relative">
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            placeholder={lang.searchUsers} 
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold" 
          />
        </div>

        {/* Dropdown 1: Role */}
        <select 
          value={roleFilter} 
          onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
          className="w-full sm:w-36 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
        >
          <option value="">{lang.allRoles}</option>
          <option value="STUDENT">{lang.students}</option>
          <option value="INSTRUCTOR">{lang.instructors}</option>
          <option value="ADMIN">{lang.admin}</option>
        </select>

        {/* Dropdown 2: Status */}
        <select 
          value={statusFilter} 
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="w-full sm:w-36 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
        >
          <option value="">{lang.allStatuses}</option>
          <option value="ACTIVE">{lang.active}</option>
          <option value="BANNED">{lang.banned}</option>
        </select>

        {/* Adjustments Filter Button */}
        <button className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-slate-50 transition shadow-sm shrink-0">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </button>
      </div>

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs" onClick={() => setShowImport(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="import-users-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-4">
              <h3 id="import-users-title" className="text-lg font-bold text-slate-800">{lang.importUsers}</h3>
              <button type="button" aria-label={lang.close} onClick={() => setShowImport(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{lang.importUsersHint}</p>
            <form onSubmit={doImport} className="mt-5 space-y-4">
              <label className="block text-xs font-bold text-slate-600">
                <span>{lang.jsonFile}</span>
                <input type="file" accept=".json,application/json" required onChange={e => { setImportFile(e.target.files?.[0] || null); setImportState({ loading: false, error: '', result: null }); }} className="mt-2 block w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-blue-100 file:px-3 file:py-1.5 file:font-bold file:text-blue-800" />
              </label>
              {importState.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{importState.error}</div>}
              {importState.result && importState.result.errors?.length === 0 && (
                <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                  {lang.importSuccess.replace('{created}', importState.result.created).replace('{updated}', importState.result.updated)}
                </div>
              )}
              {importState.result?.errors?.length > 0 && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <p className="font-bold">{lang.importFailed}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {importState.result.errors.map((item, index) => (
                      <li key={`${item.item}-${item.field}-${index}`}>{lang.item} {item.item}: {item.field} — {item.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2.5 pt-2">
                <button type="button" onClick={() => setShowImport(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50">{lang.cancel}</button>
                <button type="submit" disabled={!importFile || importState.loading} className="rounded-xl bg-[#0c162e] px-4 py-2 text-xs font-bold text-white hover:bg-[#152447] disabled:cursor-not-allowed disabled:opacity-50">
                  {importState.loading ? lang.importing : lang.importUsers}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User creation modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs" onClick={() => setShowCreate(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="create-user-title" className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 transform transition-all" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 id="create-user-title" className="font-bold text-lg text-slate-800">{lang.createUser}</h3>
              <button type="button" aria-label={lang.close} onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={doCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{lang.emailAddress}</label>
                <input name="email" placeholder="email@example.com" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} required className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{lang.firstName}</label>
                  <input name="firstName" placeholder={lang.firstName} value={createForm.firstName} onChange={e => setCreateForm(p => ({ ...p, firstName: e.target.value }))} required className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{lang.lastName}</label>
                  <input name="lastName" placeholder={lang.lastName} value={createForm.lastName} onChange={e => setCreateForm(p => ({ ...p, lastName: e.target.value }))} required className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{lang.userRole}</label>
                <select value={createForm.role} onChange={e => setCreateForm(p => ({ ...p, role: e.target.value, studentCode: '' }))} className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer">
                  <option value="STUDENT">{lang.students}</option>
                  <option value="INSTRUCTOR">{lang.instructors}</option>
                </select>
              </div>
              {createForm.role === 'STUDENT' && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{lang.studentCode}</label>
                  <input name="studentCode" maxLength={50} placeholder="SE170608" value={createForm.studentCode} onChange={e => setCreateForm(p => ({ ...p, studentCode: e.target.value }))} required className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              )}
              <p className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-800">{lang.temporaryPasswordHint}</p>
              {createErr && <div className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-100 font-semibold">{createErr}</div>}
              <div className="flex gap-2.5 justify-end pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">{lang.cancel}</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold bg-[#0c162e] text-white rounded-xl hover:bg-[#152447] transition">{lang.createUser}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && <ErrorBlock msg={error} onRetry={() => fetch(page, new AbortController().signal)} />}

      {/* Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table data-guide="table" className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-gray-100">
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.email}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.fullName}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.studentCode}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.role}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.status}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider text-right">{lang.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-slate-700 font-semibold">
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">{Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-full" /></td>
                ))}</tr>
              )) : users.content.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400 font-medium">{lang.noUsers}</td></tr>
              ) : users.content.map(u => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-6 py-4 font-mono text-gray-600 font-medium">{u.email}</td>
                  <td className="px-6 py-4 font-bold text-slate-800">{u.firstName} {u.lastName}</td>
                  <td className="px-6 py-4 font-mono text-slate-600">{u.role === 'STUDENT' ? u.studentCode || '—' : ''}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${u.role === 'ADMIN' ? 'bg-rose-100 text-rose-700' : u.role === 'INSTRUCTOR' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{u.role}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${u.accountStatus === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{u.accountStatus === 'ACTIVE' ? lang.active : lang.banned}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-4">
                      {/* Detail Icon */}
                      <button onClick={() => setDetailUser(u)} title={lang.details}
                        className="p-1.5 rounded-lg hover:bg-slate-100 transition text-[#1e3a8a] shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>

                      {/* Ban / Activate Icon */}
                      <button onClick={() => toggleStatus(u)} disabled={loadingAction[u.id]} title={u.accountStatus === 'ACTIVE' ? lang.banUser : lang.activateUser}
                        className={`p-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-50 shrink-0 ${u.accountStatus === 'ACTIVE' ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {loadingAction[u.id] ? (
                          <span className="text-[10px]">...</span>
                        ) : u.accountStatus === 'ACTIVE' ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M4.9 19.1L19.1 4.9" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9 12l2 2 4-4" />
                          </svg>
                        )}
                      </button>

                      {/* Delete Icon */}
                      <button onClick={() => handleDelete(u)} disabled={loadingAction['del_' + u.id]} title={lang.deleteUser}
                        className="p-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-50 text-rose-600 shrink-0">
                        {loadingAction['del_' + u.id] ? (
                          <span className="text-[10px]">...</span>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            <line x1="10" x2="10" y1="11" y2="17" />
                            <line x1="14" x2="14" y1="11" y2="17" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Footer / Pagination */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-100 bg-gray-50/50 text-xs font-semibold text-gray-500">
          <span>{lang.showingUsers.replace('{shown}', users.content.length).replace('{total}', users.totalElements || users.content.length)}</span>
          {users.totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(page - 1)} disabled={page === 0}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {Array.from({ length: users.totalPages }).map((_, i) => {
                if (i === 0 || i === users.totalPages - 1 || (i >= page - 1 && i <= page + 1)) {
                  const isActive = page === i;
                  return (
                    <button key={i} onClick={() => setPage(i)}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition ${isActive ? 'bg-[#1e3a8a] text-white shadow-sm' : 'border border-gray-200 text-gray-600 hover:bg-slate-50'}`}>
                      {i + 1}
                    </button>
                  );
                } else if (i === 1 || i === users.totalPages - 2) {
                  return <span key={i} className="text-gray-400 text-xs px-0.5">...</span>;
                }
                return null;
              })}
              <button onClick={() => setPage(page + 1)} disabled={page >= users.totalPages - 1}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {pendingDelete && <UndoToast pending={pendingDelete} onUndo={undoDelete} onDismiss={dismissDelete} />}

      <Modal open={!!detailUser} onClose={() => setDetailUser(null)} title={lang.details} closeLabel={lang.close}>
        {detailUser && (
          <div className="space-y-3 text-xs">
            {[
              { label: lang.fullName, value: `${detailUser.firstName || ''} ${detailUser.lastName || ''}`.trim() },
              { label: lang.email, value: detailUser.email },
              { label: lang.role, value: detailUser.role },
              { label: lang.studentCode, value: detailUser.role === 'STUDENT' ? detailUser.studentCode || '—' : '—' },
              { label: lang.status, value: detailUser.accountStatus },
              { label: lang.createdAt, value: detailUser.createdAt ? new Date(detailUser.createdAt).toLocaleString() : '—' },
            ].map(row => (
              <div key={row.label} className="flex justify-between gap-4 border-b border-gray-100 pb-2">
                <span className="font-bold text-gray-400">{row.label}</span>
                <span className="text-right font-semibold text-slate-800 break-words">{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}


export { UsersSection };
