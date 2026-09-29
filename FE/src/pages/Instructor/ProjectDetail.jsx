import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AppHeader, LoadingSkeleton, StatusBadge, Modal, TourLauncher, Spinner, Breadcrumb, UniversalDocumentIngestionModal } from '../../components';
import FileViewerModal from '../../components/features/FileViewerModal';
import { Marker, MarkerIcon, MarkerContent } from '../../components/ui/Marker';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import {
  getSourceShareChanges,
  getBlockedSources,
  isSourceShareable,
  isSourceSharedWithProject,
} from '../../utils/instructor/sourceShareSelection';
import { getStudentSuggestions, paginateStudents, studentDisplayName } from '../../utils/instructor/studentSearch';
import useUndoDelete from '../../components/ui/UndoDelete.jsx';
import DeleteConfirm from '../../components/ui/DeleteConfirm.jsx';
import ActionExpandHeader from '../../components/Instructor/ActionExpandHeader.jsx';
import ContributionGraph from '../../components/Instructor/ContributionGraph.jsx';
import EditPaperSectionModal from '../../components/Instructor/EditPaperSectionModal.jsx';
import StandardRequirementsModal from '../../components/Instructor/sections/StandardRequirementsModal.jsx';
import ProjectEditModal from '../../components/Instructor/ProjectEditModal.jsx';
import ProjectDeletionNotice from '../../components/projects/ProjectDeletionNotice.jsx';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { hasProjectAction } from '../../utils/projectActions.js';
import { formatDate, formatDateTime } from '../../utils/formatters/date.js';
import { taskKey, readTask, writeTask } from '../../utils/taskState.js';
import { getWithRetry } from '../../utils/aiJobPolling.js';
import { readUpload, writeUpload, prepareUpload, listUploadDocuments, reconcileFiles } from '../../utils/uploadRecovery.js';

import {
  CITATION_STANDARDS,
  MODAL_PAGE_SIZE,
  ENTITY_TYPES,
  DEFAULT_PROJECT_INGESTION_TABS,
  DOCUMENT_PROCESSING_STATUSES,
  API_ROUTES,
} from '../../constants';

const USER_ROLES = Object.freeze(['STUDENT', 'INSTRUCTOR', 'ADMIN']);
const PROJECT_ROLES = Object.freeze(['MEMBER', 'LEADER', 'INSTRUCTOR']);
const DOCUMENT_TYPES = Object.freeze(['PAPER', 'SOURCE']);

const STANDARDS = CITATION_STANDARDS;
const reportDate = (daysAgo) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const setupKey = taskKey(api, user?.id, 'paper-setup', id);
  const paperUploadKey = setupKey ? `${setupKey}:file` : null;
  const setupKeyRef = useRef(setupKey);
  setupKeyRef.current = setupKey;
  const { subscribeToEntityChanges } = useNotification();
  const { pending: pendingDelete, start: startDelete } = useUndoDelete();
  // rationale: common action labels for SectionManager/SectionRow/StandardConfigModal (were an undefined `ct` → crash).
  const ct = { delete: t('delete'), add: t('add'), cancel: t('cancel'), saving: t('saving'), save: t('save') };
  // rationale: section components take a scoped label object, not the i18next
  // function (passing `t` raw renders every label as undefined/empty).
  const sectionT = {
    selectPaperSections: t('instructor.projectDetail.selectPaperSections'),
    processingSections: t('instructor.projectDetail.processingSections'),
    noSectionsHelp: t('instructor.projectDetail.noSectionsHelp'),
    sectionConflict: t('instructor.projectDetail.sectionConflict'),
    sectionsUnsaved: t('instructor.projectDetail.sectionsUnsaved'),
    rename: t('instructor.projectDetail.rename'),
    editContent: t('instructor.projectDetail.editContent'),
    unassigned: t('instructor.projectDetail.unassigned'),
    dragToReorder: t('instructor.projectDetail.dragToReorder'),
    unassignToReorder: t('instructor.projectDetail.unassignToReorder'),
    deleteSectionConfirm: t('instructor.projectDetail.deleteSectionConfirm'),
    reloadSection: t('instructor.projectDetail.reloadSection'),
    configStandard: t('instructor.projectDetail.configStandard'),
    standardLocked: t('instructor.projectDetail.standardLocked'),
    standardRequirements: t('instructor.projectDetail.standardRequirements'),
    noStandardRequirements: t('instructor.projectDetail.noStandardRequirements'),
    addStandardRequirement: t('instructor.projectDetail.addStandardRequirement'),
  };
  const paperEditorT = {
    editPaperSections: t('instructor.projectDetail.editPaperSections'),
    pages: t('pages'),
    paperName: t('instructor.projectDetail.paperName'),
    renamePaper: t('instructor.projectDetail.renamePaper'),
    savePaperName: t('save'),
    cancelPaperRename: t('cancel'),
    paperEditor: t('instructor.projectDetail.paperEditor'),
    sectionTitle: t('instructor.projectDetail.sectionTitle'),
    sectionContent: t('instructor.projectDetail.sectionContent'),
    assignedStudent: t('instructor.projectDetail.assignedStudent'),
    unassigned: t('instructor.projectDetail.unassigned'),
    selectSection: t('instructor.projectDetail.selectSection'),
    standardConfigured: t('instructor.projectDetail.standardConfigured'),
    standardNotConfigured: t('instructor.projectDetail.standardNotConfigured'),
    viewStandard: t('instructor.projectDetail.viewStandard'),
    standardRequirements: t('instructor.projectDetail.standardRequirements'),
    noStandardRequirements: t('instructor.projectDetail.noStandardRequirements'),
    changesSaved: t('instructor.projectDetail.changesSaved'),
    saveChangesFailed: t('instructor.projectDetail.reorderSectionsFailed'),
    assignmentsApplied: t('instructor.projectDetail.assignmentsApplied'),
    assignmentsApplyFailed: t('instructor.projectDetail.assignmentsApplyFailed'),
    configStandard: t('instructor.projectDetail.configStandard'),
    standards: t('instructor.projectDetail.standards'),
    referenceSharedEditors: t('instructor.projectDetail.referenceSharedEditors'),
    bulkAssign: t('instructor.projectDetail.bulkAssign'),
    bulkAssignHint: t('instructor.projectDetail.bulkAssignHint'),
    bulkAssignmentStudent: t('instructor.projectDetail.bulkAssignmentStudent'),
    bulkAssignAll: t('instructor.projectDetail.bulkAssignAll'),
    selectStudent: t('instructor.projectDetail.selectStudent'),
    applyAssignment: t('instructor.projectDetail.applyAssignment'),
    unassignAll: t('instructor.projectDetail.unassignAll'),
    unassignAllConfirm: t('instructor.projectDetail.unassignAllConfirm'),
    selectedSections: count => t('instructor.projectDetail.selectedSections', { count }),
    deleteSelectedSections: t('instructor.projectDetail.deleteSelectedSections'),
    deleteSelectedSectionsConfirm: t('instructor.projectDetail.deleteSelectedSectionsConfirm'),
    addSection: t('instructor.projectDetail.addSection'),
    rename: t('instructor.projectDetail.rename'),
    deleteSection: t('instructor.projectDetail.deleteSectionAction'),
    deleteSectionConfirm: t('instructor.projectDetail.deleteSectionConfirm'),
    reloadSection: t('instructor.projectDetail.reloadSectionAction'),
    sectionsUnsaved: t('instructor.projectDetail.sectionsUnsaved'),
    noUnsavedChanges: t('instructor.projectDetail.noUnsavedChanges'),
    discardChanges: t('instructor.projectDetail.discardChangesAction'),
    saveChanges: t('instructor.projectDetail.saveSectionChanges'),
    discardUnsavedChanges: t('instructor.projectDetail.discardUnsavedChanges'),
    discardUnsavedChangesHint: t('instructor.projectDetail.discardUnsavedChangesHint'),
    keepEditing: t('instructor.projectDetail.keepEditing'),
    noSectionsHelp: t('instructor.projectDetail.noSectionsHelp'),
    editMode: t('instructor.projectDetail.editMode'),
    previewMode: t('instructor.projectDetail.previewMode'),
    closePages: t('instructor.projectDetail.closePages'),
    closeEditor: t('instructor.projectDetail.closeEditor'),
  };
  const [activeTab, setActiveTab] = useState('setup');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState(null);
  const [showEditProject, setShowEditProject] = useState(false);
  const [showEditPaper, setShowEditPaper] = useState(false);
  const [savingProjectEdit, setSavingProjectEdit] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [members, setMembers] = useState([]);
  const [papers, setPapers] = useState([]);
  const [sections, setSections] = useState([]);
  // Draft buffer — decouples UI from server (Mandate 1). All edits mutate draftSections; API fires only on Save Changes.
  const [draftSections, setDraftSections] = useState([]);
  const [conflictSectionId, setConflictSectionId] = useState(null);
  const draftDirty = useMemo(() => JSON.stringify(sections) !== JSON.stringify(draftSections), [sections, draftSections]);
  const displaySections = draftDirty ? draftSections : sections;
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [feedbackRequests, setFeedbackRequests] = useState([]);
  const [progressReport, setProgressReport] = useState(null);
  const [progressReportError, setProgressReportError] = useState(false);
  const progressReportRequestRef = useRef(0);
  const [reportSectionId, setReportSectionId] = useState(null);
  const [reportMemberId, setReportMemberId] = useState('ALL');
  const [reportFrom, setReportFrom] = useState(() => reportDate(29));
  const [reportTo, setReportTo] = useState(() => reportDate(0));
  const [progressQuery, setProgressQuery] = useState('');
  const [progressSort, setProgressSort] = useState({ key: 'name', dir: 1 });
  const [users, setUsers] = useState([]);
  const [advancedPage, setAdvancedPage] = useState(0);
  const [updatingMemberId, setUpdatingMemberId] = useState(null);

  // Setup tab state
  const [doiInput, setDoiInput] = useState('');
  const [doiErrors, setDoiErrors] = useState([]);
  const [standard, setStandard] = useState('');
  const [sources, setSources] = useState([]);
  const [showSourceDetail, setShowSourceDetail] = useState(false);
  const [sourceDetail, setSourceDetail] = useState(null);
  const [showAddSource, setShowAddSource] = useState(false);
  const [pendingSourceFile, setPendingSourceFile] = useState(null);
  const [pendingSourceFiles, setPendingSourceFiles] = useState([]);
  const [showShareCollection, setShowShareCollection] = useState(false);
  const [collections, setCollections] = useState([]);
  const [collectionPage, setCollectionPage] = useState(0);
  const [collectionTotalPages, setCollectionTotalPages] = useState(0);
  const [linkedCollections, setLinkedCollections] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [collectionSourcePages, setCollectionSourcePages] = useState({});
  const [collectionSourcePage, setCollectionSourcePage] = useState(0);
  const [collectionSourceTotalPages, setCollectionSourceTotalPages] = useState(0);
  const [selectedSourceIds, setSelectedSourceIds] = useState([]);
  const [selectedProjectSourceIds, setSelectedProjectSourceIds] = useState([]);
  const [collectionSourcesLoading, setCollectionSourcesLoading] = useState(false);
  const sourceSelectionTouched = useRef(new Set());
  const [showSetUpPaper, setShowSetUpPaper] = useState(false);
  const [setupMode, setSetupMode] = useState('standard');
  const [editingPaperId, setEditingPaperId] = useState(null);
  const [editingPaperTitle, setEditingPaperTitle] = useState('');
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');
  const [sectionStructureSaving, setSectionStructureSaving] = useState(false);
  const [uploadState, setUploadState] = useState(null);
  const [pendingPaperUpload, setPendingPaperUpload] = useState(null);
  const [paperUploadError, setPaperUploadError] = useState('');
  const [setupHydratedKey, setSetupHydratedKey] = useState(null);
  const [standardSuggestion, setStandardSuggestion] = useState(null);
  const [standardSuggestionLoading, setStandardSuggestionLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [addSourceLoading, setAddSourceLoading] = useState(false);
  const [shareLoadingId, setShareLoadingId] = useState(null);
  const [statusPending, setStatusPending] = useState(null);
  // Phase 2: Assign Students local state
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [sourceSearch, setSourceSearch] = useState('');
  const [showAdvancedAdd, setShowAdvancedAdd] = useState(false);
  const [advancedSelectedIds, setAdvancedSelectedIds] = useState([]);
  const [advancedRoleMap, setAdvancedRoleMap] = useState({});
  const [advancedSearch, setAdvancedSearch] = useState('');
  // Phase 4: document preview (reuse FileViewerModal from Student Workspace / SourceLibraryPanel)
  const [viewerFile, setViewerFile] = useState(null);
  // Section standards are configured here and checked by the assigned student.
  const [sectionEvals, setSectionEvals] = useState({});
  const [standardViewSectionId, setStandardViewSectionId] = useState(null);
  const sectionLoadRequestRef = useRef(0);
  const anyDirty = draftDirty;
  const anyDirtyRef = useRef(anyDirty);
  const selectedPaperIdRef = useRef(null);
  const selectedCollectionIdRef = useRef('');
  anyDirtyRef.current = anyDirty;
  selectedPaperIdRef.current = selectedPaper?.id || null;
  selectedCollectionIdRef.current = selectedCollectionId;

  useEffect(() => {
    const saved = readTask(setupKey);
    setActiveTab(['setup', 'sections', 'review', 'progress', 'assign-member'].includes(saved?.activeTab) ? saved.activeTab : 'setup');
    setShowSetUpPaper(Boolean(saved?.showSetUpPaper));
    setSetupMode(saved?.setupMode === 'paper' ? 'paper' : 'standard');
    setSetupHydratedKey(setupKey);
  }, [setupKey]);

  useEffect(() => {
    if (!setupKey || setupHydratedKey !== setupKey || String(project?.id) !== String(id)) return;
    writeTask(setupKey, { activeTab, showSetUpPaper, setupMode, standard, standardBase: project.targetStandard || '', paperId: selectedPaper?.id });
  }, [setupKey, setupHydratedKey, id, project?.id, project?.targetStandard, activeTab, showSetUpPaper, setupMode, standard, selectedPaper?.id]);

  useEffect(() => {
    let cancelled = false;
    setPendingPaperUpload(null);
    setPaperUploadError('');
    setUploadState(null);
    readUpload(paperUploadKey).then(async record => {
      if (!record || cancelled) return;
      setPendingPaperUpload(record);
      setPaperUploadError(t('recoveryInterrupted'));
      const recovery = reconcileFiles(record, await listUploadDocuments(api, `/api/projects/${id}/papers`));
      if (cancelled) return;
      if (recovery.accepted.length) {
        setSelectedPaper(recovery.accepted[0]);
        setPendingPaperUpload(null); setPaperUploadError('');
        await writeUpload(paperUploadKey, null);
      } else {
        setPendingPaperUpload(recovery);
        setPaperUploadError(t(recovery.pending ? 'recoveryReceiptPending' : 'recoveryInterrupted'));
      }
    }).catch(() => { if (!cancelled) setPaperUploadError(t('recoveryReconcileFailed')); });
    return () => { cancelled = true; };
  }, [paperUploadKey, id]);

  const collectionSources = useMemo(
    () => Object.values(collectionSourcePages).flat(),
    [collectionSourcePages],
  );
  const visibleCollectionSources = collectionSourcePages[collectionSourcePage] || [];

  const loadProject = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const [projRes, memRes] = await Promise.all([
        api.get(`/api/projects/${id}`),
        api.get(`/api/projects/${id}/members`).catch(() => ({ data: [] })),
      ]);
      setProject(projRes.data);
      const saved = readTask(setupKey);
      const serverStandard = projRes.data.targetStandard || '';
      setStandard(saved?.standardBase === serverStandard ? saved.standard : serverStandard);
      setMembers(memRes.data || []);
    } catch { navigate('/instructor/projects'); }
    finally { if (showLoading) setLoading(false); }
  }, [id, navigate, setupKey]);

  const loadPapers = useCallback(async () => {
    try {
      const res = await api.get(`/api/projects/${id}/papers`);
      setPapers(res.data || []);
    } catch { }
  }, [id]);

  const loadSections = useCallback(async (paperId) => {
    const requestId = ++sectionLoadRequestRef.current;
    try {
      const res = await api.get(`/api/papers/${paperId}/sections`);
      if (requestId !== sectionLoadRequestRef.current) return;
      const data = res.data || [];
      setSections(data);
      setDraftSections(data);
      setConflictSectionId(null);
      setSectionEvals({});
      const evaluations = await Promise.all(data.map(async (sec) => {
        try {
          const r = await api.get(`/api/papers/${paperId}/sections/${sec.id}/standard-evaluation`);
          return r.data ? [String(sec.id), r.data] : null;
        } catch { return null; }
      }));
      if (requestId === sectionLoadRequestRef.current) {
        setSectionEvals(Object.fromEntries(evaluations.filter(Boolean)));
      }
    } catch {
      if (requestId === sectionLoadRequestRef.current) {
        setSections([]);
        setDraftSections([]);
        setSectionEvals({});
      }
    }
  }, []);

  const saveSectionStandard = async (sectionId, config) => {
    if (!selectedPaper) return false;
    try {
      const { data } = await api.put(
        `/api/papers/${selectedPaper.id}/sections/${sectionId}/standard-evaluation/config`,
        config,
      );
      setSectionEvals(prev => ({ ...prev, [String(sectionId)]: data }));
      return true;
    } catch (err) {
      alert(err?.response?.data?.message || t('instructor.projectDetail.standardSaveFailed'));
      return false;
    }
  };

  const loadFeedback = useCallback(async () => {
    try {
      const fbRes = await api.get('/api/feedback-requests');
      const projectFbs = (fbRes.data || []).filter(fb => String(fb.projectId) === String(id));
      setFeedbackRequests(projectFbs);
    } catch { }
  }, [id]);

  const loadProgressReport = useCallback(async () => {
    const requestId = ++progressReportRequestRef.current;
    setProgressReport(null);
    setProgressReportError(false);
    try {
      let resolution = 'month';
      if (reportFrom && reportTo) {
        const diffDays = Math.ceil((new Date(reportTo) - new Date(reportFrom)) / (1000 * 60 * 60 * 24));
        if (diffDays < 14) resolution = 'day';
        else if (diffDays <= 84) resolution = 'week';
      }

      const progRes = await api.get(`/api/projects/${id}/progress-report`, {
        params: {
          memberFilter: reportMemberId,
          ...(reportFrom && reportTo ? { from: reportFrom, to: reportTo } : {}),
          resolution,
        },
      });
      if (requestId === progressReportRequestRef.current) setProgressReport(progRes.data);
    } catch {
      if (requestId === progressReportRequestRef.current) setProgressReportError(true);
    }
  }, [id, reportFrom, reportMemberId, reportTo]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.get('/api/users?role=STUDENT');
      setUsers(res.data || []);
    } catch { }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const res = await api.get(`/api/sources/projects/${id}`);
      const nextSources = res.data || [];
      setSources(nextSources);
      setSelectedProjectSourceIds(current => current.filter(sourceId =>
        nextSources.some(source => String(source.id) === String(sourceId))));
    } catch { }
  }, [id]);

  const loadCollections = useCallback(async (page = 0) => {
    try {
      const [collectionRes, linkedRes] = await Promise.all([
        api.get('/api/collections', { params: { page, size: MODAL_PAGE_SIZE } }),
        api.get(`/api/projects/${id}/collections`),
      ]);
      const collectionData = collectionRes.data;
      const content = collectionData?.content || collectionData || [];
      setCollections(content);
      setCollectionPage(collectionData?.page ?? page);
      setCollectionTotalPages(collectionData?.totalPages ?? (Array.isArray(content) && content.length > 0 ? 1 : 0));
      setLinkedCollections(linkedRes.data || []);
    } catch { }
  }, [id]);

  useEffect(() => { loadProject(); }, [loadProject]);
  useEffect(() => { if (project) { loadPapers(); loadSources(); loadUsers(); } }, [project, loadPapers, loadSources, loadUsers]);

  useEffect(() => subscribeToEntityChanges(event => {
    if (!event) return;
    if (event.entity === 'PROJECT' && String(event.id) === String(id)) {
      void loadProject(false);
      void loadPapers();
      return;
    }
    if (event.entity === 'DOCUMENT' && String(event.projectId) === String(id)) {
      void loadSources();
      void loadPapers();
      if (selectedPaperIdRef.current && String(event.id) === String(selectedPaperIdRef.current) && !anyDirtyRef.current) {
        void loadSections(event.id);
      }
      return;
    }
    if (event.entity === 'FEEDBACK' && String(event.projectId) === String(id)) {
      void loadFeedback();
      void loadProject(false);
      return;
    }
    if (event.entity === 'COLLECTION' && event.action === 'SOURCE_CHANGED') {
      void loadSources();
      if (String(event.id) === String(selectedCollectionIdRef.current)) void loadCollections();
    }
  }), [id, loadCollections, loadFeedback, loadPapers, loadProject, loadSections, loadSources, subscribeToEntityChanges]);

  // ponytail: attention + table derive from report sections (all papers) and
  // contributions. Edited-title matching is approximate (titles can repeat).
  const reportSections = useMemo(() => progressReport?.sections || [], [progressReport]);
  const reportContributions = useMemo(() => progressReport?.contributions || [], [progressReport]);

  const attention = useMemo(() => {
    const awaitingReview = project?.status === 'SUBMITTED_FOR_REVIEW' ? reportSections.length : 0;
    const openFeedback = reportSections.reduce((sum, s) => sum + (s.feedbackOpen || 0), 0);
    const unassigned = reportSections.filter(s => !s.assignedUserId);
    const editedTitles = new Set();
    reportContributions.forEach(c => (c.editedSections || []).forEach(title => editedTitles.add(title)));
    const untouched = reportSections.filter(s => !editedTitles.has(s.sectionTitle));
    return { awaitingReview, openFeedback, unassigned, untouched };
  }, [project, reportSections, reportContributions]);

  const progressRows = useMemo(() => {
    const q = progressQuery.trim().toLowerCase();
    let rows = reportContributions;
    if (reportSectionId) {
      const assignees = new Set(reportSections.filter(s => String(s.sectionId) === String(reportSectionId)).map(s => String(s.assignedUserId)));
      rows = rows.filter(c => assignees.has(String(c.userId)));
    }
    if (q) rows = rows.filter(c => (c.userName || '').toLowerCase().includes(q));
    const valueOf = (c) => {
      switch (progressSort.key) {
        case 'assigned': return c.assignedSectionCount || 0;
        case 'saves': return c.saveCount || 0;
        case 'lastEdit': return c.lastEditedAt ? new Date(c.lastEditedAt).getTime() : -1;
        case 'open': return c.feedbackOpen || 0;
        default: return (c.userName || '').toLowerCase();
      }
    };
    return [...rows].sort((a, b) => {
      const diff = typeof valueOf(a) === 'string'
        ? valueOf(a).localeCompare(valueOf(b))
        : valueOf(a) - valueOf(b);
      return diff * progressSort.dir;
    });
  }, [reportContributions, reportSections, reportSectionId, progressQuery, progressSort]);

  const dailyBuckets = useMemo(() => {
    // ponytail: the chart answers "when were edits recorded" — saves per day,
    // summed across the visible contributions. Exact values in tooltips/labels.
    let visible = reportContributions;
    if (reportSectionId) {
      const assignees = new Set(reportSections.filter(s => String(s.sectionId) === String(reportSectionId)).map(s => String(s.assignedUserId)));
      visible = visible.filter(c => assignees.has(String(c.userId)));
    }
    const byDate = new Map();
    visible.forEach(c => (c.dailyWordDeltas || []).forEach(day => {
      const current = byDate.get(day.date) || { saves: 0, words: 0 };
      byDate.set(day.date, { saves: current.saves + (day.saveCount || 0), words: current.words + (day.wordDelta || 0) });
    }));
    return [...byDate.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([date, totals]) => ({ date, label: date, count: totals.saves, words: totals.words }));
  }, [reportContributions, reportSections, reportSectionId]);

  // Full match list (uncapped) + paged slice for the combobox — previously the
  // list silently stopped at 8 with no way to reach the rest.
  const studentMembers = useMemo(
    () => members.filter(member => member.userRole === 'STUDENT'),
    [members],
  );

  // Phase 2 & 3: filtered students for assignment search + selection.
  const filteredMembers = useMemo(() => {
    // ponytail: leaders always on top; stable for the rest.
    const ordered = [...studentMembers].sort((a, b) => (b.role === 'LEADER') - (a.role === 'LEADER'));
    if (!memberSearch.trim()) return ordered;
    const q = memberSearch.toLowerCase();
    return ordered.filter(m => studentDisplayName(m).toLowerCase().includes(q) || m.email?.toLowerCase().includes(q) || (m.studentCode?.toLowerCase() ?? '').includes(q) || String(m.userRole||'').toLowerCase().includes(q));
  }, [studentMembers, memberSearch]);

  const filteredSources = useMemo(() => {
    if (!sourceSearch.trim()) return sources;
    const q = sourceSearch.toLowerCase();
    return sources.filter(s => (s.title||'').toLowerCase().includes(q) || (s.originalFilename||'').toLowerCase().includes(q) || (s.doi||'').toLowerCase().includes(q));
  }, [sources, sourceSearch]);

  const advancedFilteredStudents = useMemo(() => {
    const q = advancedSearch.trim().toLowerCase();
    const list = getStudentSuggestions(users, members, '', Number.MAX_SAFE_INTEGER);
    if (!q) return list;
    return list.filter(s => studentDisplayName(s).toLowerCase().includes(q) || (s.email?.toLowerCase() ?? '').includes(q) || (s.studentCode?.toLowerCase() ?? '').includes(q));
  }, [users, members, advancedSearch]);
  const advancedPaging = useMemo(
    () => paginateStudents(advancedFilteredStudents, advancedPage, MODAL_PAGE_SIZE),
    [advancedFilteredStudents, advancedPage],
  );

  const selectedMember = useMemo(() => {
    if (selectedMemberId) return studentMembers.find(m => String(m.userId) === String(selectedMemberId)) || studentMembers.find(m => String(m.id) === String(selectedMemberId)) || null;
    return studentMembers[0] || null;
  }, [studentMembers, selectedMemberId]);

  useEffect(() => {
    if (activeTab === 'review') loadFeedback();
    if (activeTab === 'progress') loadProgressReport();
    if (activeTab === 'assign-member' || activeTab === 'settings') { loadFeedback(); loadProgressReport(); }
  }, [activeTab, loadFeedback, loadProgressReport]);

  // Phase 1: migrate old 'settings' tab key to 'assign-member'
  useEffect(() => { if (activeTab === 'settings') setActiveTab('assign-member'); }, [activeTab]);

  // Phase 2: auto-select first member when members load
  useEffect(() => {
    if (studentMembers.length > 0 && !selectedMemberId) setSelectedMemberId(String(studentMembers[0].userId || studentMembers[0].id));
    if (studentMembers.length === 0) setSelectedMemberId(null);
    setSelectedMemberIds(current => current.filter(id => studentMembers.some(m => String(m.userId || m.id) === String(id))));
  }, [studentMembers, selectedMemberId]);

  const saveStandard = async (nextStandard) => {
    if (!nextStandard || !project) return;
    setSaving(true);
    try {
      const paper = selectedPaper || papers[0];
      const usesGeneratedTemplate = !paper || paper.originalFilename?.startsWith('_standard_');
      if (usesGeneratedTemplate) {
        await api.post(`/api/projects/${id}/papers/reset-standard?standard=${nextStandard}`);
      }
      await api.put(`/api/projects/${id}`, {
        title: project.title,
        description: project.description,
        targetStandard: nextStandard,
      });
      setStandard(nextStandard);
      setStandardSuggestion(null);
      await loadProject();
      const papersRes = await api.get(`/api/projects/${id}/papers`);
      const freshPapers = papersRes.data || [];
      setPapers(freshPapers);
      const canonicalPaper = freshPapers.find(p => p.id === selectedPaper?.id) || freshPapers[0] || null;
      setSelectedPaper(canonicalPaper);
      if (canonicalPaper) {
        await loadSections(canonicalPaper.id);
      }
      setShowSetUpPaper(false);
    } catch { alert(t('instructor.projectDetail.updateStandardFailed')); }
    finally { setSaving(false); }
  };

  const handleUpdateStandard = () => saveStandard(standard);

  const handleImportDoiUnified = async (specificDoi = null) => {
    const raw = specificDoi || doiInput.trim();
    if (!raw) return;
    const dois = [...new Set(raw.split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean))];
    if (dois.length === 0) return;
    
    setAddSourceLoading(true);
    if (!specificDoi) {
      setDoiErrors([]);
    }
    
    try {
      let response;
      if (dois.length === 1) {
        response = await api.post('/api/documents/ingest/doi', { doi: dois[0], projectId: id });
      } else {
        response = await api.post('/api/documents/ingest/doi/batch', { projectId: id, dois });
      }
      
      // Handle 207 Multi-Status
      if (response && response.status === 207 && response.data && response.data.failed) {
        if (!specificDoi) {
          setDoiErrors(response.data.failed);
        } else {
          // If retry returns 207, update the error for that specific DOI
          setDoiErrors(prev => prev.map(e => e.doi === specificDoi ? (response.data.failed.find(f => f.doi === specificDoi) || e) : e));
        }
      } else if (specificDoi) {
        // Successful retry: remove from errors
        setDoiErrors(prev => prev.filter(e => e.doi !== specificDoi));
      }

      if (!specificDoi) {
        setDoiInput('');
      }
      
      await loadSources();
      
      // Only close modal if it was a batch and there were no errors
      if (!specificDoi && (!response || response.status !== 207)) {
        setShowAddSource(false);
      }
    } catch (err) { 
      if (specificDoi) {
        setDoiErrors(prev => prev.map(e => e.doi === specificDoi ? { ...e, error: err?.response?.data?.message || t('instructor.projectDetail.networkError') } : e));
      } else {
        setDoiErrors([{ doi: dois.length === 1 ? dois[0] : 'batch', error: err?.response?.data?.message || t('instructor.projectDetail.ingestionNetworkError') }]);
      }
    }
    finally { setAddSourceLoading(false); }
  };

  const handleUploadSource = async (file) => {
    if (!file) return false;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', id);
    try {
      await api.post('/api/sources', formData);
      await loadSources();
      return true;
    } catch { alert(t('instructor.projectDetail.uploadFailed')); return false; }
  };

  // Phase 3: concurrency queue max 3 for bulk file uploads
  const handleUploadSourcesBatch = async (files) => {
    if (!files || files.length === 0) return;
    setAddSourceLoading(true);
    const concurrency = 3;
    let idx = 0;
    const results = [];
    const queue = Array(Math.min(concurrency, files.length)).fill(0).map(async () => {
      while (idx < files.length) {
        const i = idx++;
        const file = files[i];
        const fd = new FormData(); fd.append('file', file); fd.append('projectId', id);
        try { await api.post('/api/sources', fd); results[i] = true; } catch { results[i] = false; }
      }
    });
    await Promise.all(queue);
    await loadSources();
    setAddSourceLoading(false);
    return results;
  };

  const uploadPaperFile = async file => {
    if (!file || uploadState) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', id);
    setUploadState('uploading');
    setPaperUploadError('');
    setStandardSuggestion(null);
    let persisted = false;
    try {
      const record = await prepareUpload(api, `/api/projects/${id}/papers`, [file]);
      if (setupKeyRef.current !== setupKey) return;
      setPendingPaperUpload(record);
      await writeUpload(paperUploadKey, record);
      persisted = true;
      if (setupKeyRef.current !== setupKey) return;
      const { data: doc } = await api.post('/api/papers', formData);
      await writeUpload(paperUploadKey, null);
      if (setupKeyRef.current !== setupKey) return;
      setPendingPaperUpload(null);
      setSelectedPaper(doc);
      setUploadState('processing');
      loadPapers();
      loadProject();
      if (doc?.id) loadSections(doc.id);
    } catch (err) {
      if (setupKeyRef.current !== setupKey) return;
      const msg = err?.response?.data?.message || err?.response?.data || t('instructor.projectDetail.uploadFailed');
      if (err?.response?.status === 409) {
        alert(msg);
      } else {
        alert(t('instructor.projectDetail.uploadFailed'));
      }
      setUploadState(null);
      setPaperUploadError(t(persisted ? 'recoveryInterrupted' : 'recoveryStorageFailed'));
    }
  };

  const handleUploadPaper = e => uploadPaperFile(e.target.files?.[0]);

  const retryPaperUpload = async () => {
    try {
      const record = reconcileFiles(pendingPaperUpload, await listUploadDocuments(api, `/api/projects/${id}/papers`));
      if (setupKeyRef.current !== setupKey) return;
      if (record.pending) { setPaperUploadError(t('recoveryReceiptPending')); return; }
      if (record.accepted.length) {
        setSelectedPaper(record.accepted[0]);
        setPendingPaperUpload(null); setPaperUploadError('');
        await writeUpload(paperUploadKey, null);
        loadPapers();
      } else await uploadPaperFile(record.entries[0]?.file);
    } catch { setPaperUploadError(t('recoveryReconcileFailed')); }
  };

  const resetSourceSharing = () => {
    sourceSelectionTouched.current.clear();
    setSelectedCollectionId('');
    setCollectionSourcePages({});
    setCollectionSourcePage(0);
    setCollectionSourceTotalPages(0);
    setSelectedSourceIds([]);
  };

  const loadCollectionSources = async (collectionId, page = 0) => {
    if (!collectionId) {
      setCollectionSourcePages({});
      setCollectionSourcePage(0);
      setCollectionSourceTotalPages(0);
      setSelectedSourceIds([]);
      return;
    }
    setCollectionSourcesLoading(true);
    try {
      const res = await api.get(`/api/collections/${collectionId}/sources`, {
        params: { page, size: MODAL_PAGE_SIZE },
      });
      const pageData = res.data;
      const loaded = pageData?.content || pageData || [];
      setCollectionSourcePages(current => ({ ...current, [page]: loaded }));
      setCollectionSourcePage(pageData?.page ?? page);
      setCollectionSourceTotalPages(pageData?.totalPages ?? (Array.isArray(loaded) && loaded.length > 0 ? 1 : 0));

      const pageIds = new Set(loaded.map(source => String(source.id)));
      setSelectedSourceIds(current => {
        const touched = sourceSelectionTouched.current;
        const next = current.filter(sourceId => !pageIds.has(String(sourceId)));
        const serverSelected = loaded
          .filter(source => touched.has(String(source.id))
            ? current.some(sourceId => String(sourceId) === String(source.id))
            : isSourceSharedWithProject(source, id))
          .map(source => String(source.id));
        return [...new Set([...next.map(String), ...serverSelected])];
      });
    } catch {
      setCollectionSourcePages({});
      setCollectionSourcePage(0);
      setCollectionSourceTotalPages(0);
      setSelectedSourceIds([]);
      alert(t('instructor.projectDetail.operationFailed'));
    } finally {
      setCollectionSourcesLoading(false);
    }
  };

  const handleCollectionSelection = async (collectionId) => {
    sourceSelectionTouched.current.clear();
    setSelectedCollectionId(collectionId);
    setCollectionSourcePages({});
    setCollectionSourcePage(0);
    setCollectionSourceTotalPages(0);
    setSelectedSourceIds([]);
    await loadCollectionSources(collectionId, 0);
  };

  const toggleSourceSelection = (sourceId) => {
    const normalizedId = String(sourceId);
    sourceSelectionTouched.current.add(normalizedId);
    setSelectedSourceIds(current => current.includes(normalizedId)
      ? current.filter(id => id !== normalizedId)
      : [...current, normalizedId]);
  };

  const handleShareSources = async () => {
    if (!selectedCollectionId) return;
    const { toShare, toUnshare } = getSourceShareChanges(
      collectionSources, id, selectedSourceIds);
    const blocked = getBlockedSources(collectionSources, toShare);
    if (blocked.length > 0) {
      alert(`${t('instructor.projectDetail.sourceNotReady')}: ${blocked.map(b => `${b.title} (${t(`status.${DOCUMENT_PROCESSING_STATUSES.includes(b.status) ? b.status : 'UNKNOWN'}`)})`).join(', ')}`);
      return;
    }
    const titles = new Map(collectionSources.map(source => [String(source.id), source.title || source.originalFilename || source.id]));
    const requests = [
      ...toShare.map(sourceId => ({ id: sourceId, promise: api.post(
        `/api/collections/${selectedCollectionId}/sources/${sourceId}/share-to-project/${id}`) })),
      ...(toUnshare.length > 0 ? [{
        id: 'bulk-unshare',
        title: toUnshare.map(sourceId => titles.get(String(sourceId)) || sourceId).join(', '),
        promise: api.post(`/api/sources/projects/${id}/unshare`, { sourceIds: toUnshare }),
      }] : []),
    ];
    setShareLoadingId(selectedCollectionId);
    try {
      const results = await Promise.allSettled(requests.map(request => request.promise));
      await Promise.all([loadSources(), loadCollectionSources(selectedCollectionId)]);
      const failed = requests.filter((request, index) => results[index].status === 'rejected');
      if (failed.length > 0) {
        alert(`${t('instructor.projectDetail.operationFailed')}: ${failed.map(request => request.title || titles.get(String(request.id)) || request.id).join(', ')}`);
        return;
      }
      setShowShareCollection(false);
      resetSourceSharing();
    } finally {
      setShareLoadingId(null);
    }
  };

  const handleStopCollectionSync = async () => {
    if (!selectedCollectionId) return;
    setShareLoadingId(selectedCollectionId);
    try {
      await api.delete(`/api/projects/${id}/collections/${selectedCollectionId}`);
      await Promise.all([loadCollections(), loadSources(), loadCollectionSources(selectedCollectionId)]);
    } catch {
      alert(t('instructor.projectDetail.operationFailed'));
    } finally {
      setShareLoadingId(null);
    }
  };

  const handleStartRename = (paper) => {
    setEditingPaperId(paper.id);
    setEditingPaperTitle(paper.title || paper.originalFilename || '');
  };

  const handleSaveRename = async (paperId, nextTitle = editingPaperTitle) => {
    if (!nextTitle.trim()) return;
    try {
      const newTitle = nextTitle.trim();
      const newFilename = newTitle.endsWith('.tex') ? newTitle : newTitle + '.tex';
      await api.put(`/api/papers/${paperId}`, null, { params: { title: newTitle, originalFilename: newFilename } });
      setEditingPaperId(null);
      setSelectedPaper(current => current?.id === paperId ? { ...current, title: newTitle, originalFilename: newFilename } : current);
      await loadPapers();
    } catch { alert(t('instructor.projectDetail.renameFailed')); }
  };

  const handleDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index || !selectedPaper) return;
    // Mutate draft only — no API call (Mandate 1)
    const reordered = Array.from(draftSections);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    // reindex order in draft for display
    const reindexed = reordered.map((s, idx) => ({ ...s, sectionOrder: idx }));
    setDraftSections(reindexed);
  };

  // Single batch endpoint — replaces Promise.all N-transaction trap.
  const persistSectionBatch = async (nextSections) => {
    const payload = {
      sections: nextSections.map(s => ({
        id: s.id,
        sectionOrder: s.sectionOrder,
        sectionTitle: s.sectionTitle,
        assignedUserId: s.assignedUserId || null,
        contentTex: s.contentTex,
        expectedRevision: s.revision ?? s.optVersion ?? null,
      }))
    };
    const { data } = await api.put(`/api/papers/${selectedPaper.id}/sections/batch`, payload);
    setSections(data || []);
    setDraftSections(data || []);
    await loadProject(false);
    return data;
  };

  // ponytail: result objects let the modal pop its own toast (global toasts
  // hide from the AX tree while aria-modal is open; the portal host stays).
  const handleSaveAllSections = async () => {
    if (!selectedPaper || !anyDirty || pendingDelete) return { ok: false, conflict: false, message: '' };
    setSectionStructureSaving(true);
    setConflictSectionId(null);
    try {
      await persistSectionBatch(draftSections);
      return { ok: true };
    } catch (err) {
      const fieldErrors = err?.response?.data?.fieldErrors;
      const sid = fieldErrors?.sectionId || err?.response?.data?.details?.sectionId;
      if (err?.response?.status === 409 && sid) {
        setConflictSectionId(String(sid));
        return { ok: false, conflict: true, message: '' };
      }
      return { ok: false, conflict: false, message: err?.response?.data?.message || t('instructor.projectDetail.reorderSectionsFailed') };
    } finally {
      setSectionStructureSaving(false);
    }
  };

  // ponytail: assignments persist immediately via one batch PUT (no Save click).
  // Payload builds from the live draft so unsaved title/content edits ride along.
  const handleApplyAssignmentsNow = async (nextSections) => {
    if (!selectedPaper || sectionStructureSaving) return { ok: false, conflict: false, message: '' };
    setSectionStructureSaving(true);
    setConflictSectionId(null);
    setDraftSections(nextSections);
    try {
      await persistSectionBatch(nextSections);
      return { ok: true };
    } catch (err) {
      const fieldErrors = err?.response?.data?.fieldErrors;
      const sid = fieldErrors?.sectionId || err?.response?.data?.details?.sectionId;
      if (err?.response?.status === 409 && sid) {
        setConflictSectionId(String(sid));
        return { ok: false, conflict: true, message: '' };
      }
      return { ok: false, conflict: false, message: err?.response?.data?.message || t('instructor.projectDetail.assignmentsApplyFailed') };
    } finally {
      setSectionStructureSaving(false);
    }
  };

  const handleAddSection = async () => {
    // ponytail: status-only gate; per-section assigned checks live in the
    // edit modal + BE guards. Appending a section never touches assigned work.
    const structureLockedNow = ['SUBMITTED_FOR_REVIEW', 'APPROVED', 'ARCHIVED', 'PENDING_DELETE'].includes(project?.status);
    if (!selectedPaper || structureLockedNow || sectionStructureSaving) return;
    setSectionStructureSaving(true);
    try {
      await api.post(`/api/papers/${selectedPaper.id}/sections/create`, null, {
        params: { title: t('instructor.projectDetail.newSectionTitle') },
      });
      await loadSections(selectedPaper.id);
    } catch (err) {
      alert(err?.response?.data?.message || t('instructor.projectDetail.addSectionFailed'));
    } finally {
      setSectionStructureSaving(false);
    }
  };

  const handleStartSectionRename = (section) => {
    setEditingSectionId(section.id);
    setEditingSectionTitle(section.sectionTitle);
  };

  const handleSaveSectionRename = async (sectionId, nextTitle = editingSectionTitle) => {
    if (!nextTitle.trim() || !selectedPaper) return;
    // Draft-only — no API (Mandate 1)
    setDraftSections(prev => prev.map(s => String(s.id) === String(sectionId) ? { ...s, sectionTitle: nextTitle.trim() } : s));
    setEditingSectionId(null);
  };

  const handleDiscardSectionDraft = () => {
    setDraftSections(sections);
    setConflictSectionId(null);
    setShowEditPaper(false);
  };

  const handleDeleteSection = (sectionId) => {
    if (!selectedPaper) return;
    const section = sections.find(s => String(s.id) === String(sectionId))
      || draftSections.find(s => String(s.id) === String(sectionId));
    startDelete({
      entityName: section?.sectionTitle || sectionId,
      entityDetails: sectionId,
    }, async () => {
      try {
        await api.delete(`/api/papers/${selectedPaper.id}/sections/${sectionId}`);
        setSections(prev => prev.filter(s => String(s.id) !== String(sectionId)));
        setDraftSections(prev => prev.filter(s => String(s.id) !== String(sectionId)));
      } catch (err) {
        alert(err?.response?.data?.message || t('instructor.projectDetail.deleteSectionFailed'));
      }
    });
  };

  // ponytail: surface the backend block reason — a bare count misdirects
  // (SOURCE_NOT_READY is extraction state, not paper/review usage).
  const unshareBlockedMessage = (blocked) => {
    const reasons = [...new Set((blocked || []).map(entry => entry?.reason).filter(Boolean))];
    if (reasons.includes('SOURCE_NOT_READY')) {
      return `${t('instructor.projectDetail.removeSourceNotReady')}: ${blocked.length}`;
    }
    return `${t('instructor.projectDetail.removeSourceBlocked')}: ${blocked.length}`;
  };

  const handleRemoveSource = async (sourceId) => {
    try {
      await api.post(`/api/sources/projects/${id}/unshare`, { sourceIds: [sourceId] });
    } catch (err) {
      const blocked = err?.response?.data?.blocked || [];
      alert(blocked.length > 0
        ? unshareBlockedMessage(blocked)
        : (err?.response?.data?.message || t('instructor.projectDetail.removeSourceFailed')));
    }
    await loadSources();
  };

  const toggleProjectSourceSelection = (sourceId) => {
    const normalizedId = String(sourceId);
    setSelectedProjectSourceIds(current => current.includes(normalizedId)
      ? current.filter(id => id !== normalizedId)
      : [...current, normalizedId]);
  };

  const handleRemoveSelectedSources = async () => {
    if (selectedProjectSourceIds.length === 0) return;
    const sourceIds = [...selectedProjectSourceIds];
    try {
      await api.post(`/api/sources/projects/${id}/unshare`, { sourceIds });
      setSelectedProjectSourceIds([]);
      await loadSources();
    } catch (err) {
      const blocked = err?.response?.data?.blocked || [];
      alert(blocked.length > 0
        ? unshareBlockedMessage(blocked)
        : (err?.response?.data?.message || t('instructor.projectDetail.removeSourceFailed')));
      await loadSources();
    }
  };

  const handleReloadConflictSection = async (sectionId) => {
    try {
      const { data } = await api.get(`/api/papers/${selectedPaper.id}/sections/${sectionId}/history`);
      const fresh = { ...data, revision: data.revision ?? data.optVersion };
      setSections(prev => prev.map(s => String(s.id) === String(sectionId) ? { ...s, ...fresh } : s));
      setDraftSections(prev => prev.map(s => String(s.id) === String(sectionId) ? { ...s, ...fresh } : s));
      setConflictSectionId(null);
    } catch { alert(t('instructor.projectDetail.operationFailed')); }
  };

  // Phase 3: Advanced Add Multiple
  const handleAdvancedAddMultiple = async () => {
    if (advancedSelectedIds.length === 0) return;
    try {
      const results = await Promise.allSettled(advancedSelectedIds.map(uid => api.post(`/api/projects/${id}/members`, null, { params: { userId: uid, role: advancedRoleMap[uid] || 'MEMBER' } })));
      const failed = results.filter(r=>r.status==='rejected');
      if (failed.length) alert(`${t('instructor.projectDetail.addMemberFailed')}: ${failed.length} failed`);
      setShowAdvancedAdd(false); setAdvancedSelectedIds([]); setAdvancedRoleMap({});
      await loadProject();
    } catch { alert(t('instructor.projectDetail.addMemberFailed')); }
  };

  const handleRemoveMember = async (userId) => {
    try {
      await api.delete(`/api/projects/${id}/members/${userId}`);
      loadProject();
    } catch { alert(t('instructor.projectDetail.removeMemberFailed')); }
  };

  const toggleMemberSelection = (memberId) => {
    const key = String(memberId);
    setSelectedMemberIds(current => current.includes(key)
      ? current.filter(id => id !== key)
      : [...current, key]);
  };

  const handleRemoveSelectedMembers = async () => {
    const ids = [...selectedMemberIds];
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map(userId => api.delete(`/api/projects/${id}/members/${userId}`)));
      if (ids.includes(String(selectedMemberId))) setSelectedMemberId(null);
      setSelectedMemberIds([]);
      loadProject();
    } catch { alert(t('instructor.projectDetail.removeMemberFailed')); }
  };

  const handleUpdateMemberRole = async (userId, role) => {
    setUpdatingMemberId(userId);
    try {
      await api.patch(`/api/projects/${id}/members/${userId}`, null, { params: { role } });
      await loadProject();
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.detail || t('instructor.projectDetail.updateMemberRoleFailed'));
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleUnassignAll = () => handleApplyAssignmentsNow(
    draftSections.map(section => (
      section.sectionType === 'REFERENCE' ? section : { ...section, assignedUserId: null }
    )),
  );

  const handleDeleteProject = () => {
    if (!project || deletingProject) return;
    startDelete({
      entityName: project.title || id,
      entityDetails: id,
    }, async () => {
      setDeletingProject(true);
      try {
        const { data } = await api.delete(API_ROUTES.PROJECTS.BY_ID(id));
        if (data?.deletionScheduledAt) {
          setProject(data);
        } else {
          await loadProject();
        }
      } catch (err) {
        alert(err?.response?.data?.message || t('instructor.projectManagement.deleteProjectFailed'));
      } finally {
        setDeletingProject(false);
      }
    });
  };

  const handleRevokeDeletion = async () => {
    try {
      const { data } = await api.patch(API_ROUTES.PROJECTS.CANCEL_DELETION(id));
      if (data) {
        setProject(data);
      } else {
        await loadProject();
      }
    } catch {
      alert(t('instructor.projectManagement.revokeDeletionFailed'));
    }
  };

  const [reextractingPaper, setReextractingPaper] = useState(false);
  const handleReextractPaper = async () => {
    if (!selectedPaper || reextractingPaper) return;
    setReextractingPaper(true);
    try {
      await api.post(`/api/documents/${selectedPaper.id}/re-extract`);
      await loadPapers();
      const res = await api.get(`/api/papers/${selectedPaper.id}`);
      setSelectedPaper(res.data || null);
    } catch {
      alert(t('instructor.projectDetail.reExtractFailed'));
    } finally {
      setReextractingPaper(false);
    }
  };

  const handlePatch = async (action) => {
    setStatusPending(action);
    try {
      await api.patch(`/api/projects/${id}/${action}`);
      await loadProject();
    } catch {
      alert(t('instructor.projectDetail.projectActionFailed', {
        action: t(`instructor.projectDetail.action.${['archive', 'unarchive', 'complete'].includes(action) ? action : 'UNKNOWN'}`),
      }));
    }
    finally { setStatusPending(null); }
  };

  const handleUpdateProject = async ({ title, description }) => {
    if (!project || savingProjectEdit) return;
    setSavingProjectEdit(true);
    try {
      const { data } = await api.put(`/api/projects/${id}`, {
        title,
        description,
        targetStandard: project.targetStandard || null,
      });
      setProject(data || { ...project, title, description });
      setShowEditProject(false);
    } catch {
      alert(t('instructor.projectManagement.updateProjectFailed'));
    } finally {
      setSavingProjectEdit(false);
    }
  };

  const TOUR_STEPS = [
    { element: '#project-header', popover: { title: t('instructor.projectDetail.tourProjectTitle'), description: t('instructor.projectDetail.tourProjectDesc'), side: 'bottom', align: 'start' } },
    { element: '#tab-setup', popover: { title: t('instructor.projectDetail.projectSetup'), description: t('instructor.projectDetail.tourSetupDesc'), side: 'bottom', align: 'center' } },
    { element: '#tab-assign-member', popover: { title: t('instructor.projectDetail.assignStudents'), description: t('instructor.projectDetail.tourProjectSettingsDesc'), side: 'bottom', align: 'center' } },
    { element: '#tab-sections', popover: { title: t('instructor.projectDetail.projectSections'), description: t('instructor.projectDetail.tourSectionsDesc'), side: 'bottom', align: 'center' } },
    { element: '#tab-review', popover: { title: t('instructor.projectDetail.projectReview'), description: t('instructor.projectDetail.tourProjectReviewDesc'), side: 'bottom', align: 'center' } },
    { element: '#source-documents', popover: { title: t('instructor.projectDetail.sourceDocuments'), description: t('instructor.projectDetail.tourSourceDocumentsDesc'), side: 'top', align: 'start' } },
    { element: '#set-up-paper', popover: { title: t('instructor.projectDetail.setUpPaper'), description: t('instructor.projectDetail.tourSetUpPaperDesc'), side: 'top', align: 'start' } },
    { element: '#project-members', popover: { title: t('instructor.projectDetail.members'), description: t('instructor.projectDetail.tourMembersDesc'), side: 'top', align: 'start' } },
    { element: '#project-header', popover: { title: t('instructor.projectDetail.status'), description: t('instructor.projectDetail.tourStatusControlsDesc'), side: 'top', align: 'start' } },
  ];

  useEffect(() => {
    if (papers.length > 0 && !selectedPaper) {
      const saved = readTask(setupKey);
      setSelectedPaper(papers.find(paper => String(paper.id) === String(saved?.paperId)) || papers[0]);
    }
  }, [papers]);

  useEffect(() => {
    if (selectedPaper) loadSections(selectedPaper.id);
  }, [selectedPaper]);

  useEffect(() => {
    if (!selectedPaper) return;
    const status = selectedPaper.processingStatus;
    if (status === 'READY' || status === 'FAILED' || !status) { setUploadState(null); return; }
    setUploadState('processing');
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const res = await getWithRetry(api, `/api/papers/${selectedPaper.id}`, () => cancelled);
        if (!res || cancelled) return;
        setSelectedPaper(res.data);
        if (res.data.processingStatus === 'READY' || res.data.processingStatus === 'FAILED') {
          setUploadState(null);
          if (res.data.processingStatus === 'READY') loadSections(res.data.id);
          loadSources();
          loadPapers();
          return;
        }
      } catch (error) {
        if (cancelled) return;
        if ([401, 403, 404].includes(error.response?.status)) { setUploadState(null); return; }
      }
      if (!cancelled) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [selectedPaper?.id, selectedPaper?.processingStatus]);

  useEffect(() => {
    const shouldSuggest = !project?.targetStandard
      && selectedPaper?.processingStatus === 'READY'
      && !selectedPaper?.originalFilename?.startsWith('_standard_');
    if (!shouldSuggest) {
      setStandardSuggestion(null);
      setStandardSuggestionLoading(false);
      return undefined;
    }

    let cancelled = false;
    setStandardSuggestionLoading(true);
    api.get(`/api/papers/${selectedPaper.id}/standard-suggestion`)
      .then(({ data }) => { if (!cancelled) setStandardSuggestion(data); })
      .catch(() => { if (!cancelled) setStandardSuggestion(null); })
      .finally(() => { if (!cancelled) setStandardSuggestionLoading(false); });
    return () => { cancelled = true; };
  }, [project?.targetStandard, selectedPaper?.id, selectedPaper?.processingStatus]);

  if (loading) return <div className="h-screen w-full flex flex-col overflow-hidden bg-[var(--page-bg)]"><AppHeader /><div className="flex-1 min-h-0 overflow-hidden flex mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8"><LoadingSkeleton count={6} /></div></div>;
  if (!project) return null;

  const projectMembers = members;
  const hasAssignedSections = sections.some(s => s.assignedUserId);
  const projectReadOnly = ['SUBMITTED_FOR_REVIEW', 'APPROVED', 'ARCHIVED', 'PENDING_DELETE'].includes(project.status) || Boolean(project.deletionScheduledAt);
  // Keep source controls aligned with the backend read-only guard for frozen
  // and scheduled projects.
  const canModifySources = !projectReadOnly;
  // ponytail: global freeze stays for whole-paper setup ops (re-extract /
  // reset-standard are destructive). The edit-paper modal uses per-section
  // locks instead — only the assigned section locks title/standards/delete.
  const sectionStructureLocked = hasAssignedSections || projectReadOnly;
  const standardViewSection = displaySections.find(section => String(section.id) === String(standardViewSectionId)) || null;
  const projectActionState = {
    ...project,
    active: project.active ?? true,
    hasAuthoritativeData: Boolean(selectedPaper || papers.length),
  };

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-[var(--page-bg)] text-[var(--text-primary)] font-sans">
      <AppHeader />
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
        <div id="project-header" className="mb-6 shrink-0">
          <Breadcrumb
            items={[
              { label: t('instructor.projectDetail.dashboard'), path: '/instructor/dashboard' },
              { label: t('instructor.projectDetail.projects'), path: '/instructor/projects' },
              { label: project.title }
            ]}
          />
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-2xl font-black text-[var(--brand-foreground)]">{project.title}</h1>
              {project.description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{project.description}</p>}
              <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-[var(--text-tertiary)]"><StatusBadge status={project.status} /></p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {hasProjectAction(projectActionState, 'revokeDeletion') && (
                <button onClick={handleRevokeDeletion} className="rounded-lg border border-amber-500 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100 cursor-pointer">
                  {t('instructor.projectManagement.revokeDeletion')}
                </button>
              )}
              {hasProjectAction(projectActionState, 'edit') && (
                <button onClick={() => setShowEditProject(true)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-bold text-[var(--brand-foreground)] transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]">
                  {t('instructor.projectManagement.commonEdit')}
                </button>
              )}
              {/* PHASE 1: Status Control lifted from Settings tab — replaces View Evidence Trace */}
              {hasProjectAction(projectActionState, 'delete') && (
                <DeleteConfirm
                  message={t('instructor.projectManagement.deleteProjectConfirmSchedule')}
                  onConfirm={handleDeleteProject}
                  triggerLabel={t('delete')}
                  confirmLabel={t('delete')}
                  cancelLabel={t('cancel')}
                  disabled={deletingProject}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                >
                  {deletingProject ? t('saving') : t('delete')}
                </DeleteConfirm>
              )}
              {hasProjectAction(projectActionState, 'complete') && (
                <button onClick={() => handlePatch('complete')} disabled={!!statusPending} className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-hover)] disabled:opacity-50">
                  {statusPending === 'complete' ? '...' : t('instructor.projectDetail.markComplete')}
                </button>
              )}
              {hasProjectAction(projectActionState, 'archive') && (
                <button onClick={() => handlePatch('archive')} disabled={!!statusPending} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50">
                  {statusPending === 'archive' ? '...' : t('instructor.projectDetail.archive')}
                </button>
              )}
              {hasProjectAction(projectActionState, 'unarchive') && (
                <button onClick={() => handlePatch('unarchive')} disabled={!!statusPending} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                  {statusPending === 'unarchive' ? '...' : t('instructor.projectDetail.unarchive')}
                </button>
              )}
              {hasProjectAction(projectActionState, 'export') && <button onClick={() => setShowExportModal(true)} className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-hover)]">{t('instructor.projectDetail.export')}</button>}
              <TourLauncher steps={TOUR_STEPS} tourKey="instructor-project-detail"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-sm font-bold text-[var(--text-secondary)] shadow-sm transition-all hover:border-indigo-300 hover:bg-[var(--brand-soft)] hover:text-[var(--brand-foreground)]" />
            </div>
          </div>
          {project.deletionScheduledAt && (
            <div className="mt-4">
              <ProjectDeletionNotice
                deadline={project.deletionScheduledAt}
              />
            </div>
          )}
        </div>

        {/* Tabs — Static, wrap not scroll */}
        <div className="flex flex-wrap items-center border-b border-[var(--border)] shrink-0 mb-6">
          {[
            { key: 'setup', label: t('instructor.projectDetail.projectSetup') },
            { key: 'assign-member', label: t('instructor.projectDetail.assignStudents') },
            { key: 'sections', label: t('instructor.projectDetail.projectSections') },
            { key: 'progress', label: t('instructor.projectDetail.projectProgressReport') },
            { key: 'review', label: t('instructor.projectDetail.projectReview') },
          ].map(tab => (
            <button
              key={tab.key}
              id={`tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`-mb-px shrink-0 rounded-t-lg px-4 py-2 text-xs font-bold transition ${activeTab === tab.key ? 'border border-b-[var(--surface)] border-[var(--border)] bg-[var(--surface)] text-[var(--brand-foreground)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {paperUploadError && (
          <div role="status" className="mb-3 shrink-0 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p>{paperUploadError}</p>
            {pendingPaperUpload && <>
              <p className="mt-1">{pendingPaperUpload.entries[0]?.file.name}</p>
              <button type="button" onClick={retryPaperUpload} disabled={Boolean(uploadState) || !canModifySources} className="mt-2 rounded-lg bg-(--brand) px-3 py-1.5 font-bold text-(--on-brand) disabled:opacity-50">{t('recoveryRetryUpload')}</button>
              <button type="button" onClick={async () => { await writeUpload(paperUploadKey, null); setPendingPaperUpload(null); setPaperUploadError(''); }} className="ml-2 rounded-lg border border-(--border) px-3 py-1.5">{t('shared.ingestion.commonDismiss')}</button>
            </>}
          </div>
        )}
        {/* Tab: Setup */}
        {activeTab === 'setup' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full overflow-hidden">
            <div id="source-documents" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 h-full min-h-0 overflow-hidden flex flex-col">
              <div className="mb-3 shrink-0">
                <ActionExpandHeader title={t('instructor.projectDetail.sourceDocuments')} placeholder={t('instructor.projectDetail.searchSource')} searchValue={sourceSearch} onSearch={setSourceSearch} onAdd={() => setShowAddSource(true)} addLabel={t('instructor.projectDetail.addSource')} hideAdd={!canModifySources} action={selectedProjectSourceIds.length > 0 && canModifySources ? (
                  <DeleteConfirm
                    message={t('instructor.projectDetail.removeSelectedSourcesConfirm', { count: selectedProjectSourceIds.length })}
                    onConfirm={handleRemoveSelectedSources}
                    triggerLabel={t('instructor.projectDetail.removeSelectedSources')}
                    confirmLabel={t('instructor.projectDetail.removeSelectedSources')}
                    cancelLabel={t('cancel')}
                    className="group flex h-8 w-8 shrink-0 items-center justify-center gap-0 overflow-hidden rounded-lg bg-rose-600 text-white transition-all duration-300 hover:w-24 hover:gap-1.5 hover:bg-rose-700"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current" strokeWidth="2"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                    <span className="hidden whitespace-nowrap text-xs font-bold group-hover:inline">Remove?</span>
                  </DeleteConfirm>
                ) : null} />
              </div>
              {filteredSources.length === 0 ? (
                <p className="text-xs italic text-[var(--text-tertiary)]">{sourceSearch ? t('instructor.projectDetail.noStudentsFound') : t('instructor.projectDetail.noSourceDocuments')}</p>
              ) : (
                <div className="space-y-1 flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                  {filteredSources.map(s => (
                    <div key={s.id} data-testid={`source-${s.id}`} className="flex items-center gap-2 rounded-lg bg-[var(--surface-secondary)] px-3 py-2 text-xs transition hover:bg-[var(--surface-tertiary)]">
                      <input
                        type="checkbox"
                        checked={selectedProjectSourceIds.includes(String(s.id))}
                        onChange={() => toggleProjectSourceSelection(s.id)}
                        disabled={!canModifySources || s.referenced}
                        title={s.referenced ? t('instructor.projectDetail.removeSourceReferenced') : undefined}
                        aria-label={t('instructor.projectDetail.selectSource', { name: s.title || s.originalFilename || s.id })}
                        className="h-4 w-4 shrink-0 rounded border-[var(--border)] text-[var(--brand)] focus:ring-[var(--brand)] disabled:opacity-50"
                      />
                      <button onClick={() => { setSourceDetail(s); setShowSourceDetail(true); }} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                        <span className="min-w-0 truncate font-medium">{s.title || s.originalFilename || t('unknown')}</span>
                        <StatusBadge status={s.processingStatus || 'READY'} />
                      </button>
                      <span title={s.referenced ? t('instructor.projectDetail.removeSourceReferenced') : undefined}>
                      <DeleteConfirm
                        message={t('instructor.projectDetail.removeSourceConfirm')}
                        onConfirm={() => handleRemoveSource(s.id)}
                        triggerLabel={t('instructor.projectDetail.removeSource')}
                        confirmLabel={t('instructor.projectDetail.removeSource')}
                        cancelLabel={t('cancel')}
                        disabled={!canModifySources || s.referenced}
                        className="shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] transition hover:bg-rose-100 hover:text-rose-600 disabled:opacity-50"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>
                      </DeleteConfirm>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div id="set-up-paper" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 h-full min-h-0 overflow-y-auto flex flex-col">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[var(--brand-foreground)]">{t('instructor.projectDetail.setUpPaper')}</h2>
                {!sectionStructureLocked && (
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedPaper && hasProjectAction(projectActionState, 'reExtract') && (
                      <button
                        onClick={handleReextractPaper}
                        disabled={reextractingPaper || selectedPaper.processingStatus === 'QUEUED' || selectedPaper.processingStatus === 'PROCESSING'}
                        className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--brand-foreground)] transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-50"
                      >
                        {reextractingPaper ? t('saving') : t('instructor.projectDetail.reExtractPaper')}
                      </button>
                    )}
                    <button onClick={() => { setSetupMode(standard ? 'standard' : 'paper'); setShowSetUpPaper(true); }} className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--brand-hover)]">
                      {standard || papers.length > 0 ? t('instructor.projectDetail.updateSetup') : t('instructor.projectDetail.setUpPaper')}
                    </button>
                  </div>
                )}
              </div>
              {standard && (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-xs">
                  <span className="font-medium text-[var(--brand-foreground)]">{t('instructor.projectDetail.standardLabel', { standard })}</span>
                  <button onClick={() => { setSetupMode('standard'); setShowSetUpPaper(true); }} className="text-xs font-bold text-[var(--brand-foreground)] hover:underline">{t('instructor.projectDetail.change')}</button>
                </div>
              )}
              {papers.length > 0 && (
                <div className="mb-3 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t('instructor.projectDetail.uploadedPapers')}</p>
                  {papers.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-secondary)] px-3 py-2 text-xs">
                      <span className="min-w-0 truncate font-medium">{p.originalFilename || p.title}</span>
                      <StatusBadge status={p.processingStatus || 'READY'} />
                    </div>
                  ))}
                </div>
              )}
              {!project?.targetStandard && standardSuggestionLoading && (
                <p className="mb-3 text-xs italic text-[var(--text-tertiary)]">{t('instructor.projectDetail.detectingPaperStandard')}</p>
              )}
              {!project?.targetStandard && standardSuggestion && !standardSuggestionLoading && (
                <div className="mb-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-950">
                  {standardSuggestion.suggestedStandard === 'CUSTOM' ? (
                    <p>{t('instructor.projectDetail.noReliableStandard')}</p>
                  ) : (
                    <>
                      <p className="font-bold">
                        {t('instructor.projectDetail.suggestedPaperStandard', { standard: standardSuggestion.suggestedStandard })}
                      </p>
                      <p>
                        {t('instructor.projectDetail.standardConfidence', { confidence: standardSuggestion.confidencePercent })}
                      </p>
                      {standardSuggestion.evidence?.length > 0 && (
                        <p>{t('instructor.projectDetail.standardEvidence', { evidence: standardSuggestion.evidence.join(', ') })}</p>
                      )}
                    </>
                  )}
                  <p className="text-[10px] text-amber-800">{t('instructor.projectDetail.standardSuggestionAdvisory')}</p>
                  <div className="flex flex-wrap gap-2">
                    {standardSuggestion.suggestedStandard !== 'CUSTOM' && (
                      <button
                        onClick={() => saveStandard(standardSuggestion.suggestedStandard)}
                        disabled={saving}
                        className="rounded-lg bg-[var(--brand)] px-3 py-2 font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
                      >
                        {t('instructor.projectDetail.confirmSuggestedStandard')}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setStandard(standardSuggestion.suggestedStandard === 'CUSTOM' ? '' : standardSuggestion.suggestedStandard);
                        setSetupMode('standard');
                        setShowSetUpPaper(true);
                      }}
                      className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-bold text-amber-900 hover:bg-amber-100"
                    >
                      {t('instructor.projectDetail.chooseDifferentStandard')}
                    </button>
                    <button
                      onClick={() => saveStandard('CUSTOM')}
                      disabled={saving}
                      className="rounded-lg px-3 py-2 font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                    >
                      {t('instructor.projectDetail.keepCustomStandard')}
                    </button>
                  </div>
                </div>
              )}
              {!standard && papers.length === 0 && (
                <p className="mb-3 text-xs italic text-[var(--text-tertiary)]">{t('instructor.projectDetail.noPaperConfigured')}</p>
              )}
              {sectionStructureLocked && (
                <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-center text-xs font-bold text-[var(--text-secondary)]">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                  {projectReadOnly ? t('instructor.projectDetail.setupLockedReadOnly') : t('instructor.projectDetail.setupLockedAssigned')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Sections */}
        {activeTab === 'sections' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-hidden">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 lg:col-span-1 h-full flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold text-[var(--brand-foreground)]">{t('instructor.projectDetail.papers')}</h2>
              </div>
              {papers.length === 0 ? (
                <p className="text-xs italic text-[var(--text-tertiary)]">{t('instructor.projectDetail.uploadPaperFirst')}</p>
              ) : (
                <div className="space-y-1">
                  {papers.map(p => (
                    <div key={p.id} className="flex items-center gap-1">
                      {editingPaperId === p.id ? (
                        <div className="flex flex-1 items-center gap-1 rounded-lg border border-indigo-200 bg-[var(--brand-soft)] px-3 py-2">
                          <input autoFocus value={editingPaperTitle} onChange={e => setEditingPaperTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveRename(p.id); if (e.key === 'Escape') setEditingPaperId(null); }} className="min-w-0 flex-1 border-b border-indigo-300 bg-transparent text-xs outline-none" onClick={e => e.stopPropagation()} />
                          <button onClick={() => handleSaveRename(p.id)} className="rounded p-1 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-800" title={t('save')} aria-label={t('save')}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg></button>
                          <button onClick={() => setEditingPaperId(null)} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-tertiary)] hover:text-[var(--text-primary)]" title={t('cancel')} aria-label={t('cancel')}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setSelectedPaper(p); loadSections(p.id); }}
                          className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-xs transition ${selectedPaper?.id === p.id ? 'border border-indigo-200 bg-[var(--brand-soft)] text-[var(--brand-foreground)]' : 'hover:bg-[var(--surface-secondary)]'}`}
                        >
                          <span className="font-medium">{p.originalFilename || p.title}</span>
                        </button>
                      )}
                      {editingPaperId !== p.id && (
                        <button onClick={e => { e.stopPropagation(); handleStartRename(p); }} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand-foreground)]" title={t('instructor.projectDetail.rename')} aria-label={t('instructor.projectDetail.rename')}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z" /><path d="m13 7 4 4" /></svg></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 lg:col-span-2 h-full flex flex-col min-h-0 overflow-hidden">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3 shrink-0">
                <div>
                  <h2 className="text-sm font-bold text-[var(--brand-foreground)]">{t('instructor.projectDetail.projectSections')}</h2>
                  {selectedPaper && projectReadOnly && (
                    <p className="text-[10px] text-amber-700 mt-1">
                      {t('instructor.projectDetail.projectReadOnly')}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {selectedPaper && (
                    <button
                      type="button"
                      aria-label={t('instructor.projectDetail.editPaperAction')}
                      onClick={() => setShowEditPaper(true)}
                      disabled={displaySections.length === 0 || sectionStructureSaving || selectedPaper.processingStatus === 'QUEUED' || selectedPaper.processingStatus === 'PROCESSING'}
                      className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('instructor.projectDetail.editPaperAction')}
                    </button>
                  )}
                </div>
              </div>
              {!selectedPaper ? (
                <p className="text-xs italic text-[var(--text-tertiary)]">{t('instructor.projectDetail.selectPaperSections')}</p>
              ) : selectedPaper.processingStatus === 'PROCESSING' || selectedPaper.processingStatus === 'QUEUED' || uploadState ? (
                (() => {
                  const s = selectedPaper.processingStatus;
                  const isUploading = uploadState === 'uploading' || s === 'QUEUED';
                  const isExtracting = uploadState === 'processing' || s === 'PROCESSING';
                  // Native React + Tailwind extraction bar — 4 sequential steps tied to poll (ProjectDetail.jsx:655)
                  // 3000ms poll may jump steps; transition-all duration-1000 masks latency
                  const steps = t('instructor.projectDetail.processingSteps', { returnObjects: true });
                  let progress = 0; let activeIdx = 0;
                  if (isUploading) { progress = 25; activeIdx = 0; }
                  else if (isExtracting) { progress = 50; activeIdx = 1; }
                  else if (s === 'PROCESSING') { progress = 60; activeIdx = 1; }
                  else if (s === 'READY' && sections.length===0) { progress = 75; activeIdx = 2; }
                  else if (s === 'QUEUED') { progress = 25; activeIdx = 0; }
                  const pct = Math.min(progress, 95);
                  return (
                    <div className="space-y-3">
                      <div className="w-full h-2.5 rounded-full bg-[var(--surface-tertiary)] overflow-hidden">
                        <div className="h-full bg-[var(--brand)] rounded-full transition-all duration-1000 ease-in-out" style={{ width: `${pct}%` }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[9px] font-bold">
                        {steps.map((label, i) => (
                          <span key={label} className={`text-center truncate px-1 py-1 rounded ${i===activeIdx ? 'bg-[var(--brand-soft)] text-[var(--brand-foreground)]' : i < activeIdx ? 'text-emerald-600' : 'text-[var(--text-tertiary)]'}`}>{i < activeIdx ? '✓ ' : ''}{label}</span>
                        ))}
                      </div>
                      <p className="text-xs italic text-[var(--text-secondary)] flex items-center gap-2"><span className="inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse" />{t('instructor.projectDetail.processingSections')}</p>
                    </div>
                  );
                })()
              ) : displaySections.length === 0 ? (
                <div className="text-xs italic text-[var(--text-tertiary)]">
                  <p>{t('instructor.projectDetail.noSectionsHelp')}</p>
                </div>
              ) : (
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto" aria-label={t('instructor.projectDetail.sectionSummary')}>
                  {displaySections.map((section, index) => {
                    const evaluation = sectionEvals[String(section.id)];
                    const assignedMember = projectMembers.find(member => String(member.userId) === String(section.assignedUserId));
                    return (
                      <div key={section.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-xs font-black text-[var(--brand-foreground)]">{index + 1}</span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-[var(--text-primary)]">{section.sectionTitle || t('untitled')}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {section.sectionType === 'REFERENCE' ? (
                                <span className="text-[10px] italic text-[var(--text-tertiary)]">{t('instructor.projectDetail.referenceSharedEditors')}</span>
                              ) : (
                                <span data-testid={`tab-assignee-badge-${section.id}`} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${assignedMember ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-500'}`}>
                                  {assignedMember ? studentDisplayName(assignedMember) : t('instructor.projectDetail.unassigned')}
                                </span>
                              )}
                              <span data-testid={`tab-standard-badge-${section.id}`} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${evaluation?.requirements?.length ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                                {evaluation?.requirements?.length ? t('instructor.projectDetail.standardConfigured') : t('instructor.projectDetail.standardNotConfigured')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${evaluation?.requirements?.length ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {evaluation?.requirements?.length ? t('instructor.projectDetail.standardConfigured') : t('instructor.projectDetail.standardNotConfigured')}
                          </span>
                          {evaluation?.requirements?.length > 0 && (
                            <button
                              type="button"
                              data-testid={`view-standard-tab-${section.id}`}
                              onClick={() => setStandardViewSectionId(section.id)}
                              aria-label={`${t('instructor.projectDetail.viewStandard')}: ${section.sectionTitle}`}
                              title={t('instructor.projectDetail.viewStandard')}
                              className="rounded p-1 text-indigo-600 hover:bg-indigo-50"
                            >
                              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Review */}
        {activeTab === 'review' && (
          <div className="grid grid-cols-1 gap-6">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
              <h2 className="mb-4 text-sm font-bold text-[var(--brand-foreground)]">{t('instructor.projectDetail.feedbackRequests')}</h2>
              {feedbackRequests.length === 0 ? (
                <p className="text-xs italic text-[var(--text-tertiary)]">{t('instructor.projectDetail.noReviewRequests')}</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {feedbackRequests.map(fb => (
                    <Link key={fb.id} to={`/instructor/requests/${encodeURIComponent(id)}?review=${encodeURIComponent(fb.id)}`} data-testid={`feedback-${fb.id}`} className="block rounded-lg bg-[var(--surface-secondary)] px-3 py-2 text-xs">
                      <div className="flex justify-between items-center">
                        <StatusBadge status={fb.status} />
                        <span className="text-[var(--text-tertiary)]">{fb.requestedAt ? formatDate(fb.requestedAt, i18n.language) : ''}</span>
                      </div>
                      <p className="mt-1 text-[var(--text-secondary)]">{t('instructor.projectDetail.studentLabel', { student: fb.studentName || fb.studentId })}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Project Process Report */}
        {activeTab === 'progress' && (
          <div className="h-full overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-5">
              <div className="mb-4 space-y-3">
                <div>
                  <h2 className="text-sm font-bold text-[var(--brand-foreground)]">{t('instructor.projectDetail.contributionEvidence')}</h2>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">{t('instructor.projectDetail.contributionEvidenceNote')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-secondary)] p-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                    {t('instructor.projectDetail.fromLabel')}
                    <input
                      type="date"
                      value={reportFrom}
                      max={reportTo || undefined}
                      onChange={event => {
                        setProgressReport(null);
                        setReportFrom(event.target.value);
                        if (!event.target.value) setReportTo('');
                      }}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--brand)]"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                    {t('instructor.projectDetail.toLabel')}
                    <input
                      type="date"
                      value={reportTo}
                      min={reportFrom || undefined}
                      onChange={event => {
                        setProgressReport(null);
                        setReportTo(event.target.value);
                        if (!event.target.value) setReportFrom('');
                      }}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--brand)]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => { setProgressReport(null); setReportFrom(''); setReportTo(''); }}
                    className="rounded-lg px-2 py-2 text-xs font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-soft)]"
                  >
                    {t('instructor.projectDetail.allTime')}
                  </button>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                    {t('instructor.projectDetail.studentFilter')}
                    <select
                      value={reportMemberId}
                      onChange={event => {
                        setProgressReport(null);
                        setReportMemberId(event.target.value);
                        setReportSectionId(null);
                      }}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--brand)]"
                    >
                      <option value="ALL">{t('instructor.projectDetail.allStudents')}</option>
                      {studentMembers.map(member => (
                        <option key={member.userId} value={member.userId}>{studentDisplayName(member ?? {})}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                    {t('instructor.projectDetail.sectionFilter')}
                    <select
                      value={reportSectionId || 'ALL'}
                      onChange={event => setReportSectionId(event.target.value === 'ALL' ? null : event.target.value)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--brand)]"
                    >
                      <option value="ALL">{t('instructor.projectDetail.allSections')}</option>
                      {(progressReport?.sections || []).map(section => (
                        <option key={section.sectionId} value={section.sectionId}>{section.sectionTitle}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              {progressReportError ? (
                <div role="alert" className="space-y-2 text-xs text-[var(--text-secondary)]">
                  <p>{t('instructor.projectDetail.progressLoadFailed')}</p>
                  <button type="button" onClick={loadProgressReport} className="font-bold text-[var(--brand-foreground)] hover:underline">
                    {t('instructor.projectDetail.progressRetry')}
                  </button>
                </div>
              ) : !progressReport ? (
                <p className="text-xs italic text-[var(--text-tertiary)]">{t('loading')}</p>
              ) : (
                <div className="space-y-4">
                  <div aria-label={t('instructor.projectDetail.attentionNeeded')}>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t('instructor.projectDetail.attentionNeeded')}</p>
                    {(attention.awaitingReview + attention.openFeedback + attention.unassigned.length + attention.untouched.length) === 0 ? (
                      <p className="text-xs italic text-[var(--text-tertiary)]">{t('instructor.projectDetail.noAttention')}</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {attention.awaitingReview > 0 && (
                          <button type="button" onClick={() => setActiveTab('review')} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-left text-xs hover:bg-amber-100">
                            <span className="font-bold text-amber-900">{t('instructor.projectDetail.attentionReview', { count: attention.awaitingReview })}</span>
                          </button>
                        )}
                        {attention.openFeedback > 0 && (
                          <button type="button" onClick={() => setActiveTab('review')} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-left text-xs hover:bg-amber-100">
                            <span className="font-bold text-amber-900">{t('instructor.projectDetail.attentionFeedback', { count: attention.openFeedback })}</span>
                          </button>
                        )}
                        {attention.unassigned.length > 0 && (
                          <button type="button" onClick={() => setActiveTab('sections')} className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-1.5 text-left text-xs hover:bg-[var(--surface-tertiary)]">
                            <span className="font-bold text-[var(--text-primary)]">{t('instructor.projectDetail.attentionUnassigned', { count: attention.unassigned.length })}</span>
                          </button>
                        )}
                        {attention.untouched.length > 0 && (
                          <button type="button" onClick={() => setActiveTab('sections')} className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-1.5 text-left text-xs hover:bg-[var(--surface-tertiary)]">
                            <span className="font-bold text-[var(--text-primary)]">{t('instructor.projectDetail.attentionNoEdits', { count: attention.untouched.length })}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      type="search"
                      value={progressQuery}
                      onChange={event => setProgressQuery(event.target.value)}
                      placeholder={t('instructor.projectDetail.tableSearchStudents')}
                      aria-label={t('instructor.projectDetail.tableSearchStudents')}
                      className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[var(--brand)]"
                    />
                    {progressRows.length === 0 ? (
                      <p className="text-xs italic text-[var(--text-tertiary)]">{progressReport.contributions?.length ? t('instructor.projectDetail.noStudentsFound') : t('instructor.projectDetail.noContributionData')}</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                        <table className="w-full min-w-[560px] text-xs">
                          <thead>
                            <tr className="bg-[var(--surface-secondary)] text-left text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                              {[
                                { key: 'name', label: t('instructor.projectDetail.thStudent') },
                                { key: 'assigned', label: t('instructor.projectDetail.thAssigned') },
                                { key: 'saves', label: t('instructor.projectDetail.thSaves') },
                                { key: 'lastEdit', label: t('instructor.projectDetail.thLastEdit') },
                                { key: 'open', label: t('instructor.projectDetail.thOpenFeedback') },
                              ].map(col => (
                                <th key={col.key} className="px-3 py-2 font-bold">
                                  <button type="button" onClick={() => setProgressSort(current => current.key === col.key ? { key: col.key, dir: -current.dir } : { key: col.key, dir: 1 })} className="hover:text-[var(--text-primary)]">
                                    {col.label}{progressSort.key === col.key ? (progressSort.dir === 1 ? ' ▲' : ' ▼') : ''}
                                  </button>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-light)]">
                            {progressRows.map(c => (
                              <tr key={c.userId} className="hover:bg-[var(--surface-secondary)]">
                                <td className="px-3 py-2">
                                  <button type="button" onClick={() => setReportMemberId(String(c.userId))} className="font-bold text-[var(--brand-foreground)] hover:underline" title={c.userName}>{c.userName}</button>
                                </td>
                                <td className="px-3 py-2">{c.assignedSectionCount}</td>
                                <td className="px-3 py-2">{c.saveCount}</td>
                                <td className="px-3 py-2 text-[var(--text-secondary)]">{c.lastEditedAt ? formatDateTime(c.lastEditedAt, i18n.language) : '—'}</td>
                                <td className="px-3 py-2">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.feedbackOpen ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{c.feedbackOpen}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  {reportMemberId !== 'ALL' && (() => {
                    const detail = reportContributions.find(c => String(c.userId) === String(reportMemberId));
                    if (!detail) return null;
                    return (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-bold text-[var(--text-primary)]">{detail.userName}</p>
                          <button type="button" onClick={() => setReportMemberId('ALL')} className="text-[10px] font-bold text-[var(--brand-foreground)] hover:underline">{t('instructor.projectDetail.allStudents')}</button>
                        </div>
                        {(detail.editedSections?.length > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {detail.editedSections.map(title => (
                              <button key={title} type="button" onClick={() => setActiveTab('sections')} className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100">{title}</button>
                            ))}
                          </div>
                        )}
                        {(detail.dailyWordDeltas?.length > 0) ? (
                          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                            {detail.dailyWordDeltas.map(day => (
                              <div key={day.date} className="flex items-center justify-between rounded bg-[var(--surface)] px-2 py-1 text-[10px]">
                                <span>{formatDate(`${day.date}T00:00:00Z`, i18n.language)}</span>
                                <span className="text-[var(--text-secondary)]">
                                  {day.saveCount} {t('instructor.projectDetail.savesShort')} · +{day.wordsAdded ?? Math.max(day.wordDelta, 0)}/-{day.wordsRemoved ?? Math.max(-day.wordDelta, 0)} {t('instructor.projectDetail.wordsShort')}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-[10px] italic text-[var(--text-tertiary)]">{t('instructor.projectDetail.noRecordedEdits')}</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
              <div className="mt-5 border-t border-[var(--border-light)] pt-4">
                <h3 className="mb-3 text-xs font-bold text-[var(--text-primary)]">{t('instructor.projectDetail.dailySeriesTitle')}</h3>
                <ContributionGraph buckets={dailyBuckets} emptyLabel={t('instructor.projectDetail.noContributionData')} ariaLabel={t('instructor.projectDetail.dailySeriesTitle')} />
              </div>
          </div>
        )}

        {/* Tab: Assign Students — PHASE 2+3: former Settings, Status controls removed, 2-col layout */}
        {(activeTab === 'assign-member' || activeTab === 'settings') && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-full overflow-hidden">
            {/* Left: Members list with search — expanded from 33% to 40% so search fits without horizontal scroll */}
            <div id="project-members" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 lg:col-span-2 h-full overflow-hidden flex flex-col [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
              <div className="sticky top-0 z-10 mb-3 shrink-0 bg-[var(--surface)] pb-1">
                <ActionExpandHeader title={t('instructor.projectDetail.members')} placeholder={t('instructor.projectDetail.searchStudent')} searchValue={memberSearch} onSearch={setMemberSearch} onAdd={() => { setShowAdvancedAdd(true); loadUsers(); }} addLabel={t('instructor.projectDetail.add')} hideAdd={projectReadOnly} action={selectedMemberIds.length > 0 && !projectReadOnly ? (
                  <DeleteConfirm
                    message={t('instructor.projectDetail.removeSelectedMembersConfirm', { count: selectedMemberIds.length })}
                    onConfirm={handleRemoveSelectedMembers}
                    triggerLabel={t('instructor.projectDetail.removeSelectedMembers')}
                    confirmLabel={t('instructor.projectDetail.removeSelectedMembers')}
                    cancelLabel={t('cancel')}
                    className="group flex h-8 w-8 shrink-0 items-center justify-center gap-0 overflow-hidden rounded-lg bg-rose-600 text-white transition-all duration-300 hover:w-24 hover:gap-1.5 hover:bg-rose-700"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current" strokeWidth="2"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                    <span className="hidden whitespace-nowrap text-xs font-bold group-hover:inline">Remove?</span>
                  </DeleteConfirm>
                ) : null} />
              </div>
              {filteredMembers.length === 0 ? (
                <p className="text-xs italic text-[var(--text-tertiary)]">{memberSearch ? t('instructor.projectDetail.noStudentsFound') : t('instructor.projectDetail.noStudentsAssigned')}</p>
              ) : (
                <div className="space-y-1 pr-1 flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                  {filteredMembers.map(m => {
                    const isSelected = selectedMember && String(selectedMember.userId||selectedMember.id) === String(m.userId||m.id);
                    const isLeader = m.role === 'LEADER';
                    const checked = selectedMemberIds.includes(String(m.userId||m.id));
                    return (
                       <div key={m.userId} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${isSelected ? 'border border-indigo-200 bg-[var(--brand-soft)] text-[var(--brand-foreground)]' : 'bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)]'}`}>
                         <input
                           type="checkbox"
                           checked={checked}
                           onChange={() => toggleMemberSelection(m.userId||m.id)}
                           disabled={projectReadOnly}
                           aria-label={`${t('instructor.projectDetail.selectSection')} ${studentDisplayName(m ?? {})}`}
                           className="h-3.5 w-3.5 shrink-0 accent-indigo-600 disabled:opacity-50"
                         />
                          <button data-testid={`member-${m.userId}`} onClick={()=>setSelectedMemberId(String(m.userId))} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                            <div className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{studentDisplayName(m ?? {})}</span>
                              <span className="block truncate text-[10px] text-[var(--text-tertiary)]">{m.email}{m.studentCode ? ` · ${m.studentCode}` : ''}</span>
                            </div>
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${isLeader ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-600'}`}>
                              {t(`instructor.projectDetail.projectRole.${PROJECT_ROLES.includes(m.role) ? m.role : 'UNKNOWN'}`)}
                            </span>
                          </button>
                          <DeleteConfirm message={t('instructor.projectDetail.removeMemberConfirm')} onConfirm={()=>{handleRemoveMember(m.userId||m.id); if (String(selectedMemberId) === String(m.userId||m.id)) setSelectedMemberId(null);}} triggerLabel={`${t('instructor.projectDetail.remove')}: ${studentDisplayName(m ?? {})}`} confirmLabel={t('instructor.projectDetail.remove')} cancelLabel={t('cancel')} disabled={projectReadOnly} className="shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
                          </DeleteConfirm>
                       </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Right: Selected member detail — PHASE 2 */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 lg:col-span-3 h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
              {!selectedMember ? (
                <div className="flex h-full min-h-[200px] items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-secondary)] p-6 text-center">
                  <p className="text-xs text-[var(--text-tertiary)]">{t('instructor.projectDetail.selectMemberToView')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] text-sm font-black text-white">{(selectedMember.firstName?.[0]||selectedMember.email?.[0]||'U').toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-[var(--brand-foreground)]">{studentDisplayName(selectedMember ?? {})}{selectedMember.studentCode ? ` - ${selectedMember.studentCode}` : ''}</h3>
                      <p className="truncate text-xs text-[var(--text-tertiary)]">{selectedMember.email}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">{t(`instructor.projectDetail.userRole.${USER_ROLES.includes(selectedMember.userRole) ? selectedMember.userRole : 'UNKNOWN'}`)}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${selectedMember.role === 'LEADER' ? 'bg-indigo-100 text-indigo-800' : 'bg-[var(--surface-tertiary)] text-[var(--text-secondary)]'}`}>{t(`instructor.projectDetail.projectRole.${PROJECT_ROLES.includes(selectedMember.role) ? selectedMember.role : 'UNKNOWN'}`)}</span>
                      </div>
                      {selectedMember.role !== 'INSTRUCTOR' && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--text-secondary)]">{t('instructor.projectDetail.editMemberRole')}:</span>
                          <select value={selectedMember.role} onChange={e=>handleUpdateMemberRole(selectedMember.userId, e.target.value)} disabled={projectReadOnly || updatingMemberId!==null} className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs outline-none disabled:opacity-50">
                            <option value="MEMBER">{t('instructor.projectDetail.memberRole')}</option>
                            <option value="LEADER">{t('instructor.projectDetail.leaderRole')}</option>
                          </select>
                        </div>
                      )}
                  {(() => {
                    // ponytail: report sections span all papers; fall back to the
                    // selected paper's draft-state sections before the report loads.
                    const pool = (progressReport?.sections?.length
                      ? progressReport.sections.map(s => ({ id: s.sectionId, sectionTitle: s.sectionTitle, assignedUserId: s.assignedUserId }))
                      : sections);
                    const memberSections = pool.filter(s => String(s.assignedUserId) === String(selectedMember.userId));
                    const perf = (progressReport?.contributions || []).find(c => String(c.userId) === String(selectedMember.userId));
                    const openFb = feedbackRequests.filter(fb => String(fb.studentId) === String(selectedMember.userId) && (fb.status === 'PENDING' || fb.status === 'RETURNED'));
                    return (
                      <div className="space-y-3 border-t border-[var(--border-light)] pt-4 text-xs">
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase text-[var(--text-tertiary)]">{t('instructor.projectDetail.memberAssignedSections')} ({memberSections.length})</p>
                          {memberSections.length === 0 ? (
                            <p className="text-xs italic text-[var(--text-tertiary)]">{t('instructor.projectDetail.noAssignedSections')}</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {memberSections.map(s => (
                                <button key={s.id} type="button" onClick={() => setActiveTab('sections')} className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100">{s.sectionTitle || t('untitled')}</button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">{t('instructor.projectDetail.lastRecordedEdit')}</p>
                          {perf?.lastEditedAt ? (
                            <p className="mt-0.5 text-xs text-[var(--text-primary)]">{formatDateTime(perf.lastEditedAt, i18n.language)} <span className="text-[var(--text-tertiary)]">· {t('instructor.projectDetail.memberLastEditNote')}</span></p>
                          ) : (
                            <p className="mt-0.5 text-xs italic text-[var(--text-tertiary)]">{t('instructor.projectDetail.memberNoActivity')}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${openFb.length ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{t('instructor.projectDetail.memberOpenFeedback')}: {openFb.length}</span>
                          {openFb.length > 0 && (
                            <button type="button" onClick={() => setActiveTab('review')} className="text-[11px] font-bold text-[var(--brand-foreground)] hover:underline">{t('instructor.projectDetail.memberView')}</button>
                          )}
                          <button type="button" onClick={() => { setShowEditPaper(true); }} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-soft)]">{t('instructor.projectDetail.memberAssignSections')}</button>
                          <button type="button" onClick={() => { setReportMemberId(String(selectedMember.userId)); setActiveTab('progress'); }} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--brand-foreground)] hover:bg-[var(--brand-soft)]">{t('instructor.projectDetail.memberViewProgress')}</button>
                        </div>
                      </div>
                    );
                  })()}
                  </div>
                </div>
              </div>
              )}
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Phase 3: Add Students — with local search */}
      <Modal open={showAdvancedAdd} onClose={()=>{setShowAdvancedAdd(false); setAdvancedSelectedIds([]); setAdvancedSearch(''); setAdvancedPage(0);}} title={t('instructor.projectDetail.addStudents')}>
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-secondary)]">{t('instructor.projectDetail.addStudentsHint')}</p>
          <div className="relative">
            <svg aria-hidden="true" viewBox="0 0 16 16" className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 fill-[var(--text-tertiary)]"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0" /></svg>
            <input value={advancedSearch} onChange={e=>{setAdvancedSearch(e.target.value); setAdvancedPage(0);}} placeholder={t('instructor.projectDetail.searchNameOrEmail')} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] py-2 pl-8 pr-3 text-xs outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]" />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] divide-y divide-[var(--border-light)]">
            {advancedPaging.total===0 ? <p className="p-3 text-xs italic text-[var(--text-tertiary)]">{t('instructor.projectDetail.noStudentsFound')}</p> : advancedPaging.items.map(st=> {
              const checked = advancedSelectedIds.includes(String(st.id));
              return (
                <label key={st.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--surface-secondary)]">
                  <input type="checkbox" checked={checked} onChange={e=> setAdvancedSelectedIds(cur=> e.target.checked ? [...cur, String(st.id)] : cur.filter(id=>id!==String(st.id)))} />
                  <span className="min-w-0 flex-1 truncate">{studentDisplayName(st)} <span className="text-[10px] text-[var(--text-tertiary)]">({st.email}{st.studentCode ? ` · ${st.studentCode}` : ''})</span></span>
                  <select value={advancedRoleMap[st.id]||'MEMBER'} onChange={e=> setAdvancedRoleMap(m=>({...m,[st.id]:e.target.value}))} onClick={e=>e.stopPropagation()} className="rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-[10px]">
                    <option value="MEMBER">{t('instructor.projectDetail.memberRole')}</option><option value="LEADER">{t('instructor.projectDetail.leaderRole')}</option>
                  </select>
                </label>
              )
            })}
          </div>
          {advancedPaging.totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-[var(--text-secondary)]">
              <span>{t('instructor.projectDetail.suggestionPager', { shown: advancedPaging.items.length, total: advancedPaging.total })}</span>
              <span className="flex items-center gap-1">
                <span>{t('instructor.projectDetail.page')} {advancedPaging.page + 1}/{advancedPaging.totalPages}</span>
                <button type="button" disabled={advancedPaging.page === 0} onClick={() => setAdvancedPage(p => Math.max(0, p - 1))} className="rounded px-1.5 py-0.5 hover:bg-[var(--surface-secondary)] disabled:opacity-40">{t('instructor.projectDetail.prev')}</button>
                <button type="button" disabled={advancedPaging.page >= advancedPaging.totalPages - 1} onClick={() => setAdvancedPage(p => p + 1)} className="rounded px-1.5 py-0.5 hover:bg-[var(--surface-secondary)] disabled:opacity-40">{t('instructor.projectDetail.next')}</button>
              </span>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={()=>{setShowAdvancedAdd(false); setAdvancedSelectedIds([]); setAdvancedSearch(''); setAdvancedPage(0);}} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold">{t('cancel')}</button>
            <button onClick={handleAdvancedAddMultiple} disabled={advancedSelectedIds.length===0} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{t('instructor.projectDetail.add')} {advancedSelectedIds.length ? `(${advancedSelectedIds.length})` : ''}</button>
          </div>
        </div>
      </Modal>

      {/* Phase 4: Document preview modal — reuses FileViewerModal (SourceLibraryPanel / Student Workspace) */}
      <Modal open={showSourceDetail} onClose={() => setShowSourceDetail(false)} title={t('instructor.projectDetail.sourceDetail')}>
        {sourceDetail && (
          <div className="space-y-3 text-xs">
            <div><span className="font-bold text-[var(--text-secondary)]">{t('instructor.projectDetail.titleLabel')}</span> <span>{sourceDetail.title || '-'}</span></div>
            <div><span className="font-bold text-[var(--text-secondary)]">{t('instructor.projectDetail.filenameLabel')}</span> <span>{sourceDetail.originalFilename || '-'}</span></div>
            <div><span className="font-bold text-[var(--text-secondary)]">DOI:</span> <span className="font-mono">{sourceDetail.doi || '-'}</span></div>
            <div><span className="font-bold text-[var(--text-secondary)]">{t('instructor.projectDetail.status')}:</span> <StatusBadge status={sourceDetail.processingStatus || 'READY'} /></div>
            <div><span className="font-bold text-[var(--text-secondary)]">{t('instructor.projectDetail.typeLabel')}</span> <span>{t(`instructor.projectDetail.documentType.${DOCUMENT_TYPES.includes(sourceDetail.docType) ? sourceDetail.docType : 'UNKNOWN'}`)}</span></div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setShowSourceDetail(false); setViewerFile({ fileUrl: API_ROUTES.DOCUMENTS.DOWNLOAD(sourceDetail.id), fileName: sourceDetail.originalFilename || sourceDetail.title }); }} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)]">{t('instructor.projectDetail.previewSource')}</button>
              <button onClick={() => setShowSourceDetail(false)} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:opacity-80">{t('close')}</button>
            </div>
          </div>
        )}
      </Modal>
      {viewerFile && <FileViewerModal fileUrl={viewerFile.fileUrl} fileName={viewerFile.fileName} onClose={() => setViewerFile(null)} />}

      <UniversalDocumentIngestionModal
        open={showAddSource}
        onClose={() => setShowAddSource(false)}
        entityType={ENTITY_TYPES.PROJECT}
        entityId={id}
        existingSourceIds={sources.map(s => s.id)}
        onSuccess={() => {
          loadSources();
          loadPapers();
        }}
        allowedTabs={DEFAULT_PROJECT_INGESTION_TABS}
      />

      <Modal open={showSetUpPaper} onClose={() => setShowSetUpPaper(false)} title={t('instructor.projectDetail.setUpPaper')}>
        {sectionStructureLocked ? (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-amber-800" strokeWidth="2"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              <span className="text-amber-800">
                {projectReadOnly ? t('instructor.projectDetail.setupLockedReadOnly') : t('instructor.projectDetail.setupLockedAssigned')}
              </span>
            </div>
          <div className="flex justify-end">
              <button onClick={() => setShowSetUpPaper(false)} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:opacity-80">{t('close')}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 text-xs">
            <div className="flex gap-1 rounded-lg bg-[var(--surface-tertiary)] p-1">
              <button onClick={() => setSetupMode('standard')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition ${setupMode === 'standard' ? 'bg-[var(--surface)] text-[var(--brand-foreground)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 2h6v4H9zM8 10h8M8 14h8M8 18h5" /></svg>
                {t('instructor.projectDetail.chooseStandard')}
              </button>
              <button onClick={() => setSetupMode('paper')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition ${setupMode === 'paper' ? 'bg-[var(--surface)] text-[var(--brand-foreground)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M6 2h8l4 4v16H6zM14 2v5h5M9 13h6M12 10v6" /></svg>
                {t('instructor.projectDetail.uploadPaper')}
              </button>
            </div>

            {setupMode === 'standard' && (
              <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
                <h3 className="font-bold text-[var(--brand-foreground)]">{t('instructor.projectDetail.chooseStandard')}</h3>
                <p className="text-[var(--text-tertiary)]">{t('instructor.projectDetail.chooseStandardDesc')}</p>
                <select value={standard} onChange={e => setStandard(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none">
                  <option value="">{t('instructor.projectDetail.noStandard')}</option>
                  {STANDARDS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={handleUpdateStandard} disabled={saving} className="rounded-lg bg-[var(--brand)] px-4 py-2 font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">{saving ? t('saving') : t('instructor.projectDetail.saveStandard')}</button>
              </div>
            )}

            {setupMode === 'paper' && (
              <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
                <h3 className="font-bold text-[var(--brand-foreground)]">{t('instructor.projectDetail.uploadPaper')}</h3>
                <p className="text-[var(--text-tertiary)]">{t('instructor.projectDetail.uploadPaperDesc')}</p>
                <input type="file" accept=".pdf,.docx" onChange={(e) => { handleUploadPaper(e); setShowSetUpPaper(false); }} className="text-xs" />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSetUpPaper(false)} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:opacity-80">{t('cancel')}</button>
            </div>
          </div>
        )}
      </Modal>
      <EditPaperSectionModal
        open={showEditPaper}
        paper={selectedPaper}
        sections={displaySections}
        serverSections={sections}
        sectionEvals={sectionEvals}
        projectMembers={projectMembers}
        users={users}
        projectReadOnly={projectReadOnly}
        // ponytail: status-only — per-section assigned locks are enforced
        // inside the modal + BE. Setup-level sectionStructureLocked stays
        // global (whole-paper ops are destructive).
        sectionStructureLocked={projectReadOnly}
        sectionStructureSaving={sectionStructureSaving}
        conflictSectionId={conflictSectionId}
        onClose={() => setShowEditPaper(false)}
        onDraftChange={setDraftSections}
        onSave={handleSaveAllSections}
        onDiscard={handleDiscardSectionDraft}
        onAddSection={handleAddSection}
        onDeleteSection={handleDeleteSection}
        onSavePaperRename={handleSaveRename}
        onStartRename={handleStartSectionRename}
        onSaveRename={handleSaveSectionRename}
        onReloadConflict={handleReloadConflictSection}
        onSaveStandard={saveSectionStandard}
        onUnassignAll={handleUnassignAll}
        onApplyAssignmentsNow={handleApplyAssignmentsNow}
        t={paperEditorT}
        ct={ct}
      />

      <StandardRequirementsModal
        open={Boolean(standardViewSection)}
        section={standardViewSection}
        requirements={standardViewSection ? sectionEvals[String(standardViewSection.id)]?.requirements || [] : []}
        title={t('instructor.projectDetail.viewStandard')}
        requirementsLabel={t('instructor.projectDetail.standardRequirements')}
        emptyLabel={t('instructor.projectDetail.noStandardRequirements')}
        closeLabel={t('close')}
        onClose={() => setStandardViewSectionId(null)}
      />

      <ProjectEditModal
        open={showEditProject}
        project={project}
        saving={savingProjectEdit}
        onClose={() => setShowEditProject(false)}
        onSave={handleUpdateProject}
        t={t}
      />

      <Modal open={showExportModal} onClose={() => setShowExportModal(false)} title={t('instructor.projectDetail.export')}>
        <div className="space-y-3 text-xs">
          <button onClick={async () => {
            try {
              const r = await api.get(`/api/projects/${id}/export?format=tex`, { responseType: 'blob' });
              const url = URL.createObjectURL(r.data);
              const a = document.createElement('a'); a.href = url; a.download = `papers-${project?.title || 'export'}.zip`;
              a.click(); URL.revokeObjectURL(url);
              setShowExportModal(false);
            } catch { alert(t('instructor.projectDetail.exportFailed')); }
          }} className="w-full rounded-lg bg-emerald-50 px-4 py-3 text-left font-medium text-emerald-800 transition hover:bg-emerald-100">
            {t('instructor.projectDetail.paperArchive')}
            <span className="block text-[10px] font-normal text-emerald-900/70">{t('instructor.projectDetail.paperArchiveDesc')}</span>
          </button>
          <button onClick={async () => {
            try {
              const r = await api.get(`/api/projects/${id}/traceability`);
              const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `project-data-${project?.title || 'export'}.json`;
              a.click(); URL.revokeObjectURL(url);
              setShowExportModal(false);
            } catch { alert(t('instructor.projectDetail.exportFailed')); }
          }} className="w-full rounded-lg bg-emerald-50 px-4 py-3 text-left font-medium text-emerald-800 transition hover:bg-emerald-100">
            {t('instructor.projectDetail.traceabilityJson')}
            <span className="block text-[10px] font-normal text-emerald-900/70">{t('instructor.projectDetail.traceabilityJsonDesc')}</span>
          </button>
          <button onClick={async () => {
            try {
              const r = await api.get(`/api/projects/${id}/traceability/csv`, { responseType: 'blob' });
              const url = URL.createObjectURL(r.data);
              const a = document.createElement('a'); a.href = url; a.download = `project-data-csv-${project?.title || 'export'}.zip`;
              a.click(); URL.revokeObjectURL(url);
              setShowExportModal(false);
            } catch { alert(t('instructor.projectDetail.exportFailed')); }
          }} className="w-full rounded-lg bg-emerald-50 px-4 py-3 text-left font-medium text-emerald-800 transition hover:bg-emerald-100">
            {t('instructor.projectDetail.traceabilityCsv')}
            <span className="block text-[10px] font-normal text-emerald-900/70">{t('instructor.projectDetail.traceabilityCsvDesc')}</span>
          </button>
          <div className="flex justify-end">
            <button onClick={() => setShowExportModal(false)} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:opacity-80">{t('cancel')}</button>
          </div>
        </div>
      </Modal>

      {uploadState && (
        <Modal open={true} onClose={() => {}} title="">
          <Marker role="status">
            <MarkerIcon>
              <Spinner className="animate-spin h-8 w-8 text-indigo-600" />
            </MarkerIcon>
            <MarkerContent className="shimmer-text">
              {uploadState === 'uploading' ? t('instructor.projectDetail.uploadingPaper') : t('instructor.projectDetail.processingSections')}
            </MarkerContent>
          </Marker>
        </Modal>
      )}
    </div>
  );
}
