import { useState, useEffect, useCallback } from 'react';
import { driver } from 'driver.js';
import Modal from '../../../components/ui/Modal.jsx';
import { ErrorBlock, JsonTree } from './shared.jsx';
function AuditLogsSection({ lang, api }) {
  const [logs, setLogs] = useState({ content: [], page: 0, totalElements: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [detailLog, setDetailLog] = useState(null);

  const [q, setQ] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  const fetch = useCallback(async (p, actorId, signal) => {
    setLoading(true); setError(null);
    try {
      const params = { page: p, size: 5 };
      if (actorId) params.actorId = actorId;
      const r = await api.get('/api/admin/audit-logs', { params, signal });
      setLogs(r.data);
    } catch (e) {
      if (signal && signal.aborted) return;
      setError(e.message || lang.loadFailed);
    } finally {
      if (!signal || !signal.aborted) setLoading(false);
    }
  }, [api, lang.loadFailed]);

  useEffect(() => {
    const ac = new AbortController();
    fetch(page, userFilter, ac.signal);
    return () => ac.abort();
  }, [fetch, page, userFilter]);

  const startProcessGuide = () => {
    setTimeout(() => {
      driver({
        animate: true, showProgress: true,
        steps: [
          { popover: { title: lang.processGuide, description: lang.guideAuditDesc, side: 'center' } },
          { element: '[data-guide="logs-filter"]', popover: { title: lang.filter, description: lang.guideAuditFilter, side: 'bottom' } },
          { element: '[data-guide="logs-table"]', popover: { title: lang.auditLogs, description: lang.guideAuditTable, side: 'left' } },
          { popover: { title: lang.done, description: lang.guideAuditDone, side: 'center' } },
        ],
      }).drive();
    }, 300);
  };

  const getActorAvatar = (email) => {
    const safeEmail = email ?? '';
    const isBot = safeEmail.includes('bot');
    const initial = (safeEmail.charAt(0) || '?').toUpperCase();
    if (isBot) {
      return (
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0 bg-rose-400">
          {initial}
        </div>
      );
    } else {
      return (
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0 bg-blue-400">
          {initial}
        </div>
      );
    }
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'PROJECT_UPDATED':
      case 'UPDATE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">PROJECT_UPDATED</span>;
      case 'PROJECT_CREATED':
      case 'CREATE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">PROJECT_CREATED</span>;
      case 'USER_BANNED':
      case 'BAN':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100">USER_BANNED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-(--surface-secondary) text-(--text-primary) border border-(--border-light)">{action}</span>;
    }
  };

  const displayLogs = logs;

  const parseMaybe = (s) => {
    if (s == null || s === '') return s;
    try { return JSON.parse(s); } catch { return s; }
  };

  const filteredLogs = displayLogs.content.filter(log => {
    const matchesQ = q.trim() === '' || 
      ((log.actorEmail ?? '').toLowerCase().includes(q.toLowerCase()) || 
      ((log.entityType ?? '') + '#' + (log.entityId ?? '')).toLowerCase().includes(q.toLowerCase()));
    
    const matchesAction = actionFilter === '' || log.action === actionFilter;

    return matchesQ && matchesAction;
  });

  return (
    <div className="p-8 space-y-6 bg-(--page-bg)">
      {/* Title Area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-(--border) pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-(--brand-foreground) tracking-tight">{lang.auditLogs}</h1>
          <p className="text-(--text-secondary) text-xs mt-1">{lang.auditSub}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => fetch(page, userFilter)} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#0c162e] hover:bg-[#152447] rounded-xl transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{lang.refreshLogs}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Logs */}
        <div className="bg-(--surface) rounded-xl border border-(--border) p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-(--surface-secondary) flex items-center justify-center shrink-0 border border-(--border-light)">
            <svg className="w-6 h-6 text-(--text-secondary)" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">TOTAL LOGS</span>
            <span className="text-2xl font-extrabold text-(--text-primary)">{logs.totalElements ?? '—'}</span>
          </div>
        </div>

        {/* Security Alerts */}
        <div className="bg-(--surface) rounded-xl border border-(--border) p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center shrink-0 border border-rose-100">
            <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">SECURITY ALERTS</span>
            <span className="text-2xl font-extrabold text-(--text-primary)">—</span>
          </div>
        </div>

        {/* System Events */}
        <div className="bg-(--surface) rounded-xl border border-(--border) p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">SYSTEM EVENTS</span>
            <span className="text-2xl font-extrabold text-(--text-primary)">—</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-(--surface) rounded-xl border border-(--border) p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 w-full gap-3 items-center">
          {/* Search Input */}
          <div className="flex-1 relative">
            <svg className="w-4 h-4 text-(--text-tertiary) absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder={lang.searchLogs} 
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              className="w-full pl-9 pr-4 py-2 bg-(--surface-secondary) border border-(--border) rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold" 
            />
          </div>

          {/* Action Filter Dropdown */}
          <select 
            value={actionFilter} 
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            className="w-36 px-3 py-2 bg-(--surface) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none cursor-pointer"
          >
            <option value="">{lang.actionAll}</option>
            <option value="PROJECT_UPDATED">{lang.actionUpdated}</option>
            <option value="PROJECT_CREATED">{lang.actionCreated}</option>
            <option value="USER_BANNED">{lang.actionBanned}</option>
          </select>

          {/* User Filter Dropdown (server-side actorId filter) */}
          <select 
            value={userFilter} 
            onChange={(e) => { setUserFilter(e.target.value); setPage(0); }}
            className="w-40 px-3 py-2 bg-(--surface) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none cursor-pointer"
          >
            <option value="">{lang.userAll}</option>
            {[...new Map(logs.content.map(l => [l.actorId, l.actorEmail ?? 'System']).filter(([id]) => id))].map(([id, email]) => (
              <option key={id} value={id}>{email}</option>
            ))}
          </select>

          {/* Settings Filter Button */}
          <button className="p-2 bg-(--surface) border border-(--border) rounded-xl hover:bg-(--surface-secondary) shadow-sm transition shrink-0">
            <svg className="w-4 h-4 text-(--text-secondary)" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        </div>
      </div>

      {error && <ErrorBlock msg={error} onRetry={() => fetch(page, userFilter, new AbortController().signal)} />}

      {/* Table Card */}
      <div className="bg-(--surface) rounded-2xl shadow-sm border border-(--border) overflow-hidden">
        <div className="overflow-x-auto">
          <table data-guide="logs-table" className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-(--surface-secondary) text-(--text-tertiary) font-bold uppercase border-b border-(--border-light)">
                <th className="px-6 py-3.5 font-bold tracking-wider">Timestamp</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">Actor</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">Action</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">Entity</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{lang.details}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border-light) text-(--text-primary) font-semibold">
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">{Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-full" /></td>
                ))}</tr>
              )) : filteredLogs.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-(--text-tertiary) font-medium">{lang.noLogs}</td></tr>
              ) : filteredLogs.map((log, i) => {
                const dateObj = new Date(log.occurredAt);
                const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }) + `, ` + dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });

                return (
                  <tr key={log.actorId + log.occurredAt + i} className="hover:bg-(--surface-secondary)/50 transition">
                    {/* Timestamp */}
                    <td className="px-6 py-4 text-(--text-secondary) font-medium">{formattedDate}</td>

                    {/* Actor with avatar */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getActorAvatar(log.actorEmail)}
                        <span className="text-(--text-primary) font-bold">{log.actorEmail || 'System'}</span>
                      </div>
                    </td>

                    {/* Action Badge */}
                    <td className="px-6 py-4">
                      {getActionBadge(log.action)}
                    </td>

                    {/* Entity */}
                    <td className="px-6 py-4 text-(--text-secondary) font-mono font-medium">
                      {(log.entityType ?? '—')}#{log.entityId ?? ''}
                    </td>

                    {/* Details */}
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setDetailLog(log)} title={lang.details}
                        className="px-3 py-1.5 text-[10px] font-bold text-(--text-secondary) bg-(--surface-secondary) border border-(--border) rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition shadow-sm cursor-pointer">
                        {lang.details}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-(--border-light) bg-(--surface-secondary)/50 text-xs font-semibold text-(--text-secondary)">
          <span>{lang.showingLogs.replace('{shown}', filteredLogs.length).replace('{total}', logs.totalElements ?? 0)}</span>
          {logs.totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(page - 1)} disabled={page === 0}
                className="px-3 py-1.5 rounded-lg border border-(--border) text-(--text-secondary) hover:bg-(--surface-secondary) disabled:opacity-30 disabled:cursor-not-allowed transition">
                {lang.prev}
              </button>
              <span>{lang.page} {page + 1} / {logs.totalPages}</span>
              <button onClick={() => setPage(page + 1)} disabled={page >= logs.totalPages - 1}
                className="px-3 py-1.5 rounded-lg border border-(--border) text-(--text-secondary) hover:bg-(--surface-secondary) disabled:opacity-30 disabled:cursor-not-allowed transition">
                {lang.next}
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal open={!!detailLog} onClose={() => setDetailLog(null)} title={lang.details} closeLabel={lang.close}>
        {detailLog && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{lang.actor}</span>
                <span className="font-bold text-(--text-primary)">{detailLog.actorEmail || 'System'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{lang.action}</span>
                <span className="font-bold text-(--text-primary)">{detailLog.action}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{lang.entity}</span>
                <span className="font-bold text-(--text-primary) font-mono">{(detailLog.entityType ?? '—')}#{detailLog.entityId ?? ''}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{lang.timestamp}</span>
                <span className="font-bold text-(--text-primary)">{new Date(detailLog.occurredAt).toLocaleString()}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-(--surface-secondary) border border-(--border) rounded-xl p-4 min-w-0">
                <span className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider block mb-2">Previous value</span>
                <div className="text-xs font-mono text-(--text-primary) whitespace-pre-wrap break-words max-h-60 overflow-y-auto pr-1">
                  <JsonTree data={parseMaybe(detailLog.oldValue)} />
                </div>
              </div>
              <div className="bg-(--surface-secondary) border border-(--border) rounded-xl p-4 min-w-0">
                <span className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider block mb-2">New value</span>
                <div className="text-xs font-mono text-(--text-primary) whitespace-pre-wrap break-words max-h-60 overflow-y-auto pr-1">
                  <JsonTree data={parseMaybe(detailLog.newValue)} />
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}


export { AuditLogsSection };
