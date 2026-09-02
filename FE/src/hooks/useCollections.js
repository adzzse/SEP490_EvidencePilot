import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export function useCollections(page = 0, size = 20, sort, q, categoryId) {
  const [data, setData] = useState({ content: [], totalElements: 0, totalPages: 0, last: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = { page, size };
      if (sort) params.sort = sort;
      if (q) params.q = q;
      if (categoryId) params.categoryId = categoryId;
      const res = await api.get('/api/collections', { params });
      setData(res.data);
    } catch { setError('Failed to load collections.'); }
    finally { setLoading(false); }
  }, [page, size, sort, q, categoryId]);

  useEffect(() => { fetch(); }, [fetch]);
  return { ...data, loading, error, refetch: fetch };
}

export function useCollectionSources(collectionId, page = 0, size = 20, sort, q) {
  const [data, setData] = useState({ content: [], totalElements: 0, totalPages: 0, last: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    if (!collectionId) return;
    setLoading(true); setError('');
    try {
      const params = { page, size };
      if (sort) params.sort = sort;
      if (q) params.q = q;
      const res = await api.get(`/api/collections/${collectionId}/sources`, { params });
      setData(res.data);
    } catch { setError('Failed to load sources.'); }
    finally { setLoading(false); }
  }, [collectionId, page, size, sort, q]);

  useEffect(() => { fetch(); }, [fetch]);
  return { ...data, loading, error, refetch: fetch };
}
