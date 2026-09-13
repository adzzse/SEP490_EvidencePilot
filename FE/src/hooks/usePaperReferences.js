import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api.js';
import { API_ROUTES } from '../constants/apiRoutes.js';

export function usePaperReferences(paperId) {
  const [snapshot, setSnapshot] = useState({ paperId, references: [] });
  const references = snapshot.paperId === paperId ? snapshot.references : [];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const currentPaperId = useRef(paperId);
  currentPaperId.current = paperId;

  const reload = useCallback(async () => {
    if (currentPaperId.current !== paperId) return;
    const id = ++requestId.current;
    const isCurrent = () => id === requestId.current && currentPaperId.current === paperId;
    if (!paperId) {
      setSnapshot({ paperId, references: [] });
      setError('');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await api.get(API_ROUTES.PAPERS.REFERENCES(paperId));
      if (!isCurrent()) return;
      setSnapshot({ paperId, references: response.data || [] });
      setError('');
    } catch {
      if (isCurrent()) setError('referencesLoadFailed');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [paperId]);

  useEffect(() => {
    setSnapshot({ paperId, references: [] });
    setError('');
    reload();
    return () => { requestId.current += 1; };
  }, [reload]);

  const addReference = useCallback(async (sourceId) => {
    await api.post(API_ROUTES.PAPERS.REFERENCE_BY_ID(paperId, sourceId));
    await reload();
  }, [paperId, reload]);

  const removeReference = useCallback(async (sourceId) => {
    await api.delete(API_ROUTES.PAPERS.REFERENCE_BY_ID(paperId, sourceId));
    await reload();
  }, [paperId, reload]);

  return { references, loading, error, reload, addReference, removeReference };
}
