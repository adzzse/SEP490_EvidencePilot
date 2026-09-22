import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api.js';
import { useNotification } from '../context/NotificationContext';
import useUndoDelete from '../components/ui/UndoDelete.jsx';
import { normalizeSource, resolveAnchor, sourceFingerprint } from '../utils/student/feedbackAnchors.js';
import { wordDiff } from '../utils/instructor/wordDiff.js';
import { previousRequest } from '../utils/reviewRounds.js';

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
        if (!cancelled) setErrorMessage(t('instructor.review.loadReviewSpaceFailed'));
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
      .then(r => {
        if (!cancelled) {
          const liveSections = r.data || [];
          setSections(liveSections);
          setSelectedSectionId(previous => liveSections.some(section => String(section.id) === String(previous))
            ? previous : liveSections[0]?.id || null);
        }
      })
      .catch(() => { if (!cancelled) setSections([]); });
    return () => { cancelled = true; };
  }, [selectedPaperId, snapshotState, submissionSnapshot, viewMode]);

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

  // rationale: passage-adjust intent shared by the edit card (which starts it)
  // and the EditorPanel FAB (which confirms it). Confirming writes the draft
  // only — Update persists, Cancel discards. No auto-remap anywhere.
  const [passageAdjust, setPassageAdjust] = useState(null);
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
        setErrorMessage(err?.response?.data?.message || t('instructor.review.deleteFeedbackFailed'));
        loadFeedback();
      }
    }, () => { loadFeedback(); });
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

  const pollAiJob = async (jobId, shouldAbort) => {
    let polls = 0;
    const MAX_POLLS = 1200;
    const startedAt = Date.now();
    for (; ;) {
      if (shouldAbort?.()) return null;
      const { data: job } = await api.get(`/api/jobs/${jobId}`);
      if (job.status === 'SUCCESS') return job;
      if (job.status === 'FAILED') {
        const error = new Error(job.errorMessage || t('instructor.review.suggestionFailed'));
        error.status = Number(job.errorMessage?.match(/(\d{3})/)?.[1]) || undefined;
        throw error;
      }
      if (++polls >= MAX_POLLS || Date.now() - startedAt > 30 * 60 * 1000) {
        const error = new Error(t('instructor.review.aiSuggestionWorkerUnavailable'));
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
          ? t('instructor.review.aiSuggestionRateLimited')
          : status === 502 || status === 503 || status === 504
            ? t('instructor.review.aiSuggestionWorkerUnavailable')
            : err?.response?.data?.message || err?.message || t('instructor.review.suggestionFailed'));
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

  const submitTraceJudgment = async (traceId, judgment, instructorFeedback) => {
    if (!enabled || !projectId || !traceId || !judgment) return;
    setErrorMessage('');
    try {
      await api.patch(`/api/projects/${projectId}/evidence-traces/${traceId}/review`,
        { judgment, instructorFeedback: instructorFeedback?.trim() || null });
      await reloadEvidence();
    } catch (err) {
      setErrorMessage(err?.response?.data?.message || t('instructor.review.updateStatusFailed'));
    }
  };

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
    isAdjustingPassage: !!passageAdjust,
    startPassageAdjust,
    cancelPassageAdjust,
    confirmPassageSelection,
    handleEditFeedback,
    handleCancelEdit,
    handleDeleteFeedback,
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
    submitTraceJudgment,
  };

  return { workspace, workflow };
}
