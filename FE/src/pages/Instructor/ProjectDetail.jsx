import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { AppHeader, LoadingSkeleton, StatusBadge, Modal, TourLauncher, Spinner } from '../../components';
import FileViewerModal from '../../components/FileViewerModal';
import { Marker, MarkerIcon, MarkerContent } from '../../components/Marker';
import { instructorText, commonText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../api';
import {
  getSourceShareChanges,
  getBlockedSources,
  isSourceShareable,
  isSourceSharedWithProject,
} from './sourceShareSelection';
import { getStudentSuggestions, studentDisplayName } from './studentSearch';
import useUndoDelete, { UndoToast } from '../../components/UndoDelete.jsx';
import DeleteConfirm from '../../components/DeleteConfirm.jsx';
import ActionExpandHeader from './components/ActionExpandHeader.jsx';
import ContributionGraph from './components/ContributionGraph.jsx';
import SectionManager from './components/sections/SectionManager.jsx';
import { useAuth } from '../../context/AuthContext';

const STANDARDS = ['IEEE', 'ACM', 'SPRINGER_LNCS', 'APA', 'MLA', 'CUSTOM'];
const MODAL_PAGE_SIZE = 20;
const reportDate = (daysAgo) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { user } = useAuth();
  const ct = commonText[language];
  const t = instructorText[language];
  const { pending: pendingDelete, start: startDelete, undo: undoDelete, dismiss: dismissDelete } = useUndoDelete();
  const undoStrings = {
    header: t.undoHeader,
    bodyTemplate: t.undoBodyTemplate,
    caution: t.undoCaution,
    undoLabel: t.undoLabel,
    undoRemaining: t.undoRemaining,
    dismissLabel: t.dismissLabel,
  };
  const [activeTab, setActiveTab] = useState('setup');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState(null);
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
  const [checkpointDiff, setCheckpointDiff] = useState(null);
  const [reportSectionId, setReportSectionId] = useState(null);
  const [reportMemberId, setReportMemberId] = useState('ALL');
  const [reportFrom, setReportFrom] = useState(() => reportDate(29));
  const [reportTo, setReportTo] = useState(() => reportDate(0));
  const [users, setUsers] = useState([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberId, setNewMemberId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('MEMBER');
  const [memberQuery, setMemberQuery] = useState('');
  const [memberSuggestionsOpen, setMemberSuggestionsOpen] = useState(false);
  const [highlightedStudentIndex, setHighlightedStudentIndex] = useState(0);
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
  const [standardSuggestion, setStandardSuggestion] = useState(null);
  const [standardSuggestionLoading, setStandardSuggestionLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [addSourceLoading, setAddSourceLoading] = useState(false);
  const [shareLoadingId, setShareLoadingId] = useState(null);
  const [pendingAssign, setPendingAssign] = useState(null); // { sectionId, userId, userName }
  const [statusPending, setStatusPending] = useState(null);
  // Phase 2: Assign Member local state
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [sourceSearch, setSourceSearch] = useState('');
  const [showAdvancedAdd, setShowAdvancedAdd] = useState(false);
  const [advancedSelectedIds, setAdvancedSelectedIds] = useState([]);
  const [advancedRoleMap, setAdvancedRoleMap] = useState({});
  const [advancedSearch, setAdvancedSearch] = useState('');
  // Phase 4: document preview (reuse FileViewerModal from Student Workspace / SourceLibraryPanel)
  const [viewerFile, setViewerFile] = useState(null);
  // Section Standard AI pipeline — per-section checklist + passThreshold + strict evaluation
  const [sectionEvals, setSectionEvals] = useState({}); // sectionId -> {status, scorePercent, resultJson, errorMessage}
  const [evaluatingSectionId, setEvaluatingSectionId] = useState(null);
  const sectionLoadRequestRef = useRef(0);
  const anyDirty = draftDirty;

  const collectionSources = useMemo(
    () => Object.values(collectionSourcePages).flat(),
    [collectionSourcePages],
  );
  const visibleCollectionSources = collectionSourcePages[collectionSourcePage] || [];

  const loadProject = useCallback(async () => {
    try {
      setLoading(true);
      const [projRes, memRes] = await Promise.all([
        api.get(`/api/projects/${id}`),
        api.get(`/api/projects/${id}/members`).catch(() => ({ data: [] })),
      ]);
      setProject(projRes.data);
      setStandard(projRes.data.targetStandard || '');
      setMembers(memRes.data || []);
    } catch { navigate('/instructor/projects'); }
    finally { setLoading(false); }
  }, [id, navigate]);

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

  const runStandardCheck = async (sectionId) => {
    if (!selectedPaper) return;
    setEvaluatingSectionId(sectionId);
    try {
      const { data } = await api.post(`/api/papers/${selectedPaper.id}/sections/${sectionId}/standard-evaluation`);
      setSectionEvals(prev => ({ ...prev, [String(sectionId)]: data }));
    } catch (err) {
      alert(err?.response?.data?.message || t.standardEvaluationFailed);
    } finally { setEvaluatingSectionId(null); }
  };

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
      alert(err?.response?.data?.message || t.standardSaveFailed);
      return false;
    }
  };

  const loadFeedback = useCallback(async () => {
    try {
      const fbRes = await api.get('/api/feedback-requests');
      const projectFbs = (fbRes.data || []).filter(fb => fb.projectId === id);
      setFeedbackRequests(projectFbs);
    } catch { }
  }, [id]);

  const loadProgressReport = useCallback(async () => {
    try {
      let resolution = 'month';
      if (reportFrom && reportTo) {
        const diffDays = Math.ceil((new Date(reportTo) - new Date(reportFrom)) / (1000 * 60 * 60 * 24));
        if (diffDays < 14) resolution = 'day';
        else if (diffDays <= 84) resolution = 'week';
      }

      const [progRes, diffRes] = await Promise.all([
        api.get(`/api/projects/${id}/progress-report`, {
          params: {
            memberFilter: reportMemberId,
            ...(reportFrom && reportTo ? { from: reportFrom, to: reportTo } : {}),
            resolution,
          },
        }).catch(() => null),
        api.get(`/api/projects/${id}/checkpoints/diff`).catch(() => null),
      ]);
      setProgressReport(progRes?.data || null);
      setCheckpointDiff(diffRes?.data || null);
    } catch { }
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
      setSources(res.data || []);
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

  const sectionDiff = useMemo(() => {
    if (!checkpointDiff) return null;
    return {
      ...checkpointDiff,
      sectionWordDeltas: (checkpointDiff.sectionWordDeltas || [])
        .filter(d => !reportSectionId || String(d.sectionId) === String(reportSectionId)),
    };
  }, [checkpointDiff, reportSectionId]);

  const contributionBuckets = useMemo(() => {
    if (!progressReport?.contributions) return [];
    
    // Aggregate by member instead of date
    return progressReport.contributions.map(c => ({
      label: c.userName || 'Unknown',
      count: c.saveCount || 0
    }));
  }, [progressReport]);

  const studentSuggestions = useMemo(
    () => getStudentSuggestions(users, members, memberQuery),
    [users, members, memberQuery],
  );
  const studentMembers = useMemo(
    () => members.filter(member => member.userRole === 'STUDENT'),
    [members],
  );

  // Phase 2 & 3: filtered members for Assign Member search + selection
  const filteredMembers = useMemo(() => {
    let filtered = members;
    if (user?.id) {
      filtered = filtered.filter(m => String(m.userId) !== String(user.id));
    }
    if (!memberSearch.trim()) return filtered;
    const q = memberSearch.toLowerCase();
    return filtered.filter(m => studentDisplayName(m).toLowerCase().includes(q) || m.email?.toLowerCase().includes(q) || String(m.userRole||'').toLowerCase().includes(q));
  }, [members, memberSearch, user?.id]);

  const filteredSources = useMemo(() => {
    if (!sourceSearch.trim()) return sources;
    const q = sourceSearch.toLowerCase();
    return sources.filter(s => (s.title||'').toLowerCase().includes(q) || (s.originalFilename||'').toLowerCase().includes(q) || (s.doi||'').toLowerCase().includes(q));
  }, [sources, sourceSearch]);

  const advancedFilteredStudents = useMemo(() => {
    const q = advancedSearch.trim().toLowerCase();
    const list = getStudentSuggestions(users, members, '');
    if (!q) return list;
    return list.filter(s => studentDisplayName(s).toLowerCase().includes(q) || (s.email?.toLowerCase() ?? '').includes(q));
  }, [users, members, advancedSearch]);

  const selectedMember = useMemo(() => {
    if (selectedMemberId) return members.find(m => String(m.userId) === String(selectedMemberId)) || members.find(m => String(m.id) === String(selectedMemberId)) || null;
    return members[0] || null;
  }, [members, selectedMemberId]);

  useEffect(() => {
    if (activeTab === 'review') loadFeedback();
    if (activeTab === 'progress') loadProgressReport();
  }, [activeTab, loadFeedback, loadProgressReport]);

  // Phase 1: migrate old 'settings' tab key to 'assign-member'
  useEffect(() => { if (activeTab === 'settings') setActiveTab('assign-member'); }, [activeTab]);

  // Phase 2: auto-select first member when members load
  useEffect(() => {
    if (members.length > 0 && !selectedMemberId) setSelectedMemberId(String(members[0].userId || members[0].id));
    if (members.length === 0) setSelectedMemberId(null);
  }, [members, selectedMemberId]);

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
    } catch { alert(t.updateStandardFailed); }
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
        setDoiErrors(prev => prev.map(e => e.doi === specificDoi ? { ...e, error: err?.response?.data?.message || 'Network error' } : e));
      } else {
        setDoiErrors([{ doi: 'batch', error: err?.response?.data?.message || 'Network/Server Error: Could not complete ingestion' }]);
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
    } catch { alert(t.uploadFailed); return false; }
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

  const handleUploadPaper = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', id);
    setUploadState('uploading');
    setStandardSuggestion(null);
    try {
      const { data: doc } = await api.post('/api/papers', formData);
      setSelectedPaper(doc);
      setUploadState('processing');
      loadPapers();
      loadProject();
      if (doc?.id) loadSections(doc.id);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data || t.uploadFailed;
      if (err?.response?.status === 409) {
        alert(msg);
      } else {
        alert(t.uploadFailed);
      }
      setUploadState(null);
    }
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
      alert(t.operationFailed);
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
      alert(`${t.sourceNotReady}: ${blocked.map(b => `${b.title} (${b.status})`).join(', ')}`);
      return;
    }
    const titles = new Map(collectionSources.map(source => [String(source.id), source.title || source.originalFilename || source.id]));
    const requests = [
      ...toShare.map(sourceId => ({ id: sourceId, promise: api.post(
        `/api/collections/${selectedCollectionId}/sources/${sourceId}/share-to-project/${id}`) })),
      ...toUnshare.map(sourceId => ({ id: sourceId, promise: api.delete(
        `/api/sources/projects/${id}/sources/${sourceId}`) })),
    ];
    setShareLoadingId(selectedCollectionId);
    try {
      const results = await Promise.allSettled(requests.map(request => request.promise));
      await Promise.all([loadSources(), loadCollectionSources(selectedCollectionId)]);
      const failed = requests.filter((request, index) => results[index].status === 'rejected');
      if (failed.length > 0) {
        alert(`${t.operationFailed}: ${failed.map(request => titles.get(String(request.id)) || request.id).join(', ')}`);
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
      alert(t.operationFailed);
    } finally {
      setShareLoadingId(null);
    }
  };

  const handleStartRename = (paper) => {
    setEditingPaperId(paper.id);
    setEditingPaperTitle(paper.title || paper.originalFilename || '');
  };

  const handleSaveRename = async (paperId) => {
    if (!editingPaperTitle.trim()) return;
    try {
      const newTitle = editingPaperTitle.trim();
      const newFilename = newTitle.endsWith('.tex') ? newTitle : newTitle + '.tex';
      await api.put(`/api/papers/${paperId}`, null, { params: { title: newTitle, originalFilename: newFilename } });
      setEditingPaperId(null);
      await loadPapers();
    } catch { alert(t.renameFailed); }
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
  const handleSaveAllSections = async () => {
    if (!selectedPaper || !anyDirty || pendingDelete) return;
    setSectionStructureSaving(true);
    setConflictSectionId(null);
    try {
      const payload = {
        sections: draftSections.map((s, idx) => ({
          id: s.id,
          sectionOrder: idx,
          sectionTitle: s.sectionTitle,
          assignedUserId: s.assignedUserId || null,
          contentTex: s.contentTex,
          expectedRevision: s.revision ?? s.optVersion ?? null,
        }))
      };
      const { data } = await api.put(`/api/papers/${selectedPaper.id}/sections/batch`, payload);
      setSections(data || []);
      setDraftSections(data || []);
    } catch (err) {
      const fieldErrors = err?.response?.data?.fieldErrors;
      const sid = fieldErrors?.sectionId || err?.response?.data?.details?.sectionId;
      if (err?.response?.status === 409 && sid) {
        setConflictSectionId(String(sid));
      } else {
        alert(err?.response?.data?.message || t.reorderSectionsFailed);
      }
    } finally {
      setSectionStructureSaving(false);
    }
  };

  const handleAddSection = async () => {
    if (!selectedPaper) return;
    setSectionStructureSaving(true);
    try {
      await api.post(`/api/papers/${selectedPaper.id}/sections/create`, null, {
        params: { title: t.newSectionTitle },
      });
      await loadSections(selectedPaper.id);
    } catch (err) {
      alert(err?.response?.data?.message || t.addSectionFailed);
    } finally {
      setSectionStructureSaving(false);
    }
  };

  const handleStartSectionRename = (section) => {
    setEditingSectionId(section.id);
    setEditingSectionTitle(section.sectionTitle);
  };

  const handleSaveSectionRename = async (sectionId) => {
    if (!editingSectionTitle.trim() || !selectedPaper) return;
    // Draft-only — no API (Mandate 1)
    setDraftSections(prev => prev.map(s => String(s.id) === String(sectionId) ? { ...s, sectionTitle: editingSectionTitle.trim() } : s));
    setEditingSectionId(null);
  };

  const handleDeleteSection = async (sectionId) => {
    if (!selectedPaper) return;
    const serverIndex = sections.findIndex(s => String(s.id) === String(sectionId));
    const draftIndex = draftSections.findIndex(s => String(s.id) === String(sectionId));
    const section = sections[serverIndex] || draftSections[draftIndex];
    const draftSection = draftSections[draftIndex];
    const restoreAt = (items, item, index) => {
      if (!item || items.some(s => String(s.id) === String(item.id))) return items;
      const next = [...items];
      next.splice(Math.max(0, index), 0, item);
      return next;
    };
    setSections(prev => prev.filter(s => String(s.id) !== String(sectionId)));
    setDraftSections(prev => prev.filter(s => String(s.id) !== String(sectionId)));
    startDelete({
      ...undoStrings,
      entityName: section?.sectionTitle || sectionId,
      entityDetails: sectionId,
    }, async () => {
      try {
        await api.delete(`/api/papers/${selectedPaper.id}/sections/${sectionId}`);
      } catch (err) {
        setSections(prev => restoreAt(prev, section, serverIndex));
        setDraftSections(prev => restoreAt(prev, draftSection || section, draftIndex));
        alert(err?.response?.data?.message || t.deleteSectionFailed);
      }
    }, async () => {
      setSections(prev => restoreAt(prev, section, serverIndex));
      setDraftSections(prev => restoreAt(prev, draftSection || section, draftIndex));
    });
  };

  const handleRemoveSource = async (sourceId) => {
    const src = sources.find(s => String(s.id) === String(sourceId));
    setSources(prev => prev.filter(s => String(s.id) !== String(sourceId)));
    startDelete({
      ...undoStrings,
      entityName: src?.title || src?.originalFilename || sourceId,
      entityDetails: sourceId,
    }, async () => {
      try {
        await api.delete(`/api/sources/projects/${id}/sources/${sourceId}`);
      } catch (err) {
        alert(err?.response?.data?.message || t.removeSourceFailed);
      }
      await loadSources();
    }, async () => {
      await loadSources();
    });
  };

  const handleAssignSection = async (sectionId, userId) => {
    const section = displaySections.find(s => String(s.id) === String(sectionId));
    if (!userId) return handleConfirmAssign(null, sectionId);
    if (!section?.assignedUserId) {
      const member = projectMembers.find(m => String(m.userId) === String(userId));
      setPendingAssign({ sectionId, userId, userName: studentDisplayName(member ?? {}) });
      return;
    }
    handleConfirmAssign(userId, sectionId);
  };

  const handleConfirmAssign = async (userId, sectionId) => {
    setPendingAssign(null);
    // Draft-only for assignment too (Mandate 1) — persists on Save Changes batch
    setDraftSections(prev => prev.map(s => String(s.id) === String(sectionId) ? { ...s, assignedUserId: userId || null } : s));
  };

  const handleReloadConflictSection = async (sectionId) => {
    try {
      const { data } = await api.get(`/api/papers/${selectedPaper.id}/sections/${sectionId}/history`);
      const fresh = { ...data, revision: data.revision ?? data.optVersion };
      setSections(prev => prev.map(s => String(s.id) === String(sectionId) ? { ...s, ...fresh } : s));
      setDraftSections(prev => prev.map(s => String(s.id) === String(sectionId) ? { ...s, ...fresh } : s));
      setConflictSectionId(null);
    } catch { alert(t.operationFailed); }
  };

  const closeAddMemberModal = () => {
    setShowAddMember(false);
    setNewMemberId('');
    setNewMemberRole('MEMBER');
    setMemberQuery('');
    setMemberSuggestionsOpen(false);
    setHighlightedStudentIndex(0);
  };

  const selectStudent = (student) => {
    setNewMemberId(student.id);
    setMemberQuery(studentDisplayName(student));
    setMemberSuggestionsOpen(false);
  };

  const handleStudentSearchKeyDown = (event) => {
    if (event.key === 'Escape' && memberSuggestionsOpen) {
      event.preventDefault();
      event.stopPropagation();
      setMemberSuggestionsOpen(false);
      return;
    }
    if (!studentSuggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMemberSuggestionsOpen(true);
      setHighlightedStudentIndex(index => Math.min(index + 1, studentSuggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMemberSuggestionsOpen(true);
      setHighlightedStudentIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && memberSuggestionsOpen) {
      event.preventDefault();
      selectStudent(studentSuggestions[highlightedStudentIndex]);
    }
  };

  const handleAddMember = async () => {
    if (!newMemberId) return;
    try {
      await api.post(`/api/projects/${id}/members`, null, { params: { userId: newMemberId, role: newMemberRole } });
      closeAddMemberModal();
      loadProject();
    } catch { alert(t.addMemberFailed); }
  };

  // Phase 3: Advanced Add Multiple
  const handleAdvancedAddMultiple = async () => {
    if (advancedSelectedIds.length === 0) return;
    try {
      const results = await Promise.allSettled(advancedSelectedIds.map(uid => api.post(`/api/projects/${id}/members`, null, { params: { userId: uid, role: advancedRoleMap[uid] || 'MEMBER' } })));
      const failed = results.filter(r=>r.status==='rejected');
      if (failed.length) alert(`${t.addMemberFailed}: ${failed.length} failed`);
      setShowAdvancedAdd(false); setAdvancedSelectedIds([]); setAdvancedRoleMap({});
      await loadProject();
    } catch { alert(t.addMemberFailed); }
  };

  const handleRemoveMember = async (userId) => {
    try {
      await api.delete(`/api/projects/${id}/members/${userId}`);
      loadProject();
    } catch { alert(t.removeMemberFailed); }
  };

  const handleUpdateMemberRole = async (userId, role) => {
    setUpdatingMemberId(userId);
    try {
      await api.patch(`/api/projects/${id}/members/${userId}`, null, { params: { role } });
      await loadProject();
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.detail || t.updateMemberRoleFailed);
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handlePatch = async (action) => {
    setStatusPending(action);
    try {
      await api.patch(`/api/projects/${id}/${action}`);
      await loadProject();
    } catch { alert(t.projectActionFailed.replace('{{action}}', t[action] || action)); }
    finally { setStatusPending(null); }
  };

  const TOUR_STEPS = [
    { element: '#project-header', popover: { title: t.tourProjectTitle, description: t.tourProjectDesc, side: 'bottom', align: 'start' } },
    { element: '#tab-setup', popover: { title: t.projectSetup, description: t.tourSetupDesc, side: 'bottom', align: 'center' } },
    { element: '#tab-assign-member', popover: { title: 'Assign Member', description: t.tourProjectSettingsDesc, side: 'bottom', align: 'center' } },
    { element: '#tab-sections', popover: { title: t.projectSections, description: t.tourSectionsDesc, side: 'bottom', align: 'center' } },
    { element: '#tab-review', popover: { title: t.projectReview, description: t.tourProjectReviewDesc, side: 'bottom', align: 'center' } },
    { element: '#source-documents', popover: { title: t.sourceDocuments, description: t.tourSourceDocumentsDesc, side: 'top', align: 'start' } },
    { element: '#set-up-paper', popover: { title: t.setUpPaper, description: t.tourSetUpPaperDesc, side: 'top', align: 'start' } },
    { element: '#project-members', popover: { title: t.members, description: t.tourMembersDesc, side: 'top', align: 'start' } },
    { element: '#project-header', popover: { title: ct.status, description: t.tourStatusControlsDesc, side: 'top', align: 'start' } },
  ];

  useEffect(() => {
    if (papers.length > 0 && !selectedPaper) {
      setSelectedPaper(papers[0]);
    }
  }, [papers]);

  useEffect(() => {
    if (selectedPaper) loadSections(selectedPaper.id);
  }, [selectedPaper]);

  useEffect(() => {
    if (!selectedPaper) return;
    const status = selectedPaper.processingStatus;
    if (status === 'READY' || status === 'FAILED' || !status) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/api/papers/${selectedPaper.id}`);
        setSelectedPaper(res.data);
        if (res.data.processingStatus === 'READY' || res.data.processingStatus === 'FAILED') {
          clearInterval(interval);
          setUploadState(null);
          if (res.data.processingStatus === 'READY') loadSections(res.data.id);
          loadPapers();
        }
      } catch { clearInterval(interval); }
    }, 3000);
    return () => clearInterval(interval);
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
  const projectReadOnly = ['SUBMITTED_FOR_REVIEW', 'APPROVED', 'ARCHIVED'].includes(project.status);
  const sectionStructureLocked = hasAssignedSections || projectReadOnly;

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-[var(--page-bg)] text-[var(--text-primary)] font-sans">
      <AppHeader />
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
        <div id="project-header" className="mb-6 shrink-0">
          <Link to="/instructor/projects" className="text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--brand-foreground)]">&larr; {ct.back}</Link>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-2xl font-black text-[var(--brand-foreground)]">{project.title}</h1>
              {project.description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{project.description}</p>}
              <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-[var(--text-tertiary)]"><StatusBadge status={project.status} /></p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* PHASE 1: Status Control lifted from Settings tab — replaces View Evidence Trace */}
              {project.status === 'IN_PROGRESS' && (
                <button onClick={() => handlePatch('complete')} disabled={!!statusPending} className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-hover)] disabled:opacity-50">
                  {statusPending === 'complete' ? '...' : t.markComplete}
                </button>
              )}
              {project.status !== 'ARCHIVED' ? (
                <button onClick={() => handlePatch('archive')} disabled={!!statusPending} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50">
                  {statusPending === 'archive' ? '...' : t.archive}
                </button>
              ) : (
                <button onClick={() => handlePatch('unarchive')} disabled={!!statusPending} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                  {statusPending === 'unarchive' ? '...' : t.unarchive}
                </button>
              )}
              <button onClick={() => setShowExportModal(true)} className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-hover)]">{t.export}</button>
              <TourLauncher steps={TOUR_STEPS} tourKey="instructor-project-detail"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-sm font-bold text-[var(--text-secondary)] shadow-sm transition-all hover:border-indigo-300 hover:bg-[var(--brand-soft)] hover:text-[var(--brand-foreground)]" />
            </div>
          </div>
        </div>

        {/* Tabs — Static, wrap not scroll */}
        <div className="flex flex-wrap items-center border-b border-[var(--border)] shrink-0 mb-6">
          {[
            { key: 'setup', label: t.projectSetup },
            { key: 'assign-member', label: 'Assign Member' },
            { key: 'sections', label: t.projectSections },
            { key: 'progress', label: t.projectProgressReport },
            { key: 'review', label: t.projectReview },
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
        {/* Tab: Setup */}
        {activeTab === 'setup' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full overflow-hidden">
            <div id="source-documents" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 h-full overflow-y-auto">
              <div className="mb-3">
                <ActionExpandHeader title={t.sourceDocuments} placeholder={t.searchSource || 'Search sources...'} searchValue={sourceSearch} onSearch={setSourceSearch} onAdd={() => setShowAddSource(true)} addLabel={t.addSource} />
              </div>
              {filteredSources.length === 0 ? (
                <p className="text-xs italic text-[var(--text-tertiary)]">{sourceSearch ? t.noStudentsFound || 'No matches' : t.noSourceDocuments}</p>
              ) : (
                <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                  {filteredSources.map(s => (
                    <div key={s.id} data-testid={`source-${s.id}`} className="flex items-center gap-2 rounded-lg bg-[var(--surface-secondary)] px-3 py-2 text-xs transition hover:bg-[var(--surface-tertiary)]">
                      <button onClick={() => { setSourceDetail(s); setShowSourceDetail(true); }} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                        <span className="min-w-0 truncate font-medium">{s.title || s.originalFilename || ct.unknown || 'Unknown Source'}</span>
                        <StatusBadge status={s.processingStatus || 'READY'} />
                      </button>
                      <DeleteConfirm
                        message={t.removeSourceConfirm}
                        onConfirm={() => handleRemoveSource(s.id)}
                        triggerLabel={t.removeSource}
                        confirmLabel={t.removeSource}
                        cancelLabel={ct.cancel}
                        className="shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] transition hover:bg-rose-100 hover:text-rose-600"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>
                      </DeleteConfirm>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div id="set-up-paper" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 h-full overflow-y-auto">
              <h2 className="mb-4 text-sm font-bold text-[var(--brand-foreground)]">{t.setUpPaper}</h2>
              {standard && (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-xs">
                  <span className="font-medium text-[var(--brand-foreground)]">{t.standardLabel.replace('{{standard}}', standard)}</span>
                  <button onClick={() => { setSetupMode('standard'); setShowSetUpPaper(true); }} className="text-xs font-bold text-[var(--brand-foreground)] hover:underline">{t.change}</button>
                </div>
              )}
              {papers.length > 0 && (
                <div className="mb-3 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t.uploadedPapers}</p>
                  {papers.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-secondary)] px-3 py-2 text-xs">
                      <span className="min-w-0 truncate font-medium">{p.originalFilename || p.title}</span>
                      <StatusBadge status={p.processingStatus || 'READY'} />
                    </div>
                  ))}
                </div>
              )}
              {!project?.targetStandard && standardSuggestionLoading && (
                <p className="mb-3 text-xs italic text-[var(--text-tertiary)]">{t.detectingPaperStandard}</p>
              )}
              {!project?.targetStandard && standardSuggestion && !standardSuggestionLoading && (
                <div className="mb-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-950">
                  {standardSuggestion.suggestedStandard === 'CUSTOM' ? (
                    <p>{t.noReliableStandard}</p>
                  ) : (
                    <>
                      <p className="font-bold">
                        {t.suggestedPaperStandard.replace('{{standard}}', standardSuggestion.suggestedStandard)}
                      </p>
                      <p>
                        {t.standardConfidence.replace('{{confidence}}', standardSuggestion.confidencePercent)}
                      </p>
                      {standardSuggestion.evidence?.length > 0 && (
                        <p>{t.standardEvidence.replace('{{evidence}}', standardSuggestion.evidence.join(', '))}</p>
                      )}
                    </>
                  )}
                  <p className="text-[10px] text-amber-800">{t.standardSuggestionAdvisory}</p>
                  <div className="flex flex-wrap gap-2">
                    {standardSuggestion.suggestedStandard !== 'CUSTOM' && (
                      <button
                        onClick={() => saveStandard(standardSuggestion.suggestedStandard)}
                        disabled={saving}
                        className="rounded-lg bg-[var(--brand)] px-3 py-2 font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
                      >
                        {t.confirmSuggestedStandard}
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
                      {t.chooseDifferentStandard}
                    </button>
                    <button
                      onClick={() => saveStandard('CUSTOM')}
                      disabled={saving}
                      className="rounded-lg px-3 py-2 font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                    >
                      {t.keepCustomStandard}
                    </button>
                  </div>
                </div>
              )}
              {!standard && papers.length === 0 && (
                <p className="mb-3 text-xs italic text-[var(--text-tertiary)]">{t.noPaperConfigured}</p>
              )}
              {sectionStructureLocked ? (
                <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-center text-xs font-bold text-[var(--text-secondary)]">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                  {projectReadOnly ? t.setupLockedReadOnly : t.setupLockedAssigned}
                </div>
              ) : (
                <button onClick={() => { setSetupMode(standard ? 'standard' : 'paper'); setShowSetUpPaper(true); }} className="w-full rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)]">
                  {standard || papers.length > 0 ? t.updateSetup : t.setUpPaper}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tab: Sections */}
        {activeTab === 'sections' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-hidden">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 lg:col-span-1 h-full flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold text-[var(--brand-foreground)]">{t.papers}</h2>
              </div>
              {papers.length === 0 ? (
                <p className="text-xs italic text-[var(--text-tertiary)]">{t.uploadPaperFirst}</p>
              ) : (
                <div className="space-y-1">
                  {papers.map(p => (
                    <div key={p.id} className="flex items-center gap-1">
                      {editingPaperId === p.id ? (
                        <div className="flex flex-1 items-center gap-1 rounded-lg border border-indigo-200 bg-[var(--brand-soft)] px-3 py-2">
                          <input autoFocus value={editingPaperTitle} onChange={e => setEditingPaperTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveRename(p.id); if (e.key === 'Escape') setEditingPaperId(null); }} className="min-w-0 flex-1 border-b border-indigo-300 bg-transparent text-xs outline-none" onClick={e => e.stopPropagation()} />
                          <button onClick={() => handleSaveRename(p.id)} className="rounded p-1 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-800" title={ct.save} aria-label={ct.save}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg></button>
                          <button onClick={() => setEditingPaperId(null)} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-tertiary)] hover:text-[var(--text-primary)]" title={ct.cancel} aria-label={ct.cancel}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
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
                        <button onClick={e => { e.stopPropagation(); handleStartRename(p); }} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand-foreground)]" title={t.rename} aria-label={t.rename}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z" /><path d="m13 7 4 4" /></svg></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 lg:col-span-2 h-full flex flex-col min-h-0 overflow-hidden">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3 shrink-0">
                <div>
                  <h2 className="text-sm font-bold text-[var(--brand-foreground)]">{t.projectSections}</h2>
                  {selectedPaper && sectionStructureLocked && (
                    <p className="text-[10px] text-amber-700 mt-1">
                      {projectReadOnly ? t.projectReadOnly : t.sectionStructureLocked}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {selectedPaper && (
                    <button
                      onClick={handleAddSection}
                      disabled={sectionStructureLocked || sectionStructureSaving
                        || selectedPaper.processingStatus === 'QUEUED'
                        || selectedPaper.processingStatus === 'PROCESSING'}
                      className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      + {t.addSection}
                    </button>
                  )}
                  {selectedPaper && anyDirty && (
                    <button
                      data-testid="save-section-changes"
                      onClick={handleSaveAllSections}
                      disabled={sectionStructureSaving || !!pendingDelete}
                      title={sectionStructureLocked ? t.sectionStructureLocked : undefined}
                      className="px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t.saveSectionChanges}
                    </button>
                  )}
                  {selectedPaper && anyDirty && (
                    <button
                      onClick={() => { setDraftSections(sections); setConflictSectionId(null); }}
                      className="px-3 py-1.5 bg-[var(--surface-tertiary)] text-[var(--text-secondary)] text-xs font-bold rounded-lg hover:opacity-80"
                    >
                      {t.discardSectionChanges}
                    </button>
                  )}
                </div>
              </div>
              {!selectedPaper ? (
                <p className="text-xs italic text-[var(--text-tertiary)]">{t.selectPaperSections}</p>
              ) : selectedPaper.processingStatus === 'PROCESSING' || selectedPaper.processingStatus === 'QUEUED' || uploadState ? (
                (() => {
                  const s = selectedPaper.processingStatus;
                  const isUploading = uploadState === 'uploading' || s === 'QUEUED';
                  const isExtracting = uploadState === 'processing' || s === 'PROCESSING';
                  // Native React + Tailwind extraction bar — 4 sequential steps tied to poll (ProjectDetail.jsx:655)
                  // 3000ms poll may jump steps; transition-all duration-1000 masks latency
                  const steps = ['Uploading paper','Extracting paper','Markdown paper','Divide into sections'];
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
                      <div className="grid grid-cols-4 gap-1 text-[9px] font-bold">
                        {steps.map((label, i) => (
                          <span key={label} className={`text-center truncate px-1 py-1 rounded ${i===activeIdx ? 'bg-[var(--brand-soft)] text-[var(--brand-foreground)]' : i < activeIdx ? 'text-emerald-600' : 'text-[var(--text-tertiary)]'}`}>{i < activeIdx ? '✓ ' : ''}{label}</span>
                        ))}
                      </div>
                      <p className="text-xs italic text-[var(--text-secondary)] flex items-center gap-2"><span className="inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse" />{t.processingSections || steps[activeIdx]}</p>
                    </div>
                  );
                })()
              ) : displaySections.length === 0 ? (
                <div className="text-xs italic text-[var(--text-tertiary)]">
                  <p>{t.noSectionsHelp}</p>
                </div>
              ) : (
                <SectionManager
                  selectedPaper={selectedPaper}
                  sections={sections}
                  draftSections={draftSections}
                  displaySections={displaySections}
                  conflictSectionId={conflictSectionId}
                  sectionStructureLocked={sectionStructureLocked}
                  projectReadOnly={projectReadOnly}
                  sectionStructureSaving={sectionStructureSaving}
                  sectionEvals={sectionEvals}
                  t={t}
                  ct={ct}
                  users={users}
                  projectMembers={projectMembers}
                  editingSectionId={editingSectionId}
                  editingSectionTitle={editingSectionTitle}
                  onStartRename={handleStartSectionRename}
                  onSaveRename={handleSaveSectionRename}
                  onCancelRename={()=>setEditingSectionId(null)}
                  onEditingChange={setEditingSectionTitle}
                  onDelete={handleDeleteSection}
                  onAssign={handleAssignSection}
                  onReloadConflict={handleReloadConflictSection}
                  onDragEnd={handleDragEnd}
                  onConfigSave={saveSectionStandard}
                  onEvaluateStandard={runStandardCheck}
                  evaluatingSectionId={evaluatingSectionId}
                />
              )}
            </div>
          </div>
        )}

        {/* Tab: Review */}
        {activeTab === 'review' && (
          <div className="grid grid-cols-1 gap-6">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6">
              <h2 className="mb-4 text-sm font-bold text-[var(--brand-foreground)]">{t.feedbackRequests}</h2>
              {feedbackRequests.length === 0 ? (
                <p className="text-xs italic text-[var(--text-tertiary)]">{t.noReviewRequests}</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {feedbackRequests.map(fb => (
                    <div key={fb.id} data-testid={`feedback-${fb.id}`} className="rounded-lg bg-[var(--surface-secondary)] px-3 py-2 text-xs">
                      <div className="flex justify-between items-center">
                        <StatusBadge status={fb.status} />
                        <span className="text-[var(--text-tertiary)]">{fb.requestedAt ? new Date(fb.requestedAt).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US') : ''}</span>
                      </div>
                      <p className="mt-1 text-[var(--text-secondary)]">{t.studentLabel.replace('{{student}}', fb.studentName || fb.studentId)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Project Process Report — Phase 4: GitHub graph right panel */}
        {activeTab === 'progress' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-hidden">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 lg:col-span-2 h-full overflow-y-auto">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-[var(--brand-foreground)]">{t.contributionEvidence}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                    {t.fromLabel}
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
                    {t.toLabel}
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
                    {t.allTime}
                  </button>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                    {t.studentFilter}
                    <select
                      value={reportMemberId}
                      onChange={event => {
                        setProgressReport(null);
                        setReportMemberId(event.target.value);
                        setReportSectionId(null);
                      }}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--brand)]"
                    >
                      <option value="ALL">{t.allStudents}</option>
                      {studentMembers.map(member => (
                        <option key={member.userId} value={member.userId}>{studentDisplayName(member ?? {})}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <p className="mb-4 text-xs text-[var(--text-tertiary)]">{t.contributionEvidenceNote}</p>
              {!progressReport ? (
                <p className="text-xs italic text-[var(--text-tertiary)]">{ct.loading}</p>
              ) : (progressReport.contributions || []).length === 0 ? (
                <p className="text-xs italic text-[var(--text-tertiary)]">{t.noContributionData}</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {(progressReport.contributions || []).map(contribution => (
                    <div key={contribution.userId} className="rounded-xl bg-[var(--surface-secondary)] p-4 text-xs">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-bold text-[var(--text-primary)]">{contribution.userName}</p>
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                          {t.lastRecordedEdit}: {contribution.lastEditedAt
                            ? new Date(contribution.lastEditedAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')
                            : '—'}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {[
                          { label: t.assignedSections, value: contribution.assignedSectionCount },
                          { label: t.currentWords, value: contribution.currentWordCount },
                          { label: t.recordedSaves, value: contribution.saveCount },
                          { label: t.wordsAdded, value: contribution.wordsAdded ?? Math.max(contribution.wordDelta, 0) },
                          { label: t.wordsRemoved, value: contribution.wordsRemoved ?? Math.max(-contribution.wordDelta, 0) },
                          { label: t.netWordChange, value: contribution.wordDelta > 0 ? `+${contribution.wordDelta}` : contribution.wordDelta },
                        ].map(stat => (
                          <div key={stat.label} className="rounded-lg bg-[var(--surface)] p-2 text-center">
                            <p className="text-base font-black text-[var(--brand-foreground)]">{stat.value}</p>
                            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{stat.label}</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-[10px] text-[var(--text-tertiary)]">
                        {t.feedbackSummary
                          .replace('{{answered}}', contribution.feedbackAnswered)
                          .replace('{{total}}', contribution.feedbackAnswered + contribution.feedbackUnanswered)}
                      </p>
                      {contribution.editedSections?.length > 0 && (
                        <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">
                          <span className="font-bold">{t.editedSections}:</span> {contribution.editedSections.join(' · ')}
                        </p>
                      )}
                      {contribution.dailyWordDeltas?.length > 0 ? (
                        <div className="mt-3 max-h-32 space-y-1 overflow-y-auto pr-1">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t.dailyEditHistory}</p>
                          {contribution.dailyWordDeltas.map(day => (
                            <div key={day.date} className="flex items-center justify-between rounded bg-[var(--surface)] px-2 py-1 text-[10px]">
                              <span>{new Date(`${day.date}T00:00:00`).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US')}</span>
                              <span className="text-[var(--text-secondary)]">
                                {day.saveCount} {t.savesShort} · +{day.wordsAdded ?? Math.max(day.wordDelta, 0)}/-{day.wordsRemoved ?? Math.max(-day.wordDelta, 0)} {t.wordsShort} · {day.wordDelta > 0 ? `+${day.wordDelta}` : day.wordDelta} {t.netWordChange.toLowerCase()}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-[10px] italic text-[var(--text-tertiary)]">{t.noRecordedEdits}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 lg:col-span-1 h-full overflow-y-auto">
              <h2 className="mb-3 text-sm font-bold text-[var(--brand-foreground)]">{t.dailyEditHistory}</h2>
              <p className="mb-3 text-[10px] text-[var(--text-tertiary)]">{t.contributionEvidenceNote}</p>
              <ContributionGraph buckets={contributionBuckets} emptyLabel={t.noContributionData} ariaLabel={t.dailyEditHistory} />
            </div>
          </div>
        )}

        {/* Tab: Assign Member — PHASE 2+3: former Settings, Status controls removed, 2-col layout */}
        {(activeTab === 'assign-member' || activeTab === 'settings') && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-full overflow-hidden">
            {/* Left: Members list with search — expanded from 33% to 40% so search fits without horizontal scroll */}
            <div id="project-members" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 lg:col-span-2 h-full overflow-y-auto">
              <div className="mb-3">
                <ActionExpandHeader title={t.members} placeholder={t.searchStudent || 'Search members...'} searchValue={memberSearch} onSearch={setMemberSearch} onAdd={() => { setShowAdvancedAdd(true); loadUsers(); }} addLabel={t.add} />
              </div>
              {filteredMembers.length === 0 ? (
                <p className="text-xs italic text-[var(--text-tertiary)]">{memberSearch ? t.noStudentsFound || 'No matches' : t.noMembers}</p>
              ) : (
                <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
                  {filteredMembers.map(m => {
                    const isSelected = selectedMember && String(selectedMember.userId||selectedMember.id) === String(m.userId||m.id);
                    return (
                       <button key={m.userId} data-testid={`member-${m.userId}`} onClick={()=>setSelectedMemberId(String(m.userId))} className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${isSelected ? 'border border-indigo-200 bg-[var(--brand-soft)] text-[var(--brand-foreground)]' : 'bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)]'}`}>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{studentDisplayName(m ?? {})}</span>
                          <span className="block truncate text-[10px] text-[var(--text-tertiary)]">{m.email}</span>
                        </div>
                        <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">{m.userRole || m.role}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Right: Selected member detail — PHASE 2 */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-6 lg:col-span-3 h-full overflow-y-auto">
              {!selectedMember ? (
                <div className="flex h-full min-h-[200px] items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-secondary)] p-6 text-center">
                  <p className="text-xs text-[var(--text-tertiary)]">Select a member to view details</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] text-sm font-black text-white">{(selectedMember.firstName?.[0]||selectedMember.email?.[0]||'U').toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-[var(--brand-foreground)]">{studentDisplayName(selectedMember ?? {})}</h3>
                      <p className="truncate text-xs text-[var(--text-tertiary)]">{selectedMember.email}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">{selectedMember.userRole}</span>
                        <span className="rounded bg-[var(--surface-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">{selectedMember.role}</span>
                        <StatusBadge status={project.status} />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><span className="block text-[10px] font-bold uppercase text-[var(--text-tertiary)]">Student Code</span><span className="text-[11px]">{selectedMember.studentCode || '-'}</span></div>
                  </div>
                  {selectedMember.role !== 'INSTRUCTOR' && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-light)] pt-4">
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">{t.editMemberRole}:</span>
                      <select value={selectedMember.role} onChange={e=>handleUpdateMemberRole(selectedMember.userId, e.target.value)} disabled={projectReadOnly || updatingMemberId!==null} className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs outline-none disabled:opacity-50">
                        <option value="MEMBER">{t.memberRole}</option>
                        <option value="LEADER">{t.leaderRole}</option>
                      </select>
                      <DeleteConfirm message={t.removeMemberConfirm} onConfirm={()=>{handleRemoveMember(selectedMember.userId); setSelectedMemberId(null)}} triggerLabel={t.remove} confirmLabel={t.remove} cancelLabel={ct.cancel} className="ml-auto rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100">{t.remove}</DeleteConfirm>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </main>

      <Modal open={showAddMember} onClose={closeAddMemberModal} title={t.addMember} className="!overflow-visible">
        <div className="space-y-4">
          <div className="relative">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 fill-none stroke-[var(--text-tertiary)]" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              autoFocus
              type="search"
              role="combobox"
              autoComplete="off"
              value={memberQuery}
              placeholder={t.searchStudent}
              aria-label={t.searchStudent}
              aria-autocomplete="list"
              aria-expanded={memberSuggestionsOpen}
              aria-controls="student-suggestions"
              aria-activedescendant={memberSuggestionsOpen && studentSuggestions[highlightedStudentIndex]
                ? `student-suggestion-${studentSuggestions[highlightedStudentIndex].id}`
                : undefined}
              onFocus={() => setMemberSuggestionsOpen(true)}
              onBlur={() => setMemberSuggestionsOpen(false)}
              onChange={event => {
                setMemberQuery(event.target.value);
                setNewMemberId('');
                setHighlightedStudentIndex(0);
                setMemberSuggestionsOpen(true);
              }}
              onKeyDown={handleStudentSearchKeyDown}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-xs outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
            />
            {memberSuggestionsOpen && (
              <div id="student-suggestions" role="listbox" className="absolute z-10 mt-1 max-h-96 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg">
                {studentSuggestions.length === 0 ? (
                  <p className="px-3 py-3 text-xs italic text-[var(--text-tertiary)]">{t.noStudentsFound}</p>
                ) : studentSuggestions.map((student, index) => (
                  <button
                    id={`student-suggestion-${student.id}`}
                    key={student.id}
                    type="button"
                    role="option"
                    aria-selected={newMemberId === student.id}
                    onMouseDown={event => event.preventDefault()}
                    onMouseEnter={() => setHighlightedStudentIndex(index)}
                    onClick={() => selectStudent(student)}
                    className={`flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${index === highlightedStudentIndex ? 'bg-[var(--brand-soft)]' : 'hover:bg-[var(--surface-secondary)]'}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">{studentDisplayName(student)}</span>
                      <span className="block truncate text-[10px] text-[var(--text-tertiary)]">{student.email}</span>
                    </span>
                    {student.studentCode && <span className="shrink-0 rounded bg-[var(--surface-tertiary)] px-2 py-1 font-mono text-[10px] font-semibold text-[var(--text-secondary)]">{student.studentCode}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <select value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs outline-none">
            <option value="MEMBER">{t.memberRole}</option>
            <option value="LEADER">{t.leaderRole}</option>
          </select>
          <div className="flex justify-end gap-2">
            <button onClick={closeAddMemberModal} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:opacity-80">{ct.cancel}</button>
            <button onClick={handleAddMember} disabled={!newMemberId} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">{ct.save}</button>
          </div>
        </div>
      </Modal>

      {/* Phase 3: Add Students — with local search */}
      <Modal open={showAdvancedAdd} onClose={()=>{setShowAdvancedAdd(false); setAdvancedSelectedIds([]); setAdvancedSearch('');}} title="Add Students">
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-secondary)]">Select multiple students and assign roles. Already members are hidden.</p>
          <div className="relative">
            <svg aria-hidden="true" viewBox="0 0 16 16" className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 fill-[var(--text-tertiary)]"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0" /></svg>
            <input value={advancedSearch} onChange={e=>setAdvancedSearch(e.target.value)} placeholder="Search name or email..." className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] py-2 pl-8 pr-3 text-xs outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]" />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] divide-y divide-[var(--border-light)]">
            {advancedFilteredStudents.length===0 ? <p className="p-3 text-xs italic text-[var(--text-tertiary)]">{t.noStudentsFound}</p> : advancedFilteredStudents.map(st=> {
              const checked = advancedSelectedIds.includes(String(st.id));
              return (
                <label key={st.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--surface-secondary)]">
                  <input type="checkbox" checked={checked} onChange={e=> setAdvancedSelectedIds(cur=> e.target.checked ? [...cur, String(st.id)] : cur.filter(id=>id!==String(st.id)))} />
                  <span className="min-w-0 flex-1 truncate">{studentDisplayName(st)} <span className="text-[10px] text-[var(--text-tertiary)]">({st.email})</span></span>
                  <select value={advancedRoleMap[st.id]||'MEMBER'} onChange={e=> setAdvancedRoleMap(m=>({...m,[st.id]:e.target.value}))} onClick={e=>e.stopPropagation()} className="rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-[10px]">
                    <option value="MEMBER">{t.memberRole}</option><option value="LEADER">{t.leaderRole}</option>
                  </select>
                </label>
              )
            })}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={()=>{setShowAdvancedAdd(false); setAdvancedSelectedIds([]); setAdvancedSearch('');}} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold">{ct.cancel}</button>
            <button onClick={handleAdvancedAddMultiple} disabled={advancedSelectedIds.length===0} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Add {advancedSelectedIds.length ? `(${advancedSelectedIds.length})` : ''}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!pendingAssign} onClose={() => setPendingAssign(null)} title={t.assignSection}>
        <div className="space-y-4 text-xs">
          <p className="text-[var(--text-secondary)]">{t.assignSectionQuestion.replace('{{student}}', pendingAssign?.userName || '')}</p>
          <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {t.assignSectionWarning}
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setPendingAssign(null)} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:opacity-80">{ct.cancel}</button>
            <button onClick={() => handleConfirmAssign(pendingAssign?.userId, pendingAssign?.sectionId)} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)]">{ct.confirm}</button>
          </div>
        </div>
      </Modal>

      {/* Phase 4: Document preview modal — reuses FileViewerModal (SourceLibraryPanel / Student Workspace) */}
      <Modal open={showSourceDetail} onClose={() => setShowSourceDetail(false)} title={t.sourceDetail}>
        {sourceDetail && (
          <div className="space-y-3 text-xs">
            <div><span className="font-bold text-[var(--text-secondary)]">{t.titleLabel}</span> <span>{sourceDetail.title || '-'}</span></div>
            <div><span className="font-bold text-[var(--text-secondary)]">{t.filenameLabel}</span> <span>{sourceDetail.originalFilename || '-'}</span></div>
            <div><span className="font-bold text-[var(--text-secondary)]">DOI:</span> <span className="font-mono">{sourceDetail.doi || '-'}</span></div>
            <div><span className="font-bold text-[var(--text-secondary)]">{ct.status}:</span> <StatusBadge status={sourceDetail.processingStatus || 'READY'} /></div>
            <div><span className="font-bold text-[var(--text-secondary)]">{t.typeLabel}</span> <span>{sourceDetail.docType || 'SOURCE'}</span></div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setViewerFile({ fileUrl: `/api/documents/${sourceDetail.id}/download`, fileName: sourceDetail.originalFilename || sourceDetail.title }); }} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)]">{t.previewSource || 'Preview'}</button>
              <button onClick={() => setShowSourceDetail(false)} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:opacity-80">{ct.close}</button>
            </div>
          </div>
        )}
      </Modal>
      {viewerFile && <FileViewerModal fileUrl={viewerFile.fileUrl} fileName={viewerFile.fileName} onClose={() => setViewerFile(null)} />}

      <Modal open={showAddSource} onClose={() => { setShowAddSource(false); setDoiInput(''); setPendingSourceFile(null); setPendingSourceFiles([]); }} title={t.addSource}>
        <div className="space-y-5 text-xs">
          <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
            <h3 className="font-bold text-[var(--brand-foreground)]">{t.importByDoi}</h3>
            <textarea value={doiInput} onChange={e => setDoiInput(e.target.value)} placeholder="10.1000/xyz123, 10.1001/abc&#10;One per line or comma/semicolon separated" rows={3} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs outline-none" />
            <div className="flex gap-2">
              <button onClick={() => handleImportDoiUnified()} disabled={addSourceLoading || !doiInput.trim()} className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
                {addSourceLoading ? '...' : t.import}
              </button>
              {doiInput.trim().split(/[\n,;]+/).filter(Boolean).length > 1 && <span className="py-2 text-[10px] text-[var(--text-tertiary)]">{doiInput.trim().split(/[\n,;]+/).filter(Boolean).length} DOIs — one request</span>}
            </div>
            {doiErrors.length > 0 && (
              <div className="space-y-2 mt-2">
                {doiErrors.map((err, idx) => (
                  <div key={idx} className="flex flex-col gap-1 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700 border border-rose-200">
                    <div className="font-semibold">{err.doi}: {err.error}</div>
                    {err.doi !== 'batch' && (
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => handleImportDoiUnified(err.doi)} className="rounded bg-rose-600 px-2 py-1 font-bold text-white hover:bg-rose-700">Retry</button>
                        <button onClick={() => console.warn("TODO: Wire up manual modal")} className="rounded bg-rose-100 px-2 py-1 font-bold text-rose-700 hover:bg-rose-200">Manual Input</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] italic text-[var(--text-tertiary)]">{t.sourcesAutoClassified} • Batch uses single POST /api/documents/ingest/doi/batch</p>
          </div>
          <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
            <h3 className="font-bold text-[var(--text-primary)]">{t.uploadSourceFile} — Multiple allowed (concurrency 3)</h3>
            <input type="file" multiple accept=".pdf,.docx" onChange={(e) => { const files = [...(e.target.files||[])]; setPendingSourceFiles(files); setPendingSourceFile(files[0]||null); e.target.value = ''; }} className="text-xs" />
            {pendingSourceFile && pendingSourceFiles.length === 1 && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-secondary)] px-3 py-2">
                <span className="truncate font-semibold">{pendingSourceFile.name}</span>
                <button onClick={async () => { if (await handleUploadSource(pendingSourceFile)) { setPendingSourceFile(null); setPendingSourceFiles([]); setShowAddSource(false); } }} disabled={addSourceLoading} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
                  {addSourceLoading ? '...' : ct.save}
                </button>
              </div>
            )}
            {pendingSourceFiles.length > 1 && (
              <div className="space-y-2">
                <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                  {pendingSourceFiles.map(f => <div key={f.name+f.size} className="truncate rounded bg-[var(--surface-secondary)] px-2 py-1 text-[10px]">{f.name} — {(f.size/1024).toFixed(0)}KB</div>)}
                </div>
                <button onClick={async () => { await handleUploadSourcesBatch(pendingSourceFiles); setPendingSourceFile(null); setPendingSourceFiles([]); setShowAddSource(false); }} disabled={addSourceLoading} className="w-full rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
                  {addSourceLoading ? 'Uploading...' : `Upload ${pendingSourceFiles.length} files (max 3 concurrent)`}
                </button>
              </div>
            )}
          </div>
          <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
            <h3 className="font-bold text-[var(--text-primary)]">{t.shareFromCollection}</h3>
            <button onClick={() => { setShowShareCollection(true); loadCollections(); setShowAddSource(false); }} className="rounded-lg bg-[var(--brand)] px-3 py-2 font-bold text-white hover:bg-[var(--brand-hover)]">{t.browseCollections}</button>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddSource(false)} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:opacity-80">{ct.cancel}</button>
          </div>
        </div>
      </Modal>

      <Modal open={showSetUpPaper} onClose={() => setShowSetUpPaper(false)} title={t.setUpPaper}>
        {sectionStructureLocked ? (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-amber-800" strokeWidth="2"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              <span className="text-amber-800">
                {projectReadOnly ? t.setupLockedReadOnly : t.setupLockedAssigned}
              </span>
            </div>
          <div className="flex justify-end">
              <button onClick={() => setShowSetUpPaper(false)} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:opacity-80">{ct.close}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 text-xs">
            <div className="flex gap-1 rounded-lg bg-[var(--surface-tertiary)] p-1">
              <button onClick={() => setSetupMode('standard')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition ${setupMode === 'standard' ? 'bg-[var(--surface)] text-[var(--brand-foreground)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 2h6v4H9zM8 10h8M8 14h8M8 18h5" /></svg>
                {t.chooseStandard}
              </button>
              <button onClick={() => setSetupMode('paper')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition ${setupMode === 'paper' ? 'bg-[var(--surface)] text-[var(--brand-foreground)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M6 2h8l4 4v16H6zM14 2v5h5M9 13h6M12 10v6" /></svg>
                {t.uploadPaper}
              </button>
            </div>

            {setupMode === 'standard' && (
              <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
                <h3 className="font-bold text-[var(--brand-foreground)]">{t.chooseStandard}</h3>
                <p className="text-[var(--text-tertiary)]">{t.chooseStandardDesc}</p>
                <select value={standard} onChange={e => setStandard(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none">
                  <option value="">{t.noStandard}</option>
                  {STANDARDS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={handleUpdateStandard} disabled={saving} className="rounded-lg bg-[var(--brand)] px-4 py-2 font-bold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">{saving ? ct.saving : t.saveStandard}</button>
              </div>
            )}

            {setupMode === 'paper' && (
              <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
                <h3 className="font-bold text-[var(--brand-foreground)]">{t.uploadPaper}</h3>
                <p className="text-[var(--text-tertiary)]">{t.uploadPaperDesc}</p>
                <input type="file" accept=".pdf,.docx" onChange={(e) => { handleUploadPaper(e); setShowSetUpPaper(false); }} className="text-xs" />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSetUpPaper(false)} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:opacity-80">{ct.cancel}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showShareCollection} onClose={() => { setShowShareCollection(false); resetSourceSharing(); }} title={t.shareFromCollection}>
        <div className="space-y-4 text-xs">
          {collections.length === 0 ? (
            <p className="italic text-[var(--text-tertiary)]">{t.noCollectionsFound}</p>
          ) : (
            <>
              <select value={selectedCollectionId} onChange={e => handleCollectionSelection(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs outline-none">
                <option value="">{t.selectCollection}</option>
                {collections.map(c => {
                  const linked = linkedCollections.some(item => String(item.id) === String(c.id));
                  return <option key={c.id} value={c.id}>{c.name || c.title || c.id}{linked ? ` — ${t.collectionLinked}` : ''}</option>;
                })}
              </select>
              {collectionTotalPages > 1 && (
                <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--text-tertiary)]">
                  <button
                    type="button"
                    disabled={collectionPage === 0}
                    onClick={() => { resetSourceSharing(); loadCollections(collectionPage - 1); }}
                    className="rounded border border-[var(--border)] px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  >{t.prev}</button>
                  <span>{t.page} {collectionPage + 1} / {collectionTotalPages}</span>
                  <button
                    type="button"
                    disabled={collectionPage + 1 >= collectionTotalPages}
                    onClick={() => { resetSourceSharing(); loadCollections(collectionPage + 1); }}
                    className="rounded border border-[var(--border)] px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  >{t.next}</button>
                </div>
              )}
            </>
          )}
          {selectedCollectionId && linkedCollections.some(c => String(c.id) === String(selectedCollectionId)) && (
            <div className="space-y-3 rounded-lg bg-[var(--surface-secondary)] px-3 py-3 text-[var(--text-secondary)]">
              <p>{t.collectionLinked}</p>
              <DeleteConfirm message={t.stopCollectionSyncConfirm} onConfirm={handleStopCollectionSync} triggerLabel={t.stopCollectionSync} confirmLabel={t.stopCollectionSync} cancelLabel={ct.cancel} disabled={projectReadOnly || shareLoadingId !== null} className="w-full rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50">
                {shareLoadingId === selectedCollectionId ? ct.saving : t.stopCollectionSync}
              </DeleteConfirm>
            </div>
          )}
          {selectedCollectionId && projectReadOnly && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">{t.collectionSyncPaused}</p>
          )}
          {selectedCollectionId && collectionSourcesLoading && (
            <p className="italic text-[var(--text-tertiary)]">{ct.loading}</p>
          )}
          {selectedCollectionId && !collectionSourcesLoading
            && !linkedCollections.some(c => String(c.id) === String(selectedCollectionId))
            && visibleCollectionSources.length === 0 && (
            <p className="italic text-[var(--text-tertiary)]">{t.noCollectionSources}</p>
          )}
          {!collectionSourcesLoading
            && !linkedCollections.some(c => String(c.id) === String(selectedCollectionId))
            && visibleCollectionSources.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--border-light)] p-1">
              {visibleCollectionSources.map(source => {
                const shareable = isSourceShareable(source);
                const canToggle = shareable || isSourceSharedWithProject(source, id);
                return (
                  <label key={source.id} className={`flex items-center gap-2 rounded-lg bg-[var(--surface-secondary)] px-3 py-2 ${canToggle ? 'cursor-pointer hover:bg-[var(--surface-tertiary)]' : 'cursor-not-allowed opacity-60'}`}>
                    <input type="checkbox" checked={selectedSourceIds.includes(String(source.id))} onChange={() => toggleSourceSelection(source.id)} disabled={projectReadOnly || shareLoadingId !== null || !canToggle} className="accent-indigo-600" />
                    <span className="flex-1 text-xs font-medium">{source.title || source.originalFilename || source.id}</span>
                    {!shareable && <span className="text-[10px] font-semibold text-amber-600">{t.sourceNotReady}</span>}
                  </label>
                );
              })}
            </div>
          )}
          {!collectionSourcesLoading
            && !linkedCollections.some(c => String(c.id) === String(selectedCollectionId))
            && collectionSourceTotalPages > 1 && (
            <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--text-tertiary)]">
              <button
                type="button"
                disabled={collectionSourcePage === 0 || shareLoadingId !== null}
                onClick={() => loadCollectionSources(selectedCollectionId, collectionSourcePage - 1)}
                className="rounded border border-[var(--border)] px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >{t.prev}</button>
              <span>{t.page} {collectionSourcePage + 1} / {collectionSourceTotalPages}</span>
              <button
                type="button"
                disabled={collectionSourcePage + 1 >= collectionSourceTotalPages || shareLoadingId !== null}
                onClick={() => loadCollectionSources(selectedCollectionId, collectionSourcePage + 1)}
                className="rounded border border-[var(--border)] px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >{t.next}</button>
            </div>
          )}
          {!collectionSourcesLoading
            && !linkedCollections.some(c => String(c.id) === String(selectedCollectionId))
            && visibleCollectionSources.length > 0 && (
            <button onClick={handleShareSources} disabled={projectReadOnly || shareLoadingId !== null} className="w-full rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50">
              {shareLoadingId === selectedCollectionId ? ct.saving : t.applyChanges}
            </button>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowShareCollection(false); resetSourceSharing(); }} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:opacity-80">{ct.close}</button>
          </div>
        </div>
      </Modal>

      <Modal open={showExportModal} onClose={() => setShowExportModal(false)} title={t.export}>
        <div className="space-y-3 text-xs">
          <button onClick={async () => {
            try {
              const r = await api.get(`/api/projects/${id}/export?format=tex`, { responseType: 'blob' });
              const url = URL.createObjectURL(r.data);
              const a = document.createElement('a'); a.href = url; a.download = `papers-${project?.title || 'export'}.zip`;
              a.click(); URL.revokeObjectURL(url);
              setShowExportModal(false);
            } catch { alert(t.exportFailed); }
          }} className="w-full rounded-lg bg-emerald-50 px-4 py-3 text-left font-medium text-emerald-800 transition hover:bg-emerald-100">
            {t.paperArchive}
            <span className="block text-[10px] font-normal text-emerald-900/70">{t.paperArchiveDesc}</span>
          </button>
          <button onClick={async () => {
            try {
              const r = await api.get(`/api/projects/${id}/traceability`);
              const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `traceability-${project?.title || 'export'}.json`;
              a.click(); URL.revokeObjectURL(url);
              setShowExportModal(false);
            } catch { alert(t.exportFailed); }
          }} className="w-full rounded-lg bg-emerald-50 px-4 py-3 text-left font-medium text-emerald-800 transition hover:bg-emerald-100">
            {t.traceabilityJson}
            <span className="block text-[10px] font-normal text-emerald-900/70">{t.traceabilityJsonDesc}</span>
          </button>
          <button onClick={async () => {
            try {
              const r = await api.get(`/api/projects/${id}/traceability/csv`, { responseType: 'blob' });
              const url = URL.createObjectURL(r.data);
              const a = document.createElement('a'); a.href = url; a.download = `traceability-${project?.title || 'export'}.csv`;
              a.click(); URL.revokeObjectURL(url);
              setShowExportModal(false);
            } catch { alert(t.exportFailed); }
          }} className="w-full rounded-lg bg-emerald-50 px-4 py-3 text-left font-medium text-emerald-800 transition hover:bg-emerald-100">
            {t.traceabilityCsv}
            <span className="block text-[10px] font-normal text-emerald-900/70">{t.traceabilityCsvDesc}</span>
          </button>
          <div className="flex justify-end">
            <button onClick={() => setShowExportModal(false)} className="rounded-lg bg-[var(--surface-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:opacity-80">{ct.cancel}</button>
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
              {uploadState === 'uploading' ? t.uploadingPaper : t.processingSections}
            </MarkerContent>
          </Marker>
        </Modal>
      )}

      {pendingDelete && <UndoToast pending={pendingDelete} onUndo={undoDelete} onDismiss={dismissDelete} />}
    </div>
  );
}
