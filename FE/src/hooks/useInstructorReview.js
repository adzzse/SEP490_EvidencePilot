import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api.js';
import { useNotification } from '../context/NotificationContext';
import useUndoDelete from '../components/ui/UndoDelete.jsx';
import { normalizeSource, resolveAnchor, sourceFingerprint } from '../utils/student/feedbackAnchors.js';
import { wordDiff } from '../utils/instructor/wordDiff.js';
import { previousRequest } from '../utils/reviewRounds.js';
import { useAuth } from '../context/AuthContext';
import { trackAiJob } from '../utils/aiJobPolling.js';
import { taskKey, readTask, writeTask } from '../utils/taskState.js';

export async function loadAllProjectSources(projectId) {
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
  const { t } = useTranslation();
  const { user } = useAuth();
  const selectionKey = taskKey(api, user?.id, 'instructor-review', projectId);
  const { subscribeToEntityChanges } = useNotification();
  const { pending: pendingDelete, start: startDelete, undo: undoDelete, dismiss: dismissDelete } = useUndoDelete();
  const undoStrings = {
    header: t('undoHeader'),
    bodyTemplate: t('undoBodyTemplate'),
    caution: t('undoCaution'),
    undoLabel: t('undoLabel'),
    undoRemaining: t('undoRemaining'),
    dismissLabel: t('dismissLabel'),
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
  const requestsLoadRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [diffEnabled, setDiffEnabled] = useState(false);
  const [baseline, setBaseline] = useState(null);
  const [submittedSnap, setSubmittedSnap] = useState(null);
  const [baselineSectionId, setBaselineSectionId] = useState(null);
  const [baselineUnavailable, setBaselineUnavailable] = useState(false);
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const draftKey = JSON.stringify([projectId, activeRequestId, selectedSectionId]);
  const { content: feedbackDraft = '', lineReference: feedbackLineRef = '',
    anchor: selectedAnchor = null, editingId: editingFeedbackId = null } = feedbackDrafts[draftKey] || {};
  const updateFeedbackDraft = change => setFeedbackDrafts(previous => ({
    ...previous, [draftKey]: { ...previous[draftKey], ...change },
  }));
  const clearFeedbackDraft = () => setFeedbackDrafts(previous => ({ ...previous, [draftKey]: {} }));
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [activeFeedbackId, setActiveFeedbackId] = useState(null);
  const [viewMode, setViewMode] = useState('submitted');
  const sourceEditorRef = useRef(null);
  const [transitioningRequestId, setTransitioningRequestId] = useState(null);
  const [pendingTransition, setPendingTransition] = useState(null);
  const [guides, setGuides] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [suggestionRan, setSuggestionRan] = useState(false);
  const [submissionSnapshot, setSubmissionSnapshot] = useState(null);
  const [snapshotState, setSnapshotState] = useState('LOADING');
  const [snapshotRetry, setSnapshotRetry] = useState(0);
  const suggestionRequestRef = useRef(0);
  const [feedbackFocusToken, setFeedbackFocusToken] = useState(0);
  // rationale: project evidence traces shared by Evidence tab + overview (single fetch, client-side scoping)
  const [evidenceTraces, setEvidenceTraces] = useState([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  // rationale: previous-round feedback hidden by default; History eye toggles it.
  const [showPrevFeedback, setShowPrevFeedback] = useState(false);

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
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMessage('');
      setProject(null);
      setPapers([]);
      setMediaAssets([]);
      setLivePapers([]);
      setSections([]);
      setRequests([]);
      setActiveRequestId(null);
      setFeedbackItems([]);
      try {
        const [proj, papersRes, reqs, srcs] = await Promise.all([
          api.get(`/api/projects/${projectId}`),
          api.get(`/api/projects/${projectId}/papers`),
          api.get('/api/feedback-requests'),
          loadAllProjectSources(projectId).catch(() => []),
        ]);
        if (cancelled) return;
        setProject(proj.data);
        setPapers([]);
        setLivePapers(papersRes.data || []);
        setRequests((reqs.data || []).filter(r => String(r.projectId) === String(projectId)));
        setSources(srcs);
        const saved = readTask(selectionKey);
        setViewMode(saved?.viewMode === 'working' ? 'working' : 'submitted');
        setActiveRequestId(saved?.requestId || null);
        setSelectedSectionId(saved?.sectionId || null);
        if ((papersRes.data || []).length > 0) {
          setSelectedPaperId(papersRes.data.find(paper => String(paper.id) === String(saved?.paperId))?.id || papersRes.data[0].id);
        }
      } catch {
        if (!cancelled) setErrorMessage(t('instructor.review.loadReviewSpaceFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, enabled, selectionKey]);

  useEffect(() => {
    if (!enabled || !selectedPaperId) { setMediaAssets([]); return; }
    let cancelled = false;
    setMediaAssets([]);
    api.get(`/api/media/papers/${selectedPaperId}`)
      .then(response => { if (!cancelled) setMediaAssets(response.data || []); })
      .catch(() => { if (!cancelled) setMediaAssets([]); });
    return () => { cancelled = true; };
  }, [enabled, selectedPaperId]);

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
    || project?.status === 'ARCHIVED'
    || project?.status === 'PENDING_DELETE';
  const canReturn = !requestLocked && activeRequest.status === 'PENDING';
  const canApprove = !requestLocked && activeRequest.status === 'PENDING';
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
        // rationale: accept snapshot schema v1 (sections only) and v2 (+evidence/standard refs)
        const schemaOk = candidate?.schemaVersion === 1 || candidate?.schemaVersion === 2;
        const available = response.data?.state === 'AVAILABLE' && schemaOk
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
        // Submitted snapshots carry sectionType (v2 additive) — undefined on
        // older rows, which safely reads as a normal section.
        sectionType: section.sectionType || null,
        version: section.contentVersion,
        handoffConfirmedById: section.confirmedById,
        handoffConfirmedByName: section.confirmedByName,
        handoffConfirmedAt: section.confirmedAt,
        handoffContentVersion: section.confirmedContentVersion,
      }));
      setSections(snapshotSections);
      setSelectedSectionId(previous => snapshotSections.some(section => String(section.id) === String(previous))
        ? previous : snapshotSections.find(section => String(section.id) === String(readTask(selectionKey)?.sectionId))?.id || snapshotSections[0]?.id || null);
      return;
    }
    let cancelled = false;
    api.get(`/api/papers/${selectedPaperId}/sections`)
      .then(r => {
        if (!cancelled) {
          const liveSections = r.data || [];
          setSections(liveSections);
          setSelectedSectionId(previous => liveSections.some(section => String(section.id) === String(previous))
            ? previous : liveSections.find(section => String(section.id) === String(readTask(selectionKey)?.sectionId))?.id || liveSections[0]?.id || null);
        }
      })
      .catch(() => { if (!cancelled) setSections([]); });
    return () => { cancelled = true; };
  }, [selectedPaperId, snapshotState, submissionSnapshot, viewMode, selectionKey]);

  useEffect(() => {
    if (!enabled) return;
    if (!diffEnabled || !activeRequest?.id || !selectedSectionId) { setBaseline(null); setSubmittedSnap(null); setBaselineSectionId(null); setBaselineUnavailable(false); return; }
    setBaseline(null);
    setSubmittedSnap(null);
    setBaselineSectionId(null);
    setBaselineUnavailable(false);
    let cancelled = false;
    // rationale: comparison source is server-resolved (latest earlier RETURNED
    // BASELINE, else initial assignment baseline, else null) — never compare
    // rows within the single active request.
    api.get(`/api/feedback-requests/${activeRequest.id}/comparison-source`, {
      params: { sectionId: selectedSectionId },
    })
      .then(r => {
        if (cancelled) return;
        const data = r.data || {};
        const submitted = data.submitted || null;
        const baselineRow = data.baseline || null;
        setBaseline(baselineRow ? { contentTex: baselineRow.contentTex || '' } : null);
        setSubmittedSnap(submitted ? { contentTex: submitted.contentTex || '' } : null);
        setBaselineSectionId(selectedSectionId);
        setBaselineUnavailable(!baselineRow && !!submitted);
      })
      .catch(() => { if (!cancelled) { setBaseline(null); setSubmittedSnap(null); setBaselineSectionId(null); setBaselineUnavailable(false); } });
    return () => { cancelled = true; };
  }, [diffEnabled, activeRequest?.id, selectedSectionId]);

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

  useEffect(() => {
    if (!enabled || String(project?.id) !== String(projectId) || !selectedSection || !activeRequestId) return;
    if (loading || (viewMode === 'submitted' && snapshotState !== 'AVAILABLE')) return;
    writeTask(selectionKey, { paperId: selectedPaperId, sectionId: selectedSectionId, requestId: activeRequestId, viewMode });
  }, [enabled, loading, snapshotState, project?.id, projectId, selectedPaperId, selectedSection, selectedSectionId, activeRequestId, viewMode, selectionKey]);

  const suggestionKey = taskKey(api, user?.id, 'suggestions', projectId, activeRequestId, viewMode, selectedPaperId, selectedSectionId);
  const suggestionSignature = JSON.stringify([selectedSection?.contentTex, selectedSection?.version, activeGuide]);
  const showSuggestionResult = job => {
    setSuggestions((job.result || []).map(s => ({
      ...s, actionableFix: s.actionableFix ?? s.actionable_fix, lineReference: s.lineReference ?? s.line_reference,
    })));
    setSuggestionRan(true);
  };
  const showSuggestionError = err => {
    const status = err?.response?.status || err?.status;
    setSuggestionError(status === 429 ? t('instructor.review.aiSuggestionRateLimited')
      : [502, 503, 504].includes(status) ? t('instructor.review.aiSuggestionWorkerUnavailable')
        : err?.response?.data?.message || err?.message || t('instructor.review.suggestionFailed'));
  };

  useEffect(() => {
    const requestId = ++suggestionRequestRef.current;
    setSuggestions([]);
    setSuggestionError('');
    setSuggestionLoading(false);
    setSuggestionRan(false);
    const saved = readTask(suggestionKey);
    if (enabled && selectedSection && activeGuide && saved?.signature === suggestionSignature) {
      setSuggestionLoading(true);
      trackAiJob(api, suggestionKey, suggestionSignature, null, () => suggestionRequestRef.current !== requestId)
        .then(job => { if (job && suggestionRequestRef.current === requestId) showSuggestionResult(job); })
        .catch(err => { if (suggestionRequestRef.current === requestId) showSuggestionError(err); })
        .finally(() => { if (suggestionRequestRef.current === requestId) setSuggestionLoading(false); });
    }
    return () => { suggestionRequestRef.current += 1; };
  }, [enabled, suggestionKey, suggestionSignature]);

  // rationale: word-level BASELINE-vs-SUBMITTED diff (was checkpoint-vs-live).
  // Normalized first so change offsets line up with displayContent (what the
  // LaTeX editor and Preview both render); all three views share diffResult.
  const diffResult = useMemo(() => {
    if (!diffEnabled || !baseline || !submittedSnap) return null;
    if (String(baselineSectionId) !== String(selectedSection?.id)) return null;
    return wordDiff(normalizeSource(baseline.contentTex || ''), normalizeSource(submittedSnap.contentTex || ''));
  }, [diffEnabled, baseline, submittedSnap, baselineSectionId, selectedSection]);
  const diffOps = diffResult?.ops || null;
  const diffTruncated = !!diffResult?.truncated;
  const changeRanges = diffResult?.ranges || [];

  const loadFeedback = useCallback(async () => {
    if (!enabled) return;
    const generation = ++feedbackLoadRef.current;
    if (orderedRequests.length === 0 || !activeRequestId) {
      setFeedbackItems([]);
      return;
    }
    try {
      // rationale: the workspace only ever renders the active request plus the
      // immediately previous returned one (cards, carry-over, History) — load
      // those two rounds instead of flattening the whole history.
      const ids = [activeRequestId];
      const prev = previousRequest(orderedRequests, activeRequestId);
      if (prev && String(prev.id) !== String(activeRequestId)) ids.push(prev.id);
      const responses = await Promise.all(ids.map(id =>
        api.get(`/api/feedback-requests/${id}/feedback`)));
      if (generation !== feedbackLoadRef.current) return;
      setFeedbackItems(responses.flatMap(response => response.data || []));
    } catch {
      setErrorMessage(t('instructor.review.loadFeedbackFailed'));
    }
  }, [orderedRequests, activeRequestId, t, enabled]);

  useEffect(() => { if (!enabled) return; loadFeedback(); return () => { feedbackLoadRef.current += 1; }; }, [loadFeedback, enabled]);

  const reloadRequests = useCallback(async () => {
    if (!enabled || !projectId) return;
    const generation = ++requestsLoadRef.current;
    try {
      const response = await api.get('/api/feedback-requests');
      if (generation !== requestsLoadRef.current) return;
      setRequests((response.data || []).filter(request => String(request.projectId) === String(projectId)));
    } catch (error) {
      if (generation === requestsLoadRef.current && error?.code !== 'ERR_CANCELED' && error?.name !== 'CanceledError') {
        setErrorMessage(t('instructor.review.loadFeedbackFailed'));
      }
    }
  }, [enabled, projectId, t]);

  useEffect(() => {
    if (!enabled || !projectId) return undefined;
    return subscribeToEntityChanges(event => {
      if (!event) return;
      const projectMatches = String(event.projectId || event.id) === String(projectId);
      if ((event.entity === 'FEEDBACK' || event.entity === 'PROJECT' || event.entity === 'DOCUMENT') && projectMatches) {
        void reloadRequests();
      }
    });
  }, [enabled, projectId, reloadRequests, subscribeToEntityChanges]);

  // rationale: mutations return the full post-commit thread DTO — merge it
  // surgically instead of invalidating/refetching (a fast refetch would race
  // the slow commit and ghost the change). Full reloads stay for mount,
  // round switches, transitions (many rows change), and explicit refresh.
  const mergeThread = useCallback(thread => {
    if (!thread?.id) return;
    setFeedbackItems(previous => (previous.some(item => String(item.id) === String(thread.id))
      ? previous.map(item => (String(item.id) === String(thread.id) ? thread : item))
      : [...previous, thread]));
  }, []);

  const handleSubmitFeedback = async (e, mediaAssetIds) => {
    e.preventDefault();
    if (!enabled || !canCreateRoot || !activeRequestId || !selectedSectionId || !feedbackDraft.trim()) return false;
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
        ...(mediaAssetIds?.length ? { mediaAssetIds } : {}),
      };
      if (editingFeedbackId) {
        const { data } = await api.patch(`/api/instructor-feedback/${editingFeedbackId}`, body);
        mergeThread(data);
      } else {
        const { data } = await api.post(`/api/feedback-requests/${activeRequestId}/feedback`, body);
        mergeThread(data);
      }
      clearFeedbackDraft();
      return true;
    } catch (err) {
      setErrorMessage(err?.response?.data?.message || t('instructor.review.saveFeedbackFailed'));
      return false;
    } finally { setSavingFeedback(false); }
  };

  const captureSourceSelection = async () => {
    if (!enabled || !canCreateRoot || !selectedSection) return;
    const range = sourceEditorRef.current?.getSelectionRange?.();
    // rationale: CodeMirror's doc is LF — normalize the DB text BEFORE measuring,
    // or raw \r\n lengths drift from/to (line-10 highlight bug).
    const source = normalizeSource(selectedSection.contentTex || '');
    if (!range || range.to <= range.from || range.to > source.length || !Number.isInteger(selectedSection.version)) {
      setErrorMessage(t('instructor.review.selectSourceRange'));
      return;
    }
    try {
      updateFeedbackDraft({
        anchor: {
          from: range.from,
          to: range.to,
          contentVersion: selectedSection.version,
          fingerprint: await sourceFingerprint(source),
        }, lineReference: ''
      });
    } catch {
      setErrorMessage(t('instructor.review.selectSourceRange'));
    }
  };

  // rationale: create-mode auto-arm — every non-empty editor selection becomes
  // the draft target without a confirmation click. Silent on empty/collapsed
  // (that must NOT clear an armed passage — stickiness lives in the draft
  // store), skipped entirely while editing (seeded passages are explicit).
  const autoCaptureSelection = useCallback(async () => {
    if (!enabled || !canCreateRoot || !selectedSection || editingFeedbackId) return;
    const range = sourceEditorRef.current?.getSelectionRange?.();
    const source = normalizeSource(selectedSection.contentTex || '');
    if (!range || range.to <= range.from || range.to > source.length
      || !Number.isInteger(selectedSection.version)) return;
    try {
      updateFeedbackDraft({
        anchor: {
          from: range.from,
          to: range.to,
          contentVersion: selectedSection.version,
          fingerprint: await sourceFingerprint(source),
        }, lineReference: ''
      });
    } catch {
      // Silent by design — the composer keeps its previous target.
    }
  }, [enabled, canCreateRoot, selectedSection, editingFeedbackId]);

  // rationale: Preview-armed passages share the editor's anchor contract —
  // offsets are validated against the same normalized source + version, so a
  // mapped Preview range is indistinguishable from an editor selection.
  // Anything unmappable never reaches here (the banner refuses it instead).
  const commitPreviewSelection = useCallback(async ({ from, to }) => {
    if (!enabled || !canCreateRoot || !selectedSection) return false;
    const source = normalizeSource(selectedSection.contentTex || '');
    if (!Number.isInteger(from) || !Number.isInteger(to) || to <= from
      || to > source.length || !Number.isInteger(selectedSection.version)) return false;
    try {
      updateFeedbackDraft({
        anchor: {
          from,
          to,
          contentVersion: selectedSection.version,
          fingerprint: await sourceFingerprint(source),
        }, lineReference: ''
      });
      return true;
    } catch {
      return false;
    }
  }, [enabled, canCreateRoot, selectedSection]);

  // rationale: opening a citation finding arms that passage as the create-mode
  // draft target directly (same anchor contract, no reliance on the async
  // selection→capture chain), so the Feedback composer context renders
  // deterministically. Active edits are never touched.
  const armFindingPassage = useCallback(async ({ from, to }) => {
    if (!enabled || !canCreateRoot || !selectedSection || editingFeedbackId) return false;
    const source = normalizeSource(selectedSection.contentTex || '');
    if (!Number.isInteger(from) || !Number.isInteger(to) || to <= from
      || to > source.length || !Number.isInteger(selectedSection.version)) return false;
    try {
      updateFeedbackDraft({
        anchor: {
          from,
          to,
          contentVersion: selectedSection.version,
          fingerprint: await sourceFingerprint(source),
        }, lineReference: ''
      });
      return true;
    } catch {
      return false;
    }
  }, [enabled, canCreateRoot, selectedSection, editingFeedbackId]);

  // rationale: passage-adjust intent shared by the edit card (which starts it)
  // and the EditorPanel FAB (which confirms it). Confirming writes the draft
  // only — Update persists, Cancel discards. No auto-remap anywhere.
  const [passageAdjust, setPassageAdjust] = useState(null);
  // rationale: live editor selection mirror — lets the edit card preview the
  // passage under the cursor while adjusting, before anything is confirmed.
  const [liveSelection, setLiveSelection] = useState(null);
  useEffect(() => { setLiveSelection(null); }, [selectedSectionId, activeRequestId]);
  const startPassageAdjust = useCallback(feedbackId => {
    if (enabled) setPassageAdjust({ feedbackId });
  }, [enabled]);
  const cancelPassageAdjust = useCallback(() => setPassageAdjust(null), []);
  useEffect(() => { setPassageAdjust(null); }, [selectedSectionId, activeRequestId]);
  const confirmPassageSelection = useCallback(async () => {
    if (!enabled || !canCreateRoot || !selectedSection || !passageAdjust) return false;
    const range = sourceEditorRef.current?.getSelectionRange?.();
    const source = normalizeSource(selectedSection.contentTex || '');
    if (!range || range.to <= range.from || range.to > source.length
      || !Number.isInteger(selectedSection.version)) return false;
    try {
      updateFeedbackDraft({
        anchor: {
          from: range.from,
          to: range.to,
          contentVersion: selectedSection.version,
          fingerprint: await sourceFingerprint(source),
        }, lineReference: ''
      });
      setPassageAdjust(null);
      return true;
    } catch {
      return false;
    }
  }, [enabled, canCreateRoot, selectedSection, passageAdjust]);

  const handleEditFeedback = (item) => {
    selectFeedback(item);
    const key = JSON.stringify([projectId, activeRequestId, item.sectionId]);
    // rationale: seed the draft from the stored original passage (immutable
    // review-time Target) — never from the live-resolved current, which may be
    // remapped or DETACHED after later section edits.
    const original = item.anchor?.original;
    setFeedbackDrafts(previous => ({ ...previous, [key]: {
      editingId: item.id,
      content: item.content || '',
      lineReference: item.lineReference || '',
      anchor: original && original.from != null && original.to != null
        ? { from: original.from, to: original.to,
            contentVersion: original.contentVersion, fingerprint: original.fingerprint }
        : null,
    } }));
  };

  const handleCancelEdit = () => {
    clearFeedbackDraft();
    setPassageAdjust(null);
  };

  const handleDeleteFeedback = async (itemId) => {    const sid = String(itemId);    const item = feedbackItems.find(f => String(f.id) === sid);
    // rationale: removal happens at commit, not upfront — the card stays
    // visible during the undo window so Undo restores instantly with no
    // refetch (matches every other startDelete caller).
    startDelete({
      ...undoStrings,
      entityName: item?.content || item?.text || itemId,
      entityDetails: itemId,
    }, async () => {
      setFeedbackItems(prev => prev.filter(f => String(f.id) !== sid));
      try {
        await api.delete(`/api/instructor-feedback/${itemId}`);
        loadFeedback();
      } catch (err) {
        setErrorMessage(err?.response?.data?.message || t('instructor.review.deleteFeedbackFailed'));
        loadFeedback();
      }
    });
  };

  const handleDetachAttachment = async (attachmentId) => {
    if (!enabled || !attachmentId) return false;
    setErrorMessage('');
    try {
      const { data } = await api.delete(`/api/feedback-attachments/${attachmentId}`);
      if (data?.id) mergeThread(data);
      else loadFeedback();
      return true;
    } catch (err) {
      setErrorMessage(err?.response?.data?.message || t('instructor.review.deleteFeedbackFailed'));
      return false;
    }
  };

  const handleResolveThread = async (itemId, targetState) => {
    const sid = String(itemId);
    setFeedbackItems(prev => prev.map(f => String(f.id) === sid ? { ...f, threadState: targetState } : f));
    try {
      const { data } = await api.patch(`/api/instructor-feedback/${itemId}/thread-state`, null, { params: { state: targetState } });
      if (data) setFeedbackItems(prev => prev.map(f => String(f.id) === sid ? { ...f, ...data } : f));
      loadFeedback();
    } catch (err) {
      setErrorMessage(err?.response?.data?.message || t('instructor.review.resolveThreadFailed'));
      loadFeedback();
    }
  };

  const selectFeedback = (feedback, { focus = false } = {}) => {
    if (feedback.paperId && String(feedback.paperId) !== String(selectedPaperId)) {
      setSelectedPaperId(feedback.paperId);
    }
    if (feedback.sectionId) setSelectedSectionId(feedback.sectionId);
    setActiveFeedbackId(feedback.id);
    if (focus) setFeedbackFocusToken(value => value + 1);
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
    if (feedback) {
      selectFeedback(feedback, { focus: true });
      const search = new URLSearchParams(location.search);
      search.delete('review');
      search.delete('feedback');
      navigate({ pathname: location.pathname, search: search.toString() }, { replace: true });
      return;
    }
    // Single-round pool: a deep link may point outside the two loaded rounds.
    // Fetch that one thread on demand instead of loading all of history.
    let cancelled = false;
    api.get(`/api/instructor-feedback/${feedbackLink}`)
      .then(({ data }) => {
        if (cancelled || !data?.id) return;
        mergeThread(data);
        selectFeedback(data, { focus: true });
      })
      .catch(() => {});
    return () => { cancelled = true; };
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
      setSuccessMessage(targetStatus === 'REVIEWED' ? t('instructor.review.reviewApproved') : t('instructor.review.reviewReturned'));
      if (targetStatus === 'REVIEWED') {
        setTimeout(() => navigate('/instructor/requests'), 1000);
      }
    } catch (err) {
      setErrorMessage(err?.response?.data?.message || t('instructor.review.updateStatusFailed'));
    } finally { setTransitioningRequestId(null); }
  };

  const handleGenerateSuggestions = async () => {
    if (!enabled || !selectedPaperId || !selectedSection || !activeGuide || suggestionLoading
      || requestLocked || activeRequest?.status !== 'PENDING') return;
    const requestId = ++suggestionRequestRef.current;
    setSuggestionLoading(true);
    setSuggestionError('');
    setSuggestionRan(false);
    try {
      writeTask(suggestionKey, null);
      const job = await trackAiJob(api, suggestionKey, suggestionSignature, () => api.post(
        `/api/papers/${selectedPaperId}/sections/${selectedSectionId}/suggestions`,
        { sectionType: activeGuide.sectionType }), () => suggestionRequestRef.current !== requestId);
      if (suggestionRequestRef.current !== requestId || !job) return;
      showSuggestionResult(job);
    } catch (err) {
      if (suggestionRequestRef.current === requestId) {
        showSuggestionError(err);
      }
    } finally {
      if (suggestionRequestRef.current === requestId) setSuggestionLoading(false);
    }
  };

  const injectIntoFeedback = (lineRef, content) => {
    const existing = feedbackDraft.trim();
    const incoming = (content || '').trim();
    if (!incoming) return;
    updateFeedbackDraft({
      content: existing ? `${existing}\n\n${incoming}` : incoming,
      ...(lineRef ? { lineReference: lineRef } : {})
    });
  };

  const reloadEvidence = useCallback(async () => {
    if (!enabled || !projectId) return;
    setEvidenceLoading(true);
    try {
      const { data } = await api.get(`/api/projects/${projectId}/evidence-traces`);
      setEvidenceTraces(Array.isArray(data) ? data : []);
    } catch {
      setEvidenceTraces([]);
    } finally {
      setEvidenceLoading(false);
    }
  }, [enabled, projectId]);

  useEffect(() => { reloadEvidence(); }, [reloadEvidence]);

  // rationale: sealed per-origin archives for the active request — fetched
  // alongside everything else, scoped by request window server-side. Silent
  // failure falls back to the snapshot-trace view (never blocks Findings).
  const [citationArchives, setCitationArchives] = useState(null);
  const refetchCitationArchives = useCallback(async () => {
    if (!enabled || !activeRequestId || !selectedSectionId) {
      setCitationArchives(null);
      return null;
    }
    try {
      const response = await api.get(`/api/feedback-requests/${activeRequestId}/citation-archives`,
        { params: { sectionId: selectedSectionId } });
      setCitationArchives(response.data || null);
      return response.data || null;
    } catch {
      setCitationArchives(null);
      return null;
    }
  }, [enabled, activeRequestId, selectedSectionId]);
  useEffect(() => { void refetchCitationArchives(); }, [refetchCitationArchives]);

  // rationale: Findings tab live update — a citation round materializing
  // anywhere (own run finishing in another tab, colleague's run) broadcasts
  // EVIDENCE READY; refresh traces + sealed archives for the open section.
  // This hook only runs in the instructor review workspace, so the student
  // view is untouched. Declared after refetchCitationArchives: the dep array
  // below reads it during render, so it must be initialized first.
  useEffect(() => {
    if (!enabled || !projectId) return undefined;
    return subscribeToEntityChanges(event => {
      if (!event || event.entity !== 'EVIDENCE') return;
      if (String(event.projectId) !== String(projectId)) return;
      void reloadEvidence();
      void refetchCitationArchives();
    });
  }, [enabled, projectId, reloadEvidence, refetchCitationArchives, subscribeToEntityChanges]);

  // rationale: historical rounds are read-only; only the latest PENDING/RETURNED request accepts input
  const isHistoricalRound = !!activeRequest && !!latestRequest && String(activeRequest.id) !== String(latestRequest.id);

  const selectedPaper = papers.find(paper => String(paper.id) === String(selectedPaperId)) || null;
  const workspace = {
    phase: loading ? 'loading' : project ? 'ready' : errorMessage ? 'error' : 'ready',
    error: project ? '' : errorMessage,
    project,
    papers,
    sources,
    mediaAssets,
    sections,
    selectedPaperId,
    selectedPaper,
    selectedSectionId,
    selectedSection,
    content: normalizeSource(selectedSection?.contentTex || ''),
    selectPaper: setSelectedPaperId,
    selectSection: setSelectedSectionId,
    editorRef: sourceEditorRef,
    readOnly: true,
  };

  const workflow = {
    selectedPaperId,
    selectedSectionId,
    sections,
    papers,
    orderedRequests,
    activeRequest,
    activeRequestId,
    setActiveRequestId,
    isHistoricalRound,
    feedbackItems,
    errorMessage,
    successMessage,
    diffEnabled,
    setDiffEnabled,
    baselineUnavailable,
    diffOps,
    diffTruncated,
    changeRanges,
    feedbackDraft,
    feedbackLineRef,
    selectedAnchor,
    editingFeedbackId,
    updateFeedbackDraft,
    savingFeedback,
    activeFeedbackId,
    viewMode,
    setViewMode,
    transitioningRequestId,
    pendingTransition,
    setPendingTransition,
    suggestions,
    suggestionLoading,
    suggestionError,
    suggestionRan,
    submissionSnapshot,
    snapshotState,
    setSnapshotRetry,
    activeGuide,
    requestLocked,
    canReturn,
    canApprove,
    canCreateRoot,
    feedbackFocusToken,
    handleSubmitFeedback,
    captureSourceSelection,
    autoCaptureSelection,
    commitPreviewSelection,
    armFindingPassage,
    isAdjustingPassage: !!passageAdjust,
    startPassageAdjust,
    cancelPassageAdjust,
    confirmPassageSelection,
    liveSelection,
    setLiveSelection,
    handleEditFeedback,
    handleCancelEdit,
    handleDeleteFeedback,
    handleDetachAttachment,
    handleResolveThread,
    selectFeedback,
    handleTransitionStatus,
    handleGenerateSuggestions,
    injectIntoFeedback,
    pendingDelete,
    undoDelete,
    dismissDelete,
    evidenceTraces,
    evidenceLoading,
    reloadEvidence,
    citationArchives,
    showPrevFeedback,
    setShowPrevFeedback,
  };

  return { workspace, workflow };
}
