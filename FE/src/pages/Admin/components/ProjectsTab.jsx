import { useState, useEffect, useCallback } from 'react';
import { driver } from 'driver.js';
import Modal from '../../../components/Modal.jsx';
import { ErrorBlock } from './shared.jsx';
import DeleteConfirm from '../../../components/DeleteConfirm.jsx';
import useUndoDelete, { UndoToast } from '../../../components/UndoDelete.jsx';
function ProjectsSection({ lang, api }) {
  const [projects, setProjects] = useState({ content: [], page: 0, totalElements: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const { pending: pendingDelete, start: startDelete, undo: undoDelete, dismiss: dismissDelete } = useUndoDelete({ onUndo: () => fetch(page) });

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals and Forms
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [activeProject, setActiveProject] = useState(null);
  const [projectErr, setProjectErr] = useState('');
  const [toast, setToast] = useState(null);

  // Detail modal state
  const [detailProject, setDetailProject] = useState(null);
  const [detailMembers, setDetailMembers] = useState([]);
  const [detailDocs, setDetailDocs] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Membership state
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState('MEMBER');
  const [updatingMemberId, setUpdatingMemberId] = useState(null);
  const [memberErr, setMemberErr] = useState('');

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetch = useCallback(async (p, signal) => {
    setLoading(true); setError(null);
    try {
      const params = { page: p, size: 20 };
      if (q.trim()) params.q = q.trim();
      if (statusFilter) params.status = statusFilter;
      const r = await api.get('/api/admin/projects', { params, signal });
      setProjects(r.data);
    } catch (e) {
      if (signal && signal.aborted) return;
      setError(e.message || lang.loadFailed);
    } finally {
      if (!signal || !signal.aborted) setLoading(false);
    }
  }, [api, q, statusFilter, lang.loadFailed]);

  useEffect(() => {
    const ac = new AbortController();
    fetch(page, ac.signal);
    return () => ac.abort();
  }, [fetch, page]);

  useEffect(() => {
    setPage(0);
  }, [q, statusFilter]);

  const doUnarchive = async (p) => {
    try {
      await api.patch(`/api/projects/${p.id}/unarchive`);
      showToast(lang.unarchiveSuccess, "success");
      fetch(page);
    } catch (e) {
      showToast(e.response?.data?.message || lang.unarchiveFailed, "error");
    }
  };

  const doDelete = async (id) => {
    try {
      await api.delete(`/api/projects/${id}`);
      showToast(lang.projectDeletedSuccess, "success");
      await fetch(page);
    }
    catch (e) { setError(e.message); }
  };

  const handleDelete = (p) => {
    setProjects(prev => ({ ...prev, content: prev.content.filter(x => x.id !== p.id) }));
    startDelete({
      entityName: p.title,
      entityDetails: p.id,
      header: lang.undoHeader,
      bodyTemplate: lang.undoBodyTemplate,
      caution: lang.undoCaution,
      undoLabel: lang.undoLabel,
      undoRemaining: lang.undoRemaining,
      dismissLabel: lang.dismissLabel,
    }, () => doDelete(p.id));
  };

  const openDetail = async (p) => {
    setDetailProject(p);
    setDetailMembers([]);
    setDetailDocs([]);
    setDetailLoading(true);
    try {
      const [m, d] = await Promise.all([
        api.get(`/api/projects/${p.id}/members`),
        api.get(`/api/projects/${p.id}/documents`, { params: { page: 0, size: 100 } }),
      ]);
      setDetailMembers(m.data || []);
      setDetailDocs(d.data?.content || []);
    } catch { /* silent */ } finally {
      setDetailLoading(false);
    }
  };

  // Membership Handlers
  const handleOpenMembers = async (p) => {
    setActiveProject(p);
    setMembers([]);
    setSelectedUser('');
    setMemberErr('');
    setShowMembersModal(true);
    setMembersLoading(true);

    try {
      // 1. Fetch current members
      const resMembers = await api.get(`/api/projects/${p.id}/members`);
      setMembers(resMembers.data || []);

      // 2. Fetch all system users to select from
      const resUsers = await api.get('/api/admin/users?size=100');
      setAllUsers(resUsers.data?.content || []);
    } catch (err) {
      setMemberErr(lang.memberLoadFailed);
    } finally {
      setMembersLoading(false);
    }
  };

  const doAddMember = async (e) => {
    e.preventDefault();
    if (!selectedUser) {
      setMemberErr(lang.selectUserFirst);
      return;
    }
    setMemberErr('');
    try {
      await api.post(`/api/projects/${activeProject.id}/members?userId=${selectedUser}&role=${selectedRole}`);
      showToast(lang.memberAdded, "success");
      setSelectedUser('');
      
      // Refresh member list
      const resMembers = await api.get(`/api/projects/${activeProject.id}/members`);
      setMembers(resMembers.data || []);
    } catch (err) {
      setMemberErr(err.response?.data?.message || lang.memberAddFailed);
    }
  };

  const doRemoveMember = async (userId) => {
    setMemberErr('');
    try {
      await api.delete(`/api/projects/${activeProject.id}/members/${userId}`);
      showToast(lang.memberRemoved, "success");
      
      // Refresh member list
      const resMembers = await api.get(`/api/projects/${activeProject.id}/members`);
      setMembers(resMembers.data || []);
    } catch (err) {
      setMemberErr(err.response?.data?.message || lang.memberRemoveFailed);
    }
  };

  const doUpdateMemberRole = async (userId, role) => {
    setMemberErr('');
    setUpdatingMemberId(userId);
    try {
      await api.patch(`/api/projects/${activeProject.id}/members/${userId}`, null, { params: { role } });
      const resMembers = await api.get(`/api/projects/${activeProject.id}/members`);
      setMembers(resMembers.data || []);
      showToast(lang.memberRoleUpdated, "success");
    } catch (err) {
      setMemberErr(err.response?.data?.message || err.response?.data?.detail || lang.memberRoleUpdateFailed);
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const startProcessGuide = () => {
    setTimeout(() => {
      driver({
        animate: true, showProgress: true,
        steps: [
          { popover: { title: lang.processGuide, description: lang.guideProjectsDesc, side: 'center' } },
          { element: '[data-guide="projects-table"]', popover: { title: lang.projects, description: lang.guideProjectsTable, side: 'left' } },
          { popover: { title: lang.done, description: lang.guideProjectsDone, side: 'center' } },
        ],
      }).drive();
    }, 300);
  };

  const getStatusBadge = (status) => {
    const styles = {
      CREATED: 'bg-slate-100 text-slate-700',
      ASSIGNED: 'bg-blue-100 text-blue-700',
      IN_PROGRESS: 'bg-cyan-100 text-cyan-700',
      SUBMITTED_FOR_REVIEW: 'bg-amber-100 text-amber-700',
      RETURNED: 'bg-orange-100 text-orange-700',
      APPROVED: 'bg-emerald-100 text-emerald-700',
      ARCHIVED: 'bg-gray-100 text-gray-600'
    };
    const labels = {
      CREATED: 'Created',
      ASSIGNED: 'Assigned',
      IN_PROGRESS: 'In Progress',
      SUBMITTED_FOR_REVIEW: 'Under Review',
      RETURNED: 'Returned',
      APPROVED: 'Approved',
      ARCHIVED: 'Archived'
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${styles[status] || 'bg-slate-100 text-slate-700'}`}>
        {labels[status] || status || '—'}
      </span>
    );
  };

  const collaboratorsTotal = projects.content.reduce((a, p) => a + (p.collaboratorCount ?? 0), 0);
  const papersTotal = projects.content.reduce((a, p) => a + (p.papersProcessed ?? 0), 0);
  const completionAvg = projects.content.length
    ? Math.round(projects.content.reduce((a, p) => a + (p.completionRate ?? 0), 0) / projects.content.length)
    : 0;

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';

  return (
    <div className="p-8 space-y-6 bg-[#f8fafc]">
      {/* Title Area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1e3a8a] tracking-tight">{lang.projects}</h1>
          <p className="text-gray-550 text-xs mt-1">{lang.projectsSub}</p>
        </div>
      </div>

      {/* Mini KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Active */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col justify-between h-28">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">TOTAL PROJECTS</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-extrabold text-slate-800">{projects.totalElements ?? '—'}</span>
          </div>
        </div>

        {/* Collaborators */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col justify-between h-28">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">COLLABORATORS</span>
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <span className="text-3xl font-extrabold text-slate-800 mt-1">{collaboratorsTotal}</span>
        </div>

        {/* Papers Processed */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col justify-between h-28">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">PAPERS PROCESSED</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-extrabold text-slate-800">{papersTotal}</span>
          </div>
        </div>

        {/* Completion Rate */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col justify-between h-28">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">COMPLETION RATE</span>
          <span className="text-3xl font-extrabold text-slate-800 mt-1">{completionAvg}%</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 w-full gap-3 items-center">
          {/* Search Input */}
          <div className="flex-1 relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Search projects..." 
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold" 
            />
          </div>

          {/* Status Dropdown */}
          <select 
            value={statusFilter} 
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="w-36 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="CREATED">Created</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SUBMITTED_FOR_REVIEW">Under Review</option>
            <option value="RETURNED">Returned</option>
            <option value="APPROVED">Approved</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>

        <span className="text-xs text-gray-400 font-bold self-end sm:self-center shrink-0">
          Showing {projects.content.length} of {projects.totalElements || projects.content.length} Projects
        </span>
      </div>

      {error && <ErrorBlock msg={error} onRetry={() => fetch(page, new AbortController().signal)} />}

      {/* Table Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table data-guide="projects-table" className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-gray-100">
                <th className="px-6 py-3.5 font-bold tracking-wider">Project Title</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">Instructor</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">Collaborators</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">Papers</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">Completion</th>
                <th className="px-6 py-3.5 font-bold tracking-wider">Status</th>
                <th className="px-6 py-3.5 font-bold tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-slate-700 font-semibold">
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">{Array.from({ length: 7 }).map((_, j) => (
                  <td key={j} className="px-6 py-5"><div className="h-4 bg-gray-200 rounded w-full" /></td>
                ))}</tr>
              )) : projects.content.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400 font-medium">No projects found</td></tr>
              ) : projects.content.map(p => {
                const projCode = p.projCode || '—';

                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition">
                    {/* Project Title */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 max-w-xs truncate">{p.title}</span>
                        <span className="text-[10px] text-gray-400 font-bold mt-0.5">{projCode}</span>
                      </div>
                    </td>

                    {/* Principal Investigator with Avatar */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold shrink-0 bg-slate-500">
                          {(p.instructorName || '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="text-slate-700 font-semibold">{p.instructorName || '—'}</span>
                      </div>
                    </td>

                    {/* Collaborators */}
                    <td className="px-6 py-4 text-slate-600 font-bold">
                      {p.collaboratorCount ?? '—'}
                    </td>

                    {/* Papers */}
                    <td className="px-6 py-4 text-slate-600 font-bold">
                      {p.papersProcessed ?? '—'}
                    </td>

                    {/* Completion */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, p.completionRate ?? 0)}%` }} />
                        </div>
                        <span className="text-slate-600 font-bold">{p.completionRate ?? 0}%</span>
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="px-6 py-4">
                      {getStatusBadge(p.status)}
                    </td>

                    {/* Actions icons */}
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* View Details Icon */}
                        <button onClick={() => openDetail(p)} title="View Project Details" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer">
                          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>

                        {/* Manage Members Icon */}
                        <button onClick={() => handleOpenMembers(p)} title="Manage Members" className="p-1.5 rounded-lg hover:bg-slate-100 text-blue-600 hover:text-blue-800 transition cursor-pointer">
                          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                        </button>

                        {/* Unarchive Icon (Restore to Active) */}
                        {p.status === 'ARCHIVED' && (
                          <button onClick={() => doUnarchive(p)} title="Unarchive Project (Restore to Active)" className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 hover:text-emerald-800 transition cursor-pointer">
                            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                        )}

                        {/* Delete Icon */}
                        <DeleteConfirm
                          message={lang.confirmDeleteProject}
                          onConfirm={() => handleDelete(p)}
                          triggerLabel={lang.delete}
                          confirmLabel={lang.delete}
                          cancelLabel={lang.cancel}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-rose-600 hover:text-rose-800 transition cursor-pointer"
                        >
                          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                        </DeleteConfirm>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-100 bg-gray-50/50 text-xs font-semibold text-gray-500">
          {projects.totalPages > 1 ? (
            <>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(page - 1)} disabled={page === 0}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {Array.from({ length: projects.totalPages }).map((_, i) => {
                  if (i === 0 || i === projects.totalPages - 1 || (i >= page - 1 && i <= page + 1)) {
                    const isActive = page === i;
                    return (
                      <button key={i} onClick={() => setPage(i)}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition ${isActive ? 'bg-[#1e3a8a] text-white shadow-sm' : 'border border-gray-200 text-gray-600 hover:bg-slate-50'}`}>
                        {i + 1}
                      </button>
                    );
                  } else if (i === 1 || i === projects.totalPages - 2) {
                    return <span key={i} className="text-gray-400 text-xs px-0.5">...</span>;
                  }
                  return null;
                })}
                <button onClick={() => setPage(page + 1)} disabled={page >= projects.totalPages - 1}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <span>Page {page + 1} of {projects.totalPages}</span>
            </>
          ) : (
            <>
              <div className="w-1" />
              <span>Page 1 of 1</span>
            </>
          )}
        </div>
      </div>

      {/* Project Detail Modal Overlay */}
      {detailProject && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-150 overflow-hidden transform scale-100 transition-all duration-300 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="bg-slate-50 border-b border-gray-150 px-6 py-4 flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h3 className="font-bold text-slate-800 text-sm truncate">{detailProject.title}</h3>
                  {getStatusBadge(detailProject.status)}
                </div>
                <p className="text-gray-400 text-[10px] mt-0.5 font-mono truncate">{detailProject.id}</p>
              </div>
              <button
                onClick={() => setDetailProject(null)}
                className="text-slate-400 hover:text-slate-600 transition cursor-pointer shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto">
              {/* General Information */}
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-3">General Information</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Instructor</span>
                    <span className="font-bold text-slate-800">{detailProject.instructorName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target Standard</span>
                    <span className="font-bold text-slate-800">{detailProject.targetStandard || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Created</span>
                    <span className="font-bold text-slate-800">{fmtDate(detailProject.createdAt)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Collaborators</span>
                    <span className="font-bold text-slate-800">{detailProject.collaboratorCount ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Papers Processed</span>
                    <span className="font-bold text-slate-800">{detailProject.papersProcessed ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Completion Rate</span>
                    <span className="font-bold text-slate-800">{detailProject.completionRate ?? 0}%</span>
                  </div>
                </div>
                <div className="mt-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Description</span>
                  <p className="bg-slate-50 border border-gray-200 rounded-xl px-3 py-2 font-semibold text-slate-700">
                    {detailProject.description || 'No description provided.'}
                  </p>
                </div>
              </div>

              {/* Project Structure */}
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-3">Project Structure</span>
                {detailLoading ? (
                  <div className="animate-pulse space-y-2 py-4">
                    <div className="h-8 bg-gray-200 rounded w-full" />
                    <div className="h-8 bg-gray-200 rounded w-full" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Members */}
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Members ({detailMembers.length})</span>
                      {detailMembers.length === 0 ? (
                        <p className="text-xs text-gray-400 italic border border-dashed border-gray-200 rounded-xl px-3 py-2 bg-slate-50/20">No members assigned.</p>
                      ) : (
                        <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white">
                          {detailMembers.map(m => (
                            <div key={m.id} className="px-4 py-2 flex items-center justify-between text-xs">
                              <div className="min-w-0">
                                <p className="font-bold text-slate-800 truncate">{(m.firstName || '') + ' ' + (m.lastName || '')}</p>
                                <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{m.email}</p>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold border shrink-0 ml-3 ${
                                m.role === 'INSTRUCTOR'
                                  ? 'bg-amber-50 text-amber-700 border-amber-100'
                                  : m.role === 'LEADER'
                                  ? 'bg-blue-50 text-blue-700 border-blue-100'
                                  : 'bg-slate-50 text-slate-600 border-slate-100'
                              }`}>
                                {m.role}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Documents */}
                    <div>
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Documents ({detailDocs.length})</span>
                      {detailDocs.length === 0 ? (
                        <p className="text-xs text-gray-400 italic border border-dashed border-gray-200 rounded-xl px-3 py-2 bg-slate-50/20">No documents in this project.</p>
                      ) : (
                        <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white max-h-56 overflow-y-auto">
                          {detailDocs.map(d => (
                            <div key={d.id} className="px-4 py-2 flex items-center justify-between gap-3 text-xs">
                              <div className="min-w-0">
                                <p className="font-bold text-slate-800 truncate">{d.title || d.originalFilename || 'Untitled'}</p>
                                <p className="text-[10px] text-gray-400 font-medium mt-0.5 truncate">{d.docType || ''}{d.doi ? ` · ${d.doi}` : ''}</p>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold border shrink-0 ${
                                ['COMPLETED', 'READY'].includes(d.processingStatus)
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                  : ['FAILED', 'PARTIAL'].includes(d.processingStatus)
                                  ? 'bg-rose-50 text-rose-700 border-rose-100'
                                  : ['PROCESSING', 'QUEUED'].includes(d.processingStatus)
                                  ? 'bg-amber-50 text-amber-700 border-amber-100'
                                  : 'bg-slate-50 text-slate-600 border-slate-100'
                              }`}>
                                {d.processingStatus || '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-3.5 border-t border-gray-150 flex items-center justify-end">
              <button
                onClick={() => setDetailProject(null)}
                className="px-4 py-2 bg-[#0c162e] hover:bg-[#152447] text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workspace Membership Management Modal Overlay */}
      {showMembersModal && activeProject && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-150 overflow-hidden transform scale-100 transition-all duration-300">
            {/* Modal Header */}
            <div className="bg-slate-50 border-b border-gray-150 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Manage Workspace Members</h3>
                <p className="text-gray-400 text-[10px] mt-0.5 truncate max-w-xs">{activeProject.title}</p>
              </div>
              <button 
                onClick={() => setShowMembersModal(false)}
                className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Form to add a new member */}
              <form onSubmit={doAddMember} className="bg-slate-50/50 border border-slate-200 rounded-xl p-4.5 space-y-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Add Workspace Member</span>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Select User */}
                  <div className="flex-1">
                    <select 
                      value={selectedUser} 
                      onChange={e => setSelectedUser(e.target.value)} 
                      className="w-full px-3 py-2 bg-white border border-gray-255 rounded-xl font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs cursor-pointer"
                    >
                      <option value="">{lang.chooseUserAccounts}</option>
                      {allUsers
                        .filter(u => u.role === 'STUDENT' && !members.some(m => m.userId === u.id))
                        .map(u => (
                          <option key={u.id} value={u.id}>
                            {u.firstName} {u.lastName} ({u.email} - {u.role})
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Select Project Role */}
                  <div className="w-full sm:w-36">
                    <select 
                      value={selectedRole} 
                      onChange={e => setSelectedRole(e.target.value)} 
                      className="w-full px-3 py-2 bg-white border border-gray-255 rounded-xl font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs cursor-pointer"
                    >
                      <option value="MEMBER">Member</option>
                      <option value="LEADER">Leader</option>
                    </select>
                  </div>

                  <button 
                    type="submit" 
                    className="px-4 py-2 bg-[#0c162e] hover:bg-[#152447] text-white rounded-xl text-xs font-bold transition shadow-sm shrink-0 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </form>

              {memberErr && <div className="text-xs text-rose-700 bg-rose-50 p-2.5 rounded-lg border border-rose-100 font-semibold">{memberErr}</div>}

              {/* Members List */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Current Members ({members.length})</span>
                
                {membersLoading ? (
                  <div className="animate-pulse space-y-2 py-4">
                    <div className="h-8 bg-gray-200 rounded w-full"></div>
                    <div className="h-8 bg-gray-200 rounded w-full"></div>
                  </div>
                ) : members.length === 0 ? (
                  <div className="text-xs text-gray-400 py-6 text-center italic border border-dashed border-gray-255 rounded-xl bg-slate-50/20">
                    No members assigned to this project workspace.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-150 border border-gray-200 rounded-xl max-h-56 overflow-y-auto bg-white">
                    {members.map(m => (
                      <div key={m.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition text-xs">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate">{m.firstName} {m.lastName}</p>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{m.email}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {m.role === 'INSTRUCTOR' ? (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold border bg-amber-50 text-amber-700 border-amber-100">
                              {m.role}
                            </span>
                          ) : (
                            <select
                              value={m.role}
                              onChange={e => doUpdateMemberRole(m.userId, e.target.value)}
                              disabled={updatingMemberId !== null}
                              aria-label={`${lang.role}: ${m.firstName} ${m.lastName}`}
                              className="cursor-pointer rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 outline-none transition focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <option value="MEMBER">Member</option>
                              <option value="LEADER">Leader</option>
                            </select>
                          )}
                          {m.role !== 'INSTRUCTOR' && (
                            <DeleteConfirm
                              message={lang.confirmRemoveMember}
                              onConfirm={() => doRemoveMember(m.userId)}
                              triggerLabel={lang.delete}
                              confirmLabel={lang.delete}
                              cancelLabel={lang.cancel}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition cursor-pointer"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </DeleteConfirm>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-3.5 border-t border-gray-150 flex items-center justify-end">
              <button 
                onClick={() => setShowMembersModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Toast Notification Popup */}
      {toast && (
        <div className="fixed top-4 right-4 z-55 flex items-center gap-2.5 px-4.5 py-3 rounded-2xl shadow-xl border animate-slide-in-right bg-white border-slate-100">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
            toast.type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
          }`}>
            {toast.type === 'error' ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className="text-xs font-bold text-slate-800">{toast.message}</span>
        </div>
      )}

      {pendingDelete && <UndoToast pending={pendingDelete} onUndo={undoDelete} onDismiss={dismissDelete} />}
    </div>
  );
}



export { ProjectsSection };
