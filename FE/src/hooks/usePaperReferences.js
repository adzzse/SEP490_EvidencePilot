import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api.js';
import { API_ROUTES } from '../constants/apiRoutes.js';
import { taskKey, readTask, writeTask } from '../utils/taskState.js';
import { getWithRetry } from '../utils/aiJobPolling.js';

export function usePaperReferences(paperId, userId) {
  const checkKey = taskKey(api, userId, 'reference-check', paperId);
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
    writeTask(checkKey, null);
    checkRequestId.current += 1;
    setSnapshot(current => current.paperId === paperId
      ? { ...current, check: null }
      : current);
    setCheckError('');
    setCheckLoading(false);
  }, [paperId, checkKey]);

  const runCheck = useCallback(async () => {
    if (!paperId || currentPaperId.current !== paperId) return null;
    const id = ++checkRequestId.current;
    writeTask(checkKey, true);
    setCheckLoading(true);
    setCheckError('');
    try {
      const response = await getWithRetry(api, API_ROUTES.PAPERS.REFERENCE_CHECK(paperId),
        () => id !== checkRequestId.current || currentPaperId.current !== paperId);
      if (!response) return null;
      const { data } = response;
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
  }, [paperId, checkKey]);

  useEffect(() => {
    checkRequestId.current += 1;
    setCheckError('');
    setCheckLoading(false);
    setSnapshot({ paperId, references: [], check: null });
    setError('');
    reloadReferences();
    if (paperId && readTask(checkKey)) runCheck().catch(() => {});
    return () => {
      referencesRequestId.current += 1;
      checkRequestId.current += 1;
    };
  }, [paperId, checkKey, reloadReferences, runCheck]);

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
