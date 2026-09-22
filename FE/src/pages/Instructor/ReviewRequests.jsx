import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { StatusBadge, LoadingSkeleton, EmptyState, Modal, AppHeader, Breadcrumb, EntityCard } from '../../components';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../../utils/formatters/date';
import { CARD_GRID_PAGE_SIZE } from '../../constants';
import api from '../../services/api.js';
import { useNotification } from '../../context/NotificationContext';

export default function ReviewRequests() {
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const { subscribeToEntityChanges } = useNotification();
  const reviewLink = searchParams.get('review');

  const [requests, setRequests] = useState([]);
  const [deepLinkedRequest, setDeepLinkedRequest] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [page, setPage] = useState(0);
  const [pagination, setPagination] = useState({ totalPages: 0, totalElements: 0 });
  const [showGuide, setShowGuide] = useState(false);

  const requestControllerRef = useRef(null);

  const fetchReviewRequests = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true); setErrorMessage('');
    try {
      const params = new URLSearchParams({ page: String(page), size: String(CARD_GRID_PAGE_SIZE) });
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (projectFilter) params.set('projectId', projectFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const [res, proj] = await Promise.all([
        api.get(`/api/feedback-requests/queue?${params.toString()}`, { signal: controller.signal }),
        api.get('/api/projects?page=0&size=100', { signal: controller.signal }).catch(() => null),
      ]);
      if (controller.signal.aborted) return;
      const result = res.data || {};
      setRequests(result.content || []);
      if (reviewLink) {
        const linked = (result.content || []).find(req => String(req.id) === String(reviewLink))
          || (result.content || []).find(req => String(req.projectId) === String(reviewLink));
        if (linked) {
          setDeepLinkedRequest(linked);
        } else {
          try {
            const { data } = await api.get(
              `/api/feedback-requests/${encodeURIComponent(reviewLink)}`, { signal: controller.signal });
            setDeepLinkedRequest(data || null);
          } catch (error) {
            if (controller.signal.aborted) return;
            if (error?.response?.status !== 404) throw error;
            const { data } = await api.get(
              `/api/feedback-requests/queue?page=0&size=1&projectId=${encodeURIComponent(reviewLink)}`,
              { signal: controller.signal });
            setDeepLinkedRequest(data?.content?.[0] || null);
          }
        }
      } else {
        setDeepLinkedRequest(null);
      }
      setPagination({ totalPages: result.totalPages || 0, totalElements: result.totalElements || 0 });
      setProjects(proj?.data?.content || []);
    }
    catch (error) {
      if (!controller.signal.aborted) setErrorMessage(t('instructor.reviewRequests.loadReviewRequestsFailed'));
    }
    finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [dateFrom, dateTo, page, projectFilter, reviewLink, searchQuery, statusFilter, t]);

  useEffect(() => {
    fetchReviewRequests();
    return () => requestControllerRef.current?.abort();
  }, [fetchReviewRequests]);

  useEffect(() => subscribeToEntityChanges(event => {
    if (event?.entity === 'FEEDBACK' || event?.entity === 'PROJECT') void fetchReviewRequests();
  }), [fetchReviewRequests, subscribeToEntityChanges]);

  const projectById = useMemo(() => {
    const m = new Map();
    projects.forEach((p) => m.set(String(p.id), p));
    return m;
  }, [projects]);

  const clearFilters = () => {
    setSearchQuery('');
    setProjectFilter('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(0);
  };

  useEffect(() => { setPage(0); }, [searchQuery, projectFilter, statusFilter, dateFrom, dateTo]);

  const totalPages = pagination.totalPages;
  const safePage = Math.min(page, Math.max(0, totalPages - 1));

  const linkedRequest = deepLinkedRequest
    || requests.find(req => String(req.id) === String(reviewLink))
    || requests.find(req => String(req.projectId) === String(reviewLink));
  if (linkedRequest) {
    const search = new URLSearchParams(searchParams);
    search.set('review', linkedRequest.id);
    return <Navigate to={{ pathname: `/instructor/requests/${encodeURIComponent(linkedRequest.projectId)}`, search: `?${search}` }} replace />;
  }

  return (
    <div className="min-h-screen bg-(--page-bg) text-(--text-primary)">
      <AppHeader />
      <main className="max-w-[1400px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Breadcrumb
          items={[
            { label: t('instructor.reviewRequests.dashboard'), path: '/instructor/dashboard' },
            { label: t('instructor.reviewRequests.reviewRequests') }
          ]}
        />
        <div className="sticky top-16 z-20 flex flex-col lg:flex-row justify-between items-start lg:items-center w-full mb-6 gap-4 border-b border-(--border) bg-(--page-bg) pb-6 pt-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-black text-(--brand-foreground) tracking-tight">{t('instructor.reviewRequests.reviewRequests')}</h1>
            <p className="text-xs text-(--text-tertiary) mt-1">{t('instructor.reviewRequests.pendingRequests')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('instructor.reviewRequests.searchProjects')}
            aria-label={t('search')}
            className="w-full sm:w-56 rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)"
          />
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label={t('instructor.reviewRequests.filterByProject')}
            className="w-full sm:w-48 rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <option value="">{t('instructor.reviewRequests.allProjects')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.title || `#${String(p.id).slice(0, 8)}`}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={t('instructor.reviewRequests.filterByStatus')}
            className="w-full sm:w-40 rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)"
          >
            <option value="">{t('instructor.reviewRequests.allStatuses')}</option>
            {['PENDING', 'RETURNED', 'REVIEWED'].map((status) => (
              <option key={status} value={status}>{t(status)}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-[10px] font-bold uppercase text-(--text-tertiary)">
            <span>{t('instructor.reviewRequests.fromDate')}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border border-(--border) bg-(--surface-secondary) px-2 py-1.5 text-xs font-medium text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)"
            />
          </label>
          <label className="flex items-center gap-1 text-[10px] font-bold uppercase text-(--text-tertiary)">
            <span>{t('instructor.reviewRequests.toDate')}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border border-(--border) bg-(--surface-secondary) px-2 py-1.5 text-xs font-medium text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)"
            />
          </label>
          {(searchQuery || projectFilter || statusFilter || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[10px] font-bold text-(--brand) hover:underline px-2"
            >
              {t('instructor.reviewRequests.commonClear')}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-bold text-(--text-secondary) hover:bg-(--surface) focus:outline-none focus:ring-2 focus:ring-(--focus)"
          >
            {t('instructor.reviewRequests.userGuide')}
          </button>

          <div className="flex items-center bg-(--surface-secondary) border border-(--border) rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${viewMode === 'list' ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
              title={t('instructor.reviewRequests.listView')}
              aria-label={t('instructor.reviewRequests.listView')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${viewMode === 'card' ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
              title={t('instructor.reviewRequests.cardView')}
              aria-label={t('instructor.reviewRequests.cardView')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
          </div>
        </div>

        </div>

        {errorMessage && (
          <div className="p-4 mb-6 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold">{errorMessage}</div>
        )}

        {loading ? (
          viewMode === 'list' ? (
            <div id="review-table" className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm overflow-hidden">
              <div className="p-6 space-y-2"><LoadingSkeleton count={4} height="h-8" /></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: CARD_GRID_PAGE_SIZE }).map((_, i) => <div key={i} className="h-36 bg-(--surface-tertiary) rounded-2xl animate-pulse" />)}
            </div>
          )
        ) : requests.length === 0 ? (
          <div id="review-table" className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm">
            <EmptyState title={t('instructor.reviewRequests.noRequests')} />
          </div>
        ) : viewMode === 'list' ? (
          <div id="review-table" className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-(--surface-secondary) text-(--text-tertiary) text-[10px] font-bold uppercase border-b border-(--border-light)">
                    <th className="px-6 py-4">{t('instructor.reviewRequests.project')}</th>
                    <th className="px-6 py-4">{t('instructor.reviewRequests.studentName')}</th>
                    <th className="px-6 py-4 whitespace-nowrap">{t('instructor.reviewRequests.metadata')}</th>
                    <th className="px-6 py-4">{t('instructor.reviewRequests.status')}</th>
                    <th className="px-6 py-4">{t('instructor.reviewRequests.requestedAt')}</th>
                    <th className="px-6 py-4">{t('instructor.reviewRequests.commonActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--border-light) text-xs text-(--text-secondary)">
                  {requests.map((req) => {
                    const proj = projectById.get(String(req.projectId));
                    const projectTitle = proj?.title || `${t('instructor.reviewRequests.project')} #${String(req.projectId).slice(0, 8)}`;
                    return (
                      <tr key={req.id} className="hover:bg-(--surface-secondary) transition-colors">
                        <td className="px-6 py-4">
                          <Link to={`/instructor/requests/${encodeURIComponent(req.projectId)}?review=${encodeURIComponent(req.id)}`}
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
                              {t('instructor.reviewRequests.members')}: {proj?.memberCount ?? 0}
                            </span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-(--surface-secondary) border border-(--border-light) text-[10px] font-bold text-(--text-secondary)">
                              {t('instructor.reviewRequests.sections')}: {proj?.sectionCount ?? '—'}
                            </span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-(--surface-secondary) border border-(--border-light) text-[10px] font-bold text-(--text-secondary)">
                              {t('instructor.reviewRequests.sources')}: {proj?.sourceCount ?? '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4"><StatusBadge status={req.status} /></td>
                        <td className="px-6 py-4 whitespace-nowrap text-[10px] font-mono text-(--text-tertiary)">
                          {req.requestedAt ? formatDateTime(req.requestedAt, i18n.language) : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <Link to={`/instructor/requests/${encodeURIComponent(req.projectId)}?review=${encodeURIComponent(req.id)}`}
                            className="text-xs font-black text-(--brand) hover:underline">{t('instructor.reviewRequests.review')}</Link>
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
            {requests.map((req) => {
              const proj = projectById.get(String(req.projectId));
              const projectTitle = proj?.title || `${t('instructor.reviewRequests.project')} #${String(req.projectId).slice(0, 8)}`;
              return (
                <EntityCard
                  key={req.id}
                  className="hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
                  title={projectTitle}
                  subtitle={req.studentName ? `${t('instructor.reviewRequests.studentName')}: ${req.studentName}` : undefined}
                  status={req.status}
                  onClick={() => { window.location.href = `/instructor/requests/${encodeURIComponent(req.projectId)}?review=${encodeURIComponent(req.id)}`; }}
                >
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-(--text-tertiary)">
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
                      {t('instructor.reviewRequests.members')}: {proj?.memberCount ?? 0}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-(--surface-secondary) border border-(--border-light) text-(--text-secondary) font-bold">
                      {t('instructor.reviewRequests.sections')}: {proj?.sectionCount ?? '—'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-(--surface-secondary) border border-(--border-light) text-(--text-secondary) font-bold">
                      {t('instructor.reviewRequests.sources')}: {proj?.sourceCount ?? '—'}
                    </span>
                  </div>
                  <div className="mt-2 text-[10px] font-mono text-(--text-tertiary)">
                    {req.requestedAt ? formatDateTime(req.requestedAt, i18n.language) : ''}
                  </div>
                </EntityCard>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-6 text-xs">
            <button disabled={safePage === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 bg-(--surface) border border-(--border) rounded-lg disabled:opacity-40 font-bold text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors">{t('back')}</button>
            <span className="text-(--text-tertiary) font-mono font-bold">{t('instructor.reviewRequests.page')} {safePage + 1} {t('instructor.reviewRequests.of')} {totalPages}</span>
            <button disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 bg-(--surface) border border-(--border) rounded-lg disabled:opacity-40 font-bold text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors">{t('instructor.reviewRequests.commonNext')}</button>
          </div>
        )}
      </main>
      <Modal open={showGuide} onClose={() => setShowGuide(false)} title={t('instructor.reviewRequests.guideTitle')}>
        <p className="text-sm leading-relaxed text-(--text-secondary)">{t('instructor.reviewRequests.guideBody')}</p>
        <ul className="mt-4 space-y-2 text-sm text-(--text-secondary) list-disc pl-5">
          <li>{t('instructor.reviewRequests.guideLatest')}</li>
          <li>{t('instructor.reviewRequests.guideFilters')}</li>
          <li>{t('instructor.reviewRequests.guideHistory')}</li>
        </ul>
      </Modal>
    </div>
  );
}
