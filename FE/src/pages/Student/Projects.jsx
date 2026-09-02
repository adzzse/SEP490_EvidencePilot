import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader, EmptyState, LoadingSkeleton, TourLauncher, StatusBadge, Modal } from '../../components';
import { commonText, studentText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { PAGINATION_LIMIT } from '../../utils/constants';
import { formatDate } from '../../utils/formatters/date';
import api from '../../services/api';
function getPaginationRange(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const pages = [0];
  const start = Math.max(1, currentPage - 1);
  const end = Math.min(totalPages - 2, currentPage + 1);

  if (start > 1) {
    pages.push('DOTS_LEFT');
  }
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (end < totalPages - 2) {
    pages.push('DOTS_RIGHT');
  }
  pages.push(totalPages - 1);
  return pages;
}

export default function Projects() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { user } = useAuth();
  const t = studentText[language];
  const ct = commonText[language];

  // State
  const [projectsData, setProjectsData] = useState({ content: [], totalPages: 0, totalElements: 0 });
  const [stats, setStats] = useState({ total: 0, inProgress: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filters & Pagination
  const [page, setPage] = useState(0);
  const [pageSize] = useState(PAGINATION_LIMIT);
  const [activeTab, setActiveTab] = useState('ALL'); // ALL, IN_PROGRESS, ASSIGNED, COMPLETED
  const [searchQuery, setSearchQuery] = useState('');
  const [isGridView, setIsGridView] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  const tourSteps = [
    { element: '#projects-grid', popover: { title: t.tourProjects, description: t.tourProjectsDesc, side: 'bottom', align: 'start' } },
    { element: '.project-card:first', popover: { title: t.tourWorkspace, description: t.tourWorkspaceDesc, side: 'top', align: 'center' } },
  ];

  // Fetch KPI Stats (From overall project list)
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/api/projects', { params: { size: 100 } });
      const list = Array.isArray(res.data?.content) ? res.data.content : [];
      const total = list.length;
      const inProg = list.filter(p => ['IN_PROGRESS', 'SUBMITTED_FOR_REVIEW', 'RETURNED'].includes(p.status)).length;
      const comp = list.filter(p => ['APPROVED', 'ARCHIVED', 'COMPLETED'].includes(p.status)).length;
      setStats({ total, inProgress: inProg, completed: comp });
    } catch {
      /* silent stats fetch */
    }
  }, []);

  // Fetch Paginated & Filtered Projects
  const fetchProjects = useCallback(async (pIndex = page, statusFilter = activeTab, q = searchQuery) => {
    try {
      setLoading(true);
      setError(false);
      const params = { page: pIndex, size: pageSize };
      if (q.trim()) params.q = q.trim();
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'IN_PROGRESS') params.status = 'IN_PROGRESS';
        else if (statusFilter === 'ASSIGNED') params.status = 'ASSIGNED';
        else if (statusFilter === 'COMPLETED') params.status = 'APPROVED';
      }

      const res = await api.get('/api/projects', { params });
      const rawContent = Array.isArray(res.data?.content) ? res.data.content : [];
      const totalP = res.data?.totalPages || (rawContent.length > 0 ? 1 : 0);
      const totalE = res.data?.totalElements || rawContent.length;

      setProjectsData({
        content: rawContent,
        totalPages: totalP,
        totalElements: totalE
      });
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, activeTab, searchQuery]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchProjects(page, activeTab, searchQuery);
  }, [fetchProjects, page, activeTab, searchQuery]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(0);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setPage(0);
  };

  const getCtaText = (status) => {
    if (['APPROVED', 'ARCHIVED', 'COMPLETED'].includes(status)) {
      return t.viewWorkspace;
    }
    if (['ASSIGNED', 'CREATED'].includes(status)) {
      return t.startWorkspace;
    }
    return t.openWorkspace;
  };

  const projects = projectsData.content;

  return (
    <div className="min-h-screen bg-(--page-bg) text-(--text-primary) font-sans pb-12">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-(--text-primary)">
              {language === 'vi' ? `Chào mừng trở lại, ${user?.firstName || 'Sinh viên'}` : `Welcome back, ${user?.firstName || 'Student'}`}
            </h1>
            <p className="text-xs sm:text-sm text-(--text-secondary) mt-1">{t.workspaceDescription}</p>
          </div>
          <button onClick={() => setShowGuide(true)}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-(--surface) border border-(--border) rounded-xl text-xs font-bold text-(--text-secondary) hover:text-(--brand-foreground) hover:border-(--brand) transition-colors cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
            {t.guideButton}
          </button>
        </div>

        {/* Top KPI Stats Cards Banner (No study hours card) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          {/* Card 1: Total Projects */}
          <div className="bg-(--surface) border border-(--border) rounded-2xl p-5 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t.totalProjects}</span>
              <span className="text-3xl font-black text-(--text-primary) mt-1 block">{stats.total}</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c0-.426.29-.8.711-.904l7.5-1.875a1.125 1.125 0 01.558 0l7.5 1.875c.42.104.711.478.711.904v8.473c0 .54-.4.997-.936 1.058l-7.5 1.125a1.125 1.125 0 01-.334 0l-7.5-1.125a1.125 1.125 0 01-.936-1.058V9.776z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75v14.25" />
              </svg>
            </div>
          </div>

          {/* Card 2: In Progress */}
          <div className="bg-(--surface) border border-(--border) rounded-2xl p-5 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t.inProgress}</span>
              <span className="text-3xl font-black text-amber-600 dark:text-amber-400 mt-1 block">{stats.inProgress}</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          {/* Card 3: Completed */}
          <div className="bg-(--surface) border border-(--border) rounded-2xl p-5 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t.completed}</span>
              <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">{stats.completed}</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Controls Bar: Search & Status Filter Pills & View Switcher */}
        <div className="bg-(--surface) border border-(--border) rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row gap-4 items-center justify-between">
          {/* Search Box */}
          <div className="w-full sm:flex-1 relative">
            <svg className="w-4 h-4 text-(--text-tertiary) absolute left-3.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t.searchProjectsPlaceholder}
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-4 py-2 bg-(--surface-secondary) border border-(--border) rounded-xl text-xs font-medium text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto p-1 bg-(--surface-secondary) border border-(--border) rounded-xl">
            {[
              { key: 'ALL', label: t.allStatuses },
              { key: 'IN_PROGRESS', label: t.inProgress },
              { key: 'ASSIGNED', label: t.assignedStatus },
              { key: 'COMPLETED', label: t.completed },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === tab.key
                    ? 'bg-(--surface) text-(--text-primary) shadow-xs'
                    : 'text-(--text-secondary) hover:text-(--text-primary)'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Grid / List View Switcher */}
          <div className="flex items-center gap-1 shrink-0 bg-(--surface-secondary) border border-(--border) p-1 rounded-xl">
            <button
              onClick={() => setIsGridView(true)}
              title="Grid View"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isGridView ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </button>
            <button
              onClick={() => setIsGridView(false)}
              title="List View"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${!isGridView ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <LoadingSkeleton count={6} height="h-44" />
        ) : error ? (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 p-6 rounded-2xl text-center">
            <p className="font-semibold text-sm">{t.projectsLoadFailed}</p>
            <button onClick={() => fetchProjects(page, activeTab, searchQuery)} className="mt-3 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-colors cursor-pointer">
              {ct.retry}
            </button>
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            title={stats.total === 0 ? t.noProjects : t.noMatchingProjects}
            description={stats.total === 0 ? t.noProjectsDescription : t.noMatchingProjectsDesc}
          />
        ) : isGridView ? (
          /* Grid View Layout */
          <div id="projects-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/student/projects/${project.id}`)}
                className="project-card bg-(--surface) border border-(--border) hover:border-indigo-400 dark:hover:border-indigo-600 rounded-2xl p-5 shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between group cursor-pointer"
              >
                <div className="space-y-3">
                  {/* Top Bar with Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={project.status} />
                    {project.targetStandard && (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {t.targetStandardLabel}: {project.targetStandard}
                      </span>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="text-base font-bold text-(--text-primary) group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                      {project.title}
                    </h3>
                    <p className="text-xs text-(--text-secondary) mt-1.5 line-clamp-3 leading-relaxed">
                      {project.description || t.noDescription}
                    </p>
                  </div>
                </div>

                {/* Card Footer: Metadata & Single CTA Button */}
                <div className="pt-4 mt-4 border-t border-(--border-light) space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-(--text-tertiary)">
                    <span>
                      {t.lastUpdated.replace('{{date}}', formatDate(project.updatedAt || project.createdAt, language))}
                    </span>
                    {project.currentUserRole && (
                      <span className="font-semibold text-slate-500 dark:text-slate-400">
                        {t.roleLabel}: {project.currentUserRole}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/student/projects/${project.id}`);
                    }}
                    className="w-full py-2.5 px-4 bg-[#0c162e] hover:bg-[#152447] text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{getCtaText(project.status)}</span>
                    <span aria-hidden="true">&rarr;</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List View Layout */
          <div className="bg-(--surface) border border-(--border) rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-(--surface-secondary) text-(--text-tertiary) font-bold uppercase border-b border-(--border)">
                    <th className="px-6 py-3.5 font-bold">{t.projectName}</th>
                    <th className="px-6 py-3.5 font-bold">{t.targetStandardLabel}</th>
                    <th className="px-6 py-3.5 font-bold">{t.roleLabel}</th>
                    <th className="px-6 py-3.5 font-bold">Status</th>
                    <th className="px-6 py-3.5 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--border) text-(--text-primary) font-medium">
                  {projects.map((project) => (
                    <tr
                      key={project.id}
                      onClick={() => navigate(`/student/projects/${project.id}`)}
                      className="hover:bg-(--surface-secondary) transition cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="font-bold text-sm text-(--text-primary)">{project.title}</div>
                        <div className="text-xs text-(--text-secondary) truncate max-w-md mt-0.5">{project.description || t.noDescription}</div>
                      </td>
                      <td className="px-6 py-4 font-mono font-semibold text-slate-500">
                        {project.targetStandard || '—'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-500">
                        {project.currentUserRole || '—'}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={project.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/student/projects/${project.id}`);
                          }}
                          className="px-3.5 py-1.5 bg-[#0c162e] hover:bg-[#152447] text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1"
                        >
                          <span>{getCtaText(project.status)}</span>
                          <span aria-hidden="true">&rarr;</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination Footer (Matching exact design in screenshot) */}
        {!loading && !error && projectsData.totalElements > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-(--border) text-xs font-semibold text-(--text-secondary)">
            <span>
              {t.showingProjectsRange
                ? t.showingProjectsRange
                    .replace('{{start}}', page * pageSize + 1)
                    .replace('{{end}}', Math.min((page + 1) * pageSize, projectsData.totalElements))
                    .replace('{{total}}', projectsData.totalElements)
                : `Hiển thị ${page * pageSize + 1}-${Math.min((page + 1) * pageSize, projectsData.totalElements)} trong tổng số ${projectsData.totalElements} dự án`}
            </span>

            <div className="flex items-center gap-1.5">
              {/* Prev Button */}
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 text-gray-500 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-xs cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Page Number Buttons */}
              {getPaginationRange(page, Math.max(1, projectsData.totalPages)).map((item, idx) => {
                if (typeof item === 'string') {
                  return (
                    <span key={`${item}-${idx}`} className="text-gray-400 text-xs px-1 select-none">
                      ...
                    </span>
                  );
                }
                const isActive = page === item;
                return (
                  <button
                    key={item}
                    onClick={() => setPage(item)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition cursor-pointer ${
                      isActive
                        ? 'bg-[#0c162e] text-white shadow-xs'
                        : 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {item + 1}
                  </button>
                );
              })}

              {/* Next Button */}
              <button
                onClick={() => setPage(p => Math.min(projectsData.totalPages - 1, p + 1))}
                disabled={page >= Math.max(0, projectsData.totalPages - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 text-gray-500 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-xs cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </main>

      <TourLauncher steps={tourSteps} tourKey="projects" />

      <Modal open={showGuide} onClose={() => setShowGuide(false)} title={t.guideTitle} closeLabel={ct.close}>
        <ol className="space-y-3 text-xs">
          {(t.guideSteps || []).map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-(--brand) text-(--on-brand) text-[10px] font-black flex items-center justify-center">{i + 1}</span>
              <span className="text-(--text-secondary) leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </Modal>
    </div>
  );
}
