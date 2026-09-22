import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { useNotification } from '../context/NotificationContext';

export function useCollections(page = 0, size = 20, sort, q, categoryId) {
  const [data, setData] = useState({ content: [], totalElements: 0, totalPages: 0, last: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { subscribeToEntityChanges } = useNotification();
  const requestControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  const fetch = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setLoading(true); setError('');
    try {
      const params = { page, size };
      if (sort) params.sort = sort;
      if (q) params.q = q;
      if (categoryId) params.categoryId = categoryId;
      const res = await api.get('/api/collections', { params, signal: controller.signal });
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setData(res.data);
    } catch (requestError) {
      if (!controller.signal.aborted && requestId === requestIdRef.current
        && requestError?.code !== 'ERR_CANCELED' && requestError?.name !== 'CanceledError') {
        setError('Failed to load collections.');
      }
    }
    finally {
      if (!controller.signal.aborted && requestId === requestIdRef.current) setLoading(false);
    }
  }, [page, size, sort, q, categoryId]);

  useEffect(() => {
    fetch();
    return () => { requestControllerRef.current?.abort(); requestIdRef.current += 1; };
  }, [fetch]);
  useEffect(() => subscribeToEntityChanges(event => {
    if (event?.entity === 'COLLECTION') void fetch();
  }), [fetch, subscribeToEntityChanges]);
  return { ...data, loading, error, refetch: fetch };
}

export function useCollectionSources(collectionId, page = 0, size = 20, sort, q) {
  const [data, setData] = useState({ content: [], totalElements: 0, totalPages: 0, last: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { subscribeToEntityChanges } = useNotification();
  const requestControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  const fetch = useCallback(async () => {
    if (!collectionId) return;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setLoading(true); setError('');
    try {
      const params = { page, size };
      if (sort) params.sort = sort;
      if (q) params.q = q;
      const res = await api.get(`/api/collections/${collectionId}/sources`, { params, signal: controller.signal });
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setData(res.data);
    } catch (requestError) {
      if (!controller.signal.aborted && requestId === requestIdRef.current
        && requestError?.code !== 'ERR_CANCELED' && requestError?.name !== 'CanceledError') {
        setError('Failed to load sources.');
      }
    }
    finally {
      if (!controller.signal.aborted && requestId === requestIdRef.current) setLoading(false);
    }
  }, [collectionId, page, size, sort, q]);

  useEffect(() => {
    fetch();
    return () => { requestControllerRef.current?.abort(); requestIdRef.current += 1; };
  }, [fetch]);
  useEffect(() => subscribeToEntityChanges(event => {
    if (event?.entity === 'COLLECTION' && String(event.id) === String(collectionId)) void fetch();
  }), [collectionId, fetch, subscribeToEntityChanges]);
  return { ...data, loading, error, refetch: fetch };
}
