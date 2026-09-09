import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAdminTour } from '../../../hooks/useAdminTour.js';
import { useToast } from '../../../components/ui/Toast.jsx';
import { useTranslation } from 'react-i18next';
import Tabs from '../../../components/ui/Tabs.jsx';
import ProjectAvatar from '../../../components/ui/ProjectAvatar.jsx';
import { useLanguage } from '../../../context/LanguageContext';

function MemberAvatar({ email, firstName, lastName, avatarUrl, size = 'w-8 h-8', text = 'text-[10px]' }) {
  const initial = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase()
    || email?.[0]?.toUpperCase() || '?';
  return (
    <div className={`${size} rounded-full overflow-hidden bg-[#1e3a8a]/10 text-(--brand-foreground) flex items-center justify-center ${text} font-black shrink-0 ring-2 ring-(--surface)`} aria-hidden="true">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

function ProjectsSection({ api }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [instructorFilter, setInstructorFilter] = useState('');

  const [activeProject, setActiveProject] = useState(null);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState('MEMBER');
  const [updatingMemberId, setUpdatingMemberId] = useState(null);
  const [memberErr, setMemberErr] = useState('');

  const [detailProject, setDetailProject] = useState(null);
  const [detailTab, setDetailTab] = useState('members');

  const params = { page, size: 20 };
  if (q.trim()) params.q = q.trim();
  if (statusFilter) params.status = statusFilter;
  if (instructorFilter) params.instructor = instructorFilter;

  const projectsQuery = useQuery({
    queryKey: ['projects', 'admin', { page, q, statusFilter, instructorFilter }],
    queryFn: async ({ signal }) => {
      const r = await api.get('/api/admin/projects', { params, signal });
      return r.data;
    },
    placeholderData: (prev) => prev,
  });

  const instructorsQuery = useQuery({
    queryKey: ['users', 'instructors'],
    queryFn: async ({ signal }) => {
      const r = await api.get('/api/admin/users', { params: { size: 100 }, signal });
      return r.data?.content || [];
    },
  });

  const detailMembersQuery = useQuery({
    queryKey: ['project', detailProject?.id, 'members'],
    queryFn: ({ signal }) => api.get(`/api/projects/${detailProject.id}/members`, { signal }).then(r => r.data || []),
    enabled: !!detailProject,
  });

  const detailDocsQuery = useQuery({
    queryKey: ['project', detailProject?.id, 'documents'],
    queryFn: ({ signal }) => api.get(`/api/projects/${detailProject.id}/documents`, { params: { page: 0, size: 100 }, signal }).then(r => r.data?.content || []),
    enabled: !!detailProject,
  });

  const detailSectionsQuery = useQuery({
    queryKey: ['project', detailProject?.id, 'sections'],
    queryFn: ({ signal }) => api.get(`/api/admin/projects/${detailProject.id}/sections`, { signal }).then(r => r.data || []),
    enabled: !!detailProject,
  });

  const membersQuery = useQuery({
    queryKey: ['project', activeProject?.id, 'members-modal'],
    queryFn: ({ signal }) => api.get(`/api/projects/${activeProject.id}/members`, { signal }).then(r => r.data || []),
    enabled: showMembersModal && !!activeProject,
  });

  const allUsersQuery = useQuery({
    queryKey: ['users', 'all-students'],
    queryFn: ({ signal }) => api.get('/api/admin/users?size=100', { signal }).then(r => r.data?.content || []),
    enabled: showMembersModal,
  });

  const unarchiveMutation = useMutation({
    mutationFn: (p) => api.patch(`/api/admin/projects/${p.id}/unarchive`),
    onSuccess: () => {
      toast.success(t('admin.unarchiveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => toast.error(e.response?.data?.message || t('admin.unarchiveFailed')),
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ projectId, userId, role }) =>
      api.post(`/api/projects/${projectId}/members`, null, { params: { userId, role } }),
    onSuccess: () => {
      toast.success(t('admin.memberAdded'));
      setSelectedUser('');
      queryClient.invalidateQueries({ queryKey: ['project', activeProject.id, 'members-modal'] });
      queryClient.invalidateQueries({ queryKey: ['project', activeProject.id, 'members'] });
    },
    onError: (e) => setMemberErr(e.response?.data?.message || t('admin.memberAddFailed')),
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ projectId, userId }) => api.delete(`/api/projects/${projectId}/members/${userId}`),
    onSuccess: () => {
      toast.success(t('admin.memberRemoved'));
      queryClient.invalidateQueries({ queryKey: ['project', activeProject.id, 'members-modal'] });
      queryClient.invalidateQueries({ queryKey: ['project', activeProject.id, 'members'] });
    },
    onError: (e) => setMemberErr(e.response?.data?.message || t('admin.memberRemoveFailed')),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ projectId, userId, role }) =>
      api.patch(`/api/projects/${projectId}/members/${userId}`, null, { params: { role } }),
    onSuccess: () => {
      toast.success(t('admin.memberRoleUpdated'));
      queryClient.invalidateQueries({ queryKey: ['project', activeProject.id, 'members-modal'] });
    },
    onError: (e) => setMemberErr(e.response?.data?.message || e.response?.data?.detail || t('admin.memberRoleUpdateFailed')),
    onSettled: () => setUpdatingMemberId(null),
  });

  const projectsTourSteps = useCallback(() => [
    { popover: { title: t('admin.processGuide'), description: t('admin.guideProjectsDesc'), side: 'center' } },
    { element: '[data-guide="projects-table"]', popover: { title: t('admin.projects'), description: t('admin.guideProjectsTable'), side: 'left' } },
    { popover: { title: t('admin.done'), description: t('admin.guideProjectsDone'), side: 'center' } },
  ], [t]);
  const { start: startProcessGuide } = useAdminTour('projects', projectsTourSteps);

  const getStatusBadge = (status) => {
    const styles = {
      CREATED: 'bg-(--surface-tertiary) text-(--text-primary)',
      ASSIGNED: 'bg-blue-100 text-blue-700',
      IN_PROGRESS: 'bg-cyan-100 text-cyan-700',
      SUBMITTED_FOR_REVIEW: 'bg-amber-100 text-amber-700',
      RETURNED: 'bg-orange-100 text-orange-700',
      APPROVED: 'bg-emerald-100 text-emerald-700',
      ARCHIVED: 'bg-(--surface-secondary) text-(--text-secondary)'
    };
    const labels = {
      CREATED: t('admin.statusCreated'),
      ASSIGNED: t('admin.statusAssigned'),
      IN_PROGRESS: t('admin.statusInProgress'),
      SUBMITTED_FOR_REVIEW: t('admin.statusUnderReview'),
      RETURNED: t('admin.statusReturned'),
      APPROVED: t('admin.statusApproved'),
      ARCHIVED: t('admin.statusArchived')
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${styles[status] || 'bg-(--surface-tertiary) text-(--text-primary)'}`}>
        {labels[status] || status || '—'}
      </span>
    );
  };

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';

  const projects = projectsQuery.data || { content: [], page: 0, totalElements: 0, totalPages: 0 };
  const loading = projectsQuery.isLoading;
  const error = projectsQuery.error;
  const instructors = (instructorsQuery.data || []).filter((u) => u.role === 'INSTRUCTOR');
  const detailMembers = detailMembersQuery.data || [];
  const detailDocs = detailDocsQuery.data || [];
  const detailSections = detailSectionsQuery.data || [];
  const sourceDocs = detailDocs.filter((d) => d.docType === 'SOURCE');
  const members = membersQuery.data || [];
  const allUsers = allUsersQuery.data || [];

  return (
    <div className="p-8 space-y-6 bg-(--page-bg)">
      {/* Header — title left, metric badge right */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-(--border) pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-(--brand-foreground) tracking-tight">{t('admin.projects')}</h1>
          <p className="text-gray-550 text-xs mt-1">{t('admin.projectsSub')}</p>
        </div>
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-(--surface) border border-(--border) text-xs font-bold text-(--text-secondary) self-start sm:self-auto">
          {t('admin.totalProjectsInline', { count: projects.totalElements ?? 0 })}
        </span>
      </div>

      <div className="bg-(--surface) rounded-xl border border-(--border) p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 w-full gap-3 items-center">
          <input
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder={t('admin.searchProjects')}
            className="flex-1 px-3 py-2 bg-(--surface) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--brand)"
          />

          <select
            value={instructorFilter}
            onChange={(e) => { setInstructorFilter(e.target.value); setPage(0); }}
            aria-label={t('admin.filterByInstructor')}
            className="w-44 px-3 py-2 bg-(--surface) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none cursor-pointer"
          >
            <option value="">{t('admin.allInstructors')}</option>
            {instructors.map((u) => (
              <option key={u.id} value={u.email}>
                {u.firstName} {u.lastName} ({u.email})
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            aria-label={t('admin.filterByStatus')}
            className="w-36 px-3 py-2 bg-(--surface) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none cursor-pointer"
          >
            <option value="">{t('admin.allStatuses')}</option>
            <option value="CREATED">{t('admin.statusCreated')}</option>
            <option value="ASSIGNED">{t('admin.statusAssigned')}</option>
            <option value="IN_PROGRESS">{t('admin.statusInProgress')}</option>
            <option value="SUBMITTED_FOR_REVIEW">{t('admin.statusUnderReview')}</option>
            <option value="RETURNED">{t('admin.statusReturned')}</option>
            <option value="APPROVED">{t('admin.statusApproved')}</option>
            <option value="ARCHIVED">{t('admin.statusArchived')}</option>
          </select>
        </div>

        <span className="text-xs text-(--text-tertiary) font-bold self-end sm:self-center shrink-0">
          {t('admin.showingProjects', { shown: projects.content.length, total: projects.totalElements || projects.content.length })}
        </span>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs font-semibold flex items-center justify-between">
          <span>{error.message || t('admin.loadFailed')}</span>
          <button onClick={() => projectsQuery.refetch()} className="text-rose-800 underline">{t('admin.retry')}</button>
        </div>
      )}

      <div className="bg-(--surface) rounded-2xl shadow-sm border border-(--border) overflow-hidden">
        <div className="overflow-x-auto">
          <table data-guide="projects-table" className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-(--surface-secondary) text-(--text-tertiary) font-bold uppercase border-b border-(--border-light)">
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.projectTitle')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.totalMembers')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.totalSources')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.projectStatus')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">{t('admin.lastUpdate')}</th>
                <th className="px-6 py-3.5 font-bold tracking-wider text-right">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border-light) text-(--text-primary) font-semibold">
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">{Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-full" /></td>
                ))}</tr>
              )) : projects.content.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-(--text-tertiary) font-medium">{t('admin.noProjects')}</td></tr>
              ) : projects.content.map(p => (
                <tr key={p.id} className="hover:bg-(--surface-secondary)/50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <ProjectAvatar name={p.title} size="w-9 h-9" />
                      <span className="font-bold text-(--text-primary) max-w-xs truncate">{p.title}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-(--text-secondary) font-bold">{p.collaboratorCount ?? '—'}</td>
                  <td className="px-6 py-4 text-(--text-secondary) font-bold">{p.totalSources ?? '—'}</td>
                  <td className="px-6 py-4">{getStatusBadge(p.status)}</td>
                  <td className="px-6 py-4 text-(--text-secondary) font-semibold whitespace-nowrap">{fmtDate(p.updatedAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => { setDetailProject(p); setDetailTab('members'); }} title={t('admin.viewDetails')} className="p-1.5 rounded-lg hover:bg-(--surface-tertiary) text-(--text-secondary) hover:text-(--text-primary) transition cursor-pointer">
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>

                      <button onClick={() => { setActiveProject(p); setShowMembersModal(true); setSelectedUser(''); setMemberErr(''); }} title={t('admin.manageMembers')} className="p-1.5 rounded-lg hover:bg-(--surface-tertiary) text-blue-600 hover:text-blue-800 transition cursor-pointer">
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      </button>

                      {p.status === 'ARCHIVED' && (
                        <button onClick={() => unarchiveMutation.mutate(p)} title={t('admin.unarchiveTitle')} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 hover:text-emerald-800 transition cursor-pointer">
                          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-6 py-3.5 border-t border-(--border-light) bg-(--surface-secondary)/50 text-xs font-semibold text-(--text-secondary)">
          {projects.totalPages > 1 ? (
            <>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(page - 1)} disabled={page === 0} className="p-1.5 rounded-lg border border-(--border) text-(--text-tertiary) hover:bg-(--surface-secondary) disabled:opacity-30 disabled:cursor-not-allowed transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {Array.from({ length: projects.totalPages }).map((_, i) => {
                  if (i === 0 || i === projects.totalPages - 1 || (i >= page - 1 && i <= page + 1)) {
                    const isActive = page === i;
                    return (
                      <button key={i} onClick={() => setPage(i)} className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition ${isActive ? 'bg-[#1e3a8a] text-white shadow-sm' : 'border border-(--border) text-(--text-secondary) hover:bg-(--surface-secondary)'}`}>{i + 1}</button>
                    );
                  } else if (i === 1 || i === projects.totalPages - 2) {
                    return <span key={i} className="text-(--text-tertiary) text-xs px-0.5">...</span>;
                  }
                  return null;
                })}
                <button onClick={() => setPage(page + 1)} disabled={page >= projects.totalPages - 1} className="p-1.5 rounded-lg border border-(--border) text-(--text-tertiary) hover:bg-(--surface-secondary) disabled:opacity-30 disabled:cursor-not-allowed transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <span>{t('admin.pageOf', { page: page + 1, total: projects.totalPages })}</span>
            </>
          ) : (
            <>
              <div className="w-1" />
              <span>{t('admin.pageOf', { page: 1, total: 1 })}</span>
            </>
          )}
        </div>
      </div>

      {/* Project Detail Modal — max-w-4xl, tabbed, no nested modals */}
      {detailProject && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-(--surface) rounded-2xl shadow-2xl w-full max-w-4xl border border-gray-150 overflow-hidden transform scale-100 transition-all duration-300 max-h-[90vh] flex flex-col">
            <div className="bg-(--surface-secondary) border-b border-gray-150 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="min-w-0 flex items-center gap-3">
                <ProjectAvatar name={detailProject.title} size="w-10 h-10" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-bold text-(--text-primary) text-sm truncate">{detailProject.title}</h3>
                    {getStatusBadge(detailProject.status)}
                  </div>
                  <p className="text-(--text-tertiary) text-[10px] mt-0.5 font-mono truncate">{detailProject.id}</p>
                </div>
              </div>
              <button onClick={() => setDetailProject(null)} className="text-(--text-tertiary) hover:text-(--text-secondary) transition cursor-pointer shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              {/* Project Description */}
              <p className="text-sm text-(--text-secondary) leading-relaxed">
                {detailProject.description || t('admin.projectDescriptionEmpty')}
              </p>

              {/* Header metadata strip — no "General Information" wrapper */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-y border-(--border) py-4">
                <div>
                  <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t('admin.projectStatus')}</span>
                  <span className="font-bold text-(--text-primary)">{getStatusBadge(detailProject.status)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t('admin.standard')}</span>
                  <span className="font-bold text-(--text-primary)">{detailProject.targetStandard || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t('admin.createDate')}</span>
                  <span className="font-bold text-(--text-primary)">{fmtDate(detailProject.createdAt)}</span>
                </div>
              </div>

              <Tabs
                value={detailTab}
                onChange={setDetailTab}
                tabs={[
                  { key: 'members', label: t('admin.tabMembers'), count: detailMembers.length },
                  { key: 'sources', label: t('admin.tabSources'), count: sourceDocs.length },
                  { key: 'sections', label: t('admin.tabSections'), count: detailSections.length },
                ]}
              />

              <div className="max-h-[40vh] overflow-y-auto border border-(--border) rounded-xl bg-(--surface)">
                {detailTab === 'members' && (
                  detailMembersQuery.isLoading ? (
                    <div className="p-4 space-y-2 animate-pulse">
                      <div className="h-10 bg-gray-200 rounded" />
                      <div className="h-10 bg-gray-200 rounded" />
                    </div>
                  ) : detailMembers.length === 0 ? (
                    <p className="p-6 text-center text-xs text-(--text-tertiary) italic">{t('admin.noMembers')}</p>
                  ) : (
                    <ul className="divide-y divide-(--border-light)">
                      {detailMembers.map((m) => (
                        <li key={m.id || m.userId} className="px-4 py-3 flex items-center gap-3 text-xs">
                          <MemberAvatar email={m.email} firstName={m.firstName} lastName={m.lastName} />
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-(--text-primary) truncate">{m.firstName} {m.lastName}</p>
                            <p className="text-[10px] text-(--text-tertiary) font-mono truncate">{m.email}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-(--surface-secondary) text-(--text-secondary) border border-(--border) shrink-0">{m.role}</span>
                        </li>
                      ))}
                    </ul>
                  )
                )}

                {detailTab === 'sources' && (
                  detailDocsQuery.isLoading ? (
                    <div className="p-4 space-y-2 animate-pulse">
                      <div className="h-10 bg-gray-200 rounded" />
                      <div className="h-10 bg-gray-200 rounded" />
                    </div>
                  ) : sourceDocs.length === 0 ? (
                    <p className="p-6 text-center text-xs text-(--text-tertiary) italic">{t('admin.noSources')}</p>
                  ) : (
                    <ul className="divide-y divide-(--border-light)">
                      {sourceDocs.map((d) => (
                        <li key={d.id} className="px-4 py-3 flex items-center gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-(--text-primary) truncate">{d.title || d.originalFilename}</p>
                            <p className="text-[10px] text-(--text-tertiary) font-mono truncate">{d.doi || d.originalFilename || '—'}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-(--surface-secondary) text-(--text-secondary) border border-(--border) shrink-0">{d.processingStatus || '—'}</span>
                        </li>
                      ))}
                    </ul>
                  )
                )}

                {detailTab === 'sections' && (
                  detailSectionsQuery.isLoading ? (
                    <div className="p-4 space-y-2 animate-pulse">
                      <div className="h-10 bg-gray-200 rounded" />
                      <div className="h-10 bg-gray-200 rounded" />
                    </div>
                  ) : detailSections.length === 0 ? (
                    <p className="p-6 text-center text-xs text-(--text-tertiary) italic">{t('admin.noSections')}</p>
                  ) : (
                    <ul className="divide-y divide-(--border-light)">
                      {detailSections.map((s) => (
                        <li key={s.id} className="px-4 py-3 flex items-center gap-3 text-xs">
                          <span className="font-mono text-[10px] text-(--text-tertiary) w-6 shrink-0 text-right">#{s.sectionOrder}</span>
                          <p className="font-bold text-(--text-primary) truncate flex-1">{s.sectionTitle || t('admin.untitledSection')}</p>
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-(--surface-secondary) text-(--text-secondary) border border-(--border) shrink-0">{t('admin.revN', { n: s.revision ?? 0 })}</span>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            </div>

            <div className="bg-(--surface-secondary) px-6 py-3.5 border-t border-gray-150 flex items-center justify-end shrink-0">
              <button onClick={() => setDetailProject(null)} className="px-4 py-2 bg-[#0c162e] hover:bg-[#152447] text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer">{t('admin.close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Membership Management Modal — flat, no nested modals */}
      {showMembersModal && activeProject && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-(--surface) rounded-2xl shadow-2xl w-full max-w-lg border border-gray-150 overflow-hidden transform scale-100 transition-all duration-300">
            <div className="bg-(--surface-secondary) border-b border-gray-150 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-(--text-primary) text-sm">{t('admin.manageWorkspaceMembers')}</h3>
                <p className="text-(--text-tertiary) text-[10px] mt-0.5 truncate max-w-xs">{activeProject.title}</p>
              </div>
              <button onClick={() => setShowMembersModal(false)} className="text-(--text-tertiary) hover:text-(--text-secondary) transition cursor-pointer">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              <form
                onSubmit={(e) => { e.preventDefault(); if (!selectedUser) { setMemberErr(t('admin.selectUserFirst')); return; } setMemberErr(''); addMemberMutation.mutate({ projectId: activeProject.id, userId: selectedUser, role: selectedRole }); }}
                className="bg-(--surface-secondary)/50 border border-(--border) rounded-xl p-4.5 space-y-3"
              >
                <span className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider block">{t('admin.addWorkspaceMember')}</span>
                <div className="flex flex-col sm:flex-row gap-3">
                  <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} className="flex-1 px-3 py-2 bg-(--surface) border border-gray-255 rounded-xl font-semibold text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs cursor-pointer">
                    <option value="">{t('admin.chooseUserAccounts')}</option>
                    {allUsers
                      .filter(u => u.role === 'STUDENT' && !members.some(m => m.userId === u.id))
                      .map(u => (
                        <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email} - {u.role})</option>
                      ))}
                  </select>
                  <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} className="w-full sm:w-36 px-3 py-2 bg-(--surface) border border-gray-255 rounded-xl font-semibold text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs cursor-pointer">
                    <option value="MEMBER">{t('admin.member')}</option>
                    <option value="LEADER">{t('admin.leader')}</option>
                  </select>
                  <button type="submit" disabled={addMemberMutation.isPending} className="px-4 py-2 bg-[#0c162e] hover:bg-[#152447] text-white rounded-xl text-xs font-bold transition shadow-sm shrink-0 cursor-pointer disabled:opacity-50">
                    {t('admin.add')}
                  </button>
                </div>
              </form>

              {memberErr && <div className="text-xs text-rose-700 bg-rose-50 p-2.5 rounded-lg border border-rose-100 font-semibold">{memberErr}</div>}

              <div className="space-y-2">
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{t('admin.currentMembers', { n: members.length })}</span>
                {membersQuery.isLoading ? (
                  <div className="animate-pulse space-y-2 py-4">
                    <div className="h-8 bg-gray-200 rounded w-full" />
                    <div className="h-8 bg-gray-200 rounded w-full" />
                  </div>
                ) : members.length === 0 ? (
                  <div className="text-xs text-(--text-tertiary) py-6 text-center italic border border-dashed border-gray-255 rounded-xl bg-(--surface-secondary)/20">{t('admin.noMembersWorkspace')}</div>
                ) : (
                  <div className="divide-y divide-gray-150 border border-(--border) rounded-xl max-h-56 overflow-y-auto bg-(--surface)">
                    {members.map(m => (
                      <div key={m.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-(--surface-secondary)/50 transition text-xs">
                        <div className="min-w-0">
                          <p className="font-bold text-(--text-primary) truncate">{m.firstName} {m.lastName}</p>
                          <p className="text-[10px] text-(--text-tertiary) font-mono mt-0.5 truncate">{m.email}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {m.role === 'INSTRUCTOR' ? (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold border bg-amber-50 text-amber-700 border-amber-100">{m.role}</span>
                          ) : (
                            <select
                              value={m.role}
                              onChange={e => { setUpdatingMemberId(m.userId); updateRoleMutation.mutate({ projectId: activeProject.id, userId: m.userId, role: e.target.value }); }}
                              disabled={updatingMemberId !== null || updateRoleMutation.isPending}
                              className="cursor-pointer rounded-lg border border-(--border) bg-(--surface) px-2 py-1 text-[10px] font-bold text-(--text-secondary) outline-none transition focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <option value="MEMBER">{t('admin.member')}</option>
                              <option value="LEADER">{t('admin.leader')}</option>
                            </select>
                          )}
                          {m.role !== 'INSTRUCTOR' && (
                            <button
                              onClick={() => removeMemberMutation.mutate({ projectId: activeProject.id, userId: m.userId })}
                              disabled={removeMemberMutation.isPending}
                              title={t('admin.delete')}
                              className="p-1 text-(--text-tertiary) hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer disabled:opacity-50"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-(--surface-secondary) px-6 py-3.5 border-t border-gray-150 flex items-center justify-end">
              <button onClick={() => setShowMembersModal(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer">{t('admin.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { ProjectsSection };
