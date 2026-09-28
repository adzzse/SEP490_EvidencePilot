import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { StatusBadge, LoadingSkeleton, EmptyState, Modal, AppHeader, Breadcrumb, EntityCard } from '../../components';
import Dropdown from '../../components/ui/Dropdown.jsx';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../../utils/formatters/date';
import { CARD_GRID_PAGE_SIZE } from '../../constants';
import api from '../../services/api.js';
import { useNotification } from '../../context/NotificationContext';

const QUEUE_STATUSES = ['PENDING', 'RETURNED', 'REVIEWED', 'REJECTED'];

const daysWaiting = (iso) => {
  if (!iso) return null;
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
};

// Info-light badge (matches StatusBadge ACTIVE tones) for neutral counts.
const INFO_BADGE = 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800';

const toDisplayDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

const parseDisplayDate = (text) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text || '');
  if (!m) return null;
  const day = Number(m[1]); const month = Number(m[2]); const year = Number(m[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

// ponytail: native date inputs render mm/dd/yyyy under some browser locales and
// CSS cannot change that, so type DD/MM/YYYY here and use the hidden native
// picker (which still enforces min/max) only for the calendar popup.
function DateField({ value, min, max, ariaLabel, onChange }) {
  const [text, setText] = useState(toDisplayDate(value));
  const nativeRef = useRef(null);
  useEffect(() => { setText(toDisplayDate(value)); }, [value]);
  const commit = (next) => {
    const digits = next.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setText(formatted);
    if (digits.length === 8) {
      const iso = parseDisplayDate(formatted);
      if (iso && (!min || iso >= min) && (!max || iso <= max)) onChange(iso);
    } else if (digits.length === 0) {
      onChange('');
    }
  };
  return (
    <span className="inline-flex items-center gap-1 rounded-xl border border-(--border) bg-(--surface-secondary) px-2 py-1.5 focus-within:ring-2 focus-within:ring-(--focus)">
      <input
        type="text"
        inputMode="numeric"
        value={text}
        placeholder="DD/MM/YYYY"
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setText(toDisplayDate(value))}
        aria-label={ariaLabel}
        className="w-24 bg-transparent text-xs font-medium text-(--text-primary) placeholder:text-(--text-tertiary) focus:outline-none"
      />
      <button
        type="button"
        onClick={() => nativeRef.current?.showPicker?.()}
        aria-label={ariaLabel}
        className="text-(--text-tertiary) transition-colors hover:text-(--text-primary)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      </button>
      <input
        ref={nativeRef}
        type="date"
        value={value}
        min={min}
        max={max}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onChange(e.target.value)}
        className="absolute h-0 w-0 opacity-0"
      />
    </span>
  );
}

export default function ReviewRequests() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [showMoreFilters, setShowMoreFilters] = useState(false);
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

  const hasActiveFilters = Boolean(searchQuery || projectFilter || statusFilter || dateFrom || dateTo);
  // Local YYYY-MM-DD for native date-input bounds (matches ExtractionQueueTab pattern).
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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

  const requestPath = (req) => `/instructor/requests/${encodeURIComponent(req.projectId)}?review=${encodeURIComponent(req.id)}`;
  // Only PENDING rows accept instructor writes; everything else opens read-only history.
  const actionLabel = (req) => t(req.status === 'PENDING'
    ? 'instructor.reviewRequests.openReview'
    : 'instructor.reviewRequests.viewRequest');

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
        <div className="sticky top-16 z-20 border-b border-(--border) bg-(--page-bg) pb-5 pt-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black text-(--brand-foreground) tracking-tight">{t('instructor.reviewRequests.reviewRequests')}</h1>
            <p className="text-xs text-(--text-tertiary) mt-1">
              {!loading && t('instructor.reviewRequests.resultCount', { count: pagination.totalElements })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('instructor.reviewRequests.searchProjects')}
              aria-label={t('search')}
              className="w-full sm:w-64 rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)"
            />
            <Dropdown
              value={projectFilter}
              onChange={setProjectFilter}
              ariaLabel={t('instructor.reviewRequests.filterByProject')}
              placeholder={t('instructor.reviewRequests.allProjects')}
              options={[
                { value: '', label: t('instructor.reviewRequests.allProjects') },
                ...projects.map((p) => ({ value: p.id, label: p.title || `#${String(p.id).slice(0, 8)}` })),
              ]}
              className="w-full sm:w-48"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t('instructor.reviewRequests.filterByStatus')}
              className="w-full sm:w-40 rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)"
            >
              <option value="">{t('instructor.reviewRequests.allStatuses')}</option>
              {QUEUE_STATUSES.map((status) => (
                <option key={status} value={status}>{t(`status.${status}`)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowMoreFilters(v => !v)}
              aria-expanded={showMoreFilters}
              className="rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-bold text-(--text-secondary) hover:bg-(--surface) focus:outline-none focus:ring-2 focus:ring-(--focus)"
            >
              {t('instructor.reviewRequests.dateFilter')}{(dateFrom || dateTo) ? ' •' : ''}
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[10px] font-bold text-(--brand) hover:underline px-2"
              >
                {t('instructor.reviewRequests.commonClear')}
              </button>
            )}

            <div className="flex items-center gap-2 ms-auto">
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

          {showMoreFilters && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <DateField
                value={dateFrom}
                max={dateTo || today}
                onChange={setDateFrom}
                ariaLabel={t('instructor.reviewRequests.fromDate')}
              />
              <span aria-hidden="true" className="text-[10px] font-bold text-(--text-tertiary)">–</span>
              <DateField
                value={dateTo}
                min={dateFrom || undefined}
                max={today}
                onChange={setDateTo}
                ariaLabel={t('instructor.reviewRequests.toDate')}
              />
            </div>
          )}
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
            <EmptyState
              title={t(hasActiveFilters
                ? 'instructor.reviewRequests.noFilteredRequests'
                : 'instructor.reviewRequests.noRequests')}
              action={hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-bold text-(--brand) hover:underline"
                >
                  {t('instructor.reviewRequests.commonClear')}
                </button>
              ) : undefined}
            />
          </div>
        ) : viewMode === 'list' ? (
          <div id="review-table" className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-(--surface-secondary) text-(--text-tertiary) text-[10px] font-bold uppercase border-b border-(--border-light)">
                    <th className="px-6 py-4">{t('instructor.reviewRequests.project')}</th>
                    <th className="px-6 py-4">{t('instructor.reviewRequests.submittedBy')}</th>
                    <th className="px-6 py-4">{t('instructor.reviewRequests.overview')}</th>
                    <th className="px-6 py-4">{t('instructor.reviewRequests.status')}</th>
                    <th className="px-6 py-4 whitespace-nowrap">{t('instructor.reviewRequests.requestedAt')}</th>
                    <th className="px-6 py-4">{t('instructor.reviewRequests.commonActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--border-light) text-xs text-(--text-secondary)">
                  {requests.map((req) => {
                    const proj = projectById.get(String(req.projectId));
                    const projectTitle = proj?.title || `${t('instructor.reviewRequests.project')} #${String(req.projectId).slice(0, 8)}`;
                    const waiting = req.status === 'PENDING' ? daysWaiting(req.requestedAt) : null;
                    return (
                      <tr key={req.id} className="hover:bg-(--surface-secondary) transition-colors">
                        <td className="px-6 py-4 max-w-64">
                          <Link to={requestPath(req)}
                            title={projectTitle}
                            className="font-bold text-(--text-primary) block text-xs truncate hover:text-(--brand-foreground) transition-colors">
                            {projectTitle}
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-(--text-primary)">{req.studentName || '—'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${INFO_BADGE}`}>
                              {t('instructor.reviewRequests.members')}: {proj?.memberCount ?? 0}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${INFO_BADGE}`}>
                              {t('instructor.reviewRequests.sections')}: {proj?.sectionCount ?? '—'}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${INFO_BADGE}`}>
                              {t('instructor.reviewRequests.sources')}: {proj?.sourceCount ?? '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4"><StatusBadge status={req.status} /></td>
                        <td className="px-6 py-4 whitespace-nowrap text-[10px] font-mono text-(--text-tertiary)">
                          {req.requestedAt ? formatDateTime(req.requestedAt, i18n.language) : '—'}
                          {waiting !== null && waiting >= 1 && (
                            <span className="ml-1 font-sans font-bold text-amber-600 dark:text-amber-400">
                              · {t('instructor.reviewRequests.daysAgo', { count: waiting })}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Link to={requestPath(req)}
                            className="text-xs font-black text-(--brand) hover:underline whitespace-nowrap">{actionLabel(req)}</Link>
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
              const waiting = req.status === 'PENDING' ? daysWaiting(req.requestedAt) : null;
              return (
                <EntityCard
                  key={req.id}
                  className="hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
                  title={projectTitle}
                  subtitle={req.studentName ? <>{t('instructor.reviewRequests.submittedBy')}: <strong>{req.studentName}</strong></> : undefined}
                  status={req.status}
                  onClick={() => { navigate(requestPath(req)); }}
                >
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                    <span className={`px-1.5 py-0.5 rounded-md border ${INFO_BADGE}`}>
                      {t('instructor.reviewRequests.members')}: {proj?.memberCount ?? 0}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded-md border ${INFO_BADGE}`}>
                      {t('instructor.reviewRequests.sections')}: {proj?.sectionCount ?? '—'}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded-md border ${INFO_BADGE}`}>
                      {t('instructor.reviewRequests.sources')}: {proj?.sourceCount ?? '—'}
                    </span>
                  </div>
                  <div className="mt-2 text-[10px] font-mono text-(--text-tertiary)">
                    {req.requestedAt ? formatDateTime(req.requestedAt, i18n.language) : ''}
                    {waiting !== null && waiting >= 1 && (
                      <span className="ml-1 font-sans font-bold text-amber-600 dark:text-amber-400">
                        · {t('instructor.reviewRequests.daysAgo', { count: waiting })}
                      </span>
                    )}
                  </div>
                  <span className="mt-2 inline-block text-xs font-black text-(--brand)">{actionLabel(req)}</span>
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
