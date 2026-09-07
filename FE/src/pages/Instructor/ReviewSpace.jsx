import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { StatusBadge, LoadingSkeleton, AppHeader, Modal, Breadcrumb } from '../../components';
import api from '../../services/api.js';
// ponytail: diff-match-patch removed — see LatexEditor.jsx
import { renderLatexToHtml } from '../../utils/formatters/latexHtml.js';
import { formatDateTime } from '../../utils/formatters/date.js';
import { commonText, instructorText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import useUndoDelete, { UndoToast } from '../../components/ui/UndoDelete.jsx';
import FileViewerModal from '../../components/features/FileViewerModal';
import DeleteConfirm from '../../components/ui/DeleteConfirm.jsx';
import LatexEditor from '../../components/features/LatexEditor.jsx';
import { normalizeSource, resolveAnchor, sourceFingerprint } from '../../utils/student/feedbackAnchors.js';

function wrapLatexLines(latex) {
  if (!latex) return '';
  const lines = latex.split(/\r?\n/);
  let inBlock = false;
  
  const mathTableEnvs = ['equation', 'equation*', 'align', 'align*', 'aligned', 'aligned*', 'tabular', 'table', 'matrix', 'pmatrix', 'bmatrix', 'array'];

  const wrappedLines = lines.map((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    if (!trimmed) return line;
    
    // Check for math/table block starts/ends
    const beginMatch = trimmed.match(/\\begin\{([^}]+)\}/);
    const endMatch = trimmed.match(/\\end\{([^}]+)\}/);
    
    const isBlockStart = (beginMatch && mathTableEnvs.includes(beginMatch[1])) || trimmed.includes('\\[') || trimmed.includes('$$');
    const isBlockEnd = (endMatch && mathTableEnvs.includes(endMatch[1])) || trimmed.includes('\\]') || trimmed.includes('$$');
    
    if (isBlockStart) {
      inBlock = true;
    }
    
    let result = line;
    
    if (!inBlock) {
      const isStructureCommand = trimmed.startsWith('\\section') || 
                                 trimmed.startsWith('\\subsection') || 
                                 trimmed.startsWith('\\title') || 
                                 trimmed.startsWith('\\author') || 
                                 trimmed.startsWith('\\documentclass') || 
                                 trimmed.startsWith('\\usepackage') || 
                                 trimmed.startsWith('\\maketitle');
      
      if (!isStructureCommand) {
        if (trimmed.startsWith('\\item')) {
          const itemIdx = line.indexOf('\\item');
          const pre = line.substring(0, itemIdx + 5);
          const post = line.substring(itemIdx + 5);
          result = `${pre}<span data-line="${lineNum}" class="hover:bg-indigo-50/50 transition-colors">${post}</span>`;
        } else {
          result = `<span data-line="${lineNum}" class="hover:bg-indigo-50/50 transition-colors">${line}</span>`;
        }
      }
    }
    
    if (isBlockEnd) {
      inBlock = false;
    }
    
    return result;
  });
  
  return wrappedLines.join('\n');
}


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

function DiffView({ ops }) {
  return (
    <div className="font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-[55vh] overflow-y-auto pr-1 hide-scrollbar">
      {ops.map((op, i) => op[0] === 0 ? <span key={i}>{op[1]}</span>
        : op[0] === 1 ? <span key={i} className="bg-emerald-100 text-emerald-800 rounded px-0.5">{op[1]}</span>
          : <span key={i} className="bg-rose-100 text-rose-700 line-through rounded px-0.5">{op[1]}</span>)}
    </div>
  );
}

const ACTION_LABELS = {
  REVIEWED: { key: 'approve', cls: 'bg-emerald-600 hover:bg-emerald-700' },
  RETURNED: { key: 'returnForRevision', cls: 'bg-amber-500 hover:bg-amber-600' },
};

export default function ReviewSpace() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { language } = useLanguage();
  const t = instructorText[language];
  const ct = commonText[language];
  const { pending: pendingDelete, start: startDelete, undo: undoDelete, dismiss: dismissDelete } = useUndoDelete();
  const undoStrings = {
    header: t.undoHeader,
    bodyTemplate: t.undoBodyTemplate,
    caution: t.undoCaution,
    undoLabel: t.undoLabel,
    undoRemaining: t.undoRemaining,
    dismissLabel: t.dismissLabel,
  };
  const [project, setProject] = useState(null);
  const [papers, setPapers] = useState([]);
  const [livePapers, setLivePapers] = useState([]);
  const [sections, setSections] = useState([]);
  const [selectedPaperId, setSelectedPaperId] = useState(null);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [requests, setRequests] = useState([]);
  const [activeRequestId, setActiveRequestId] = useState(null);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [diffEnabled, setDiffEnabled] = useState(false);
  const [baseline, setBaseline] = useState(null);
  const [baselineSectionId, setBaselineSectionId] = useState(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const draftKey = JSON.stringify([projectId, activeRequestId, selectedSectionId]);
  const { content: feedbackDraft = '', lineReference: feedbackLineRef = '',
    anchor: selectedAnchor = null, editingId: editingFeedbackId = null } = feedbackDrafts[draftKey] || {};
  const updateFeedbackDraft = change => setFeedbackDrafts(previous => ({
    ...previous, [draftKey]: { ...previous[draftKey], ...change },
  }));
  const clearFeedbackDraft = () => setFeedbackDrafts(previous => ({ ...previous, [draftKey]: {} }));
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyFeedbackId, setReplyFeedbackId] = useState(null);
  const [editingReplyId, setEditingReplyId] = useState(null);
  const [replyIdempotencyKey, setReplyIdempotencyKey] = useState(null);
  const [savingReply, setSavingReply] = useState(false);
  const [feedbackFilter, setFeedbackFilter] = useState('OPEN');
  const [activeFeedbackId, setActiveFeedbackId] = useState(null);
  const [viewMode, setViewMode] = useState('submitted');
  const sourceEditorRef = useRef(null);
  const [mediaUrlMap, setMediaUrlMap] = useState({});
  const [transitioningRequestId, setTransitioningRequestId] = useState(null);
  const [pendingTransition, setPendingTransition] = useState(null);
  const [hoveredLine, setHoveredLine] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [guides, setGuides] = useState([]);
  const [checkedItems, setCheckedItems] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [suggestionRan, setSuggestionRan] = useState(false);
  const [viewerFile, setViewerFile] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const [submissionSnapshot, setSubmissionSnapshot] = useState(null);
  const [snapshotState, setSnapshotState] = useState('LOADING');
  const [snapshotRetry, setSnapshotRetry] = useState(0);
  const suggestionRequestRef = useRef(0);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [panelTab, setPanelTab] = useState('manual');

  useEffect(() => {
    let cancelled = false;
    api.get('/api/review-guides')
      .then(r => { if (!cancelled) setGuides(r.data || []); })
      .catch(() => { if (!cancelled) setGuides([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    suggestionRequestRef.current += 1;
    setSuggestions([]);
    setSuggestionError('');
    setSuggestionLoading(false);
    setSuggestionRan(false);
  }, [selectedSectionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [proj, papersRes, reqs, srcs] = await Promise.all([
          api.get(`/api/projects/${projectId}`),
          api.get(`/api/projects/${projectId}/papers`),
          api.get('/api/feedback-requests'),
          loadAllProjectSources(projectId).catch(() => []),
        ]);
        if (cancelled) return;
        setProject(proj.data);
        setPapers(papersRes.data || []);
        setLivePapers(papersRes.data || []);
        setRequests((reqs.data || []).filter(r => String(r.projectId) === String(projectId)));
        setSources(srcs);
        if ((papersRes.data || []).length > 0) setSelectedPaperId(papersRes.data[0].id);
      } catch {
        if (!cancelled) setErrorMessage(t.loadReviewSpaceFailed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const orderedRequests = useMemo(() => [...requests].sort((left, right) =>
    new Date(right.requestedAt || 0) - new Date(left.requestedAt || 0)), [requests]);
  const reviewLink = new URLSearchParams(location.search).get('review');
  const feedbackLink = new URLSearchParams(location.search).get('feedback');
  const activeRequest = orderedRequests.find(r => r.id === activeRequestId) || orderedRequests[0] || null;
  const latestRequest = orderedRequests[0] || null;
  const requestLocked = !activeRequest
    || activeRequest.id !== latestRequest?.id
    || !['PENDING', 'RETURNED'].includes(activeRequest.status)
    || project?.status === 'APPROVED'
    || project?.status === 'ARCHIVED';
  const canReturn = !requestLocked && activeRequest.status === 'PENDING';
  const canCreateRoot = canReturn && viewMode === 'submitted';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const assets = await api.get(`/api/media/projects/${projectId}`);
        if (cancelled || !assets.data?.length) return;
        const r = await api.post('/api/media/urls', { ids: assets.data.map(a => a.id) });
        if (cancelled) return;
        const urls = r.data || {};
        const map = {};
        for (const asset of assets.data) {
          const url = urls[asset.id];
          if (url) map[asset.texFilename] = url;
        }
        setMediaUrlMap(map);
      } catch {
        if (!cancelled) setMediaUrlMap({});
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (requests.length > 0 && !requests.some(r => r.id === activeRequestId)) {
      setActiveRequestId((requests.find(r => r.status === 'PENDING') || requests[0]).id);
    }
  }, [requests, activeRequestId]);

  useEffect(() => {
    if (reviewLink && requests.some(request => String(request.id) === String(reviewLink))) {
      setActiveRequestId(reviewLink);
    }
  }, [reviewLink, requests]);

  useEffect(() => {
    if (!activeRequestId) {
      setSubmissionSnapshot(null);
      setSnapshotState('NONE');
      setPapers(livePapers);
      return;
    }
    let cancelled = false;
    setSnapshotState('LOADING');
    setSubmissionSnapshot(null);
    setPapers([]);
    setSections([]);
    api.get(`/api/feedback-requests/${activeRequestId}/submission-snapshot`)
      .then(response => {
        if (cancelled) return;
        const available = response.data?.state === 'AVAILABLE' && response.data?.snapshot;
        const snapshot = available ? response.data.snapshot : null;
        const nextPapers = viewMode === 'submitted' && snapshot
          ? (snapshot.papers || []).map(paper => ({ ...paper, originalFilename: paper.title }))
          : livePapers;
        setSubmissionSnapshot(snapshot);
        setSnapshotState(available ? 'AVAILABLE' : 'LEGACY_NO_SNAPSHOT');
        setPapers(nextPapers);
        setSelectedPaperId(previous => nextPapers.some(paper => String(paper.id) === String(previous))
          ? previous : nextPapers[0]?.id || null);
      })
      .catch(() => {
        if (cancelled) return;
        setSubmissionSnapshot(null);
        setSnapshotState('LOAD_ERROR');
        setPapers([]);
      });
    return () => { cancelled = true; };
  }, [activeRequestId, livePapers, snapshotRetry, viewMode]);

  useEffect(() => {
    if (!selectedPaperId) { setSections([]); setSelectedSectionId(null); return; }
    if (snapshotState === 'LOADING' || snapshotState === 'LOAD_ERROR') return;
    if (viewMode === 'submitted' && snapshotState === 'AVAILABLE') {
      const paper = (submissionSnapshot?.papers || [])
        .find(candidate => String(candidate.id) === String(selectedPaperId));
      const snapshotSections = (paper?.sections || []).map(section => ({
        ...section,
        documentId: paper.id,
        sectionTitle: section.title,
        sectionOrder: section.order,
        version: section.contentVersion,
        handoffConfirmedById: section.confirmedById,
        handoffConfirmedByName: section.confirmedByName,
        handoffConfirmedAt: section.confirmedAt,
        handoffContentVersion: section.confirmedContentVersion,
      }));
      setSections(snapshotSections);
      setSelectedSectionId(previous => snapshotSections.some(section => String(section.id) === String(previous))
        ? previous : snapshotSections[0]?.id || null);
      return;
    }
    let cancelled = false;
    api.get(`/api/papers/${selectedPaperId}/sections`)
      .then(r => { if (!cancelled) {
        const liveSections = r.data || [];
        setSections(liveSections);
        setSelectedSectionId(previous => liveSections.some(section => String(section.id) === String(previous))
          ? previous : liveSections[0]?.id || null);
      } })
      .catch(() => { if (!cancelled) setSections([]); });
    return () => { cancelled = true; };
  }, [selectedPaperId, snapshotState, submissionSnapshot, viewMode]);

  useEffect(() => {
    if (!diffEnabled || !projectId || !selectedSectionId) { setBaseline(null); setBaselineSectionId(null); return; }
    setBaseline(null);
    setBaselineSectionId(null);
    let cancelled = false;
    api.get(`/api/projects/${projectId}/checkpoints/latest/sections/${selectedSectionId}`, {
      params: activeRequest?.requestedAt ? { before: activeRequest.requestedAt } : {},
    })
      .then(r => { if (!cancelled) { setBaseline(r.data); setBaselineSectionId(selectedSectionId); } })
      .catch(() => { if (!cancelled) { setBaseline(null); setBaselineSectionId(null); } });
    return () => { cancelled = true; };
  }, [diffEnabled, projectId, selectedSectionId, activeRequest?.requestedAt]);

  const selectedSection = sections.find(s => String(s.id) === String(selectedSectionId)) || null;

  const normalizeKey = (value = '') => value.toLowerCase().replace(/[^a-z]/g, '');

  const activeGuide = useMemo(() => {
    if (!selectedSection || guides.length === 0) return null;
    const title = normalizeKey(selectedSection.sectionTitle);
    if (!title) return null;
    const exact = guides.find(g => normalizeKey(g.sectionType) === title);
    if (exact) return exact;
    const contained = guides.find(g => {
      const key = normalizeKey(g.sectionType);
      return key.length >= 5 && title.includes(key);
    });
    return contained || guides.find(g => normalizeKey(g.sectionType) === 'default') || null;
  }, [guides, selectedSection]);

  const lineRefContent = useMemo(() => {
    const map = new Map();
    for (const fb of feedbackItems) {
      if (String(fb.sectionId) !== String(selectedSectionId || '')) continue;
      if (fb.lineReference) map.set(fb.lineReference, fb.content);
    }
    return map;
  }, [feedbackItems, selectedSectionId]);

  const sectionLineRefs = Array.from(lineRefContent.keys());

  // ponytail: simplified diff — equal? no ops, else mark whole block as changed. Full semantic diff was YAGNI for checkpoint view.
  const diffOps = useMemo(() => {
    if (!diffEnabled || !baseline || !selectedSection) return null;
    if (String(baselineSectionId) !== String(selectedSection.id)) return null;
    const a = baseline.contentTex || '';
    const b = selectedSection.contentTex || '';
    if (a === b) return [[0, b]];
    return [[-1, a], [1, b]];
  }, [diffEnabled, baseline, baselineSectionId, selectedSection]);

  const loadFeedback = useCallback(async () => {
    if (orderedRequests.length === 0) {
      setFeedbackItems([]);
      return;
    }
    try {
      const responses = await Promise.all(orderedRequests.map(request =>
        api.get(`/api/feedback-requests/${request.id}/feedback`)));
      setFeedbackItems(responses.flatMap(response => response.data || []));
    } catch {
      setErrorMessage(t.loadFeedbackFailed);
    }
  }, [orderedRequests, t.loadFeedbackFailed]);

  useEffect(() => { loadFeedback(); }, [loadFeedback]);

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    if (!canCreateRoot || !activeRequestId || !selectedSectionId || !feedbackDraft.trim()) return;
    setSavingFeedback(true); setErrorMessage('');
    try {
      const body = {
        sectionId: selectedSectionId,
        lineReference: selectedAnchor ? null : feedbackLineRef.trim() || null,
        content: feedbackDraft.trim(),
        anchor: selectedAnchor ? {
          from: selectedAnchor.from,
          to: selectedAnchor.to,
          contentVersion: selectedAnchor.contentVersion,
          fingerprint: selectedAnchor.fingerprint,
          representation: 'latex-source-lf-v1',
          offsetUnit: 'utf16',
        } : null,
      };
      if (editingFeedbackId) {
        await api.patch(`/api/instructor-feedback/${editingFeedbackId}`, body);
      } else {
        await api.post(`/api/feedback-requests/${activeRequestId}/feedback`, body);
      }
      clearFeedbackDraft();
      await loadFeedback();
    } catch (err) {
      setErrorMessage(err?.response?.data?.message || t.saveFeedbackFailed);
    } finally { setSavingFeedback(false); }
  };

  const captureSourceSelection = async () => {
    if (!canCreateRoot || !selectedSection) return;
    const range = sourceEditorRef.current?.getSelectionRange?.();
    const source = normalizeSource(selectedSection.contentTex || '');
    if (!range || range.to <= range.from || range.to > source.length || !Number.isInteger(selectedSection.version)) {
      setErrorMessage(t.selectSourceRange);
      return;
    }
    try {
      updateFeedbackDraft({ anchor: {
        from: range.from,
        to: range.to,
        contentVersion: selectedSection.version,
        fingerprint: await sourceFingerprint(source),
      }, lineReference: '' });
      setPanelTab('manual');
    } catch {
      setErrorMessage(t.selectSourceRange);
    }
  };

  const handleEditFeedback = (item) => {
    updateFeedbackDraft({ editingId: item.id, content: item.content || '',
      lineReference: item.lineReference || '', anchor: null });
    setPanelTab('manual');
  };

  const handleCancelEdit = () => {
    clearFeedbackDraft();
  };

  const handleDeleteFeedback = async (itemId) => {
    const sid = String(itemId);
    const item = feedbackItems.find(f => String(f.id) === sid);
    setFeedbackItems(prev => prev.filter(f => String(f.id) !== sid));
    startDelete({
      ...undoStrings,
      entityName: item?.content || item?.text || itemId,
      entityDetails: itemId,
    }, async () => {
      try {
        await api.delete(`/api/instructor-feedback/${itemId}`);
        loadFeedback();
      } catch (err) {
        setErrorMessage(err?.response?.data?.message || t.deleteFeedbackFailed);
        loadFeedback();
      }
    }, () => { loadFeedback(); });
  };

  const resetReplyComposer = () => {
    setReplyDraft('');
    setReplyFeedbackId(null);
    setEditingReplyId(null);
    setReplyIdempotencyKey(null);
  };

  const startReply = (feedback, message = null) => {
    setReplyFeedbackId(feedback.id);
    setEditingReplyId(message?.id || null);
    setReplyDraft(message?.content || '');
    setReplyIdempotencyKey(crypto.randomUUID());
    setActiveFeedbackId(feedback.id);
  };

  const saveReply = async (feedback) => {
    if (!replyDraft.trim() || !replyFeedbackId || savingReply) return;
    setSavingReply(true); setErrorMessage('');
    const key = replyIdempotencyKey || crypto.randomUUID();
    try {
      const body = { content: replyDraft.trim(), idempotencyKey: key };
      if (editingReplyId) {
        await api.patch(`/api/instructor-feedback/${feedback.id}/replies/${editingReplyId}`, body);
      } else {
        await api.post(`/api/instructor-feedback/${feedback.id}/replies`, body);
      }
      resetReplyComposer();
      await loadFeedback();
    } catch (err) {
      setErrorMessage(err?.response?.data?.message || t.saveFeedbackFailed);
      setReplyIdempotencyKey(key);
    } finally { setSavingReply(false); }
  };

  const deleteReply = async (feedbackId, replyId) => {
    setErrorMessage('');
    try {
      await api.delete(`/api/instructor-feedback/${feedbackId}/replies/${replyId}`);
      if (editingReplyId === replyId) resetReplyComposer();
      await loadFeedback();
    } catch (err) {
      setErrorMessage(err?.response?.data?.message || t.deleteFeedbackFailed);
    }
  };

  const prepareState = async (feedback, state) => {
    setErrorMessage('');
    try {
      await api.patch(`/api/instructor-feedback/${feedback.id}/state`, {
        state,
        expectedRevision: feedback.revision,
      });
      await loadFeedback();
    } catch (err) {
      setErrorMessage(err?.response?.data?.message || t.updateStatusFailed);
    }
  };

  const selectFeedback = (feedback) => {
    if (feedback.paperId && String(feedback.paperId) !== String(selectedPaperId)) {
      setSelectedPaperId(feedback.paperId);
    }
    if (feedback.sectionId) setSelectedSectionId(feedback.sectionId);
    setActiveFeedbackId(feedback.id);
  };

  useEffect(() => {
    const feedback = feedbackItems.find(item => String(item.id) === String(activeFeedbackId));
    if (!feedback || !selectedSection || String(feedback.sectionId) !== String(selectedSection.id)) return;
    let cancelled = false;
    const source = normalizeSource(selectedSection.contentTex || '');
    sourceFingerprint(source).catch(() => null).then(hash => {
      if (cancelled) return;
      const anchor = resolveAnchor(feedback.anchor, source, selectedSection.version, hash).current;
      if (anchor?.from != null && anchor?.to != null) sourceEditorRef.current?.selectRange?.(anchor.from, anchor.to);
    });
    return () => { cancelled = true; };
  }, [activeFeedbackId, feedbackItems, selectedSection, activeRequestId, viewMode]);

  useEffect(() => {
    if (!feedbackLink) return;
    const feedback = feedbackItems.find(item => String(item.id) === String(feedbackLink));
    if (!feedback) return;
    setFeedbackFilter('ALL');
    setPanelTab('manual');
    selectFeedback(feedback);
    const search = new URLSearchParams(location.search);
    search.delete('review');
    search.delete('feedback');
    navigate({ pathname: location.pathname, search: search.toString() }, { replace: true });
  }, [feedbackLink, feedbackItems, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!reviewLink || feedbackLink || !requests.some(request => String(request.id) === String(reviewLink))) return;
    const search = new URLSearchParams(location.search);
    search.delete('review');
    navigate({ pathname: location.pathname, search: search.toString() }, { replace: true });
  }, [feedbackLink, location.pathname, location.search, navigate, requests, reviewLink]);

  const handleTransitionStatus = async (requestId, targetStatus) => {
    setErrorMessage(''); setSuccessMessage('');
    setTransitioningRequestId(requestId);
    try {
      const res = await api.patch(`/api/feedback-requests/${requestId}/status?status=${targetStatus}`);
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: res.data.status } : r));
      await loadFeedback();
      setPendingTransition(null);
      setSuccessMessage(targetStatus === 'REVIEWED' ? t.reviewApproved : t.reviewReturned);
      if (targetStatus === 'REVIEWED') {
        setTimeout(() => navigate('/instructor/requests'), 1000);
      }
    } catch (err) {
      setErrorMessage(err?.response?.data?.message || t.updateStatusFailed);
    } finally { setTransitioningRequestId(null); }
  };

  const handleMouseMove = (e) => {
    const target = e.target.closest('[data-line]');
    if (target) {
      setHoveredLine(target.getAttribute('data-line'));
      setTooltipPos({ x: e.clientX, y: e.clientY });
    } else {
      setHoveredLine(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredLine(null);
  };

  const pollAiJob = async (jobId, shouldAbort) => {
    let polls = 0;
    const MAX_POLLS = 1200;
    const startedAt = Date.now();
    for (;;) {
      if (shouldAbort?.()) return null;
      const { data: job } = await api.get(`/api/jobs/${jobId}`);
      if (job.status === 'SUCCESS') return job;
      if (job.status === 'FAILED') {
        const error = new Error(job.errorMessage || t.suggestionFailed);
        error.status = Number(job.errorMessage?.match(/(\d{3})/)?.[1]) || undefined;
        throw error;
      }
      if (++polls >= MAX_POLLS || Date.now() - startedAt > 30 * 60 * 1000) {
        const error = new Error(t.aiSuggestionWorkerUnavailable);
        error.status = 503;
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  };

  const handleGenerateSuggestions = async () => {
    if (!selectedPaperId || !selectedSection || !activeGuide || suggestionLoading
      || requestLocked || activeRequest?.status !== 'PENDING') return;
    const requestId = ++suggestionRequestRef.current;
    setSuggestionLoading(true);
    setSuggestionError('');
    setSuggestionRan(false);
    try {
      const { data: submit } = await api.post(
        `/api/papers/${selectedPaperId}/sections/${selectedSectionId}/suggestions`,
        { sectionType: activeGuide.sectionType });
      if (suggestionRequestRef.current !== requestId) return;
      const job = await pollAiJob(submit.jobId, () => suggestionRequestRef.current !== requestId);
      if (suggestionRequestRef.current !== requestId || !job) return;
      setSuggestions((job.result || []).map(s => ({
        ...s,
        actionableFix: s.actionableFix ?? s.actionable_fix,
        lineReference: s.lineReference ?? s.line_reference,
      })));
      setSuggestionRan(true);
    } catch (err) {
      if (suggestionRequestRef.current === requestId) {
        const status = err?.response?.status || err?.status;
        setSuggestionError(status === 429
          ? t.aiSuggestionRateLimited
          : status === 502 || status === 503 || status === 504
            ? t.aiSuggestionWorkerUnavailable
            : err?.response?.data?.message || err?.message || t.suggestionFailed);
      }
    } finally {
      if (suggestionRequestRef.current === requestId) setSuggestionLoading(false);
    }
  };

  const injectIntoFeedback = (lineRef, content) => {
    const existing = feedbackDraft.trim();
    const incoming = (content || '').trim();
    if (!incoming) return;
    updateFeedbackDraft({ content: existing ? `${existing}\n\n${incoming}` : incoming,
      ...(lineRef ? { lineReference: lineRef } : {}) });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-(--page-bg)">
        <AppHeader />
        <div className="max-w-[1400px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8"><LoadingSkeleton count={4} height="h-24" /></div>
      </div>
    );
  }

  const allSectionFeedback = feedbackItems.filter(fb => !selectedSectionId || String(fb.sectionId) === String(selectedSectionId));
  const sectionFeedback = allSectionFeedback.filter(fb => feedbackFilter === 'ALL'
    || (fb.pendingState || fb.threadState || 'OPEN') === feedbackFilter);
  const historyFeedback = [...feedbackItems].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  return (
    <div className="min-h-screen bg-(--page-bg) text-(--text-primary)">
      <AppHeader />
      <main className="max-w-[1400px] 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Breadcrumb
          items={[
            { label: t.dashboard, path: '/instructor/dashboard' },
            { label: t.reviewRequests, path: '/instructor/requests' },
            { label: project?.title || t.project }
          ]}
        />
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-(--border) pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-(--brand-foreground) tracking-tight mt-1">{project?.title || t.project}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusBadge status={project?.status} />
              {orderedRequests.map(req => (
                <button key={req.id} onClick={() => setActiveRequestId(req.id)}
                  className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-colors ${req.id === activeRequest?.id ? 'bg-(--brand) text-(--on-brand) border-(--brand)' : 'bg-(--surface) text-(--text-secondary) border-(--border) hover:border-(--brand)'}`}>
                  {req.requestedAt ? formatDateTime(req.requestedAt, language) : String(req.id).slice(0, 8)} · <StatusBadge status={req.status} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button type="button" onClick={() => setShowGuide(true)}
              className="px-3 py-2 text-xs font-bold text-(--brand-foreground) rounded-xl transition border border-(--border) bg-(--surface) hover:bg-(--surface-secondary)">
              {t.reviewGuide}
            </button>
            {activeRequest && !requestLocked && (
              <>
                {canReturn && <button onClick={() => setPendingTransition({ requestId: activeRequest.id, targetStatus: 'RETURNED' })} disabled={transitioningRequestId === activeRequest.id || savingFeedback || savingReply}
                  className={`px-3 py-2 text-xs font-bold text-white rounded-xl transition ${ACTION_LABELS.RETURNED.cls} disabled:opacity-50`}>
                  {t[ACTION_LABELS.RETURNED.key]}
                </button>}
                <button onClick={() => setPendingTransition({ requestId: activeRequest.id, targetStatus: 'REVIEWED' })} disabled={transitioningRequestId === activeRequest.id || savingFeedback || savingReply}
                  className={`px-3 py-2 text-xs font-bold text-white rounded-xl transition ${ACTION_LABELS.REVIEWED.cls} disabled:opacity-50`}>
                  {t[ACTION_LABELS.REVIEWED.key]}
                </button>
              </>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold">{errorMessage}</div>
        )}
        {successMessage && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold">{successMessage}</div>
        )}
        {activeRequest && snapshotState === 'AVAILABLE' && (
          <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs font-semibold dark:bg-indigo-950/30 dark:border-indigo-900 dark:text-indigo-200">
            {t.submittedSnapshotNotice}
          </div>
        )}
        {activeRequest && snapshotState === 'LEGACY_NO_SNAPSHOT' && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-xs font-semibold dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200">
            {t.legacySnapshotNotice}
          </div>
        )}
        {activeRequest && snapshotState === 'LOAD_ERROR' && (
          <div role="alert" className="flex items-center justify-between gap-3 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-200">
            <span>{t.snapshotLoadError}</span>
            <button type="button" onClick={() => setSnapshotRetry(value => value + 1)} className="shrink-0 rounded-lg border border-current px-3 py-1.5 font-bold hover:bg-rose-100 dark:hover:bg-rose-900/40">{ct.retry}</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 1. Left navigation sidebar (the index) */}
          <aside className="lg:col-span-2">
            <div className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm p-3">
              <div className="flex items-center justify-between mb-2">
                {!sidebarCollapsed && <h2 className="text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider">{t.sectionFeedback}</h2>}
                <button type="button" onClick={() => setSidebarCollapsed(c => !c)}
                  title={sidebarCollapsed ? t.expandPanel : t.collapsePanel}
                  className={`p-1 rounded-lg text-(--text-tertiary) hover:text-(--brand-foreground) hover:bg-(--surface-secondary) transition-colors ${sidebarCollapsed ? 'mx-auto' : ''}`}>
                  <svg className={`h-4 w-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
              </div>
              {papers.length === 0 ? (
                <p className={`text-xs text-(--text-tertiary) italic ${sidebarCollapsed ? 'hidden' : ''}`}>{t.noPapers}</p>
              ) : sections.length === 0 ? (
                <p className={`text-xs text-(--text-tertiary) italic ${sidebarCollapsed ? 'hidden' : ''}`}>{t.noPaperSections}</p>
              ) : (
                <nav className={`flex gap-1 ${sidebarCollapsed ? 'w-9 flex-col' : 'flex-row overflow-x-auto lg:flex-col lg:overflow-visible'} ${sidebarCollapsed ? '' : 'lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1 hide-scrollbar'}`}>
                  {sections.map(s => (
                    <button key={s.id} onClick={() => setSelectedSectionId(s.id)} title={s.sectionTitle}
                      className={`shrink-0 rounded-lg text-xs font-bold transition-colors ${sidebarCollapsed ? 'px-2 py-2' : 'px-2.5 py-1.5 lg:text-left'} ${String(s.id) === String(selectedSectionId) ? 'bg-(--brand) text-(--on-brand)' : 'bg-(--surface-secondary) text-(--text-secondary) hover:bg-(--surface-tertiary)'}`}>
                      {sidebarCollapsed ? s.sectionTitle.slice(0, 1).toUpperCase() : <>{s.sectionTitle}{s.version > 1 && <span className="ml-1 text-[9px]">v{s.version}</span>}</>}
                    </button>
                  ))}
                </nav>
              )}
            </div>
          </aside>

          {/* 2. Center canvas: submitted source or saved working source, always read-only. */}
          <div className="lg:col-span-7 bg-(--surface) rounded-2xl border border-(--border) shadow-sm p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-(--brand-foreground)">{t.paperReadOnly}</h2>
                <p className="mt-0.5 text-[10px] font-semibold text-(--text-tertiary)">
                  {viewMode === 'submitted' ? t.submittedVersionLabel : t.workingCopyLabel}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-(--border) bg-(--surface-secondary) p-0.5 text-[10px] font-bold">
                  <button type="button" onClick={() => setViewMode('submitted')} disabled={!activeRequest}
                    className={`rounded-md px-2.5 py-1.5 disabled:opacity-50 ${viewMode === 'submitted' ? 'bg-(--surface) text-(--brand-foreground) shadow-sm' : 'text-(--text-secondary)'}`}>
                    {t.submittedVersion}
                  </button>
                  <button type="button" onClick={() => setViewMode('working')}
                    className={`rounded-md px-2.5 py-1.5 ${viewMode === 'working' ? 'bg-(--surface) text-(--brand-foreground) shadow-sm' : 'text-(--text-secondary)'}`}>
                    {t.workingCopy}
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-(--text-secondary) cursor-pointer select-none">
                  <input type="checkbox" checked={diffEnabled} onChange={e => setDiffEnabled(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a8a] focus:ring-[#1e3a8a]" />
                  {t.showChanges}
                </label>
              </div>
            </div>

            {papers.length === 0 ? (
              <p className="text-xs text-(--text-tertiary) italic">{t.noPapers}</p>
            ) : (
              <>
                <div className="flex gap-1 flex-wrap mb-3">
                  {papers.map(p => (
                    <button key={p.id} onClick={() => { setSelectedPaperId(p.id); setSelectedSectionId(null); }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${String(p.id) === String(selectedPaperId) ? 'bg-(--brand) text-(--on-brand)' : 'bg-(--surface-secondary) text-(--text-secondary) hover:bg-(--surface-tertiary)'}`}>
                      {p.originalFilename || p.title}
                    </button>
                  ))}
                </div>
                {sections.length === 0 ? (
                  <p className="text-xs text-(--text-tertiary) italic">{t.noPaperSections}</p>
                ) : (
                  <>
                    {!selectedSection ? (
                      <p className="text-xs text-(--text-tertiary) italic">{t.selectSectionContent}</p>
                    ) : diffEnabled ? (
                      diffOps === null ? (
                        <p className="text-xs text-(--text-tertiary) italic">{t.noCheckpointBaseline}</p>
                      ) : (
                        <div>
                          {baseline && (
                            <p className="text-[10px] text-(--text-tertiary) mb-2">
                              {t.baseline}: {baseline.trigger || t.checkpoint} · {baseline.createdAt ? formatDateTime(baseline.createdAt, language) : ''}
                            </p>
                          )}
                          <DiffView ops={diffOps} />
                        </div>
                      )
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wide text-(--text-tertiary)">{t.sourceEditor}</span>
                          <button type="button" onClick={() => setPanelTab('manual')}
                            className="rounded-lg border border-(--border) bg-(--surface-secondary) px-2 py-1 text-[10px] font-bold text-(--text-secondary) hover:text-(--brand-foreground)">
                            {t.openFeedbackPanel}
                          </button>
                        </div>
                        <div className="h-[55vh] overflow-hidden rounded-xl border border-(--border-light) bg-(--surface-secondary)">
                          <LatexEditor
                            key={`${viewMode}-${activeRequestId || 'working'}-${selectedSection.id}`}
                            ref={sourceEditorRef}
                            content={normalizeSource(selectedSection.contentTex || '')}
                            savedContent={normalizeSource(selectedSection.contentTex || '')}
                            savedVersion={selectedSection.version}
                            feedbackItems={allSectionFeedback}
                            activeFeedbackId={activeFeedbackId}
                            feedbackVisible
                            onFeedbackClick={ids => {
                              const feedback = allSectionFeedback.find(item => String(item.id) === String(ids[0]));
                              if (feedback) selectFeedback(feedback);
                            }}
                            readOnly
                            fontSize={13}
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto rounded-xl border border-(--border-light) bg-(--surface-secondary) p-3 text-xs">
                          <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-(--text-tertiary)">{t.preview}</p>
                          <div className="preview-content whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: renderLatexToHtml(wrapLatexLines(selectedSection.contentTex), mediaUrlMap) }} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* 3. Right action panel (the state machine) */}
          <aside className="lg:col-span-3">
            <div className="space-y-4">
            <div className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm">
              <div className="flex border-b border-(--border-light)">
                {[
                  { id: 'manual', label: t.manualFeedback },
                  { id: 'ai', label: t.aiSuggestions },
                  { id: 'history', label: t.versionHistory },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setPanelTab(tab.id)}
                    className={`flex-1 px-2 py-2.5 text-[10px] font-black text-center transition-colors border-b-2 ${panelTab === tab.id ? 'text-(--brand-foreground) border-(--brand)' : 'text-(--text-tertiary) border-transparent hover:text-(--text-secondary)'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-4 sm:p-5">
                {panelTab === 'manual' && (
                  <>
                    {!selectedSectionId ? (
                      <p className="text-xs text-(--text-tertiary) italic">{t.selectSectionFeedback}</p>
                    ) : (
                      <>
                        <div className="mb-3 flex gap-1 rounded-lg border border-(--border) bg-(--surface-secondary) p-0.5 text-[10px] font-bold">
                          {[
                            ['OPEN', t.openFeedback],
                            ['DONE', t.doneFeedback],
                            ['ALL', t.allFeedback],
                          ].map(([value, label]) => (
                            <button key={value} type="button" onClick={() => setFeedbackFilter(value)}
                              className={`flex-1 rounded-md px-2 py-1.5 ${feedbackFilter === value ? 'bg-(--surface) text-(--brand-foreground) shadow-sm' : 'text-(--text-secondary)'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="space-y-3 mb-4 max-h-[46vh] overflow-y-auto pr-1 hide-scrollbar">
                          {sectionFeedback.length === 0 ? (
                            <p className="text-xs text-(--text-tertiary) italic">{t.noSectionFeedback}</p>
                          ) : sectionFeedback.map(fb => (
                            <div key={fb.id} onClick={() => selectFeedback(fb)}
                              className={`cursor-pointer bg-(--surface-secondary) border rounded-xl p-3 text-xs space-y-2 transition-colors ${String(activeFeedbackId) === String(fb.id) ? 'border-(--brand) ring-1 ring-(--brand)/30' : 'border-(--border-light) hover:border-(--brand)/50'}`}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="truncate text-[9px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{t.section} {fb.sectionTitle || ''}</span>
                                  {!fb.publishedAt && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{t.draft}</span>}
                                  {(fb.pendingState || fb.threadState) === 'DONE' && <span className="text-[9px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">{t.doneFeedback}</span>}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {fb.stale && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{t.sectionChanged}</span>}
                                  {fb.replyState === 'ANSWERED' && <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{t.answered}</span>}
                                  {fb.canEdit && (
                                    <>
                                      <button onClick={() => handleEditFeedback(fb)} className="text-(--text-tertiary) hover:text-(--brand) p-1" title={ct.edit} aria-label={ct.edit}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 13H9v-2.828l6.586-6.586z" /></svg></button>
                                      <DeleteConfirm message={t.deleteFeedbackConfirm} onConfirm={() => handleDeleteFeedback(fb.id)} triggerLabel={ct.delete} confirmLabel={ct.delete} cancelLabel={ct.cancel} className="text-(--text-tertiary) hover:text-rose-600 p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16" /></svg></DeleteConfirm>
                                    </>
                                  )}
                                </div>
                              </div>
                              {fb.anchor?.original?.exact && <p className="text-[10px] text-(--text-tertiary) italic line-clamp-2">“{fb.anchor.original.exact}”</p>}
                              <div className="space-y-2">
                                {(fb.messages || []).map(message => {
                                  const ownDraft = message.draft && String(message.authorId) === String(user?.id);
                                  return (
                                    <div key={message.id} className={`rounded-lg p-2 ${message.draft ? 'border border-dashed border-amber-300 bg-amber-50/70 dark:bg-amber-950/20' : message.authorRole === 'STUDENT' ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-(--surface)'}`}>
                                      <div className="mb-1 flex items-center justify-between gap-2 text-[9px] font-bold text-(--text-tertiary)">
                                        <span>{message.authorName || (message.authorRole === 'STUDENT' ? t.student : t.instructor)}</span>
                                        <span className="flex shrink-0 items-center gap-1">{message.draft ? t.draft : message.publishedAt ? formatDateTime(message.publishedAt, language) : ''}
                                          {ownDraft && message.kind === 'REPLY' && <><button type="button" onClick={event => { event.stopPropagation(); startReply(fb, message); }} className="text-(--brand) hover:underline">{ct.edit}</button><button type="button" onClick={event => { event.stopPropagation(); deleteReply(fb.id, message.id); }} className="text-rose-600 hover:underline">{ct.delete}</button></>}
                                        </span>
                                      </div>
                                      <p className="whitespace-pre-wrap leading-relaxed text-(--text-primary)">{message.content}</p>
                                    </div>
                                  );
                                })}
                              </div>
                              {fb.pendingState && <p className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/20">{t.pendingState}: {fb.pendingState === 'DONE' ? t.doneFeedback : t.openFeedback}</p>}
                              {fb.canDraftReply && (
                                <div className="border-t border-(--border-light) pt-2">
                                  {replyFeedbackId === fb.id ? (
                                    <div className="space-y-2">
                                      <textarea rows="3" value={replyDraft} onChange={event => setReplyDraft(event.target.value)} placeholder={t.replyPlaceholder}
                                        className="w-full rounded-lg border border-(--border) bg-(--surface) px-2 py-1.5 text-xs text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)" />
                                      <div className="flex gap-2">
                                        <button type="button" onClick={resetReplyComposer} className="flex-1 rounded-lg bg-(--surface) px-2 py-1.5 text-[10px] font-bold text-(--text-secondary) hover:bg-(--surface-tertiary)">{ct.cancel}</button>
                                        <button type="button" onClick={() => saveReply(fb)} disabled={savingReply || !replyDraft.trim()} className="flex-1 rounded-lg bg-(--brand) px-2 py-1.5 text-[10px] font-bold text-(--on-brand) hover:bg-(--brand-hover) disabled:opacity-50">{savingReply ? ct.saving : editingReplyId ? t.updateFeedback : t.saveDraft}</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button type="button" onClick={event => { event.stopPropagation(); startReply(fb); }} className="text-[10px] font-black text-(--brand) hover:underline">{t.replyAsDraft}</button>
                                  )}
                                </div>
                              )}
                              {(fb.canMarkDone || fb.canReopen) && (
                                <div className="flex gap-2 border-t border-(--border-light) pt-2">
                                  {fb.canMarkDone && <button type="button" onClick={event => { event.stopPropagation(); prepareState(fb, 'DONE'); }} className="flex-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100">{t.markDone}</button>}
                                  {fb.canReopen && <button type="button" onClick={event => { event.stopPropagation(); prepareState(fb, 'OPEN'); }} className="flex-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-700 hover:bg-amber-100">{t.reopenFeedback}</button>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {!canCreateRoot ? (
                          <p className="text-xs text-(--text-tertiary) italic">{requestLocked ? t.reviewClosed : t.selectSubmittedSource}</p>
                        ) : (
                          <form onSubmit={handleSubmitFeedback} className="space-y-2 border-t border-(--border-light) pt-3">
                            <div className="flex gap-2">
                              <button type="button" onClick={captureSourceSelection} className="flex-1 rounded-lg border border-(--border) bg-(--surface-secondary) px-2 py-1.5 text-[10px] font-bold text-(--text-secondary) hover:text-(--brand-foreground)">{t.commentSelection}</button>
                              <button type="button" onClick={() => updateFeedbackDraft({ anchor: null, lineReference: '' })} className="flex-1 rounded-lg border border-(--border) bg-(--surface-secondary) px-2 py-1.5 text-[10px] font-bold text-(--text-secondary) hover:text-(--brand-foreground)">{t.wholeSection}</button>
                            </div>
                            {selectedAnchor && <p className="text-[10px] font-semibold text-(--brand)">{t.selectionReady.replace('{{from}}', selectedAnchor.from).replace('{{to}}', selectedAnchor.to)}</p>}
                            <textarea rows="3" value={feedbackDraft} onChange={e => updateFeedbackDraft({ content: e.target.value })}
                              placeholder={t.sectionFeedbackPlaceholder}
                              className="w-full px-3 py-2 bg-(--surface-secondary) border border-(--border) rounded-xl text-xs text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)" />
                            <div className="flex gap-2">
                              {editingFeedbackId && (
                                <button type="button" onClick={handleCancelEdit}
                                  className="flex-1 py-2 bg-(--surface-secondary) text-(--text-secondary) rounded-xl hover:bg-(--surface-tertiary) transition-colors text-xs font-bold">{ct.cancel}</button>
                              )}
                              <button type="submit" disabled={savingFeedback || !feedbackDraft.trim()}
                                className="flex-1 py-2 bg-(--brand) text-(--on-brand) rounded-xl hover:bg-(--brand-hover) transition-colors shadow-sm disabled:opacity-50 text-xs font-bold">
                                {savingFeedback ? ct.saving : editingFeedbackId ? t.updateFeedback : t.addFeedback}
                              </button>
                            </div>
                          </form>
                        )}
                      </>
                    )}
                  </>
                )}

                {panelTab === 'ai' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={handleGenerateSuggestions} disabled={!activeGuide || suggestionLoading || requestLocked || activeRequest?.status !== 'PENDING'}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50">
                        {suggestionLoading ? t.generatingSuggestions : t.generateSuggestions}
                      </button>
                      {activeGuide && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{activeGuide.sectionType}</span>}
                    </div>
                    <p className="text-[10px] text-(--text-tertiary) italic">{t.aiGenerationNote}</p>
                    {suggestionError && (
                      <p className="text-[10px] font-bold text-rose-600">{suggestionError}</p>
                    )}
                    {suggestionLoading && (
                      <div className="space-y-2" aria-busy="true">
                        <div className="h-14 bg-(--surface-secondary) animate-pulse rounded-xl" />
                        <div className="h-14 bg-(--surface-secondary) animate-pulse rounded-xl" />
                      </div>
                    )}
                    {suggestionRan && !suggestionLoading && suggestions.length === 0 && (
                      <p className="text-[10px] text-(--text-secondary) italic">{t.noSuggestionIssues}</p>
                    )}
                    {suggestions.length > 0 && (
                      <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {suggestions.map((suggestion, i) => (
                          <li key={i} className="border border-(--border-light) rounded-xl p-3 text-xs space-y-1">
                            <p className="font-bold text-(--text-primary) leading-relaxed">{suggestion.issue}</p>
                            {suggestion.quote && (
                              <p className="text-[10px] text-gray-400 italic leading-relaxed">"{suggestion.quote}"</p>
                            )}
                            <button type="button" onClick={() => { injectIntoFeedback(suggestion.lineReference, suggestion.actionableFix); setPanelTab('manual'); }}
                              className="text-[10px] font-black text-indigo-600 hover:underline">
                              {t.addToManualFeedback}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {panelTab === 'history' && (
                  <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1 hide-scrollbar">
                    {historyFeedback.length === 0 ? (
                      <p className="text-xs text-(--text-tertiary) italic">{t.historyEmpty}</p>
                    ) : historyFeedback.map(fb => (
                      <button type="button" key={fb.id} onClick={() => { setFeedbackFilter('ALL'); setPanelTab('manual'); selectFeedback(fb); }} className="w-full bg-(--surface-secondary) border border-(--border-light) rounded-xl p-3 text-left text-xs space-y-1 hover:border-(--brand)/50">
                        <div className="flex items-center justify-between gap-2">
                          {fb.sectionTitle && <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{fb.sectionTitle}</span>}
                          {fb.createdAt && <span className="text-[9px] text-(--text-tertiary)">{formatDateTime(fb.createdAt, language)}</span>}
                        </div>
                        <p className="text-(--text-primary) leading-relaxed">{(fb.messages || []).map(message => `${message.authorName || message.authorRole}: ${message.content}`).join('\n')}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sources pane (under the right action panel) */}
            <div className="bg-(--surface) rounded-2xl border border-(--border) shadow-sm px-4 py-3">
              <button type="button" onClick={() => setSourcesOpen(o => !o)}
                className="flex w-full items-center justify-between gap-2 py-1 text-[10px] font-black text-(--text-tertiary) uppercase tracking-wider hover:text-(--brand-foreground) transition-colors">
                <span>{t.sources} ({sources.length})</span>
                <svg className={`h-4 w-4 transition-transform ${sourcesOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              </button>
              {sourcesOpen && (
                sources.length === 0 ? (
                  <p className="text-xs text-(--text-tertiary) italic pb-2">{t.noProjectSources}</p>
                ) : (
                  <div className="space-y-2 pb-1">
                    {sources.map(src => (
                      <button key={src.id} type="button" onClick={() => setViewerFile({ fileUrl: `/api/documents/${src.id}/download`, fileName: src.originalFilename || src.title || src.id })}
                        className="flex w-full items-center justify-between gap-2 bg-(--surface-secondary) border border-(--border-light) rounded-lg px-3 py-2 text-xs transition hover:bg-(--surface-tertiary) text-left">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{src.title || src.originalFilename || src.id}</p>
                          <StatusBadge status={src.processingStatus || 'READY'} />
                        </div>
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-(--text-tertiary)" strokeWidth="2"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /></svg>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
            </div>
          </aside>
        </div>
      </main>

      {hoveredLine && (
        <div 
          className="fixed z-50 bg-[#1e3a8a] text-white text-[10px] font-bold px-2 py-1 rounded shadow-md pointer-events-none transition-all duration-75"
          style={{ left: tooltipPos.x + 15, top: tooltipPos.y - 10 }}
        >
          {t.lineNumber.replace('{{line}}', hoveredLine)}
        </div>
      )}

      <Modal open={!!pendingTransition} onClose={() => { if (!transitioningRequestId) setPendingTransition(null); }}
        title={pendingTransition?.targetStatus === 'REVIEWED' ? t[ACTION_LABELS.REVIEWED.key] : t[ACTION_LABELS.RETURNED.key]}
        closeLabel={ct.close}>
        <div className="space-y-4 text-xs">
          <p className="text-(--text-secondary)">
            {pendingTransition?.targetStatus === 'REVIEWED' ? t.finalizeReviewConfirm : t.returnForRevision}
          </p>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setPendingTransition(null)} disabled={!!transitioningRequestId}
              className="flex-1 py-3 bg-(--surface-secondary) hover:bg-(--surface-tertiary) text-(--text-secondary) rounded-xl transition-colors border border-(--border) disabled:opacity-50">{ct.cancel}</button>
            <button type="button" onClick={() => handleTransitionStatus(pendingTransition.requestId, pendingTransition.targetStatus)}
              disabled={!!transitioningRequestId}
              className="flex-1 py-3 bg-(--brand) text-(--on-brand) rounded-xl hover:bg-(--brand-hover) transition-colors disabled:opacity-50">{transitioningRequestId ? ct.saving : ct.confirm}</button>
          </div>
        </div>
      </Modal>
      <Modal open={showGuide} onClose={() => setShowGuide(false)} title={t.reviewGuide} closeLabel={ct.close}>
        {!selectedSection || !activeGuide ? (
          <p className="text-xs text-(--text-tertiary) italic">{t.selectSectionGuide}</p>
        ) : (
          <div className="space-y-4 text-xs">
            <span className="inline-block text-[9px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{activeGuide.sectionType}</span>
            <p className="text-(--text-secondary) leading-relaxed">{activeGuide.guidance}</p>
            <ul className="space-y-1.5">
              {activeGuide.checklist.map((item, i) => {
                const key = `${selectedSectionId}-${i}`;
                const checked = !!checkedItems[key];
                return (
                  <li key={key}>
                    <label className="flex items-start gap-2 cursor-pointer text-xs text-(--text-secondary)">
                      <input type="checkbox" checked={checked} onChange={() => setCheckedItems(prev => ({ ...prev, [key]: !checked }))}
                        className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-[#1e3a8a] focus:ring-[#1e3a8a]" />
                      <span className={checked ? 'line-through opacity-60' : ''}>{item}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Modal>
      {viewerFile && <FileViewerModal fileUrl={viewerFile.fileUrl} fileName={viewerFile.fileName} onClose={() => setViewerFile(null)} />}
      {pendingDelete && <UndoToast pending={pendingDelete} onUndo={undoDelete} onDismiss={dismissDelete} />}
    </div>
  );
}
