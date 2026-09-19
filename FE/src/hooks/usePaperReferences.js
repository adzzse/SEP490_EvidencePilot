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
  const referencesRequestId = useRef(0);
  const checkRequestId = useRef(0);
  const currentPaperId = useRef(paperId);
  currentPaperId.current = paperId;

  const reloadReferences = useCallback(async () => {
    if (currentPaperId.current !== paperId) return;
    const id = ++referencesRequestId.current;
    const isCurrent = () => id === referencesRequestId.current && currentPaperId.current === paperId;
    if (!paperId) {
      setSnapshot({ paperId, references: [], check: null });
      setError('');
      setCheckError('');
      setLoading(false);
      return;
    }
    setLoading(true);
    const referencesResult = await Promise.allSettled([
      api.get(API_ROUTES.PAPERS.REFERENCES(paperId)),
    ]).then(([result]) => result);
    if (!isCurrent()) return;

    setSnapshot(current => ({
      paperId,
      references: referencesResult.status === 'fulfilled'
        ? referencesResult.value.data || []
        : current.paperId === paperId ? current.references : [],
      check: current.paperId === paperId ? current.check : null,
    }));
    setError(referencesResult.status === 'rejected' ? 'referencesLoadFailed' : '');
    setLoading(false);
  }, [paperId]);

  const clearCheck = useCallback(() => {
    checkRequestId.current += 1;
    setSnapshot(current => current.paperId === paperId
      ? { ...current, check: null }
      : current);
    setCheckError('');
    setCheckLoading(false);
  }, [paperId]);

  const runCheck = useCallback(async () => {
    if (!paperId || currentPaperId.current !== paperId) return null;
    const id = ++checkRequestId.current;
    setCheckLoading(true);
    setCheckError('');
    try {
      const { data } = await api.get(API_ROUTES.PAPERS.REFERENCE_CHECK(paperId));
      if (id !== checkRequestId.current || currentPaperId.current !== paperId) return null;
      setSnapshot(current => ({
        paperId,
        references: current.paperId === paperId ? current.references : [],
        check: data,
      }));
      return data;
    } catch (requestError) {
      if (id === checkRequestId.current && currentPaperId.current === paperId) {
        setCheckError('referenceCheckLoadFailed');
      }
      throw requestError;
    } finally {
      if (id === checkRequestId.current && currentPaperId.current === paperId) {
        setCheckLoading(false);
      }
    }
  }, [paperId]);

  useEffect(() => {
    clearCheck();
    setSnapshot({ paperId, references: [], check: null });
    setError('');
    reloadReferences();
    return () => {
      referencesRequestId.current += 1;
      checkRequestId.current += 1;
    };
  }, [paperId, clearCheck, reloadReferences]);

  const addReference = useCallback(async (sourceId) => {
    clearCheck();
    await api.post(API_ROUTES.PAPERS.REFERENCE_BY_ID(paperId, sourceId));
    await reloadReferences();
  }, [paperId, clearCheck, reloadReferences]);

  const removeReference = useCallback(async (sourceId) => {
    clearCheck();
    await api.delete(API_ROUTES.PAPERS.REFERENCE_BY_ID(paperId, sourceId));
    await reloadReferences();
  }, [paperId, clearCheck, reloadReferences]);

  return {
    references,
    check,
    loading,
    error,
    checkLoading,
    checkError,
    reloadReferences,
    runCheck,
    clearCheck,
    addReference,
    removeReference,
  };
}
