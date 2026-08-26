import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import TourLauncher from '../../components/TourLauncher';
import FileViewerModal from '../../components/FileViewerModal';
import CitationPopover from '../../components/CitationPopover.jsx';
import api from '../../api.js';
import { subscribeToNotifications } from '../../notificationSocket.js';
import WorkspaceHeader from './WorkspaceHeader.jsx';
import FilePanel from './FilePanel.jsx';
import EditorPanel from './EditorPanel.jsx';
import ContextPanel from './ContextPanel.jsx';
import FullPaperPreview from './FullPaperPreview.jsx';
import { hasActiveExtraction } from './extractionPolling.js';
import useUndoDelete, { UndoToast } from '../../components/UndoDelete.jsx';

async function loadAllProjectSources(projectId) {
  const sources = [];
  let page = 0;
  let last = false;
  while (!last) {
    const response = await api.get(`/api/projects/${projectId}/sources`, {
      params: { page, size: 100, active: true },
    });
    sources.push(...(response.data?.content || []));
    last = response.data?.last ?? true;
    page += 1;
  }
  return sources;
}

function workspaceDraftKey(projectId, sectionId) {
  return projectId && sectionId ? `workspace_draft_${projectId}_${sectionId}` : null;
}

function readWorkspaceDraft(projectId, sectionId) {
  const key = workspaceDraftKey(projectId, sectionId);
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    console.warn('Unable to read the workspace draft from local storage.');
    return null;
  }
}

function storeWorkspaceDraft(projectId, sectionId, content) {
  const key = workspaceDraftKey(projectId, sectionId);
  if (!key) return;
  try {
    localStorage.setItem(key, content);
  } catch {
    console.warn('Unable to persist the workspace draft in local storage.');
  }
}

function removeWorkspaceDraft(projectId, sectionId) {
  const key = workspaceDraftKey(projectId, sectionId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    console.warn('Unable to remove the workspace draft from local storage.');
  }
}

function withSavedContent(section, sectionId, content, update) {
  if (String(section.id) !== String(sectionId)) return section;
  const contentChanged = section.contentTex !== content;
  return {
    ...section,
    previousContentTex: contentChanged ? section.contentTex : section.previousContentTex,
    contentTex: content,
    contentMdCache: null,
    version: update?.version ?? section.version,
    revision: update?.revision ?? section.revision,
    updatedAt: update?.updatedAt ?? section.updatedAt,
  };
}

export default function WorkspaceLayout() {
  const compactAtLoad = typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { logout, user, role } = useAuth();
  const { t, i18n } = useTranslation();
  const { pending: pendingDelete, start: startDelete, undo: undoDelete, dismiss: dismissDelete } = useUndoDelete();
  const undoStrings = {
    header: t('undoHeader'),
    bodyTemplate: t('undoBodyTemplate'),
    caution: t('undoCaution'),
    undoLabel: t('undoLabel'),
    undoRemaining: t('undoRemaining'),
    dismissLabel: t('dismissLabel'),
  };
  const [activeTab, setActiveTab] = useState(() => {
    const stored = localStorage.getItem('student_workspace_active_tab') || 'Source';
    return stored === 'Graph' || stored === 'Claims' ? 'AI Review' : stored;
  });
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [sectionsExpanded, setSectionsExpanded] = useState(true);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [sources, setSources] = useState([]);
  const [mediaAssets, setMediaAssets] = useState([]);
  const [papers, setPapers] = useState([]);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [feedbacks, setFeedbacks] = useState([]);
  const [exports, setExports] = useState([]);
  const [loadingProject, setLoadingProject] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [viewerFile, setViewerFile] = useState(null);
  const [showFullPaperPreview, setShowFullPaperPreview] = useState(false);

  const [codeContent, setCodeContent] = useState('');

  const [showSymbolMenu, setShowSymbolMenu] = useState(false);
  const [showTextSizeMenu, setShowTextSizeMenu] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [editorWidth, setEditorWidth] = useState(50);
  const [fileTreeWidth, setFileTreeWidth] = useState(256);
  const [rightDrawerWidth] = useState(380);
  const [isCompactWorkspace, setIsCompactWorkspace] = useState(compactAtLoad);
  const [isDrawerOpen, setIsDrawerOpen] = useState(!compactAtLoad);
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(!compactAtLoad);
  const [textSize, setTextSize] = useState(14);

  const [selectedPaperDetail, setSelectedPaperDetail] = useState(null);

  const [showSubmitReviewModal, setShowSubmitReviewModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [loadingAiReview, setLoadingAiReview] = useState(false);
  const [aiReviewProgress, setAiReviewProgress] = useState(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [aiReviewResult, setAiReviewResult] = useState(null);
  const [aiReviewError, setAiReviewError] = useState(null);
  const [aiReviewedContent, setAiReviewedContent] = useState('');
  const [aiSourceMatches, setAiSourceMatches] = useState({});
  const [loadingAiSources, setLoadingAiSources] = useState(false);
  const [aiSourcesError, setAiSourcesError] = useState('');
  const [newClaimContent, setNewClaimContent] = useState('');
  const [newClaimFunctionalType, setNewClaimFunctionalType] = useState('EMPIRICAL');
  const [claimEvaluation, setClaimEvaluation] = useState(null);
  const [evaluatedClaimContent, setEvaluatedClaimContent] = useState('');
  const [evaluatedClaimSectionId, setEvaluatedClaimSectionId] = useState('');
  const [evaluatingClaim, setEvaluatingClaim] = useState(false);
  const [claimEvaluationError, setClaimEvaluationError] = useState('');
  const [editingClaim, setEditingClaim] = useState(null);
  const [editClaimContent, setEditClaimContent] = useState('');
  const [editClaimFunctionalType, setEditClaimFunctionalType] = useState('EMPIRICAL');
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [claimMatches, setClaimMatches] = useState([]);
  const [claimMappings, setClaimMappings] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [claimCandidates, setClaimCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidateError, setCandidateError] = useState('');
  const [evaluatingChunkId, setEvaluatingChunkId] = useState(null);
  const [updatingSuggestionId, setUpdatingSuggestionId] = useState(null);
  const [sections, setSections] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [loadErrors, setLoadErrors] = useState([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [sectionTraces, setSectionTraces] = useState([]);
  const [updatingTraceIds, setUpdatingTraceIds] = useState([]);
  const [traceError, setTraceError] = useState('');
  const editorRef = useRef(null);
  const loadRequestRef = useRef(0);
  const projectRef = useRef(null);
  const selectedSectionIdRef = useRef('');
  const codeContentRef = useRef('');
  const dirtySectionsRef = useRef(new Set());
  const saveInFlightRef = useRef(new Map());
  const saveStatusTimerRef = useRef(null);
  const sectionRevisionRef = useRef(new Map());
  const submittingReviewRef = useRef(false);
  const aiReviewJobRef = useRef(null);
  const aiReviewRequestRef = useRef(0);
  const aiSourceRequestRef = useRef(0);

  const updateCode = (newVal) => {
    codeContentRef.current = newVal;
    setCodeContent(newVal);
    if (selectedSectionIdRef.current) dirtySectionsRef.current.add(selectedSectionIdRef.current);
  };

  const loadCode = (newVal) => {
    const text = newVal || '';
    codeContentRef.current = text;
    setCodeContent(text);
  };

  const selectSection = (id) => {
    selectedSectionIdRef.current = id;
    setSelectedSectionId(id);
  };

  const putSectionContent = useCallback((paperId, sectionId, content, fallbackRevision) => {
    if (!paperId) return Promise.reject(new Error('No paper selected'));
    const key = String(sectionId);
    const prev = saveInFlightRef.current.get(key) || Promise.resolve();
    const next = prev.catch(() => undefined).then(async () => {
      const expectedRevision = sectionRevisionRef.current.get(key) ?? fallbackRevision;
      if (expectedRevision == null) throw new Error('Section revision is unavailable');
      const response = await api.put(
        `/api/papers/${paperId}/sections/${sectionId}`,
        { content, expectedRevision },
      );
      sectionRevisionRef.current.set(key, response.data.revision);
      return response.data;
    });
    const tracked = next.finally(() => {
      if (saveInFlightRef.current.get(key) === tracked) saveInFlightRef.current.delete(key);
    });
    saveInFlightRef.current.set(key, tracked);
    return tracked;
  }, []);

  const handleSelectSection = async (sec) => {
    const current = selectedSectionIdRef.current;
    if (current && current !== sec.id && dirtySectionsRef.current.has(current)) {
      if (!window.confirm(t('unsavedSectionSwitch'))) return false;
      dirtySectionsRef.current.delete(current);
      removeWorkspaceDraft(projectRef.current?.id, current); // discard also drops the stale local draft
    }
    selectSection(sec.id);
    const draft = readWorkspaceDraft(projectRef.current?.id, sec.id);
    loadCode(draft ?? sec.contentTex ?? '');
    if (draft !== null) dirtySectionsRef.current.add(sec.id);
    return true;
  };

  const handleSelectPaper = async (p) => {
    const current = selectedSectionIdRef.current;
    if (current && dirtySectionsRef.current.has(current)) {
      if (!window.confirm(t('unsavedPaperSwitch'))) return;
      dirtySectionsRef.current.delete(current);
    }
    setSelectedPaper(p);
    setShowHistoryModal(false);
    loadCode('');
  };

  const displayContent = selectedPaper ? codeContent : `% ${t('noPaper')}`;

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const pollAiJob = async (jobId, shouldAbort, onProgress) => {
    for (; ;) {
      if (shouldAbort?.()) return null;
      const { data: job } = await api.get(`/api/jobs/${jobId}`);
      if (shouldAbort?.()) return null;
      onProgress?.({
        current: Math.max(0, Number(job.progressCurrent) || 0),
        total: Math.max(0, Number(job.progressTotal) || 0),
      });
      if (job.status === 'SUCCESS') return job;
      if (job.status === 'FAILED') {
        const error = new Error(job.errorMessage || t('aiEvaluationFailed'));
        error.status = Number(job.errorMessage?.match(/(\d{3})/)?.[1]) || undefined;
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  };

  const updateAiReviewProgress = (next) => {
    setAiReviewProgress((current) =>
      current?.current === next.current && current?.total === next.total ? current : next);
  };

  useEffect(() => {
    aiReviewRequestRef.current += 1;
    aiSourceRequestRef.current += 1;
    aiReviewJobRef.current = null;
    setLoadingAiReview(false);
    setAiReviewProgress(null);
    setAiReviewResult(null);
    setAiReviewError(null);
    setAiReviewedContent('');
    setLoadingAiSources(false);
    setAiSourceMatches({});
    setAiSourcesError('');
    editorRef.current?.setReviewRanges([]);
  }, [selectedPaper?.id, selectedSectionId]);

  // Resize handlers
  const handleMouseDown = (e) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMouseMove = (me) => {
      const container = document.getElementById('editor-preview-container');
      if (!container) return;
      const cr = container.getBoundingClientRect();
      let pct = ((me.clientX - cr.left) / cr.width) * 100;
      if (pct < 15) pct = 15;
      if (pct > 85) pct = 85;
      setEditorWidth(pct);
    };
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleLeftDividerMouseDown = (e) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMouseMove = (me) => {
      let nw = me.clientX;
      const p = document.getElementById('workspace-container');
      if (p) nw = me.clientX - p.getBoundingClientRect().left - 56;
      if (nw < 160) nw = 160;
      if (nw > 450) nw = 450;
      setFileTreeWidth(nw);
    };
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Data loading

  const loadProjectData = useCallback(async (projId) => {
    if (!projId) return;
    const requestId = ++loadRequestRef.current;
    const prevProjectId = projectRef.current?.id;
    if (prevProjectId && prevProjectId !== projId) {
      const sid = selectedSectionIdRef.current;
      if (sid && dirtySectionsRef.current.has(sid)) {
        storeWorkspaceDraft(prevProjectId, sid, codeContentRef.current);
      }
    }
    setProjectLoadError(null);
    setProject(null);
    setSources([]);
    setPapers([]);
    setMediaAssets([]);
    setFeedbacks([]);
    setSections([]);
    setSelectedPaper(null);
    selectSection('');
    setAiReviewResult(null);
    setAiReviewError(null);
    setAiReviewProgress(null);
    setAiReviewedContent('');
    setAiSourceMatches({});
    setAiSourcesError('');
    setClaimEvaluation(null);
    setEvaluatedClaimContent('');
    setEvaluatedClaimSectionId('');
    setClaimEvaluationError('');
    setLoadErrors([]);
    const stale = () => loadRequestRef.current !== requestId;
    try {
      const projRes = await api.get(`/api/projects/${projId}`);
      if (stale()) return;
      setProject(projRes.data);
      projectRef.current = projRes.data;
      try {
        const srcs = await loadAllProjectSources(projId);
        if (stale()) return;
        setSources(srcs);
      } catch { if (!stale()) setLoadErrors(errs => [...errs, 'sources']); }
      try {
        const r = await api.get(`/api/media/projects/${projId}`);
        if (stale()) return;
        setMediaAssets(r.data || []);
      } catch { if (!stale()) setLoadErrors(errs => [...errs, 'media']); }
      try {
        const r = await api.get(`/api/projects/${projId}/papers`);
        if (stale()) return;
        const list = r.data || [];
        setPapers(list);
        if (list.length > 0) { setSelectedPaper(list[0]); loadCode(''); }
        else { setSelectedPaper(null); loadCode(''); }
      } catch { if (!stale()) setLoadErrors(errs => [...errs, 'paper']); }
      try {
        const r = await api.get('/api/feedback-requests');
        if (stale()) return;
        const all = r.data || [];
        setFeedbacks(all.filter(fb => String(fb.projectId) === String(projId)));
      } catch { if (!stale()) setLoadErrors(errs => [...errs, 'feedback']); }
    } catch (err) {
      if (!stale()) {
        const status = err?.response?.status;
        if (status === 403) setProjectLoadError('forbidden');
        else if (status === 400 || status === 404) setProjectLoadError('notFound');
        else setProjectLoadError('generic');
        setProject(null);
        console.error('loadProjectData error:', err);
      }
    }
  }, []);

  useEffect(() => {
    const warn = (e) => {
      if (dirtySectionsRef.current.size === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const onHidden = () => {
      if (dirtySectionsRef.current.size > 0) showToast(t('unsavedChanges'));
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(saveStatusTimerRef.current);
      const sid = selectedSectionIdRef.current;
      if (sid && dirtySectionsRef.current.has(sid)) {
        storeWorkspaceDraft(projectRef.current?.id, sid, codeContentRef.current);
      }
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoadingProject(true);
        let pid = projectId;
        const listRes = await api.get('/api/projects');
        const active = listRes.data?.content || [];
        setProjects(active);
        if (!pid && active.length > 0) { pid = active[0].id; navigate(`/student/projects/${pid}`, { replace: true }); return; }
        if (pid) await loadProjectData(pid);
      } catch (err) { console.error(err); }
      finally { setLoadingProject(false); }
    })();
  }, [projectId, loadProjectData]);

  useEffect(() => {
    if (!project?.id || !hasActiveExtraction(sources)) return undefined;

    let cancelled = false;
    let timer;
    const refresh = async () => {
      try {
        const [sourceList, mediaResponse] = await Promise.all([
          loadAllProjectSources(project.id),
          api.get(`/api/media/projects/${project.id}`),
        ]);
        if (!cancelled) {
          setSources(sourceList);
          setMediaAssets(mediaResponse.data || []);
        }
      } catch {
        if (!cancelled) timer = window.setTimeout(refresh, 5000);
        return;
      }
      if (!cancelled) timer = window.setTimeout(refresh, 5000);
    };

    timer = window.setTimeout(refresh, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [project?.id, sources]);

  const assignedSections = user ? sections.filter(s => String(s.assignedUserId) === String(user.id)) : [];
  const isLocked = project?.status === 'SUBMITTED_FOR_REVIEW' || project?.status === 'APPROVED' || project?.status === 'ARCHIVED';
  const canEditSection = (section) => {
    if (isLocked || !section) return false;
    return role === 'STUDENT'
      && Boolean(section.assignedUserId)
      && String(section.assignedUserId) === String(user?.id);
  };
  const currentSection = sections.find(section =>
    String(section.id) === String(selectedSectionId));
  useEffect(() => {
    sections.forEach(section => {
      if (section.revision != null) {
        sectionRevisionRef.current.set(String(section.id), section.revision);
      }
    });
  }, [sections]);
  const canEditCurrentSection = canEditSection(currentSection);
  // Only mark review as stale when explicitly re-run, not on local edits
  // Highlights persist during editing and only clear when a new review runs
  const requireEditableCurrentSection = () => {
    if (canEditCurrentSection) return true;
    showToast(t('readOnlySection'));
    return false;
  };

  // Citation popover state
  const [citationPopover, setCitationPopover] = useState({ open: false, findingIndex: -1, anchor: null });
  const closeCitationPopover = () => setCitationPopover({ open: false, findingIndex: -1, anchor: null });

  // Build findings data for editor decorations (with candidates for popover)
  const editorFindings = useMemo(() => {
    if (!aiReviewResult?.findings) return [];
    return aiReviewResult.findings.map((finding, index) => ({
      from: finding.startOffset,
      to: finding.endOffset,
      findingIndex: index,
      candidates: aiSourceMatches?.[index] || [],
    }));
  }, [aiReviewResult, aiSourceMatches]);

  const handleFindingClick = (findingIndex) => {
    const finding = aiReviewResult?.findings?.[findingIndex];
    if (!finding) return;
    // Get anchor position from editor
    const coords = editorRef.current?.coordsAtPos(finding.startOffset);
    if (!coords) return;
    setCitationPopover({
      open: true,
      findingIndex,
      anchor: { left: coords.left, top: coords.bottom },
    });
  };

  useEffect(() => {
    const ranges = aiReviewResult
      ? (aiReviewResult?.findings || []).map(finding => ({
        from: finding.startOffset,
        to: finding.endOffset,
      }))
      : [];
    editorRef.current?.setReviewRanges(ranges);
  }, [aiReviewResult]);

  useEffect(() => {
    if (!selectedPaper) { setSections([]); return; }
    api.get(`/api/papers/${selectedPaper.id}/sections`)
      .then(r => {
        const list = r.data || [];
        setSections(list);
        const mine = user ? list.filter(s => String(s.assignedUserId) === String(user.id)) : [];
        if (mine.length > 0) {
          selectSection(mine[0].id);
          const draft = readWorkspaceDraft(projectRef.current?.id, mine[0].id);
          if (draft !== null) {
            loadCode(draft);
            dirtySectionsRef.current.add(mine[0].id);
          } else {
            loadCode(mine[0].contentTex || '');
          }
        } else {
          selectSection('');
          loadCode('');
        }
      })
      .catch(() => setSections([]));
  }, [selectedPaper, user]);

  useEffect(() => {
    const unsubscribe = subscribeToNotifications(localStorage.getItem('token'), n => {
      setNotifications(prev => [n, ...prev]);
      setUnreadCount(c => c + 1);
      if (n.actionType === 'EXPORT_READY') {
        showToast(t('exportReady'));
        if (project) fetchExports();
      } else {
        showToast(n.message || t('newNotification'));
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    api.get('/api/notifications/unread-count').then(r => setUnreadCount(r.data?.count || 0)).catch(() => console.warn('Failed to load unread count'));
    api.get('/api/notifications').then(r => setNotifications(r.data || [])).catch(() => console.warn('Failed to load notifications'));
  }, [projectId]);

  const handleMarkNotificationRead = async (id) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch { showToast(t('markNotificationFailed')); }
  };

  const handleExportTexArchive = async () => {
    if (!project) return;
    try {
      const r = await api.get(`/api/projects/${project.id}/export?format=tex`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a'); a.href = url; a.download = `papers-${project?.title || 'export'}.zip`;
      a.click(); URL.revokeObjectURL(url);
      showToast(t('paperArchiveDownloaded'));
    } catch { showToast(t('exportFailed')); }
  };

  const fetchExports = useCallback(async () => {
    if (!project) return;
    try { const r = await api.get('/api/exports', { params: { projectId: project.id } }); setExports(r.data || []); } catch { console.warn('Failed to load exports'); }
  }, [project]);

  const fetchSources = useCallback(async () => {
    if (!project) return;
    try { setSources(await loadAllProjectSources(project.id)); } catch { console.warn('Failed to refresh sources'); }
  }, [project]);

  // CRUD handlers
  const handleUploadPaper = async (file) => {
    if (!file || !project) return;
    showToast(t('uploadingFile', { name: file.name }));
    const fd = new FormData();
    fd.append('file', file); fd.append('projectId', project.id);
    try {
      await api.post('/api/papers', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      showToast(t('paperUploaded'));
      const r = await api.get(`/api/projects/${project.id}/papers`);
      const list = r.data || [];
      setPapers(list);
      if (list.length > 0) { setSelectedPaper(list[list.length - 1]); loadCode(''); }
    } catch { showToast(t('uploadFailed')); }
  };

  const handleDeletePaper = async (paperId) => {
    setPapers(prev => prev.filter(p => String(p.id) !== String(paperId)));
    if (selectedPaper && String(selectedPaper.id) === String(paperId)) setSelectedPaper(null);
    const paper = papers.find(p => String(p.id) === String(paperId));
    startDelete({
      ...undoStrings,
      entityName: paper?.title || paper?.originalFilename || paperId,
      entityDetails: paperId,
    }, async () => {
      try {
        await api.delete(`/api/papers/${paperId}`);
        showToast(t('paperDeleted'));
      } catch { showToast(t('deleteFailed')); }
      const r = await api.get(`/api/projects/${project.id}/papers`);
      const list = r.data || [];
      setPapers(list);
      if (selectedPaper && String(selectedPaper.id) === String(paperId)) {
        if (list.length > 0) { setSelectedPaper(list[0]); loadCode(''); }
        else { setSelectedPaper(null); loadCode(''); }
      }
    }, async () => {
      const r = await api.get(`/api/projects/${project.id}/papers`);
      setPapers(r.data || []);
    });
  };

  const handleUploadSource = async (file) => {
    if (isLocked) { showToast(t('projectLocked')); return; }
    if (!file || !project || !user) return;
    showToast(t('uploadingFile', { name: file.name }));
    const fd = new FormData();
    fd.append('file', file); fd.append('projectId', project.id);
    try {
      await api.post('/api/sources', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      showToast(t('sourceUploaded'));
      setSources(await loadAllProjectSources(project.id));
    } catch { showToast(t('uploadFailed')); }
  };

  const handleDeleteSource = async (sourceId) => {
    setSources(prev => prev.filter(s => String(s.id) !== String(sourceId)));
    const src = sources.find(s => String(s.id) === String(sourceId));
    startDelete({
      ...undoStrings,
      entityName: src?.title || src?.originalFilename || sourceId,
      entityDetails: sourceId,
    }, async () => {
      try {
        await api.delete(`/api/documents/${sourceId}`);
        showToast(t('sourceDeleted'));
      } catch (err) {
        showToast(err?.response?.data?.message || t('deleteFailed'));
      }
      setSources(await loadAllProjectSources(project.id));
    }, async () => {
      setSources(await loadAllProjectSources(project.id));
    });
  };

  const handleUploadMedia = async (file) => {
    if (isLocked) { showToast(t('projectLocked')); return; }
    if (!file || !project) return;
    showToast(t('uploadingFile', { name: file.name }));
    const fd = new FormData();
    fd.append('file', file); fd.append('projectId', project.id);
    try {
      await api.post('/api/media', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      showToast(t('mediaUploaded'));
      const r = await api.get(`/api/media/projects/${project.id}`);
      setMediaAssets(r.data || []);
    } catch { showToast(t('uploadFailed')); }
  };

  const handleDeleteMedia = async (mediaId) => {
    setMediaAssets(prev => prev.filter(m => String(m.id) !== String(mediaId)));
    const media = mediaAssets.find(m => String(m.id) === String(mediaId));
    startDelete({
      ...undoStrings,
      entityName: media?.originalFilename || mediaId,
      entityDetails: mediaId,
    }, async () => {
      try {
        await api.delete(`/api/media/${mediaId}`);
        showToast(t('mediaDeleted'));
      } catch { showToast(t('deleteFailed')); }
      const r = await api.get(`/api/media/projects/${project.id}`);
      setMediaAssets(r.data || []);
    }, async () => {
      const r = await api.get(`/api/media/projects/${project.id}`);
      setMediaAssets(r.data || []);
    });
  };

  const handleInsertMedia = (texFilename) => {
    if (!requireEditableCurrentSection()) return;
    const ed = editorRef.current;
    if (!ed) return;
    ed.insertAtCursor(`\\includegraphics{${texFilename}}`, 0);
    showToast(`${t('mediaInserted')} ${texFilename}`);
  };

  const handleAssignSection = async (sectionId, assignedUserId) => {
    if (!selectedPaper) return;
    try {
      await api.put(`/api/papers/${selectedPaper.id}/sections/${sectionId}/assign`, null, { params: { assignedUserId } });
      showToast(t(assignedUserId ? 'sectionAssigned' : 'sectionUnassigned'));
      const r = await api.get(`/api/papers/${selectedPaper.id}/sections`);
      setSections(r.data || []);
    } catch { showToast(t('assignFailed')); }
  };

  const handleRollbackSection = async (sectionId) => {
    if (!selectedPaper) return;
    const section = sections.find(item => String(item.id) === String(sectionId));
    if (section?.revision == null) { showToast(t('restoreFailed')); return; }
    if (!window.confirm(t('restoreConfirm'))) return;
    const paperId = selectedPaper.id;
    setRollingBack(true);
    try {
      const res = await api.post(
        `/api/papers/${paperId}/sections/${sectionId}/rollback`,
        null,
        { params: { expectedRevision: section.revision } },
      );
      const updated = res.data;
      sectionRevisionRef.current.set(String(updated.id), updated.revision);
      setSections(prev => prev.map(s => String(s.id) === String(updated.id) ? updated : s));
      if (String(updated.id) === String(selectedSectionIdRef.current)) {
        dirtySectionsRef.current.delete(updated.id);
        removeWorkspaceDraft(projectRef.current?.id, updated.id);
        loadCode(updated.contentTex || '');
      }
      showToast(t('versionRestored'));
      setTimeout(() => { setShowHistoryModal(false); setRollingBack(false); }, 300);
    } catch (error) {
      showToast(error?.response?.status === 409 ? t('saveConflict') : t('restoreFailed'));
      setRollingBack(false);
    }
  };

  const [saveStatus, setSaveStatus] = useState('');
  const [lastSaved, setLastSaved] = useState(null);

  const handleSaveDraft = async () => {
    if (!requireEditableCurrentSection()) return false;
    if (!selectedPaper) { showToast(t('noPaperSelected')); return false; }
    if (!selectedSectionId) { showToast(t('noSectionSelected')); return false; }
    if (saveInFlightRef.current.has(String(selectedSectionIdRef.current))) return false;
    window.clearTimeout(saveStatusTimerRef.current);
    setSaveStatus('saving');
    const paperId = selectedPaper.id;
    const projectId = projectRef.current?.id;
    const sectionId = selectedSectionIdRef.current;
    const content = codeContentRef.current;
    const revision = sections.find(section =>
      String(section.id) === String(sectionId))?.revision;
    try {
      const updated = await putSectionContent(
        paperId, sectionId, content, revision);
      setSections(previous => previous.map(section =>
        withSavedContent(section, sectionId, content, updated)));
      setLastSaved(new Date());
      const stillCurrent = String(selectedSectionIdRef.current) === String(sectionId);
      if (!stillCurrent || codeContentRef.current !== content) {
        if (stillCurrent) {
          dirtySectionsRef.current.add(sectionId);
          storeWorkspaceDraft(projectId, sectionId, codeContentRef.current);
          showToast(t('unsavedChanges'));
        }
        setSaveStatus('');
        return false;
      }
      removeWorkspaceDraft(projectId, sectionId);
      setSaveStatus('saved');
      dirtySectionsRef.current.delete(sectionId);
      saveStatusTimerRef.current = window.setTimeout(() => setSaveStatus(''), 3000);
      return { paperId, sectionId, content, version: updated?.version };
    } catch (error) {
      setSaveStatus('error');
      const status = error?.response?.status;
      if (status === 409) showToast(t('saveConflict'));
      else if (status === 403) showToast(t('saveReadOnly'));
      else if (status === 404) showToast(t('saveSectionRemoved'));
      else if (status === 400) showToast(t('saveContentInvalid'));
      else showToast(t('saveFailed'));
      return false;
    }
  };

  const handleExportTraceabilityJson = async () => {
    if (!project) return;
    try {
      const r = await api.get(`/api/projects/${project.id}/traceability`);
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `traceability-${project.title || 'export'}.json`;
      a.click(); URL.revokeObjectURL(url);
      showToast(t('traceabilityDownloaded'));
    } catch { showToast(t('exportFailed')); }
  };

  const handleExportTraceabilityCsv = async () => {
    if (!project) return;
    try {
      const r = await api.get(`/api/projects/${project.id}/traceability/csv`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a'); a.href = url; a.download = `traceability-${project.title || 'export'}.csv`;
      a.click(); URL.revokeObjectURL(url);
      showToast(t('traceabilityCsvDownloaded'));
    } catch { showToast(t('exportFailed')); }
  };

  const fetchAiReviewSources = async (review, reviewRequestId = aiReviewRequestRef.current) => {
    const findings = review?.findings || [];
    if (!selectedPaper || !selectedSectionId || findings.length === 0) {
      setAiSourceMatches({});
      setLoadingAiSources(false);
      return;
    }
    const sourceRequestId = ++aiSourceRequestRef.current;
    setLoadingAiSources(true);
    setAiSourcesError('');
    try {
      const { data: submit } = await api.post(
        `/api/papers/${selectedPaper.id}/sections/${selectedSectionId}/review/source-matches`,
        {
          findings: findings.slice(0, 10).map((finding, findingIndex) => ({
            findingIndex,
            excerpt: finding.excerpt,
            startOffset: finding.startOffset,
            endOffset: finding.endOffset,
          })),
        },
      );
      if (aiReviewRequestRef.current !== reviewRequestId
        || aiSourceRequestRef.current !== sourceRequestId) return;
      const job = await pollAiJob(submit.jobId, () =>
        aiReviewRequestRef.current !== reviewRequestId
        || aiSourceRequestRef.current !== sourceRequestId);
      if (!job) return;
      if (aiReviewRequestRef.current !== reviewRequestId
        || aiSourceRequestRef.current !== sourceRequestId) return;
      const grouped = {};
      (job.result?.findings || []).forEach(item => { grouped[item.findingIndex] = item.candidates || []; });
      setAiSourceMatches(grouped);
    } catch (error) {
      if (aiReviewRequestRef.current === reviewRequestId
        && aiSourceRequestRef.current === sourceRequestId) {
        const message = error?.response?.status === 409
          ? t('reviewSectionChanged')
          : t('sourceSearchFailed');
        setAiSourcesError(message);
      }
    } finally {
      if (aiSourceRequestRef.current === sourceRequestId) setLoadingAiSources(false);
    }
  };

  const handleRunAiReview = async () => {
    setActiveTab('AI Review');
    localStorage.setItem('student_workspace_active_tab', 'AI Review');
    setIsDrawerOpen(true);
    if (isLocked) { showToast(t('projectLocked')); return; }
    if (!selectedPaper) { showToast(t('selectPaperFirst')); return; }
    if (!selectedSectionId || !requireEditableCurrentSection()) return;
    if (aiReviewJobRef.current) return;
    aiReviewJobRef.current = 'saving';
    setLoadingAiReview(true);
    setAiReviewProgress(null);
    let requestId = aiReviewRequestRef.current;
    try {
      const saved = await handleSaveDraft();
      if (!saved) return;

      const reviewedContent = saved.content;
      const sectionId = saved.sectionId;
      requestId = ++aiReviewRequestRef.current;
      aiReviewJobRef.current = 'submitting';
      setAiReviewError(null);
      setAiSourceMatches({});
      setAiSourcesError('');
      setSectionTraces([]);
      setUpdatingTraceIds([]);
      setTraceError('');
      const { data: submit } = await api.post(
        `/api/papers/${saved.paperId}/sections/${sectionId}/review`);
      if (aiReviewRequestRef.current !== requestId) return;
      aiReviewJobRef.current = submit.jobId;
      const job = await pollAiJob(
        submit.jobId,
        () => aiReviewRequestRef.current !== requestId,
        updateAiReviewProgress,
      );
      if (!job) return;
      setAiReviewResult(job.result);
      setAiReviewedContent(reviewedContent);
      showToast(t('aiReviewComplete'));
      setLoadingAiReview(false);
      fetchAiReviewSources(job.result, requestId);
    } catch (error) {
      if (aiReviewRequestRef.current !== requestId) return;
      const status = error.response?.status || error.status;
      const message = status === 409
        ? t('reviewSectionChanged')
        : status === 429
          ? t('aiProviderRateLimited')
          : status === 503
            ? t('aiWorkerUnavailable')
            : status === 502
              ? t('aiInvalidResponse')
              : t('aiReviewFailed');
      setAiReviewError({ status, message });
      showToast(message);
    } finally {
      aiReviewJobRef.current = null;
      setLoadingAiReview(false);
      setAiReviewProgress(null);
    }
  };

  const locateReviewFinding = (finding) => {
    const content = codeContentRef.current;
    if (content.slice(finding.startOffset, finding.endOffset) === finding.excerpt) {
      return { start: finding.startOffset, end: finding.endOffset };
    }
    const start = content.indexOf(finding.excerpt);
    if (start < 0 || content.indexOf(finding.excerpt, start + 1) >= 0) return null;
    return { start, end: start + finding.excerpt.length };
  };

  const handleSelectReviewFinding = (finding) => {
    const range = locateReviewFinding(finding);
    if (!range) { showToast(t('reviewExcerptChanged')); return; }
    editorRef.current?.selectRange(range.start, range.end);
  };

  const handleInsertReviewCitation = async (finding, candidate) => {
    if (!selectedPaper || !selectedSectionId || !requireEditableCurrentSection()) return;
    const range = locateReviewFinding(finding);
    if (!range) { showToast(t('reviewExcerptChanged')); return; }
    const current = codeContentRef.current;
    const nearby = current.slice(Math.max(0, range.start - 20), Math.min(current.length, range.end + 100));
    const citation = `\\cite{${candidate.citationKey}}`;
    if (nearby.includes(citation)) {
      showToast(t('citationAlreadyInserted'));
      return;
    }
    const punctuation = /[.,;:!?]/.test(current.charAt(range.end - 1));
    const insertionOffset = punctuation ? range.end - 1 : range.end;
    if (editorRef.current?.insertAtOffset(insertionOffset, ` ${citation}`) == null) return;
    if (await handleSaveDraft()) showToast(t('citationInserted'));
  };

  useEffect(() => {
    if (!selectedPaper?.id || !selectedSectionId) return;
    const requestId = ++aiReviewRequestRef.current;
    setAiReviewResult(null);
    setAiReviewError(null);
    setAiReviewedContent('');
    api.get(`/api/papers/${selectedPaper.id}/sections/${selectedSectionId}/review`)
      .then(response => {
        if (aiReviewRequestRef.current !== requestId || response.status === 204) return;
        const review = response.data;
        setAiReviewResult(review);
        setAiReviewedContent(codeContentRef.current);
        fetchAiReviewSources(review, requestId);
      })
      .catch(() => {
        if (aiReviewRequestRef.current === requestId) {
          setAiReviewError({ message: t('cachedReviewFailed') });
        }
      });
    // Fetch only when the selected saved section changes; draft edits make the result stale locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPaper?.id, selectedSectionId]);

  const handleSubmitReview = async () => {
    if (!project) return;
    if (submittingReviewRef.current) return;
    setShowSubmitReviewModal(false);
    if (canEditSection(sections.find(section => String(section.id) === String(selectedSectionId)))) {
      const saved = await handleSaveDraft();
      if (!saved) { showToast(t('saveSubmissionCancelled')); return; }
    }
    submittingReviewRef.current = true;
    setSubmittingReview(true);
    try {
      await api.post(`/api/projects/${project.id}/reviews`);
      showToast(t('submittedForReview'));
      await loadProjectData(project.id);
    } catch { showToast(t('submitFailed')); }
    finally { submittingReviewRef.current = false; setSubmittingReview(false); }
  };

  const handleDownloadTex = () => {
    const blob = new Blob([displayContent], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = selectedPaper ? `${selectedPaper.originalFilename?.replace(/\.pdf|\.docx/g, '') || 'document'}.tex` : 'document.tex';
    a.click(); URL.revokeObjectURL(a.href);
    showToast(t('downloadedTex'));
  };

  const insertLatexTag = (tagType) => {
    if (!requireEditableCurrentSection()) return;
    const ed = editorRef.current;
    if (!ed) return;
    const sel = ed.getSelection() || '';
    let insertion = '', offset = 0;
    const m = { bold: [`\\textbf{${sel || 'text'}}`, 8], italic: [`\\textit{${sel || 'text'}}`, 8], section: [`\\section{${sel || 'Title'}}`, 9], subsection: [`\\subsection{${sel || 'Subtitle'}}`, 12], subsubsection: [`\\subsubsection{${sel || 'Subtitle2'}}`, 15], large: [`{\\large ${sel || 'text'}}`, 8], small: [`{\\small ${sel || 'text'}}`, 8], 'inline-math': [`$${sel || 'E=mc^2'}$`, 1], list: [`\n\\begin{itemize}\n  \\item ${sel || 'item'}\n\\end{itemize}\n`, 21], equation: [`\\begin{equation}\n  ${sel || 'E = mc^2'}\n\\end{equation}`, 18], comment: [`% ${sel || 'comment'}`, 2], hl: [`\\hl{${sel || 'highlight'}}`, 4] };
    if (m[tagType]) { insertion = m[tagType][0]; offset = m[tagType][1]; }
    else if (tagType === 'label') { const n = prompt('Label name:', 'sec:label') || 'sec:label'; insertion = `\\label{${n}}`; offset = insertion.length; }
    else if (tagType === 'cite') { const k = prompt('Citation key:', 'author2026') || 'key'; insertion = `\\cite{${k}}`; offset = insertion.length; }
    else if (tagType === 'link') { const url = prompt('URL:', 'https://') || 'https://'; const l = sel || prompt('Link label:', 'Link') || 'Link'; insertion = `\\href{${url}}{${l}}`; offset = insertion.length; }
    else if (tagType === 'figure') { insertion = `\n\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{image.png}\n  \\caption{${sel || 'Caption'}}\n  \\label{fig:label}\n\\end{figure}\n`; offset = 83; }
    else if (tagType === 'table') { insertion = `\n\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{|c|c|}\n    \\hline\n    Col1 & Col2 \\\\\n    \\hline\n    ${sel || 'Row1'} & Row1 \\\\\n    Row2 & Row2 \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{Table caption}\n  \\label{tab:table}\n\\end{table}\n`; offset = 120; }
    ed.insertAtCursor(insertion, offset);
  };

  const insertSymbol = (sym) => {
    if (!requireEditableCurrentSection()) return;
    const ed = editorRef.current;
    if (!ed) return;
    ed.insertAtCursor(sym);
  };

  const handleUndo = () => {
    if (!requireEditableCurrentSection()) return;
    editorRef.current?.undo();
  };

  const handleRedo = () => {
    if (!requireEditableCurrentSection()) return;
    editorRef.current?.redo();
  };

  const handleFindReplace = (replaceAll = false) => {
    if (!requireEditableCurrentSection()) return;
    if (!searchQuery) return;
    const ed = editorRef.current;
    if (!ed) return;
    const result = replaceAll
      ? ed.replaceAll(searchQuery, replaceQuery)
      : ed.replaceFirst(searchQuery, replaceQuery);
    if (!result.changed) { showToast(t('notFound')); return; }
    if (replaceAll) showToast(t('replacedAll'));
  };

  const generateRichTextHtml = (latexCode) => {
    let body = latexCode.replace(/\\documentclass.*?\n/g, '').replace(/\\usepackage.*?\n/g, '').replace(/\\title\{.*?\}/g, '').replace(/\\author\{.*?\}/g, '').replace(/\\date\{.*?\}/g, '').replace(/\\begin\{document\}/g, '').replace(/\\end\{document\}/g, '').replace(/\\maketitle/g, '');
    const titleMatch = latexCode.match(/\\title\{([^}]+)\}/);
    const authorMatch = latexCode.match(/\\author\{([^}]+)\}/);
    const sections = body.split(/\\section\{([^}]+)\}/);
    let html = '';
    if (titleMatch) html += `<h1 class="text-3xl font-bold mb-2">${titleMatch[1].replace(/\\\\/g, ' ')}</h1>`;
    if (authorMatch) html += `<p class="text-sm text-slate-500 mb-8 italic">By ${authorMatch[1]}</p>`;
    const parse = (text) => text.replace(/\\hl\{([^}]+)\}/g, '<span class="bg-yellow-200/50 px-1.5 rounded">$1</span>');
    if (sections[0]?.trim()) html += `<p class="mb-6">${parse(sections[0].trim())}</p>`;
    for (let i = 1; i < sections.length; i += 2) {
      html += `<h2 class="text-xl font-bold mb-3">${sections[i]}</h2>`;
      (sections[i + 1] || '').split('\n\n').filter(p => p.trim()).forEach(p => { html += `<p class="mb-6">${parse(p.trim())}</p>`; });
    }
    return html;
  };

  const parseHtmlToLatex = (container) => {
    let latex = `\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{xcolor}\n\\usepackage{soul}\n\n`;
    Array.from(container.children).forEach(child => {
      if (child.tagName === 'H1') latex += `\\title{${child.innerText}}\n`;
      else if (child.tagName === 'P' && child.innerText.startsWith('By ')) latex += `\\author{${child.innerText.substring(3)}}\n\\date{\\today}\n\n\\begin{document}\n\n\\maketitle\n\n`;
      else if (child.tagName === 'H2') latex += `\\section{${child.innerText}}\n\n`;
      else if (child.tagName === 'P') {
        let text = child.innerHTML.replace(/<span[^>]*>(.*?)<\/span>/g, '\\hl{$1}').replace(/&nbsp;/g, ' ');
        text = text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>?/gm, '');
        if (text.trim()) latex += `${text}\n\n`;
      }
    });
    return latex.trim();
  };

  const renderModalPaperPdf = (paperName) => {
    const dbPaper = papers.find(p => p.filename === paperName || p.name === paperName);
    const content = dbPaper?.content || '';
    if (!content) return <div className="text-center py-8 text-xs text-slate-400 italic">{t('noContent')}</div>;
    const pages = content.split(/\\newpage|\\clearpage/);
    return pages.map((pageContent, pageIndex) => {
      const titleMatch = pageContent.match(/\\title\{([^}]+)\}/);
      const authorMatch = pageContent.match(/\\author\{([^}]+)\}/);
      let body = pageContent.replace(/\\documentclass.*?\n/g, '').replace(/\\usepackage.*?\n/g, '').replace(/\\title\{.*?\}/g, '').replace(/\\author\{.*?\}/g, '').replace(/\\date\{.*?\}/g, '').replace(/\\begin\{document\}/g, '').replace(/\\end\{document\}/g, '').replace(/\\maketitle/g, '');
      const sections = body.split(/\\section\{([^}]+)\}/);
      const elements = [];
      const parse = (text) => text.split(/\\hl\{([^}]+)\}/g).map((part, idx) => idx % 2 === 1 ? <span key={idx} className="bg-yellow-100 px-1 rounded-sm border-b border-yellow-300 font-bold">{part}</span> : part);
      if (titleMatch || authorMatch) elements.push(<div key="hdr" className="text-center mb-6">{titleMatch && <h1 className="text-lg font-bold font-serif">{titleMatch[1]}</h1>}{authorMatch && <p className="text-xs text-slate-500">{authorMatch[1]}</p>}</div>);
      if (sections[0]?.trim()) elements.push(<p key="intro" className="text-[12px] mb-4 leading-relaxed font-serif text-justify">{parse(sections[0].trim())}</p>);
      for (let i = 1; i < sections.length; i += 2) {
        const st = sections[i], sc = sections[i + 1] || '';
        elements.push(<h2 key={`h2-${i}`} className="font-bold text-xs mb-2 text-indigo-700 font-serif uppercase tracking-wider mt-3 border-b border-slate-100 pb-1">{st}</h2>);
        sc.split('\n\n').filter(p => p.trim()).forEach((p, pi) => elements.push(<p key={`p-${i}-${pi}`} className="text-[11px] mb-3 leading-relaxed text-slate-600 font-serif text-justify">{parse(p.trim())}</p>));
      }
      return <div key={pageIndex} className="bg-white border border-slate-200/80 shadow-sm rounded-xl p-5 mb-4 max-h-[350px] overflow-y-auto custom-scrollbar font-serif select-text">{elements}</div>;
    });
  };

  const tourSteps = useMemo(() => [
    { element: '[data-tour="header-project-name"]', popover: { title: t('tour.projectName'), description: t('tour.projectNameDesc'), side: 'bottom' } },
    { element: '[data-tour="header-history"]', popover: { title: t('tour.versionHistory'), description: t('tour.versionHistoryDesc'), side: 'bottom' } },
    { element: '[data-tour="header-ai-review"]', popover: { title: t('tour.aiReview'), description: t('tour.aiReviewDesc'), side: 'bottom' } },
    { element: '[data-tour="sidebar-left"]', popover: { title: t('tour.sidebarLeft'), description: t('tour.sidebarLeftDesc'), side: 'right' } },
    { element: '[data-tour="file-panel"]', popover: { title: t('tour.filePanel'), description: t('tour.filePanelDesc'), side: 'right' } },
    { element: '[data-tour="editor-toolbar"]', popover: { title: t('tour.editorToolbar'), description: t('tour.editorToolbarDesc'), side: 'bottom' } },
    { element: '[data-tour="editor-section-name"]', popover: { title: t('tour.editorSectionName'), description: t('tour.editorSectionNameDesc'), side: 'bottom' } },
    { element: '[data-tour="context-panel"]', popover: { title: t('tour.contextPanel'), description: t('tour.contextPanelDesc'), side: 'left' } },
    { element: '[data-tour="context-ai-review-tab"]', popover: { title: t('tour.aiReview'), description: t('tour.aiReviewDesc'), side: 'left' } },
    { element: '[data-tour="context-feedback-tab"]', popover: { title: t('tour.feedback'), description: t('tour.feedbackDesc'), side: 'left' } },
    { element: '[data-tour="header-dark-mode"]', popover: { title: t('tour.darkMode'), description: t('tour.darkModeDesc'), side: 'bottom' } },
    { element: '[data-tour="header-language"]', popover: { title: t('tour.language'), description: t('tour.languageDesc'), side: 'bottom' } },
  ], [t]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const syncLayout = ({ matches }) => {
      setIsCompactWorkspace(matches);
      setIsDrawerOpen(!matches);
      setIsFileTreeOpen(!matches);
    };
    query.addEventListener('change', syncLayout);
    return () => query.removeEventListener('change', syncLayout);
  }, []);

  const toggleFilePanel = () => setIsFileTreeOpen((open) => {
    if (!open && isCompactWorkspace) setIsDrawerOpen(false);
    return !open;
  });
  const toggleContextPanel = () => setIsDrawerOpen((open) => {
    if (!open && isCompactWorkspace) setIsFileTreeOpen(false);
    return !open;
  });

  if (projectLoadError) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-(--surface-secondary)">
        <div className="max-w-md text-center px-6">
          <h1 className="text-xl font-bold text-(--text-primary)">
            {projectLoadError === 'forbidden' ? t('projectForbiddenTitle')
              : projectLoadError === 'notFound' ? t('projectNotFoundTitle')
                : t('projectLoadErrorTitle')}
          </h1>
          <p className="mt-2 text-sm text-(--text-secondary)">
            {projectLoadError === 'forbidden' ? t('projectForbiddenMessage')
              : projectLoadError === 'notFound' ? t('projectNotFoundMessage')
                : t('projectLoadErrorMessage')}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => navigate('/student/projects')} className="rounded-lg bg-(--brand) px-4 py-2 text-xs font-bold text-white hover:bg-(--brand-hover)">
              {t('backToProjects')}
            </button>
            {projectLoadError === 'generic' && (
              <button onClick={() => loadProjectData(projectId)} className="rounded-lg bg-(--surface-tertiary) px-4 py-2 text-xs font-semibold text-(--text-secondary) hover:opacity-80">
                {t('retry')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-(--surface-secondary) overflow-hidden font-sans antialiased text-(--text-primary)">
      <WorkspaceHeader project={project} navigate={navigate} selectedPaper={selectedPaper} handleRunAiReview={handleRunAiReview} loadingAiReview={loadingAiReview} isLocked={isLocked} onShowHistory={() => setShowHistoryModal(true)} historyDisabled={assignedSections.length === 0}
        notifications={notifications} unreadCount={unreadCount} showNotifications={showNotifications} setShowNotifications={setShowNotifications} onMarkNotificationRead={handleMarkNotificationRead}
        showExportMenu={showExportMenu} setShowExportMenu={setShowExportMenu} handleExportTexArchive={handleExportTexArchive} handleExportTraceabilityJson={handleExportTraceabilityJson} handleExportTraceabilityCsv={handleExportTraceabilityCsv} />

      {loadErrors.length > 0 && (
        <div className="flex items-center justify-between gap-4 px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 text-[11px] text-amber-900 dark:text-amber-200">
          <span>{t('someAreasFailed', { areas: loadErrors.map(area => t(area === 'media' ? 'mediaAssets' : area)).join(', ') })}</span>
          <button onClick={() => setLoadErrors([])} className="font-bold hover:underline cursor-pointer shrink-0">{t('dismiss')}</button>
        </div>
      )}

      <div id="workspace-container" className="relative flex-1 flex overflow-hidden min-w-0">
        <div data-tour="sidebar-left" className="w-14 bg-indigo-900 dark:bg-(--accent-bar) flex flex-col items-center py-4 shrink-0 z-20 border-r border-indigo-950 dark:border-(--border) shadow-[2px_0_8px_-2px_rgba(0,0,0,0.2)]">
          <button onClick={toggleFilePanel} className="w-full flex justify-center relative cursor-pointer mb-6 group outline-none" title={t('toggleFilePanel')} aria-pressed={isFileTreeOpen}>
            <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-r-md transition-colors ${isFileTreeOpen ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-transparent'}`}></div>
            <svg className={`w-[22px] h-[22px] transition-colors ${isFileTreeOpen ? 'text-white' : 'text-indigo-300 group-hover:text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </button>
          <button onClick={toggleContextPanel} className="w-full flex justify-center cursor-pointer mb-6 group relative" title={t('toggleContextPanel')} aria-pressed={isDrawerOpen}>
            <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-r-md transition-colors ${isDrawerOpen ? 'bg-indigo-400' : 'bg-transparent'}`}></div>
            <svg className={`w-[22px] h-[22px] transition-colors ${isDrawerOpen ? 'text-white' : 'text-indigo-300 group-hover:text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
        </div>

        <FilePanel compact={isCompactWorkspace} isOpen={isFileTreeOpen} width={fileTreeWidth} onResizeStart={handleLeftDividerMouseDown} sections={sections} assignedSections={assignedSections} selectedSectionId={selectedSectionId} onSelectSection={handleSelectSection} selectedPaper={selectedPaper} onSelectPaper={handleSelectPaper} onViewFullPaper={setShowFullPaperPreview} papers={papers} onUploadPaper={isLocked ? undefined : handleUploadPaper} sources={sources} onUploadSource={isLocked ? undefined : handleUploadSource} onDeleteSource={handleDeleteSource} mediaAssets={mediaAssets} onUploadMedia={isLocked ? undefined : handleUploadMedia} onDeleteMedia={handleDeleteMedia} onInsertMedia={canEditCurrentSection ? handleInsertMedia : undefined} showToast={showToast} isLocked={isLocked} onSaveDraft={handleSaveDraft} saveStatus={saveStatus} />

        <EditorPanel compact={isCompactWorkspace} editorRef={editorRef} selectedPaper={selectedPaper} selectedSectionId={selectedSectionId} assignedSections={assignedSections} canEditCurrentSection={canEditCurrentSection} currentSection={currentSection} displayContent={displayContent} updateCode={isLocked ? undefined : updateCode} editorWidth={editorWidth} onEditorResizeStart={handleMouseDown} saveStatus={saveStatus} lastSaved={lastSaved} handleSaveDraft={handleSaveDraft} insertLatexTag={insertLatexTag} insertSymbol={insertSymbol} handleFindReplace={handleFindReplace} handleDownloadTex={handleDownloadTex} showSymbolMenu={showSymbolMenu} setShowSymbolMenu={setShowSymbolMenu} showTextSizeMenu={showTextSizeMenu} setShowTextSizeMenu={setShowTextSizeMenu} showSearchPanel={showSearchPanel} setShowSearchPanel={setShowSearchPanel} searchQuery={searchQuery} setSearchQuery={setSearchQuery} replaceQuery={replaceQuery} setReplaceQuery={setReplaceQuery} textSize={textSize} setTextSize={setTextSize} showToast={showToast} mediaAssets={mediaAssets} isLocked={isLocked} findings={editorFindings} onFindingClick={handleFindingClick} sources={sources} aiSourceMatches={aiSourceMatches} />

        <ContextPanel compact={isCompactWorkspace} isOpen={isDrawerOpen} width={rightDrawerWidth} activeTab={activeTab} setActiveTab={(tab) => { setActiveTab(tab); localStorage.setItem('student_workspace_active_tab', tab); }} showToast={showToast}
          sources={sources} isUploading={isUploading} setIsUploading={setIsUploading} project={project} setViewerFile={setViewerFile} fetchSources={fetchSources} isLocked={isLocked}
          feedbacks={feedbacks} assignedSections={assignedSections} setShowSubmitReviewModal={setShowSubmitReviewModal} userProjectRole={project?.currentUserRole}
          aiReview={aiReviewResult} aiReviewLoading={loadingAiReview} aiReviewProgress={aiReviewProgress} aiReviewError={aiReviewError}
          aiSourceMatches={aiSourceMatches} aiSourcesLoading={loadingAiSources} aiSourcesError={aiSourcesError}
          onRunAiReview={handleRunAiReview} onSelectReviewFinding={handleSelectReviewFinding}
          onInsertCitation={handleInsertReviewCitation} onRetryReviewSources={() => fetchAiReviewSources(aiReviewResult)}
          canReviewSection={canEditCurrentSection} reviewSectionTitle={currentSection?.sectionTitle || null} />
      </div>

      {/* Restore Previous Save Modal */}
      {showHistoryModal && (
        <div data-tour="history-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-(--surface) rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center px-6 py-4 border-b border-(--border-light) shrink-0">
              <h2 className="text-base font-bold text-(--text-primary) flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {t('versionHistory')}
              </h2>
              <button onClick={() => setShowHistoryModal(false)} className="text-(--text-tertiary) hover:text-(--text-secondary) transition-colors p-1 rounded-lg hover:bg-(--surface-tertiary)">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {assignedSections.length === 0 ? (
                <div className="text-xs text-(--text-tertiary) italic text-center py-8">{t('noAssignedHistory')}</div>
              ) : (() => {
                const sec = sections.find(s => String(s.id) === String(selectedSectionId)) || assignedSections[0];
                return sec ? (
                  <>
                    {sec.previousContentTex != null && sec.previousContentTex !== sec.contentTex && (
                      <div className="border border-(--border) rounded-xl p-4 bg-(--surface-secondary)/50 hover:border-amber-300 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-200">{t('previousSave')}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-(--text-secondary) leading-relaxed font-mono bg-(--surface) rounded-lg p-2.5 border border-(--border-light)">{(sec.previousContentTex || '').substring(0, 140)}{(sec.previousContentTex || '').length > 140 ? '...' : ''}</p>
                        <button onClick={handleRollbackSection.bind(null, sec.id)} disabled={rollingBack} className="mt-3 w-full bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer">
                          {rollingBack ? (
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></span> {t('restoring')}</span>
                          ) : (
                            <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a5 5 0 015 5v2a5 5 0 01-5 5H6m0-10l4-4m-4 4l4 4" /></svg> {t('restoreVersion')}</>
                          )}
                        </button>
                      </div>
                    )}
                    {(sec.previousContentTex == null || sec.previousContentTex === sec.contentTex) && (
                      <div className="text-xs text-(--text-tertiary) italic text-center py-4">{t('noPreviousSave')}</div>
                    )}
                    <div className="border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 bg-indigo-50/30 dark:bg-indigo-900/10">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">{t('currentVersionLabel', { version: sec.version || 1 })}</span>
                          <p className="text-[10px] text-(--text-tertiary) mt-1.5">{t('updatedAtLabel', { date: sec.updatedAt ? new Date(sec.updatedAt).toLocaleString(i18n.language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : t('unknown') })}</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-(--text-secondary) leading-relaxed font-mono bg-(--surface) rounded-lg p-2.5 border border-(--border-light)">{(sec.contentTex || '').substring(0, 140)}{(sec.contentTex || '').length > 140 ? '...' : ''}</p>
                      <div className="mt-2 text-[10px] text-(--text-tertiary) italic flex items-center gap-1"><svg className="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg> {t('currentEditedVersion')}</div>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-(--text-tertiary) italic text-center py-8">{t('selectSectionHistory')}</div>
                );
              })()}
            </div>
            <div className="px-6 py-3 border-t border-(--border-light) flex justify-end shrink-0 bg-(--surface-secondary)/50">
              <button onClick={() => setShowHistoryModal(false)} className="text-xs font-semibold text-(--text-secondary) hover:text-(--text-primary) px-4 py-1.5 rounded-lg hover:bg-(--surface-tertiary) transition-colors cursor-pointer border border-(--border) bg-(--surface)">{t('close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Revise Modal */}
      {showReviseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-(--surface) rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-(--text-primary)">{t('autoRevise')}</h2>
              <button onClick={() => setShowReviseModal(false)} className="text-(--text-tertiary) hover:text-(--text-secondary) transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-(--text-secondary) mb-4">{t('autoReviseDescription')}</p>
            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {sections.map(sec => (
                <label key={sec.id} className="flex items-center gap-3 p-2.5 border border-(--border) rounded-lg cursor-pointer hover:bg-(--surface-secondary) transition-colors">
                  <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded border-(--border) focus:ring-indigo-500" defaultChecked />
                  <span className="text-sm font-medium text-(--text-primary)">{sec.sectionTitle} <span className="text-[10px] text-(--text-tertiary)">v{sec.version || 1}</span></span>
                </label>
              ))}
              {sections.length === 0 && <div className="text-xs text-(--text-tertiary) italic text-center py-4">{t('noSectionsAvailable')}</div>}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowReviseModal(false)} className="px-4 py-2 text-sm font-semibold text-(--text-secondary) hover:bg-(--surface-tertiary) rounded-lg transition-colors">{t('cancel')}</button>
              <button onClick={async () => {
                if (!selectedPaper) { showToast(t('selectPaperFirst')); return; }
                setShowReviseModal(false);
                handleRunAiReview();
              }} className="px-4 py-2 text-sm font-bold text-(--on-brand) bg-(--brand) hover:bg-(--brand-hover) rounded-lg shadow-sm transition-colors">{t('startRevision')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Review Modal */}
      {showSubmitReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-(--surface) rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-(--text-primary)">{t('submitReview')}</h2>
              <button onClick={() => setShowSubmitReviewModal(false)} className="text-(--text-tertiary) hover:text-(--text-secondary) transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-(--text-secondary) mb-6 leading-relaxed">
              {t('submitReviewDescription')}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowSubmitReviewModal(false)} className="px-4 py-2 text-sm font-semibold text-(--text-secondary) hover:bg-(--surface-tertiary) rounded-lg transition-colors">{t('cancel')}</button>
              <button onClick={handleSubmitReview} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-200 transition-colors cursor-pointer">{t('submitReview')}</button>
            </div>
          </div>
        </div>
      )}

      {viewerFile && <FileViewerModal fileUrl={viewerFile.fileUrl} fileName={viewerFile.fileName} onClose={() => setViewerFile(null)} />}

      {/* Paper Detail Modal */}
      {selectedPaperDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-(--surface) rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden transform transition-all border border-(--border-light) flex flex-col h-[85vh]">
            <div className="px-6 py-4 border-b border-(--border-light) bg-(--surface-secondary) flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-white px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ backgroundColor: selectedPaperDetail.color }}>{t('paper')} #{selectedPaperDetail.num}</span>
                <span className="text-[10px] font-bold text-(--text-tertiary) font-mono">{selectedPaperDetail.name}</span>
              </div>
              <button onClick={() => setSelectedPaperDetail(null)} className="text-(--text-tertiary) hover:text-(--text-secondary) transition-colors p-1.5 hover:bg-(--surface-tertiary) rounded-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 flex overflow-hidden">
              <div className="w-1/2 p-6 overflow-y-auto custom-scrollbar space-y-4 border-r border-(--border)">
                <h3 className="text-base font-extrabold text-(--text-primary) leading-snug">{selectedPaperDetail.title}</h3>
                <p className="text-[10px] text-(--text-tertiary)">{t('created')}: {selectedPaperDetail.created}</p>
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-bold text-(--text-secondary)">{t('category')}:</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md text-white shadow-sm" style={{ backgroundColor: selectedPaperDetail.color }}>{selectedPaperDetail.category}</span>
                </div>
                <div className="bg-(--surface-secondary) rounded-xl p-4 border border-(--border)/60">
                  <h4 className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-widest mb-1.5">{t('summary')}</h4>
                  <p className="text-xs text-(--text-secondary) leading-relaxed font-medium">{selectedPaperDetail.summary}</p>
                </div>
              </div>
              <div className="w-1/2 p-6 bg-(--surface-tertiary) flex flex-col overflow-hidden">
                <h4 className="text-[10px] font-black text-(--text-secondary) uppercase tracking-widest mb-3 flex items-center gap-1.5 shrink-0">
                  <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" /></svg>
                  {t('pdfPreview')}
                </h4>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">{renderModalPaperPdf(selectedPaperDetail.name)}</div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-(--border-light) bg-(--surface-secondary) flex justify-end shrink-0">
              <button onClick={() => setSelectedPaperDetail(null)} className="px-4 py-2 text-xs font-bold text-(--on-brand) bg-(--brand) hover:bg-(--brand-hover) rounded-lg shadow-md transition-colors">{t('close')}</button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[9999] bg-slate-900 text-white text-xs font-semibold px-4.5 py-3 rounded-xl shadow-2xl border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>{toastMessage}</span>
        </div>
      )}

      {pendingDelete && <UndoToast pending={pendingDelete} onUndo={undoDelete} onDismiss={dismissDelete} />}

      <CitationPopover
        open={citationPopover.open}
        finding={aiReviewResult?.findings?.[citationPopover.findingIndex]}
        candidates={aiSourceMatches?.[citationPopover.findingIndex] || []}
        onInsertCitation={handleInsertReviewCitation}
        onClose={closeCitationPopover}
        anchor={citationPopover.anchor}
      />

      <TourLauncher steps={tourSteps} tourKey="student-workspace" />

      {showFullPaperPreview && (
        <FullPaperPreview
          sections={sections}
          paperTitle={selectedPaper?.originalFilename || 'Paper'}
          mediaAssets={mediaAssets}
          onClose={() => setShowFullPaperPreview(false)}
        />
      )}
    </div>
  );
}
