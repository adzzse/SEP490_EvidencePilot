import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api.js';

export default function useProjectFeedback(projectId) {
  const [requests, setRequests] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [answerErrors, setAnswerErrors] = useState({});
  const [answeringId, setAnsweringId] = useState(null);
  const pendingAnswer = useRef(null);
  const generation = useRef(0);
  const controller = useRef(null);
  const projectRef = useRef(projectId);
  projectRef.current = projectId;

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const requestGeneration = ++generation.current;
    if (!projectId) return;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/feedback-requests', { signal: abort.signal });
      const rounds = (response.data || []).filter(round => String(round.projectId) === String(projectId));
      const groups = await Promise.all(rounds.map(async (round, index) => {
        const result = await api.get(`/api/feedback-requests/${round.id}/feedback`, { signal: abort.signal });
        return (result.data || []).map(item => ({ ...item, roundNumber: rounds.length - index,
          requestStatus: round.status, instructorName: item.instructorName || round.instructorName }));
      }));
      if (requestGeneration !== generation.current) return;
      setRequests(rounds);
      setItems(groups.flat());
    } catch (failure) {
      if (abort.signal.aborted || requestGeneration !== generation.current) return;
      setError(failure.response?.status || 'network');
      if ([401, 403].includes(failure.response?.status)) { setItems([]); setRequests([]); }
    } finally {
      if (requestGeneration === generation.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setRequests([]);
    setItems([]);
    setDrafts({});
    setAnswerErrors({});
    setAnsweringId(null);
    setError(null);
    refresh();
    return () => { generation.current++; controller.current?.abort(); };
  }, [refresh]);

  const setDraft = (id, value) => setDrafts(previous => ({ ...previous, [id]: value }));
  const answer = async item => {
    const content = (drafts[item.id] || '').trim();
    if (!content || !item.canAnswer || pendingAnswer.current) return false;
    pendingAnswer.current = item.id;
    setAnsweringId(item.id);
    setAnswerErrors(previous => ({ ...previous, [item.id]: null }));
    try {
      const response = await api.post(`/api/instructor-feedback/${item.id}/answer`, { content });
      if (projectRef.current !== projectId) return false;
      setItems(previous => previous.map(existing => existing.id === item.id ? { ...existing, ...response.data } : existing));
      setDrafts(previous => ({ ...previous, [item.id]: '' }));
      return true;
    } catch (failure) {
      if (projectRef.current === projectId) {
        setAnswerErrors(previous => ({ ...previous, [item.id]: failure.response?.status || 'network' }));
        if (failure.response?.status === 409) refresh();
      }
      return false;
    } finally {
      pendingAnswer.current = null;
      if (projectRef.current === projectId) setAnsweringId(null);
    }
  };
  return { requests, items, loading, error, refresh, drafts, setDraft, answer, answerErrors, answeringId };
}
