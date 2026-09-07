import { useState, useEffect, useCallback } from 'react';
import { driver } from 'driver.js';
import Modal from '../../../components/ui/Modal.jsx';
import { ErrorBlock, JsonTree } from './shared.jsx';
import SearchBar from '../../../components/ui/SearchBar.jsx';
import { useTranslation } from 'react-i18next';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function AuditLogsSection({ api }) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState({ content: [], page: 0, totalElements: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [detailLog, setDetailLog] = useState(null);

  const [q, setQ] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [actorInput, setActorInput] = useState('');
  const [actorId, setActorId] = useState('');

  const fetch = useCallback(async (p, filters, signal) => {
    setLoading(true); setError(null);
    try {
      const params = { page: p, size: 5 };
      if (filters.actorId) params.actorId = filters.actorId;
      if (filters.action) params.action = filters.action;
      if (filters.severity) params.severity = filters.severity;
      const r = await api.get('/api/admin/audit-logs', { params, signal });
      setLogs(r.data);
    } catch (e) {
      if (signal && signal.aborted) return;
      setError(e.message || t('admin.loadFailed'));
    } finally {
      if (!signal || !signal.aborted) setLoading(false);
    }
  }, [api, t('admin.loadFailed')]);

  useEffect(() => {
    const ac = new AbortController();
    fetch(page, { actorId, action: actionFilter, severity: severityFilter }, ac.signal);
    return () => ac.abort();
  }, [fetch, page, actorId, actionFilter, severityFilter]);

  const applyActorInput = () => {
    const v = actorInput.trim();
    if (v !== '' && !UUID_RE.test(v)) {
      setError(t('admin.invalidActorId'));
      return;
    }
    setPage(0);
    setActorId(v);
  };

  const startProcessGuide = () => {
    setTimeout(() => {
      driver({
        animate: true, showProgress: true,
        steps: [
          { popover: { title: t('admin.processGuide'), description: t('admin.guideAuditDesc'), side: 'center' } },
          { element: '[data-guide="logs-filter"]', popover: { title: t('admin.filter'), description: t('admin.guideAuditFilter'), side: 'bottom' } },
          { element: '[data-guide="logs-table"]', popover: { title: t('admin.auditLogs'), description: t('admin.guideAuditTable'), side: 'left' } },
          { popover: { title: t('admin.done'), description: t('admin.guideAuditDone'), side: 'center' } },
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

  const getSeverityBadge = (severity) => {
    const styles = {
      CRITICAL: 'bg-rose-50 text-rose-700 border-rose-100',
      WARN: 'bg-amber-50 text-amber-700 border-amber-100',
      INFO: 'bg-blue-50 text-blue-700 border-blue-100',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${styles[severity] || 'bg-(--surface-secondary) text-(--text-primary) border-(--border-light)'}`}>
        {severity || '—'}
      </span>
    );
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'PROJECT_UPDATED':
      case 'UPDATE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">{t('admin.logActionProjectUpdated')}</span>;
      case 'PROJECT_CREATED':
      case 'CREATE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">{t('admin.logActionProjectCreated')}</span>;
      case 'USER_BANNED':
      case 'BAN':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100">{t('admin.logActionUserBanned')}</span>;
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
    if (q.trim() === '') return true;
    const needle = q.toLowerCase();
    return (log.actorEmail ?? '').toLowerCase().includes(needle)
      || ((log.entityType ?? '') + '#' + (log.entityId ?? '')).toLowerCase().includes(needle);
  });

  return (
    <div className="p-8 space-y-6 bg-(--page-bg)">
      {/* Title Area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-(--border) pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-(--brand-foreground) tracking-tight">{t('admin.auditLogs')}</h1>
          <p className="text-(--text-secondary) text-xs mt-1">{t('admin.auditSub')}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => fetch(page, { actorId, action: actionFilter, severity: severityFilter })} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#0c162e] hover:bg-[#152447] rounded-xl transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{t('admin.refreshLogs')}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-(--surface) rounded-xl border border-(--border) p-4 shadow-sm flex flex-col gap-3">
        <div className="flex flex-1 w-full gap-3 items-center flex-col sm:flex-row">
          <SearchBar
            onDebouncedChange={(v) => { setQ(v); setPage(0); }}
            placeholder={t('admin.searchLogs')}
            className="w-full sm:flex-1"
          />

          {/* Severity Filter Dropdown (server-side) */}
          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(0); }}
            aria-label={t('admin.filterBySeverity')}
            className="w-full sm:w-36 px-3 py-2 bg-(--surface) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none cursor-pointer"
          >
            <option value="">{t('admin.allSeverities')}</option>
            <option value="INFO">{t('admin.severityInfo')}</option>
            <option value="WARN">{t('admin.severityWarn')}</option>
            <option value="CRITICAL">{t('admin.severityCritical')}</option>
          </select>

          {/* Action Filter (server-side exact match) */}
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value.trim()); setPage(0); }}
            placeholder={t('admin.filterByAction')}
            aria-label={t('admin.filterByAction')}
            spellCheck={false}
            className="w-full sm:w-44 px-3 py-2 bg-(--surface) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-(--text-tertiary)"
          />
        </div>

        <div className="flex w-full gap-3 items-center flex-col sm:flex-row">
          {/* Actor ID search (server-side) */}
          <div className="flex flex-1 gap-2 w-full">
            <input
              type="text"
              value={actorInput}
              onChange={(e) => setActorInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyActorInput(); }}
              placeholder={t('admin.filterByActor')}
              aria-label={t('admin.filterByActor')}
              spellCheck={false}
              className="flex-1 px-3 py-2 bg-(--surface) border border-(--border) rounded-xl text-xs font-mono text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-(--text-tertiary) placeholder:font-sans"
            />
            <button
              onClick={applyActorInput}
              className="px-4 py-2 text-xs font-bold text-(--brand-foreground) bg-(--surface) border border-(--border) rounded-xl hover:bg-(--surface-secondary) transition shadow-sm shrink-0"
            >
              {t('admin.filter')}
            </button>
            {actorId && (
              <button
                onClick={() => { setActorInput(''); setActorId(''); setPage(0); }}
                className="px-3 py-2 text-xs font-bold text-(--text-tertiary) hover:text-(--text-primary) transition shrink-0"
                title={t('admin.clearFilter')}
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <ErrorBlock msg={error} onRetry={() => fetch(page, { actorId, action: actionFilter, severity: severityFilter }, new AbortController().signal)} />}

      {/* Table Card */}
      <div className="bg-(--surface) rounded-2xl shadow-sm border border-(--border) overflow-hidden">
        <div className="overflow-x-auto">
          <table data-guide="logs-table" className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-(--surface-secondary) text-(--text-tertiary) font-bold uppercase border-b border-(--border-light)">
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.timestamp')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.actor')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.action')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.severity')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.entity')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border-light) text-(--text-primary) font-semibold">
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">{Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-full" /></td>
                ))}</tr>
              )) : filteredLogs.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-(--text-tertiary) font-medium">{t('admin.noLogs')}</td></tr>
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

                    {/* Severity Badge (backend-owned) */}
                    <td className="px-6 py-4">
                      {getSeverityBadge(log.severity)}
                    </td>

                    {/* Entity */}
                    <td className="px-6 py-4 text-(--text-secondary) font-mono font-medium">
                      {(log.entityType ?? '—')}#{log.entityId ?? ''}
                    </td>

                    {/* Details */}
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setDetailLog(log)} title={t('admin.details')}
                        className="px-3 py-1.5 text-[10px] font-bold text-(--text-secondary) bg-(--surface-secondary) border border-(--border) rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition shadow-sm cursor-pointer">
                        {t('admin.details')}
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
          <span>{t('admin.showingLogs', { shown: filteredLogs.length, total: logs.totalElements ?? 0 })}</span>
          {logs.totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(page - 1)} disabled={page === 0}
                className="px-3 py-1.5 rounded-lg border border-(--border) text-(--text-secondary) hover:bg-(--surface-secondary) disabled:opacity-30 disabled:cursor-not-allowed transition">
                {t('admin.prev')}
              </button>
              <span>{t('admin.page')} {page + 1} / {logs.totalPages}</span>
              <button onClick={() => setPage(page + 1)} disabled={page >= logs.totalPages - 1}
                className="px-3 py-1.5 rounded-lg border border-(--border) text-(--text-secondary) hover:bg-(--surface-secondary) disabled:opacity-30 disabled:cursor-not-allowed transition">
                {t('admin.next')}
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal open={!!detailLog} onClose={() => setDetailLog(null)} title={t('admin.details')} closeLabel={t('admin.close')}>
        {detailLog && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t('admin.actor')}</span>
                <span className="font-bold text-(--text-primary)">{detailLog.actorEmail || 'System'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t('admin.action')}</span>
                <span className="font-bold text-(--text-primary)">{detailLog.action}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t('admin.severity')}</span>
                <span className="font-bold text-(--text-primary)">{getSeverityBadge(detailLog.severity)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t('admin.entity')}</span>
                <span className="font-bold text-(--text-primary) font-mono">{(detailLog.entityType ?? '—')}#{detailLog.entityId ?? ''}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t('admin.timestamp')}</span>
                <span className="font-bold text-(--text-primary)">{new Date(detailLog.occurredAt).toLocaleString()}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-(--surface-secondary) border border-(--border) rounded-xl p-4 min-w-0">
                <span className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider block mb-2">{t('admin.previousValue')}</span>
                <div className="text-xs font-mono text-(--text-primary) whitespace-pre-wrap break-words max-h-60 overflow-y-auto pr-1">
                  <JsonTree data={parseMaybe(detailLog.oldValue)} />
                </div>
              </div>
              <div className="bg-(--surface-secondary) border border-(--border) rounded-xl p-4 min-w-0">
                <span className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider block mb-2">{t('admin.newValue')}</span>
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
