import { useState, useEffect, useCallback } from 'react';
import { driver } from 'driver.js';
import { ErrorBlock } from './shared.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import UserImportModal from './UserImportModal.jsx';
import UserDetailCard from '../../../components/ui/UserDetailCard.jsx';
import DeleteConfirm from '../../../components/ui/DeleteConfirm.jsx';
import useUndoDelete, { UndoToast } from '../../../components/ui/UndoDelete.jsx';
function UsersSection({ lang, api }) {
  const [users, setUsers] = useState({ content: [], page: 0, totalElements: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const { pending: pendingDelete, start: startDelete, undo: undoDelete, dismiss: dismissDelete } = useUndoDelete({ onUndo: () => fetch(page) });
  const [detailUser, setDetailUser] = useState(null);
  const [loadingAction, setLoadingAction] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', firstName: '', lastName: '', studentCode: '', role: 'STUDENT', devBypass: false });
  const [createErr, setCreateErr] = useState('');
  const [resending, setResending] = useState(false);
  const [showImport, setShowImport] = useState(false);

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
      // ponytail: drop steps whose element is absent (e.g. the DEV-only bypass
      // checkbox in production builds) so the tour never breaks on them.
      const steps = [
        { popover: { title: lang.processGuide, description: lang.guideUsersDesc, side: 'center' } },
        { element: '[data-guide="create-btn"]', popover: { title: lang.createUser, description: lang.guideUsersCreate, side: 'bottom' } },
        { element: '[data-guide="create-verify"]', popover: { title: lang.devBypass, description: lang.guideUsersVerify, side: 'bottom' } },
        { element: '[data-guide="import-btn"]', popover: { title: lang.importUsers, description: lang.guideUsersImport, side: 'bottom' } },
        { element: '[data-guide="preflight"]', popover: { title: lang.preflightTitle, description: lang.guideUsersPreflight, side: 'left' } },
        { element: '[data-guide="table"]', popover: { title: lang.userAccounts, description: lang.guideUsersTable, side: 'left' } },
        { element: '[data-guide="action-ban"]', popover: { title: lang.actions, description: lang.guideUsersActions, side: 'left' } },
        { popover: { title: lang.done, description: lang.guideUsersDone, side: 'center' } },
      ].filter((s) => !s.element || document.querySelector(s.element));
      const d = driver({
        animate: true, showProgress: true,
        steps,
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
    // ponytail: no admin-set passwords — BE always issues a set-password
    // invitation, except the quarantined dev bypass (BE-gated, 403 otherwise).
    try {
      const { studentCode, devBypass, ...base } = createForm;
      const payload = createForm.role === 'STUDENT' ? { ...base, studentCode } : base;
      payload.devBypass = devBypass;
      await api.post('/api/admin/users', payload);
      setShowCreate(false);
      setCreateForm({ email: '', firstName: '', lastName: '', studentCode: '', role: 'STUDENT', devBypass: false });
      fetch(0);
    }
    catch (err) { setCreateErr(err.response?.data?.message || err.message); }
  };

  const resendInvitation = async (u) => {
    setResending(true);
    try {
      await api.post(`/api/admin/users/${u.id}/resend-invitation`);
      const updated = { ...u, accountStatus: 'VERIFYING_EMAIL' };
      setUsers(prev => ({ ...prev, content: prev.content.map(x => x.id === u.id ? updated : x) }));
      setDetailUser(updated);
    }
    catch (e) { setError(e.response?.data?.message || e.message || lang.resendFailed); }
    finally { setResending(false); }
  };

  return (
    <div className="p-8 space-y-6 bg-(--page-bg)">
      {/* Title area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-(--border) pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-(--brand-foreground) tracking-tight">{lang.userAccounts}</h1>
          <p className="text-(--text-secondary) text-xs mt-1">{lang.usersSub}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={startProcessGuide} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-(--text-secondary) bg-(--surface) border border-(--border) rounded-xl hover:bg-(--surface-secondary) shadow-sm transition">
            <svg className="w-4 h-4 text-(--text-tertiary)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{lang.processGuide}</span>
          </button>
          <button data-guide="import-btn" onClick={() => setShowImport(true)}
            className="px-4 py-2 text-xs font-bold text-(--brand-foreground) bg-(--surface) border border-blue-200 hover:bg-blue-50 rounded-xl transition shadow-sm">
            {lang.importUsers}
          </button>
          <button data-guide="create-btn" onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-xs font-bold text-white bg-[#0c162e] hover:bg-[#152447] rounded-xl transition shadow-sm">
            {lang.createUser}
          </button>
        </div>
      </div>

      {/* Search & Filters container */}
      <div className="bg-(--surface) rounded-xl border border-(--border) p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center">
        {/* Search Input */}
        <div className="w-full sm:flex-1 relative">
          <svg className="w-4 h-4 text-(--text-tertiary) absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={lang.searchUsers}
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-4 py-2 bg-(--surface-secondary) border border-(--border) rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
          />
        </div>

        {/* Dropdown 1: Role */}
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
          className="w-full sm:w-36 px-3 py-2 bg-(--surface) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none cursor-pointer"
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
          className="w-full sm:w-36 px-3 py-2 bg-(--surface) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none cursor-pointer"
        >
          <option value="">{lang.allStatuses}</option>
          <option value="ACTIVE">{lang.active}</option>
          <option value="VERIFYING_EMAIL">{lang.verifying}</option>
          <option value="BANNED">{lang.banned}</option>
        </select>

        {/* Adjustments Filter Button */}
        <button className="p-2 bg-(--surface) border border-(--border) rounded-xl hover:bg-(--surface-secondary) transition shadow-sm shrink-0">
          <svg className="w-4 h-4 text-(--text-secondary)" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </button>
      </div>

      {showImport && (
        <UserImportModal
          lang={lang}
          api={api}
          onClose={() => setShowImport(false)}
          onDone={() => fetch(0)}
        />
      )}

      {/* User creation modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-xs" onClick={() => setShowCreate(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="create-user-title" className="bg-(--surface) rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 my-auto max-h-[90vh] overflow-y-auto transform transition-all" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 id="create-user-title" className="font-bold text-lg text-(--text-primary)">{lang.createUser}</h3>
              <button type="button" aria-label={lang.close} onClick={() => setShowCreate(false)} className="text-(--text-tertiary) hover:text-(--text-secondary) transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={doCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-(--text-tertiary) uppercase tracking-wider mb-1">{lang.emailAddress}</label>
                <input name="email" placeholder="email@example.com" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} required className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-(--text-tertiary) uppercase tracking-wider mb-1">{lang.firstName}</label>
                  <input name="firstName" placeholder={lang.firstName} value={createForm.firstName} onChange={e => setCreateForm(p => ({ ...p, firstName: e.target.value }))} required className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-(--text-tertiary) uppercase tracking-wider mb-1">{lang.lastName}</label>
                  <input name="lastName" placeholder={lang.lastName} value={createForm.lastName} onChange={e => setCreateForm(p => ({ ...p, lastName: e.target.value }))} required className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-(--text-tertiary) uppercase tracking-wider mb-1">{lang.userRole}</label>
                <select value={createForm.role} onChange={e => setCreateForm(p => ({ ...p, role: e.target.value, studentCode: '' }))} className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer">
                  <option value="STUDENT">{lang.students}</option>
                  <option value="INSTRUCTOR">{lang.instructors}</option>
                </select>
              </div>
              {createForm.role === 'STUDENT' && (
                <div>
                  <label className="block text-xs font-bold text-(--text-tertiary) uppercase tracking-wider mb-1">{lang.studentCode}</label>
                  <input name="studentCode" maxLength={50} placeholder="SE170608" value={createForm.studentCode} onChange={e => setCreateForm(p => ({ ...p, studentCode: e.target.value }))} required className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-xs uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              )}
              {/* ponytail: dev-only bypass — stripped from production builds by Vite */}
              {import.meta.env.DEV && (
              <label data-guide="create-verify" className="flex items-start gap-2.5 rounded-xl border border-(--border) bg-(--surface-secondary) p-3 cursor-pointer">
                <input type="checkbox" checked={createForm.devBypass} onChange={e => setCreateForm(p => ({ ...p, devBypass: e.target.checked }))} className="mt-0.5 accent-[#1e3a8a]" />
                <span>
                  <span className="block text-xs font-bold text-(--text-primary)">{lang.devBypass}</span>
                  <span className="block text-[11px] text-(--text-secondary) mt-0.5">{lang.devBypassHint}</span>
                </span>
              </label>
              )}
              {createErr && <div className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-100 font-semibold">{createErr}</div>}
              <div className="flex gap-2.5 justify-end pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs font-bold text-(--text-secondary) border border-(--border) rounded-xl hover:bg-(--surface-secondary) transition">{lang.cancel}</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold bg-[#0c162e] text-white rounded-xl hover:bg-[#152447] transition">{lang.createUser}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && <ErrorBlock msg={error} onRetry={() => fetch(page, new AbortController().signal)} />}

      {/* Table Card */}
      <div className="bg-(--surface) rounded-2xl shadow-sm border border-(--border) overflow-hidden">
        <div className="overflow-x-auto">
          <table data-guide="table" className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-(--surface-secondary) text-(--text-tertiary) font-bold uppercase border-b border-(--border-light)">
                <th className="px-6 py-3.5 font-bold tracking-wider"><span className="sr-only">Avatar</span></th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.email}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.fullName}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.studentCode}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.role}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.status}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider text-right">{lang.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border-light) text-(--text-primary) font-semibold">
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">{Array.from({ length: 7 }).map((_, j) => (
                  <td key={j} className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-full" /></td>
                ))}</tr>
              )) : users.content.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-(--text-tertiary) font-medium">{lang.noUsers}</td></tr>
              ) : users.content.map(u => (
                <tr key={u.id} className="hover:bg-(--surface-secondary)/50 transition">
                  <td className="px-6 py-4">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-[#1e3a8a]/10 text-(--brand-foreground) flex items-center justify-center text-[10px] font-black shrink-0" aria-hidden="true">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        `${u.firstName?.[0] || ''}${u.lastName?.[0] || ''}`.toUpperCase() || u.email?.[0]?.toUpperCase() || '?'
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-(--text-secondary) font-medium">{u.email}</td>
                  <td className="px-6 py-4 font-bold text-(--text-primary)">{u.firstName} {u.lastName}</td>
                  <td className="px-6 py-4 font-mono text-(--text-secondary)">{u.role === 'STUDENT' ? u.studentCode || '—' : ''}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${u.role === 'ADMIN' ? 'bg-rose-100 text-rose-700' : u.role === 'INSTRUCTOR' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{u.role}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${u.accountStatus === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : u.accountStatus === 'VERIFYING_EMAIL' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{u.accountStatus === 'ACTIVE' ? lang.active : u.accountStatus === 'VERIFYING_EMAIL' ? lang.verifying : lang.banned}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div data-guide="action-ban" className="flex items-center justify-end gap-4">
                      {/* Detail Icon */}
                      <button onClick={() => setDetailUser(u)} title={lang.details}
                        className="p-1.5 rounded-lg hover:bg-(--surface-tertiary) transition text-(--brand-foreground) shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>

                      {/* Ban / Activate Icon */}
                      <button onClick={() => toggleStatus(u)} disabled={loadingAction[u.id]} title={u.accountStatus === 'ACTIVE' ? lang.banUser : lang.activateUser}
                        className={`p-1.5 rounded-lg hover:bg-(--surface-tertiary) transition disabled:opacity-50 shrink-0 ${u.accountStatus === 'ACTIVE' ? 'text-amber-600' : 'text-emerald-600'}`}>
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
                      <DeleteConfirm
                        message={lang.confirmDelete}
                        onConfirm={() => handleDelete(u)}
                        triggerLabel={lang.deleteUser}
                        confirmLabel={lang.delete}
                        cancelLabel={lang.cancel}
                        disabled={loadingAction['del_' + u.id]}
                        className="p-1.5 rounded-lg hover:bg-(--surface-tertiary) transition disabled:opacity-50 text-rose-600 shrink-0"
                      >
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
                      </DeleteConfirm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-(--border-light) bg-(--surface-secondary)/50 text-xs font-semibold text-(--text-secondary)">
          <span>{lang.showingUsers.replace('{shown}', users.content.length).replace('{total}', users.totalElements || users.content.length)}</span>
          {users.totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(page - 1)} disabled={page === 0}
                className="p-1.5 rounded-lg border border-(--border) text-(--text-tertiary) hover:bg-(--surface-secondary) disabled:opacity-30 disabled:cursor-not-allowed transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {Array.from({ length: users.totalPages }).map((_, i) => {
                if (i === 0 || i === users.totalPages - 1 || (i >= page - 1 && i <= page + 1)) {
                  const isActive = page === i;
                  return (
                    <button key={i} onClick={() => setPage(i)}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition ${isActive ? 'bg-[#1e3a8a] text-white shadow-sm' : 'border border-(--border) text-(--text-secondary) hover:bg-(--surface-secondary)'}`}>
                      {i + 1}
                    </button>
                  );
                } else if (i === 1 || i === users.totalPages - 2) {
                  return <span key={i} className="text-(--text-tertiary) text-xs px-0.5">...</span>;
                }
                return null;
              })}
              <button onClick={() => setPage(page + 1)} disabled={page >= users.totalPages - 1}
                className="p-1.5 rounded-lg border border-(--border) text-(--text-tertiary) hover:bg-(--surface-secondary) disabled:opacity-30 disabled:cursor-not-allowed transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {pendingDelete && <UndoToast pending={pendingDelete} onUndo={undoDelete} onDismiss={dismissDelete} />}

      <Modal open={!!detailUser} onClose={() => setDetailUser(null)} title={lang.details} closeLabel={lang.close} style={{ maxWidth: '480px' }}>
        {detailUser && (
          <div className="text-left">
            <UserDetailCard user={detailUser} />
            {(detailUser.accountStatus === 'PENDING' || detailUser.accountStatus === 'VERIFYING_EMAIL') && (
              <button
                type="button"
                onClick={() => resendInvitation(detailUser)}
                disabled={resending}
                className="mt-4 px-5 py-2.5 text-xs font-bold text-white bg-(--brand) hover:bg-(--brand-hover) rounded-xl transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resending ? lang.saving : lang.resendInvitation}
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}


export { UsersSection };
