import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '../../../components/ui/Modal.jsx';
import { PageSkeleton, JsonTree } from './shared.jsx';
import SearchBar from '../../../components/ui/SearchBar.jsx';
import { useToast } from '../../../components/ui/Toast.jsx';
import { useNotification } from '../../../context/NotificationContext.jsx';
import { useTranslation } from 'react-i18next';

const TABS = ['All', 'Pending', 'Processing', 'Failed', 'Ready'];

// Endpoint list key -> tab key.
function listKeyForStatus(status) {
  if (status === 'QUEUED') return 'queued';
  if (status === 'PROCESSING') return 'processing';
  if (status === 'READY' || status === 'COMPLETED') return 'ready';
  if (status === 'FAILED' || status === 'PARTIAL') return 'failed';
  return null;
}

function tabForListKey(listKey) {
  if (listKey === 'queued') return 'Pending';
  if (listKey === 'processing') return 'Processing';
  if (listKey === 'failed') return 'Failed';
  if (listKey === 'ready') return 'Ready';
  return 'All';
}

function QueueSection({ api }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { notifications } = useNotification();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [detailDoc, setDetailDoc] = useState(null);
  const [externalUpdates, setExternalUpdates] = useState(0);
  const seenEventIds = useRef(new Set());

  const queueQuery = useQuery({
    queryKey: ['extractionQueue', { dateFrom, dateTo }],
    queryFn: ({ signal }) => {
      const params = {};
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      return api.get('/api/admin/documents/extraction-queue', { params, signal }).then(r => r.data);
    },
    refetchInterval: 15_000,
  });

  const queue = queueQuery.data || null;
  const loading = queueQuery.isLoading;
  const refreshing = queueQuery.isFetching && !queueQuery.isLoading;
  const fetch = () => queryClient.invalidateQueries({ queryKey: ['extractionQueue'] });

  const configQuery = useQuery({
    queryKey: ['adminConfig'],
    queryFn: ({ signal }) => api.get('/api/admin/config', { signal }).then(r => r.data),
  });
  const config = configQuery.data || null;

  const handleRefresh = async () => { await fetch(); };

  const [retryingId, setRetryingId] = useState(null);

  useEffect(() => {
    setPage(0);
  }, [activeTab, searchQuery, dateFrom, dateTo]);

  const doRetry = async (id) => {
    setRetryingId(id);
    try {
      await api.post(`/api/documents/${id}/re-extract`);
      toast.success(t('admin.reQueueSuccess'));
      await fetch();
    } catch (e) {
      toast.error(e.response?.data?.message || e.message || t('admin.reQueueFailed'));
    } finally {
      setRetryingId(null);
    }
  };

  // ponytail: filter-aware live updates. A DOCUMENT_READY/_FAILED event carries
  // no status/date payload, so the single row is fetched and evaluated against
  // the active filters BEFORE touching UI state — filtered lists never gain
  // rows that violate their own constraints.
  useEffect(() => {
    const event = notifications.find(n =>
      (n.actionType === 'DOCUMENT_READY' || n.actionType === 'DOCUMENT_FAILED') &&
      n.entityId && !seenEventIds.current.has(n.id));
    if (!event) return;
    seenEventIds.current.add(event.id);

    const filtersActive = activeTab !== 'All' || searchQuery.trim() !== '' || dateFrom !== '' || dateTo !== '';
    if (!filtersActive) {
      fetch();
      return;
    }
    api.get(`/api/documents/${event.entityId}/diagnostics`)
      .then(r => {
        const row = diagToRow(r.data);
        if (!row) return;
        if (matchesFilters(row, { activeTab, searchQuery, dateFrom, dateTo })) {
          queryClient.setQueryData(['extractionQueue', { dateFrom, dateTo }], (prev) => (prev ? mergeRow(prev, row) : prev));
        } else {
          setExternalUpdates(c => c + 1);
        }
      })
      .catch(() => { /* row gone or unreadable — next refresh will reconcile */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, activeTab, searchQuery, dateFrom, dateTo]);

  function diagToRow(d) {
    if (!d || !d.id) return null;
    const listKey = listKeyForStatus(d.processingStatus);
    if (!listKey) return null;
    return {
      id: d.id,
      originalFilename: d.originalFilename || d.title || '—',
      project: d.projectName || '—',
      errorType: d.processingError || '—',
      attempts: '—',
      createdAt: d.createdAt || null,
      timestamp: d.createdAt ? d.createdAt.replace('T', ' ').slice(0, 19) : '—',
      status: tabForListKey(listKey),
      listKey,
    };
  }

  function matchesFilters(row, filters) {
    if (filters.activeTab !== 'All' && row.status !== filters.activeTab) return false;
    const day = row.createdAt ? row.createdAt.slice(0, 10) : '';
    if (filters.dateFrom && day < filters.dateFrom) return false;
    if (filters.dateTo && day > filters.dateTo) return false;
    const needle = filters.searchQuery.trim().toLowerCase();
    if (needle !== '' && !row.originalFilename.toLowerCase().includes(needle)
      && !row.project.toLowerCase().includes(needle)) return false;
    return true;
  }

  function mergeRow(prev, row) {
    const without = {};
    for (const key of ['queued', 'processing', 'ready', 'failed']) {
      without[key] = (prev[key] || []).filter(d => d.id !== row.id);
    }
    without[row.listKey] = [...without[row.listKey], {
      id: row.id,
      originalFilename: row.originalFilename === '—' ? null : row.originalFilename,
      projectName: row.project === '—' ? null : row.project,
      processingError: row.errorType === '—' ? null : row.errorType,
      createdAt: row.createdAt,
    }];
    return { ...prev, ...without };
  }

  const clearFiltersAndRefresh = async () => {
    setActiveTab('All');
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setExternalUpdates(0);
    setPage(0);
    await fetch();
  };

  if (loading) return <PageSkeleton />;

  const counts = queue?.counts || {};
  const totalInQueue = ['QUEUED', 'PROCESSING', 'FAILED', 'READY'].reduce((a, k) => a + (counts[k] || 0), 0);
  const readyCount = counts.READY ?? 0;
  const processingCount = counts.PROCESSING ?? 0;
  const failedCount = counts.FAILED ?? 0;

  const toRow = (d, status) => ({
    id: d.id,
    originalFilename: d.originalFilename || '—',
    project: d.projectName || '—',
    errorType: d.processingError || '—',
    attempts: d.attempts ? `${d.attempts} / 3` : '—',
    timestamp: d.createdAt ? d.createdAt.replace('T', ' ').slice(0, 19) : '—',
    createdAt: d.createdAt || null,
    status
  });

  const failedList = (queue?.failed || []).map(d => toRow(d, 'Failed'));
  const queuedList = (queue?.queued || []).map(d => toRow(d, 'Pending'));
  const processingList = (queue?.processing || []).map(d => toRow(d, 'Processing'));
  const readyList = (queue?.ready || []).map(d => toRow(d, 'Ready'));

  let combinedList = [];
  if (activeTab === 'All') {
    combinedList = [...failedList, ...queuedList, ...processingList, ...readyList];
  } else if (activeTab === 'Pending') {
    combinedList = queuedList;
  } else if (activeTab === 'Failed') {
    combinedList = failedList;
  } else if (activeTab === 'Processing') {
    combinedList = processingList;
  } else if (activeTab === 'Ready') {
    combinedList = readyList;
  }

  const needle = searchQuery.trim().toLowerCase();
  const filteredDocs = combinedList.filter(d =>
    needle === '' ||
    d.originalFilename.toLowerCase().includes(needle) ||
    d.project.toLowerCase().includes(needle)
  );

  const PAGE_SIZE = 4;
  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / PAGE_SIZE));
  const pagedDocs = filteredDocs.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const tabLabel = (tab) => {
    if (tab === 'All') return t('admin.all');
    if (tab === 'Pending') return t('admin.tabPending');
    if (tab === 'Processing') return t('admin.tabProcessing');
    if (tab === 'Failed') return t('admin.tabFailed');
    return t('admin.tabReady');
  };

  return (
    <div className="p-8 space-y-6 bg-(--page-bg)">
      {/* Title Area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-(--border) pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-(--brand-foreground) tracking-tight">{t('admin.extractionQueue')}</h1>
          <p className="text-(--text-secondary) text-xs mt-1">{t('admin.queueSub')}</p>
        </div>
        <div className="flex items-center gap-2.5">
          {config?.rabbitMqManagementUrl && (
            <a href={config.rabbitMqManagementUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-(--text-primary) bg-(--surface) border border-(--border) rounded-xl hover:bg-(--surface-secondary) shadow-sm transition">
              <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              RabbitMQ Console
            </a>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#0c162e] hover:bg-[#152447] rounded-xl transition shadow-sm disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{refreshing ? t('admin.refreshing') : t('admin.refreshQueue')}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total in Queue */}
        <div className="bg-(--surface) rounded-xl border border-(--border) p-5 shadow-sm flex flex-col justify-between h-36">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-[10px] font-bold text-(--text-tertiary) block tracking-wider uppercase">{t('admin.totalInQueue')}</span>
            <span className="text-2xl font-extrabold text-(--text-primary)">{totalInQueue}</span>
          </div>
        </div>

        {/* Card 2: Ready for Extraction */}
        <div className="bg-(--surface) rounded-xl border border-(--border) p-5 shadow-sm flex flex-col justify-between h-36">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded uppercase tracking-wider">{t('admin.tabReady')}</span>
          </div>
          <div className="mt-2">
            <span className="text-[10px] font-bold text-(--text-tertiary) block tracking-wider uppercase">{t('admin.readyForExtraction')}</span>
            <span className="text-2xl font-extrabold text-(--text-primary)">{readyCount}</span>
          </div>
        </div>

        {/* Card 3: Currently Processing */}
        <div className="bg-(--surface) rounded-xl border border-(--border) p-5 shadow-sm flex flex-col justify-between h-36">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded uppercase tracking-wider">{t('admin.tabProcessing')}</span>
          </div>
          <div className="mt-2">
            <span className="text-[10px] font-bold text-(--text-tertiary) block tracking-wider uppercase">{t('admin.currentlyProcessing')}</span>
            <span className="text-2xl font-extrabold text-(--text-primary)">{processingCount}</span>
          </div>
        </div>

        {/* Card 4: Total Failed */}
        <div className="bg-(--surface) rounded-xl border border-(--border) p-5 shadow-sm flex flex-col justify-between h-36">
          <div className="flex justify-between items-start">
            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-100 uppercase tracking-wider">{t('admin.tabFailed')}</span>
          </div>
          <div className="mt-2">
            <span className="text-[10px] font-bold text-(--text-tertiary) block tracking-wider uppercase">{t('admin.totalFailed')}</span>
            <span className="text-2xl font-extrabold text-(--text-primary)">{failedCount}</span>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm overflow-hidden">
        {/* Table Header and Filters */}
        <div className="px-6 py-4.5 border-b border-(--border-light) flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="text-lg font-bold text-(--text-primary)">
                {activeTab === 'All' ? t('admin.allDocuments') : `${tabLabel(activeTab)} ${t('admin.documentsWord')}`}
              </h3>
              {/* Status Tabs */}
              <div className="flex bg-(--surface-tertiary) p-0.5 rounded-xl text-xs font-bold text-(--text-secondary)">
                {TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === tab
                        ? 'bg-(--surface) text-(--text-primary) shadow-sm'
                        : 'hover:text-(--text-primary)'
                      }`}
                  >
                    {tabLabel(tab)}
                  </button>
                ))}
              </div>
            </div>
            <SearchBar
              onDebouncedChange={(v) => { setSearchQuery(v); setPage(0); }}
              placeholder={t('admin.searchDocuments')}
              className="w-full sm:w-64"
            />
          </div>

          {/* Date Range filter */}
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider">
              {t('admin.dateRange')}
            </label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              aria-label={t('admin.dateFrom')}
              className="px-3 py-1.5 bg-(--surface-secondary) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-(--text-tertiary) text-xs">→</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              aria-label={t('admin.dateTo')}
              className="px-3 py-1.5 bg-(--surface-secondary) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setPage(0); }}
                className="text-xs font-bold text-(--text-tertiary) hover:text-(--text-primary) transition"
              >
                {t('admin.clearFilter')}
              </button>
            )}
            {externalUpdates > 0 && (
              <button
                onClick={clearFiltersAndRefresh}
                className="ml-auto px-3 py-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition"
              >
                {t('admin.externalUpdates', { n: externalUpdates })}
              </button>
            )}
          </div>
        </div>

        {/* Table Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-(--surface-secondary) text-(--text-tertiary) font-bold uppercase border-b border-(--border-light)">
                <th className="px-6 py-3.5">{t('admin.docName')}</th>
                <th className="px-6 py-3.5">{t('admin.project')}</th>
                <th className="px-6 py-3.5">{t('admin.errorType')}</th>
                <th className="px-6 py-3.5">{t('admin.attempts')}</th>
                <th className="px-6 py-3.5">{t('admin.timestamp')}</th>
                <th className="px-6 py-3.5 text-right">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border-light) text-(--text-primary) font-semibold">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-(--text-tertiary) font-medium">
                    {t('admin.noDocuments')}
                  </td>
                </tr>
              ) : pagedDocs.map((d) => (
                <tr key={d.id} className="hover:bg-(--surface-secondary)/50 transition">
                  {/* Document Name - NO ICON! */}
                  <td className="px-6 py-4">
                    <span className="font-bold text-(--text-primary) block truncate max-w-xs sm:max-w-sm">{d.originalFilename}</span>
                  </td>

                  {/* Project */}
                  <td className="px-6 py-4 text-(--text-secondary) font-bold">
                    {d.project}
                  </td>

                  {/* Error Type */}
                  <td className="px-6 py-4">
                    {d.status === 'Failed' ? (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${d.errorType === 'Timeout'
                          ? 'bg-orange-50 text-orange-700 border border-orange-100'
                          : 'bg-rose-50 text-rose-700 border border-rose-100'
                        }`}>
                        {d.errorType}
                      </span>
                    ) : (
                      <span className="text-(--text-tertiary) font-normal">—</span>
                    )}
                  </td>

                  {/* Attempts */}
                  <td className="px-6 py-4 text-(--text-secondary) font-medium">
                    {d.attempts}
                  </td>

                  {/* Timestamp */}
                  <td className="px-6 py-4 text-(--text-secondary) font-mono font-medium">
                    {d.timestamp}
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2.5">
                      <button
                        onClick={() => doRetry(d.id)}
                        disabled={retryingId === d.id}
                        title={t('admin.retryExtraction')}
                        className="w-8 h-8 rounded-xl bg-(--surface-secondary) border border-(--border) text-(--text-secondary) hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 flex items-center justify-center transition shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDetailDoc(d)}
                        title={t('admin.viewErrorDetails')}
                        className="w-8 h-8 rounded-xl bg-(--surface-secondary) border border-(--border) text-(--text-secondary) hover:bg-(--surface-tertiary) hover:text-(--text-primary) hover:border-slate-350 flex items-center justify-center transition shadow-sm cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-(--border-light) bg-(--surface-secondary)/50 text-xs font-semibold text-(--text-secondary)">
          <span>{t('admin.showingDocs', { shown: Math.min(filteredDocs.length, (page + 1) * PAGE_SIZE), total: combinedList.length })}</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="p-1.5 rounded-lg border border-(--border) text-(--text-tertiary) hover:bg-(--surface-secondary) disabled:opacity-30 disabled:cursor-not-allowed transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span>{t('admin.page')} {page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg border border-(--border) text-(--text-tertiary) hover:bg-(--surface-secondary) disabled:opacity-30 disabled:cursor-not-allowed transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal open={!!detailDoc} onClose={() => setDetailDoc(null)} title={t('admin.errorDetails')} closeLabel={t('admin.close')}>
        {detailDoc && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t('admin.title')}</span>
                <span className="font-bold text-(--text-primary) break-words">{detailDoc.originalFilename}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t('admin.project')}</span>
                <span className="font-bold text-(--text-primary)">{detailDoc.project}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t('admin.extractionStatus')}</span>
                <span className="font-bold text-(--text-primary)">{detailDoc.status}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t('admin.timestamp')}</span>
                <span className="font-bold text-(--text-primary)">{detailDoc.timestamp}</span>
              </div>
            </div>
            {detailDoc.errorType !== '—' && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block mb-1">{t('admin.errorType')}</span>
                <span className="text-xs font-bold text-rose-800">{detailDoc.errorType}</span>
              </div>
            )}
            <div className="bg-(--surface-secondary) border border-(--border) rounded-xl p-4 min-w-0">
              <span className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider block mb-2">{t('admin.docDetails')}</span>
              <div className="text-xs font-mono text-(--text-primary) whitespace-pre-wrap break-words max-h-60 overflow-y-auto pr-1">
                <JsonTree data={{ id: detailDoc.id, originalFilename: detailDoc.originalFilename, project: detailDoc.project, status: detailDoc.status, attempts: detailDoc.attempts, timestamp: detailDoc.timestamp }} />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}


export { QueueSection };
