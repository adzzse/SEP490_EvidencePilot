import { useState, useEffect, useCallback } from 'react';
import { driver } from 'driver.js';
import { PageSkeleton, ErrorBlock, StatCard } from './shared.jsx';
function DashboardSection({ lang, api }) {
  const [data, setData] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [health, setHealth] = useState(null);
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (signal) => {
    setLoading(true); setError(null);
    try {
      const [dashboard, logs, h, q] = await Promise.all([
        api.get('/api/admin/dashboard', { signal }),
        api.get('/api/admin/audit-logs', { params: { page: 0, size: 5 }, signal }).catch(() => null),
        api.get('/api/health', { signal, validateStatus: () => true }).catch(() => null),
        api.get('/api/admin/documents/extraction-queue', { signal }).catch(() => null),
      ]);
      setData(dashboard.data);
      setRecentLogs(logs ? (logs.data?.content ?? []) : null);
      setHealth(h ? h.data : null);
      setQueue(q ? q.data : null);
    } catch (e) {
      if (signal && signal.aborted) return;
      setError(e.message || lang.loadFailed);
    } finally {
      if (!signal || !signal.aborted) setLoading(false);
    }
  }, [api, lang.loadFailed]);

  useEffect(() => { const ac = new AbortController(); fetch(ac.signal); return () => ac.abort(); }, [fetch]);

  const display = data;
  const sCount = data?.usersByRole?.STUDENT ?? 0;
  const iCount = data?.usersByRole?.INSTRUCTOR ?? 0;
  const userTotal = sCount + iCount;
  const sPct = userTotal > 0 ? Math.round((sCount / userTotal) * 100) : 0;
  const sIRatio = iCount > 0 ? (sCount / iCount).toFixed(1) : '—';
  const donutOffset = userTotal > 0 ? Math.round(251.3 * (1 - sPct / 100)) : 0;

  const ir = health?.components || {};
  const irServices = Object.entries(ir)
    .filter(([k]) => k !== 'message')
    .map(([name, v]) => ({
      name,
      status: (typeof v === 'object' && v !== null) ? (v.status ?? v.ready) : v,
    }));
  const upCount = irServices.filter(s => s.status === 'UP' || s.status === true || s.status === 'Online').length;
  const allUp = irServices.length > 0 && upCount === irServices.length;
  const queueCounts = queue?.counts || {};
  const queueTotal = ['QUEUED', 'PROCESSING', 'FAILED'].reduce((a, k) => a + (typeof queueCounts[k] === 'number' ? queueCounts[k] : 0), 0);

  const startProcessGuide = () => {
    setTimeout(() => {
      driver({
        animate: true, showProgress: true,
        steps: [
          { popover: { title: lang.processGuide, description: lang.guideDashDesc, side: 'center' } },
          { element: '[data-guide="stat-totalUsers"]', popover: { title: lang.totalUsers, description: lang.guideDashUsers, side: 'bottom' } },
          { element: '[data-guide="stat-projects"]', popover: { title: lang.activeProjects, description: lang.guideDashProjects, side: 'bottom' } },
          { element: '[data-guide="stat-documents"]', popover: { title: lang.activeDocuments, description: lang.guideDashDocuments, side: 'bottom' } },
          { element: '[data-guide="dash-status"]', popover: { title: lang.status, description: lang.guideDashStatus, side: 'top' } },
          { popover: { title: lang.done, description: lang.guideDashDone, side: 'center' } },
        ],
      }).drive();
    }, 300);
  };

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorBlock msg={error} onRetry={() => fetch(new AbortController().signal)} />;
  if (!display) return <div className="p-6 text-gray-400 text-center">{lang.loadFailed}</div>;

  return (
    <div className="p-6 space-y-6 bg-[#f8fafc]">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div data-guide="stat-totalUsers" id="stat-total-students">
          <StatCard 
            label="TOTAL STUDENTS" 
            value={data.usersByRole?.STUDENT != null ? data.usersByRole.STUDENT.toLocaleString() : '—'}
            iconBg="bg-blue-50 text-blue-600"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479L12 21l-6.825-4a12.083 12.083 0 01.665-6.479L12 14z" />
              </svg>
            }
          />
        </div>
        <div id="stat-total-instructors">
          <StatCard 
            label="TOTAL INSTRUCTORS" 
            value={data.usersByRole?.INSTRUCTOR != null ? data.usersByRole.INSTRUCTOR.toLocaleString() : '—'}
            iconBg="bg-slate-100 text-slate-500"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            }
          />
        </div>
        <div data-guide="stat-projects" id="stat-active-projects">
          <StatCard 
            label="ACTIVE PROJECTS" 
            value={data.activeProjects != null ? data.activeProjects.toLocaleString() : '—'}
            iconBg="bg-rose-50 text-rose-500"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            }
          />
        </div>
        <div data-guide="stat-documents" id="stat-system-resources">
          <StatCard 
            label="SYSTEM RESOURCES" 
            value={data.activeSourceDocuments != null && data.activePaperDocuments != null ? (data.activeSourceDocuments + data.activePaperDocuments).toLocaleString() : '—'}
            sub={data.activeSourceDocuments != null && data.activePaperDocuments != null
              ? <span className="text-gray-400">{data.activeSourceDocuments.toLocaleString()} source files + {data.activePaperDocuments.toLocaleString()} paper docs</span>
              : null}
            iconBg="bg-indigo-50 text-indigo-600"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            }
          />
        </div>
      </div>

      {/* Row 2: Platform Overview & User Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Platform Overview */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Platform Overview</h3>
                <p className="text-xs text-gray-400 mt-0.5">Research data and collection summary</p>
              </div>
              <button onClick={startProcessGuide} className="text-xs font-bold text-blue-600 hover:underline">View Guide</button>
            </div>
          </div>

          {/* Sub-cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-gray-100 flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">COLLECTIONS</div>
                <div className="text-lg font-extrabold text-slate-800">{data.activeCollections != null ? data.activeCollections.toLocaleString() : '—'}</div>
                <div className="text-[10px] text-indigo-600 font-bold">{data.activeCollectionCategories != null ? `${data.activeCollectionCategories} categories` : ''}</div>
              </div>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-xl border border-gray-100 flex gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ACTIVE DOCUMENTS</div>
                <div className="text-lg font-extrabold text-slate-800">
                  {data.activeSourceDocuments != null && data.activePaperDocuments != null ? (data.activeSourceDocuments + data.activePaperDocuments).toLocaleString() : '—'}
                </div>
                <div className="text-[10px] text-blue-600 font-bold">
                  {data.activeSourceDocuments != null && data.activePaperDocuments != null ? `${data.activeSourceDocuments} source · ${data.activePaperDocuments} paper` : ''}
                </div>
              </div>
            </div>
          </div>

          {/* System Health strip */}
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">System Health</span>
                {irServices.length > 0 ? (
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${allUp ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                    {allUp ? 'OPERATIONAL' : 'DEGRADED'}
                  </span>
                ) : null}
              </div>
              <span className="text-xs font-extrabold text-slate-800">{irServices.length > 0 ? `${upCount} / ${irServices.length} services online` : 'No health data'}</span>
              <span className="text-xs font-extrabold text-slate-800">{queueTotal} in queue</span>
            </div>
            {irServices.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {irServices.map(s => {
                  const isUp = s.status === 'UP' || s.status === true || s.status === 'Online';
                  return (
                    <span key={s.name} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                      <span className={`w-2 h-2 rounded-full ${isUp ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <span className="capitalize">{s.name}</span>
                      <span className={isUp ? 'text-emerald-600' : 'text-rose-600'}>{isUp ? 'UP' : 'DOWN'}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* User Distribution */}
        <div data-guide="dash-status" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800">User Distribution</h3>
            <p className="text-xs text-gray-400 mt-0.5">Faculty to Student engagement ratio</p>
          </div>
          
          {/* Donut Chart SVG */}
          <div className="relative w-36 h-36 mx-auto my-4 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="10" />
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#bfdbfe" strokeWidth="10" strokeDasharray="251.3" strokeDashoffset="0" />
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#1e3a8a" strokeWidth="10" strokeDasharray="251.3" strokeDashoffset={donutOffset} strokeLinecap="round" />
            </svg>
            <div className="absolute text-center">
              <div className="text-xl font-extrabold text-slate-800">{userTotal > 0 ? sIRatio : '—'}</div>
              <div className="text-[10px] text-gray-400 font-extrabold tracking-wider">S:I RATIO</div>
            </div>
          </div>

          {/* Legends */}
          <div className="space-y-2 text-xs font-bold">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1e3a8a]" />
                <span className="text-gray-500">Students</span>
              </div>
              <span className="text-slate-800">{userTotal > 0 ? `${sPct}%` : '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#bfdbfe]" />
                <span className="text-gray-500">Instructors</span>
              </div>
              <span className="text-slate-800">{userTotal > 0 ? `${100 - sPct}%` : '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Recent System Logs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-800">Recent System Logs</h3>
          <span className="text-[10px] text-gray-400 font-semibold">
            {recentLogs === null ? 'Feed unavailable' : `${recentLogs.length} latest events`}
          </span>
        </div>

        {recentLogs === null ? (
          <div className="text-center py-10 text-sm text-rose-500 font-semibold">Could not load recent system logs.</div>
        ) : recentLogs.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400 font-semibold">No system logs recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2">Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-slate-600 font-semibold">
                {recentLogs.map((log, index) => (
                  <tr key={`${log.occurredAt}-${log.action}-${log.entityId ?? index}`}>
                    <td className="py-3 pr-4 whitespace-nowrap">{log.occurredAt ? new Date(log.occurredAt).toLocaleString() : '—'}</td>
                    <td className="py-3 pr-4 text-slate-800">{log.actorEmail || 'System'}</td>
                    <td className="py-3 pr-4">{log.action || '—'}</td>
                    <td className="py-3 font-mono">{log.entityType || '—'}{log.entityId ? `#${log.entityId}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


export { DashboardSection };
