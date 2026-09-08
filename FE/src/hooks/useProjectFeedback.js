import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api.js';

export default function useProjectFeedback(projectId) {
  const [requests, setRequests] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const generation = useRef(0);
  const controller = useRef(null);
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
      const rounds = (response.data || []).filter(round => String(round.projectId) === String(projectId))
        .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')) || String(a.id).localeCompare(String(b.id)));
      const groups = await Promise.all(rounds.map(async (round, index) => {
        const result = await api.get(`/api/feedback-requests/${round.id}/feedback`, { signal: abort.signal });
        return (result.data || []).map(item => ({ ...item, roundNumber: rounds.length - index,
          requestStatus: round.status, instructorName: item.instructorName || round.instructorName }));
      }));
      if (requestGeneration !== generation.current) return;
      const refreshedItems = groups.flat();
      setRequests(rounds);
      setItems(refreshedItems);
      return refreshedItems;
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
    setError(null);
    refresh();
    return () => { generation.current++; controller.current?.abort(); };
  }, [refresh]);

  return { requests, items, loading, error, refresh };
}
