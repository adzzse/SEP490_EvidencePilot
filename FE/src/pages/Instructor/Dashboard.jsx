import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import AppHeader from '../../components/layout/AppHeader.jsx';
import { instructorText, commonText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';

export default function InstructorDashboard() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const t = instructorText[language];
  const ct = commonText[language];

  const [metrics, setMetrics] = useState({
    projectsCount: 0,
    collectionsCount: 0,
    pendingRequestsCount: 0,
    sourcesCount: 0,
  });
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadMetrics() {
      setLoadingMetrics(true);
      try {
        const [projRes, colRes, reqRes, srcRes] = await Promise.allSettled([
          api.get('/api/projects?size=1'),
          api.get('/api/collections?size=1'),
          api.get('/api/feedback-requests'),
          api.get('/api/sources?size=1'),
        ]);

        if (!isMounted) return;

        const projectsCount = projRes.status === 'fulfilled' ? (projRes.value.data?.totalElements ?? 0) : 0;
        const collectionsCount = colRes.status === 'fulfilled' ? (colRes.value.data?.totalElements ?? 0) : 0;
        
        let pendingRequestsCount = 0;
        if (reqRes.status === 'fulfilled') {
          const reqData = reqRes.value.data;
          const reqList = Array.isArray(reqData) ? reqData : (reqData?.content || []);
          pendingRequestsCount = reqList.filter(r => r.status === 'PENDING' || r.status === 'SUBMITTED_FOR_REVIEW').length;
        }

        const sourcesCount = srcRes.status === 'fulfilled' ? (srcRes.value.data?.totalElements ?? 0) : 0;

        setMetrics({
          projectsCount,
          collectionsCount,
          pendingRequestsCount,
          sourcesCount,
        });
      } catch {
        // graceful fallback
      } finally {
        if (isMounted) setLoadingMetrics(false);
      }
    }

    loadMetrics();
    return () => { isMounted = false; };
  }, []);

  const startTour = () => {
    const d = driver({
      steps: [
        { element: '#metrics-grid', popover: { title: t.metricsOverview || 'Metrics Overview', description: t.metricsOverviewDesc || 'High-level operational overview of your research projects and assets.', side: 'bottom', align: 'start' } },
        { element: '#operational-hub', popover: { title: t.operationalHub || 'Operational Hub', description: t.operationalHubDesc || 'Direct shortcuts to manage research, conduct reviews, and share knowledge.', side: 'top', align: 'start' } },
      ],
      showProgress: true,
      showButtons: ['next', 'previous', 'close'],
    });
    d.drive();
  };

  return (
    <div className="min-h-screen bg-(--page-bg) text-(--text-primary) font-sans">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 border-b border-(--border) pb-5">
          <div>
            <h1 className="text-3xl font-extrabold text-(--brand-foreground) tracking-tight">
              {t.instructorControlDashboard}
            </h1>
            <p className="text-(--text-secondary) text-sm mt-1">
              {t.instructorDashboardDesc}
            </p>
          </div>

          <button
            type="button"
            onClick={startTour}
            className="px-4 py-2 bg-(--surface) border border-(--border) rounded-xl text-xs font-bold text-(--text-secondary) hover:bg-(--brand-soft) hover:text-(--brand-foreground) transition-colors shadow-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            {t.userGuidance}
          </button>
        </div>

        {/* High-Level Metrics Grid */}
        <div id="metrics-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          
          {/* Metric 1: Projects */}
          <div
            onClick={() => navigate('/instructor/projects')}
            className="bg-(--surface) border border-(--border) rounded-2xl p-5 shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-(--text-tertiary)">{t.projects}</span>
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-3xl font-black text-(--text-primary)">
                {loadingMetrics ? <span className="inline-block w-8 h-8 bg-(--surface-tertiary) rounded-lg animate-pulse" /> : metrics.projectsCount}
              </div>
              <p className="text-[11px] text-(--text-tertiary) mt-1 font-medium">{t.manageProjects} &rarr;</p>
            </div>
          </div>

          {/* Metric 2: Collections */}
          <div
            onClick={() => navigate('/instructor/collections')}
            className="bg-(--surface) border border-(--border) rounded-2xl p-5 shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-(--text-tertiary)">{t.collections}</span>
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-3xl font-black text-(--text-primary)">
                {loadingMetrics ? <span className="inline-block w-8 h-8 bg-(--surface-tertiary) rounded-lg animate-pulse" /> : metrics.collectionsCount}
              </div>
              <p className="text-[11px] text-(--text-tertiary) mt-1 font-medium">{t.manageCollectionsLink} &rarr;</p>
            </div>
          </div>

          {/* Metric 3: Pending Review Requests */}
          <div
            onClick={() => navigate('/instructor/requests')}
            className="bg-(--surface) border border-(--border) rounded-2xl p-5 shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-(--text-tertiary)">{t.reviewRequests}</span>
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6M9 8h6M5 4h14a2 2 0 012 2v14H3V6a2 2 0 012-2z" /></svg>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-3xl font-black text-(--text-primary) flex items-center gap-2">
                {loadingMetrics ? <span className="inline-block w-8 h-8 bg-(--surface-tertiary) rounded-lg animate-pulse" /> : metrics.pendingRequestsCount}
                {!loadingMetrics && metrics.pendingRequestsCount > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-600">Action Required</span>
                )}
              </div>
              <p className="text-[11px] text-(--text-tertiary) mt-1 font-medium">{t.reviewSubmissions} &rarr;</p>
            </div>
          </div>

          {/* Metric 4: Source Library Size */}
          <div
            onClick={() => navigate('/instructor/source-library')}
            className="bg-(--surface) border border-(--border) rounded-2xl p-5 shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-(--text-tertiary)">{t.sourceLibrary}</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-3xl font-black text-(--text-primary)">
                {loadingMetrics ? <span className="inline-block w-8 h-8 bg-(--surface-tertiary) rounded-lg animate-pulse" /> : metrics.sourcesCount}
              </div>
              <p className="text-[11px] text-(--text-tertiary) mt-1 font-medium">{t.viewSourceLibrary || 'Explore Library'} &rarr;</p>
            </div>
          </div>

        </div>

        {/* Operational Hub & Quick Actions */}
        <div id="operational-hub" className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-(--brand-foreground)">
              {language === 'vi' ? 'Trung tâm điều hành' : 'Operational Hub'}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            
            {/* Quick Action 1: Project Management */}
            <div className="bg-(--surface) border border-(--border) rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-(--brand)/40 transition-colors">
              <div>
                <div className="w-10 h-10 rounded-xl bg-(--brand-soft) text-(--brand-foreground) flex items-center justify-center mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 19h16M6 16V8m6 8V5m6 11v-4" /></svg>
                </div>
                <h3 className="text-sm font-black text-(--brand-foreground) mb-1">{t.projectManager}</h3>
                <p className="text-xs text-(--text-secondary) leading-relaxed mb-3 line-clamp-2">{t.projectManagerDesc}</p>
              </div>
              <Link to="/instructor/projects" className="inline-flex items-center text-xs font-bold text-(--brand) hover:underline gap-1 pt-2 border-t border-(--border-light)">
                {t.manageProjects} &rarr;
              </Link>
            </div>

            {/* Quick Action 2: Review Requests */}
            <div className="bg-(--surface) border border-(--border) rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-(--brand)/40 transition-colors">
              <div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6M9 8h6M5 4h14a2 2 0 012 2v14H3V6a2 2 0 012-2z" /></svg>
                </div>
                <h3 className="text-sm font-black text-(--brand-foreground) mb-1">{t.reviewRequests}</h3>
                <p className="text-xs text-(--text-secondary) leading-relaxed mb-3 line-clamp-2">{t.reviewRequestsDesc}</p>
              </div>
              <Link to="/instructor/requests" className="inline-flex items-center text-xs font-bold text-(--brand) hover:underline gap-1 pt-2 border-t border-(--border-light)">
                {t.reviewSubmissions} &rarr;
              </Link>
            </div>

            {/* Quick Action 3: Collections Manager */}
            <div className="bg-(--surface) border border-(--border) rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-(--brand)/40 transition-colors">
              <div>
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 2h8M8 11h8M8 15h5" /></svg>
                </div>
                <h3 className="text-sm font-black text-(--brand-foreground) mb-1">{t.collectionsManager}</h3>
                <p className="text-xs text-(--text-secondary) leading-relaxed mb-3 line-clamp-2">{t.collectionsManagerDesc}</p>
              </div>
              <Link to="/instructor/collections" className="inline-flex items-center text-xs font-bold text-(--brand) hover:underline gap-1 pt-2 border-t border-(--border-light)">
                {t.manageCollectionsLink} &rarr;
              </Link>
            </div>

            {/* Quick Action 4: Source Library */}
            <div className="bg-(--surface) border border-(--border) rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-(--brand)/40 transition-colors">
              <div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                </div>
                <h3 className="text-sm font-black text-(--brand-foreground) mb-1">{t.sourceLibrary}</h3>
                <p className="text-xs text-(--text-secondary) leading-relaxed mb-3 line-clamp-2">{t.sourceLibraryDesc || 'Manage research papers and source documents.'}</p>
              </div>
              <Link to="/instructor/source-library" className="inline-flex items-center text-xs font-bold text-(--brand) hover:underline gap-1 pt-2 border-t border-(--border-light)">
                {t.viewSourceLibrary || 'Explore Library'} &rarr;
              </Link>
            </div>

          </div>
        </div>

      </main>
    </div>
  );
}
