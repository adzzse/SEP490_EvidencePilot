import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge, LoadingSkeleton, EmptyState, TourLauncher, AppHeader, Breadcrumb, EntityCard } from '../../components';
import { instructorText, commonText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';
import { formatDateTime } from '../../utils/formatters/date';
import api from '../../services/api.js';

export default function ReviewRequests() {
  const { language } = useLanguage();
  const t = instructorText[language];
  const ct = commonText[language];

  const [requests, setRequests] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState('list');

  const tourSteps = [
    { element: '#review-table', popover: { title: t.reviewQueue, description: t.reviewQueueDesc, side: 'top', align: 'start' } },
  ];

  const fetchReviewRequests = async () => {
    setLoading(true); setErrorMessage('');
    try {
      const [res, proj] = await Promise.all([
        api.get('/api/feedback-requests'),
        api.get('/api/projects?page=0&size=100').catch(() => null),
      ]);
      setRequests(res.data);
      setProjects(proj?.data?.content || []);
    }
    catch { setErrorMessage(t.loadReviewRequestsFailed); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchReviewRequests(); }, []);

  const projectById = useMemo(() => {
    const m = new Map();
    projects.forEach((p) => m.set(String(p.id), p));
    return m;
  }, [projects]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests.filter((req) => {
      const proj = projectById.get(String(req.projectId));
      const title = proj?.title || '';
      if (q && !title.toLowerCase().includes(q)) return false;
      if (projectFilter && String(req.projectId) !== String(projectFilter)) return false;
      if (dateFrom && req.requestedAt) {
        const d = new Date(req.requestedAt);
        if (!isNaN(d) && d < new Date(dateFrom)) return false;
      }
      if (dateTo && req.requestedAt) {
        const d = new Date(req.requestedAt);
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (!isNaN(d) && d > end) return false;
      }
      return true;
    });
  }, [requests, projectById, searchQuery, projectFilter, dateFrom, dateTo]);

  const clearFilters = () => {
    setSearchQuery('');
    setProjectFilter('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="min-h-screen bg-(--page-bg) text-(--text-primary)">
      <AppHeader />
      <main className="max-w-[1400px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Breadcrumb
          items={[
            { label: t.dashboard, path: '/instructor/dashboard' },
            { label: t.reviewRequests }
          ]}
        />
        <div className="mb-6 border-b border-(--border) pb-6">
          <h1 className="text-2xl sm:text-3xl font-black text-(--brand-foreground) tracking-tight">{t.reviewRequests}</h1>
          <p className="text-xs text-(--text-tertiary) mt-1">{t.pendingRequests}</p>
        </div>

        {errorMessage && (
          <div className="p-4 mb-6 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold">{errorMessage}</div>
        )}

        {/* Control Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchProjects || ct.search}
            aria-label={ct.search}
            className="w-full sm:w-56 rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)"
          />
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label="Filter by project"
            className="w-full sm:w-48 rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <option value="">{t.allProjects || (language === 'vi' ? 'Tất cả đồ án' : 'All Projects')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.title || `#${String(p.id).slice(0, 8)}`}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-[10px] font-bold uppercase text-(--text-tertiary)">
            <span>{t.fromDate || (language === 'vi' ? 'Từ' : 'From')}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border border-(--border) bg-(--surface-secondary) px-2 py-1.5 text-xs font-medium text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)"
            />
          </label>
          <label className="flex items-center gap-1 text-[10px] font-bold uppercase text-(--text-tertiary)">
            <span>{t.toDate || (language === 'vi' ? 'Đến' : 'To')}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border border-(--border) bg-(--surface-secondary) px-2 py-1.5 text-xs font-medium text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)"
            />
          </label>
          {(searchQuery || projectFilter || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[10px] font-bold text-(--brand) hover:underline px-2"
            >
              {ct.cancel || (language === 'vi' ? 'Xóa lọc' : 'Clear')}
            </button>
          )}

          <div className="flex items-center bg-(--surface-secondary) border border-(--border) rounded-xl p-0.5 ml-auto">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${viewMode === 'list' ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
              title="List View"
              aria-label="List View"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${viewMode === 'card' ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
              title="Card View"
              aria-label="Card View"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
          </div>
        </div>

        {loading ? (
          viewMode === 'list' ? (
            <div id="review-table" className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm overflow-hidden">
              <div className="p-6 space-y-2"><LoadingSkeleton count={4} height="h-8" /></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-36 bg-(--surface-tertiary) rounded-2xl animate-pulse" />)}
            </div>
          )
        ) : filtered.length === 0 ? (
          <div id="review-table" className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm">
            <EmptyState title={t.noRequests} />
          </div>
        ) : viewMode === 'list' ? (
          <div id="review-table" className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-(--surface-secondary) text-(--text-tertiary) text-[10px] font-bold uppercase border-b border-(--border-light)">
                    <th className="px-6 py-4">{t.project}</th>
                    <th className="px-6 py-4">{t.studentName || (language === 'vi' ? 'Sinh viên' : 'Student')}</th>
                    <th className="px-6 py-4 whitespace-nowrap">{t.metadata || (language === 'vi' ? 'Thông tin' : 'Metadata')}</th>
                    <th className="px-6 py-4">{ct.status}</th>
                    <th className="px-6 py-4">{t.requestedAt || (language === 'vi' ? 'Thời gian' : 'Requested')}</th>
                    <th className="px-6 py-4">{ct.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--border-light) text-xs text-(--text-secondary)">
                  {filtered.map((req) => {
                    const proj = projectById.get(String(req.projectId));
                    const projectTitle = proj?.title || `${t.project} #${String(req.projectId).slice(0, 8)}`;
                    return (
                      <tr key={req.id} className="hover:bg-(--surface-secondary) transition-colors">
                        <td className="px-6 py-4">
                          <Link to={`/instructor/requests/${req.projectId}`}
                            className="font-bold text-(--text-primary) block text-xs hover:text-(--brand-foreground) transition-colors">
                            {projectTitle}
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs text-(--text-secondary)">{req.studentName || '—'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-(--surface-secondary) border border-(--border-light) text-[10px] font-bold text-(--text-secondary)">
                              {t.members || 'Members'}: {proj?.memberCount ?? 0}
                            </span>
                            {/* ponytail: ProjectResponse DTO only exposes memberCount today (BE: ProjectResponse.java).
                                totalSections / totalSources not in the wire payload; revisit when BE enriches. */}
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-(--surface-secondary) border border-(--border-light) text-[10px] font-bold text-(--text-tertiary)">
                              {t.sections || 'Sections'}: —
                            </span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-(--surface-secondary) border border-(--border-light) text-[10px] font-bold text-(--text-tertiary)">
                              {t.sources || 'Sources'}: —
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4"><StatusBadge status={req.status} /></td>
                        <td className="px-6 py-4 whitespace-nowrap text-[10px] font-mono text-(--text-tertiary)">
                          {req.requestedAt ? formatDateTime(req.requestedAt, language) : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <Link to={`/instructor/requests/${req.projectId}`}
                            className="text-xs font-black text-(--brand) hover:underline">{t.review}</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div id="review-table" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((req) => {
              const proj = projectById.get(String(req.projectId));
              const projectTitle = proj?.title || `${t.project} #${String(req.projectId).slice(0, 8)}`;
              return (
                <EntityCard
                  key={req.id}
                  className="hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
                  title={projectTitle}
                  subtitle={req.studentName ? `${t.studentName || (language === 'vi' ? 'Sinh viên' : 'Student')}: ${req.studentName}` : undefined}
                  status={req.status}
                  onClick={() => { window.location.href = `/instructor/requests/${req.projectId}`; }}
                >
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-(--text-tertiary)">
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
                      {t.members || 'Members'}: {proj?.memberCount ?? 0}
                    </span>
                    {/* ponytail: same deferral as the list view — BE DTO only ships memberCount today. */}
                    <span className="px-1.5 py-0.5 rounded-md bg-(--surface-secondary) border border-(--border-light) text-(--text-tertiary) font-bold">
                      {t.sections || 'Sections'}: —
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-(--surface-secondary) border border-(--border-light) text-(--text-tertiary) font-bold">
                      {t.sources || 'Sources'}: —
                    </span>
                  </div>
                  <div className="mt-2 text-[10px] font-mono text-(--text-tertiary)">
                    {req.requestedAt ? formatDateTime(req.requestedAt, language) : ''}
                  </div>
                </EntityCard>
              );
            })}
          </div>
        )}
      </main>
      <TourLauncher steps={tourSteps} tourKey="instructor-requests" />
    </div>
  );
}
