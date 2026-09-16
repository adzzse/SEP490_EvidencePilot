import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api.js';
import { API_ROUTES } from '../constants/apiRoutes.js';

export function usePaperReferences(paperId) {
  const [snapshot, setSnapshot] = useState({ paperId, references: [], check: null });
  const references = snapshot.paperId === paperId ? snapshot.references : [];
  const check = snapshot.paperId === paperId ? snapshot.check : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState('');
  const requestId = useRef(0);
  const currentPaperId = useRef(paperId);
  currentPaperId.current = paperId;

  const reload = useCallback(async () => {
    if (currentPaperId.current !== paperId) return;
    const id = ++requestId.current;
    const isCurrent = () => id === requestId.current && currentPaperId.current === paperId;
    if (!paperId) {
      setSnapshot({ paperId, references: [], check: null });
      setError('');
      setCheckError('');
      setLoading(false);
      setCheckLoading(false);
      return;
    }
    setLoading(true);
    setCheckLoading(true);
    const [referencesResult, checkResult] = await Promise.allSettled([
      api.get(API_ROUTES.PAPERS.REFERENCES(paperId)),
      api.get(API_ROUTES.PAPERS.REFERENCE_CHECK(paperId)),
    ]);
    if (!isCurrent()) return;

    setSnapshot(current => ({
      paperId,
      references: referencesResult.status === 'fulfilled'
        ? referencesResult.value.data || []
        : current.paperId === paperId ? current.references : [],
      check: checkResult.status === 'fulfilled'
        ? checkResult.value.data
        : current.paperId === paperId ? current.check : null,
    }));
    setError(referencesResult.status === 'rejected' ? 'referencesLoadFailed' : '');
    setCheckError(checkResult.status === 'rejected' ? 'referenceCheckLoadFailed' : '');
    setLoading(false);
    setCheckLoading(false);
  }, [paperId]);

  useEffect(() => {
    setSnapshot({ paperId, references: [], check: null });
    setError('');
    setCheckError('');
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

  return {
    references,
    check,
    loading,
    error,
    checkLoading,
    checkError,
    reload,
    addReference,
    removeReference,
  };
}
