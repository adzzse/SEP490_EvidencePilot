import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import { instructorText } from '../locales';
import { useLanguage } from '../context/LanguageContext';
import useUndoDelete from '../components/ui/UndoDelete.jsx';
import { normalizeSource, resolveAnchor, sourceFingerprint } from '../utils/student/feedbackAnchors.js';

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

export default function useInstructorReview({ projectId, enabled }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguage();
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
  const [mediaAssets, setMediaAssets] = useState([]);
  const feedbackLoadRef = useRef(0);
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
  const [feedbackFilter, setFeedbackFilter] = useState('OPEN');
  const [activeFeedbackId, setActiveFeedbackId] = useState(null);
  const [viewMode, setViewMode] = useState('submitted');
  const sourceEditorRef = useRef(null);
  const [transitioningRequestId, setTransitioningRequestId] = useState(null);
  const [pendingTransition, setPendingTransition] = useState(null);
  const [guides, setGuides] = useState([]);
  const [checkedItems, setCheckedItems] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [suggestionRan, setSuggestionRan] = useState(false);
  const [submissionSnapshot, setSubmissionSnapshot] = useState(null);
  const [snapshotState, setSnapshotState] = useState('LOADING');
  const [snapshotRetry, setSnapshotRetry] = useState(0);
  const suggestionRequestRef = useRef(0);

  const [panelTab, setPanelTab] = useState('manual');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.get('/api/review-guides')
      .then(r => { if (!cancelled) setGuides(r.data || []); })
      .catch(() => { if (!cancelled) setGuides([]); });
    return () => { cancelled = true; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    suggestionRequestRef.current += 1;
    setSuggestions([]);
    setSuggestionError('');
    setSuggestionLoading(false);
    setSuggestionRan(false);
  }, [selectedSectionId, activeRequestId, viewMode, projectId]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMessage('');
      setProject(null);
      setPapers([]);
      setLivePapers([]);
      setSections([]);
      setRequests([]);
      setActiveRequestId(null);
      setFeedbackItems([]);
      try {
        const [proj, papersRes, reqs, srcs, assets] = await Promise.all([
          api.get(`/api/projects/${projectId}`),
          api.get(`/api/projects/${projectId}/papers`),
          api.get('/api/feedback-requests'),
          loadAllProjectSources(projectId).catch(() => []),
          api.get(`/api/media/projects/${projectId}`).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setProject(proj.data);
        setPapers([]);
        setMediaAssets(assets.data || []);
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
  }, [projectId, enabled]);

  const orderedRequests = useMemo(() => [...requests].sort((left, right) =>
    new Date(right.requestedAt || 0) - new Date(left.requestedAt || 0)), [requests]);
  const reviewLink = new URLSearchParams(location.search).get('review');
  const feedbackLink = new URLSearchParams(location.search).get('feedback');
  const activeRequest = orderedRequests.find(r => r.id === activeRequestId) || orderedRequests[0] || null;
  const latestRequest = orderedRequests[0] || null;
  const requestLocked = !project || !activeRequest
    || activeRequest.id !== latestRequest?.id
    || !['PENDING', 'RETURNED'].includes(activeRequest.status)
    || project?.status === 'APPROVED'
    || project?.status === 'ARCHIVED';
  const canReturn = !requestLocked && activeRequest.status === 'PENDING';
  const canCreateRoot = canReturn && viewMode === 'submitted' && snapshotState === 'AVAILABLE';

  useEffect(() => {
    if (!enabled) return;
    if (requests.length > 0 && !requests.some(r => r.id === activeRequestId)) {
      setActiveRequestId((orderedRequests.find(r => String(r.id) === String(reviewLink)) || orderedRequests[0]).id);
    }
  }, [requests, activeRequestId]);

  useEffect(() => {
    if (!enabled) return;
    if (reviewLink && requests.some(request => String(request.id) === String(reviewLink))) {
      setActiveRequestId(reviewLink);
    }
  }, [reviewLink, requests]);

  useEffect(() => {
    if (!enabled) return;
    if (!activeRequestId) {
      setSubmissionSnapshot(null);
      setSnapshotState('NONE');
      setPapers(viewMode === 'working' ? livePapers : []);
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
        const candidate = response.data?.snapshot;
        const available = response.data?.state === 'AVAILABLE' && candidate?.schemaVersion === 1
          && String(candidate.projectId) === String(projectId) && Array.isArray(candidate.papers)
          && candidate.papers.every(paper => paper.id && (typeof paper.title === 'string' || paper.title === null) && Array.isArray(paper.sections)
            && paper.sections.every(section => section.id && typeof section.title === 'string'
              && typeof section.contentTex === 'string' && Number.isInteger(section.order) && Number.isInteger(section.contentVersion)));
        if (response.data?.state === 'AVAILABLE' && !available) throw new Error('Invalid submission snapshot');
        const snapshot = available ? response.data.snapshot : null;
        const nextPapers = viewMode === 'submitted' && snapshot
          ? (snapshot.papers || []).map(paper => ({ ...paper, originalFilename: paper.title }))
          : viewMode === 'working' ? livePapers : [];
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
        setPapers(viewMode === 'working' ? livePapers : []);
        if (viewMode === 'working') setSelectedPaperId(livePapers[0]?.id || null);
      });
    return () => { cancelled = true; };
  }, [activeRequestId, livePapers, snapshotRetry, viewMode]);

  useEffect(() => {
    if (!enabled) return;
    if (!selectedPaperId) { setSections([]); setSelectedSectionId(null); return; }
    if (viewMode === 'submitted' && snapshotState !== 'AVAILABLE') { setSections([]); return; }
    if (viewMode === 'submitted' && snapshotState === 'AVAILABLE') {
      const paper = (submissionSnapshot?.papers || [])
        .find(candidate => String(candidate.id) === String(selectedPaperId));
      const snapshotSections = [...(paper?.sections || [])].sort((a, b) => a.order - b.order).map(section => ({
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
    if (!enabled) return;
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
    if (!enabled) return;
    const generation = ++feedbackLoadRef.current;
    if (orderedRequests.length === 0) {
      setFeedbackItems([]);
      return;
    }
    try {
      const responses = await Promise.all(orderedRequests.map(request =>
        api.get(`/api/feedback-requests/${request.id}/feedback`)));
      if (generation !== feedbackLoadRef.current) return;
      setFeedbackItems(responses.flatMap(response => response.data || []));
    } catch {
      setErrorMessage(t.loadFeedbackFailed);
    }
  }, [orderedRequests, t.loadFeedbackFailed, enabled]);

  useEffect(() => { if (!enabled) return; loadFeedback(); return () => { feedbackLoadRef.current += 1; }; }, [loadFeedback, enabled]);

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    if (!enabled || !canCreateRoot || !activeRequestId || !selectedSectionId || !feedbackDraft.trim()) return;
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
    if (!enabled || !canCreateRoot || !selectedSection) return;
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
    selectFeedback(item);
    const key = JSON.stringify([projectId, activeRequestId, item.sectionId]);
    setFeedbackDrafts(previous => ({ ...previous, [key]: { editingId: item.id, content: item.content || '', lineReference: item.lineReference || '', anchor: null } }));
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

  const deleteReply = async (feedbackId, replyId) => {
    setErrorMessage('');
    try {
      await api.delete(`/api/instructor-feedback/${feedbackId}/replies/${replyId}`);
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
    if (!enabled) return;
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
    if (!enabled) return;
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
    if (!enabled) return;
    if (!reviewLink || feedbackLink || !requests.some(request => String(request.id) === String(reviewLink))) return;
    const search = new URLSearchParams(location.search);
    search.delete('review');
    navigate({ pathname: location.pathname, search: search.toString() }, { replace: true });
  }, [feedbackLink, location.pathname, location.search, navigate, requests, reviewLink]);

  const handleTransitionStatus = async (requestId, targetStatus) => {
    setErrorMessage(''); setSuccessMessage('');
    if (!enabled || savingFeedback || transitioningRequestId || pendingDelete) return;
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
    if (!enabled || !selectedPaperId || !selectedSection || !activeGuide || suggestionLoading
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

  return { project, papers, sections, selectedPaperId, setSelectedPaperId, selectedSectionId, setSelectedSectionId, selectedSection, requests, orderedRequests, activeRequest, activeRequestId, setActiveRequestId, feedbackItems, sources, mediaAssets, loading, errorMessage, successMessage, diffEnabled, setDiffEnabled, baseline, diffOps, feedbackDraft, feedbackLineRef, selectedAnchor, editingFeedbackId, updateFeedbackDraft, savingFeedback, feedbackFilter, setFeedbackFilter, activeFeedbackId, viewMode, setViewMode, sourceEditorRef, transitioningRequestId, pendingTransition, setPendingTransition, checkedItems, setCheckedItems, suggestions, suggestionLoading, suggestionError, suggestionRan, snapshotState, setSnapshotRetry, panelTab, setPanelTab, activeGuide, requestLocked, canReturn, canCreateRoot, handleSubmitFeedback, captureSourceSelection, handleEditFeedback, handleCancelEdit, handleDeleteFeedback, deleteReply, prepareState, selectFeedback, handleTransitionStatus, handleGenerateSuggestions, injectIntoFeedback, pendingDelete, undoDelete, dismissDelete };
}
