import { useState, useEffect, useCallback } from 'react';
import { useAdminTour } from '../../../hooks/useAdminTour.js';
import Modal from '../../../components/ui/Modal.jsx';
import { ErrorBlock, AdminPagination, ClearFiltersButton, JsonTree } from './shared.jsx';
import Dropdown from '../../../components/ui/Dropdown.jsx';
import SearchBar from '../../../components/ui/SearchBar.jsx';
import { formatDateTimeSeconds } from '../../../utils/formatters/date.js';
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
  const [actorId, setActorId] = useState('');
  const [clearSeq, setClearSeq] = useState(0);

  // ponytail: one search box routes itself — a UUID becomes the server-side
  // actor filter, anything else stays a client-side text filter.
  // Ceiling: UUID-regex heuristic misroutes UUID-like free text. Revisit
  // when server search supports a single unified query.
  const handleSearch = (v) => {
    setPage(0);
    if (UUID_RE.test(v.trim())) { setActorId(v.trim()); setQ(''); }
    else { setActorId(''); setQ(v); }
  };
  const clearActor = () => {
    setActorId(''); setQ(''); setPage(0);
    setClearSeq((n) => n + 1);
  };
  const hasFilter = q.trim() !== '' || actorId !== '' || actionFilter !== '' || severityFilter !== '';
  const clearAll = () => {
    setActionFilter(''); setSeverityFilter(''); setPage(0);
    clearActor();
  };

  const fetch = useCallback(async (p, filters, signal) => {
    setLoading(true); setError(null);
    try {
      const params = { page: p, size: 6 };
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

  const auditTourSteps = useCallback(() => [
    { popover: { title: t('admin.processGuide'), description: t('admin.guideAuditDesc'), side: 'center' } },
    { element: '[data-guide="logs-filter"]', popover: { title: t('admin.filter'), description: t('admin.guideAuditFilter'), side: 'bottom' } },
    { element: '[data-guide="logs-table"]', popover: { title: t('admin.auditLogs'), description: t('admin.guideAuditTable'), side: 'left' } },
    { popover: { title: t('admin.done'), description: t('admin.guideAuditDone'), side: 'center' } },
  ], [t]);
  const { start: startProcessGuide } = useAdminTour('audit', auditTourSteps);

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

      {/* Filter, search & table — one card (UUID text auto-routes to the actor filter) */}
      <div className="bg-(--surface) rounded-2xl shadow-sm border border-(--border) overflow-hidden">
      <div className="p-4 border-b border-(--border-light) flex flex-col gap-3">
        <div className="flex flex-1 w-full gap-3 items-center flex-col sm:flex-row">
          <SearchBar
            key={clearSeq}
            onDebouncedChange={handleSearch}
            placeholder={t('admin.searchLogs')}
            className="w-full sm:flex-1"
          />

          {/* Severity Filter Dropdown (server-side) */}
          <Dropdown
            value={severityFilter}
            onChange={(v) => { setSeverityFilter(v); setPage(0); }}
            ariaLabel={t('admin.filterBySeverity')}
            className="w-full sm:w-36"
            maxVisibleRows={5}
            options={[
              { value: '', label: t('admin.allSeverities') },
              { value: 'INFO', label: t('admin.severityInfo') },
              { value: 'WARN', label: t('admin.severityWarn') },
              { value: 'CRITICAL', label: t('admin.severityCritical') },
            ]}
          />

          {/* Action Type Filter Dropdown (server-side exact match) */}
          <Dropdown
            value={actionFilter}
            onChange={(v) => { setActionFilter(v); setPage(0); }}
            ariaLabel={t('admin.filterByAction')}
            className="w-full sm:w-44"
            maxVisibleRows={5}
            options={[
              { value: '', label: t('admin.allActions') },
              ...['CREATE', 'UPDATE', 'PROJECT_CREATED', 'PROJECT_UPDATED', 'BAN', 'USER_BANNED'].map((a) => ({ value: a, label: a })),
            ]}
          />

          <ClearFiltersButton active={hasFilter} onClear={clearAll} />
        </div>

        {actorId && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-bold font-mono">
              {actorId}
              <button onClick={clearActor} title={t('admin.clearFilter')} aria-label={t('admin.clearFilter')} className="hover:text-blue-900 font-sans">×</button>
            </span>
          </div>
        )}
      </div>

      {error && <ErrorBlock msg={error} onRetry={() => fetch(page, { actorId, action: actionFilter, severity: severityFilter }, new AbortController().signal)} />}

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
              {loading ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">{Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-full" /></td>
                ))}</tr>
              )) : filteredLogs.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-(--text-tertiary) font-medium">{t('admin.noLogs')}</td></tr>
              ) : filteredLogs.map((log, i) => {
                // Shared formatter: Asia/Ho_Chi_Minh, HH:mm:ss dd/MM/yyyy (was US-style + browser TZ).
                const formattedDate = formatDateTimeSeconds(log.occurredAt);

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
          <AdminPagination page={page} totalPages={logs.totalPages} onChange={setPage} />
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
                <span className="font-bold text-(--text-primary)">{formatDateTimeSeconds(detailLog.occurredAt)}</span>
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
