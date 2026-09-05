import { useState, useEffect, useCallback } from 'react';
import { PageSkeleton } from './shared.jsx';

let healthRequest = null;
const fetchHealth = (api) => {
  if (!healthRequest) {
    healthRequest = api.get('/api/health', { validateStatus: () => true })
      .finally(() => { healthRequest = null; });
  }
  return healthRequest;
};

function InfraSection({ lang, api }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async (signal) => {
    try {
      const [health, dashboard, queue] = await Promise.all([
        fetchHealth(api),
        api.get('/api/admin/dashboard', { signal }).catch(() => null),
        api.get('/api/admin/documents/extraction-queue', { signal }).catch(() => null),
      ]);
      if (signal?.aborted) return;
      setData({
        health: health.data,
        dashboard: dashboard?.data ?? null,
        queue: queue?.data ?? null,
      });
    } catch (e) {
      if (signal?.aborted) return;
    }
  }, [api]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  };

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    fetch(ac.signal).finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [fetch]);

  const ir = data?.health?.components || {};
  const irServices = Object.entries(ir)
    .filter(([k]) => k !== 'message')
    .map(([name, v]) => ({
      name,
      status: (typeof v === 'object' && v !== null) ? (v.status ?? v.ready) : v,
      latencyMs: (typeof v === 'object' && v !== null) ? v.latencyMs : null
    }));
  const upCount = irServices.filter(s => s.status === 'UP' || s.status === true || s.status === 'Online').length;
  const allUp = irServices.length > 0 && upCount === irServices.length;

  const counts = data?.queue?.counts || {};
  const queueTotal = ['QUEUED', 'PROCESSING', 'FAILED']
    .map(k => typeof counts[k] === 'number' ? counts[k] : 0)
    .reduce((a, b) => a + b, 0);
  const dash = data?.dashboard || {};

  const getStatusDot = (status) => {
    const isUp = status === 'UP' || status === true || status === 'Online' || (status && (status.status === 'UP' || status.status === 'Online'));
    return isUp ? (
      <span className="flex items-center gap-1.5 font-bold text-emerald-600">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        <span>Online</span>
      </span>
    ) : (
      <span className="flex items-center gap-1.5 font-bold text-rose-600">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
        <span>Offline</span>
      </span>
    );
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="p-8 space-y-6 bg-(--page-bg)">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-(--border) pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-(--brand-foreground) tracking-tight">{lang.systemHealth}</h1>
          <p className="text-(--text-secondary) text-xs mt-1">{lang.healthSub}</p>
        </div>
        <div>
          <button 
            onClick={handleRefresh} 
            disabled={refreshing}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#0c162e] hover:bg-[#152447] rounded-xl transition shadow-sm disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{refreshing ? lang.refreshing : lang.refreshMetrics}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: System Status */}
        <div className="bg-(--surface) rounded-xl border border-(--border) p-5 shadow-sm flex flex-col justify-between h-40">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            {irServices.length > 0 && (
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${allUp ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                {allUp ? 'OPERATIONAL' : 'DEGRADED'}
              </span>
            )}
          </div>
          <div className="mt-4">
            <span className="text-[10px] font-bold text-(--text-tertiary) block tracking-wider uppercase">System Status</span>
            <span className="text-xl font-extrabold text-(--text-primary)">{irServices.length > 0 ? `${upCount} / ${irServices.length} Services Online` : 'No data'}</span>
            <p className="text-[10px] text-(--text-tertiary) italic mt-1 leading-snug">From /api/health.</p>
          </div>
        </div>

        {/* Card 2: Queue Status */}
        <div className="bg-(--surface) rounded-xl border border-(--border) p-5 shadow-sm flex flex-col justify-between h-40">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 01-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <span className="text-[10px] font-bold text-(--text-tertiary) block tracking-wider uppercase">Queue Status</span>
            <span className="text-xl font-extrabold text-(--text-primary)">{queueTotal} Documents</span>
            <p className="text-[10px] text-(--text-tertiary) italic mt-1 leading-snug">
              {typeof counts.QUEUED === 'number' ? `${counts.QUEUED} Queued · ` : ''}
              {typeof counts.PROCESSING === 'number' ? `${counts.PROCESSING} Processing · ` : ''}
              {typeof counts.FAILED === 'number' ? `${counts.FAILED} Failed` : ''}
            </p>
          </div>
        </div>

        {/* Card 3: Documents */}
        <div className="bg-(--surface) rounded-xl border border-(--border) p-5 shadow-sm flex flex-col justify-between h-40">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <span className="text-[10px] font-bold text-(--text-tertiary) block tracking-wider uppercase">Documents</span>
            <span className="text-xl font-extrabold text-(--text-primary)">
              {(dash.activePaperDocuments ?? 0) + (dash.activeSourceDocuments ?? 0)} Active
            </span>
            <p className="text-[10px] text-(--text-tertiary) italic mt-1 leading-snug">
              {dash.activePaperDocuments ?? 0} Papers · {dash.activeSourceDocuments ?? 0} Sources
            </p>
          </div>
        </div>

        {/* Card 4: Collections */}
        <div className="bg-(--surface) rounded-xl border border-(--border) p-5 shadow-sm flex flex-col justify-between h-40">
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <span className="text-[10px] font-bold text-(--text-tertiary) block tracking-wider uppercase">Collections</span>
            <span className="text-xl font-extrabold text-(--text-primary)">{dash.activeCollections ?? 0} Active</span>
            <p className="text-[10px] text-(--text-tertiary) italic mt-1 leading-snug">{dash.activeCollectionCategories ?? 0} Categories</p>
          </div>
        </div>
      </div>

      {/* Services Table Card */}
      <div className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm overflow-hidden">
        <div className="px-6 py-4.5 border-b border-(--border-light)">
          <h3 className="text-xs font-bold text-(--text-primary) uppercase tracking-wider">ACTIVE SERVICES INVENTORY</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-(--surface-secondary) text-(--text-tertiary) font-bold uppercase border-b border-(--border-light)">
                <th className="px-6 py-3.5">Service Node</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Response Time</th>
                <th className="px-6 py-3.5">Uptime</th>
                <th className="px-6 py-3.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border-light) text-(--text-primary) font-semibold">
              {irServices.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-(--text-tertiary) font-medium">No infrastructure data available</td></tr>
              ) : irServices.map(s => (
                <tr key={s.name} className="hover:bg-(--surface-secondary)/50 transition">
                  <td className="px-6 py-4">
                    <span className="font-bold text-(--text-primary) capitalize">{s.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusDot(s.status)}
                  </td>
                  <td className="px-6 py-4 text-(--text-secondary) font-bold">{s.latencyMs != null ? `${s.latencyMs}ms` : '—'}</td>
                  <td className="px-6 py-4 text-(--text-secondary) font-bold">—</td>
                  <td className="px-6 py-4" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


export { InfraSection };
