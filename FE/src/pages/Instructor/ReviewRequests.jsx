import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge, LoadingSkeleton, EmptyState, TourLauncher, AppHeader, Breadcrumb } from '../../components';
import { instructorText, commonText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api.js';

export default function ReviewRequests() {
  const { language } = useLanguage();
  const t = instructorText[language];
  const ct = commonText[language];

  const [requests, setRequests] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
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

  return (
    <div className="min-h-screen bg-(--page-bg) text-(--text-primary)">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Breadcrumb
          items={[
            { label: t.dashboard, path: '/instructor/dashboard' },
            { label: t.reviewRequests }
          ]}
        />
        <div className="mb-8 border-b border-(--border) pb-6">
          <h1 className="text-3xl font-black text-(--brand-foreground) tracking-tight">{t.reviewRequests}</h1>
          <p className="text-xs text-(--text-tertiary) mt-1">{t.pendingRequests}</p>
        </div>

        {errorMessage && (
          <div className="p-4 mb-6 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold">{errorMessage}</div>
        )}

        <div id="review-table" className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-(--surface-secondary) text-(--text-tertiary) text-[10px] font-bold uppercase border-b border-(--border-light)">
                  <th className="px-6 py-4">{t.project}</th>
                  <th className="px-6 py-4">{ct.status}</th>
                  <th className="px-6 py-4">{ct.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--border-light) text-xs text-(--text-secondary)">
                {loading ? (
                  <tr><td colSpan="3" className="px-6 py-8"><LoadingSkeleton count={3} height="h-8" /></td></tr>
                ) : requests.length === 0 ? (
                  <tr><td colSpan="3" className="px-6 py-8"><EmptyState title={t.noRequests} /></td></tr>
                ) : requests.map((req) => {
                  const projectTitle = projects.find(p => String(p.id) === String(req.projectId))?.title;
                  return (
                  <tr key={req.id} className="hover:bg-(--surface-secondary) transition-colors">
                    <td className="px-6 py-4">
                      <Link to={`/instructor/requests/${req.projectId}`}
                        className="font-bold text-(--text-primary) block text-xs hover:text-(--brand-foreground) transition-colors">
                        {projectTitle || `${t.project} #${req.projectId.slice(0, 8)}`}
                      </Link>
                      <span className="text-[10px] text-(--text-tertiary) font-mono block mt-0.5">{t.request}: {req.id}</span>
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={req.status} /></td>
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
      </main>
      <TourLauncher steps={tourSteps} tourKey="instructor-requests" />
    </div>
  );
}
