import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';
import { feedbackKeys } from '../services/feedbackKeys.js';
import { roundNumberFor } from '../utils/reviewRounds.js';

// rationale: one selected round per view — fetch its threads only, never
// fan-out every historical round and flatten. The requests list stays for
// the round picker; items always belong to a single round (or none).
async function fetchRoundThreads(projectId, requestId, signal) {
  const response = await api.get('/api/feedback-requests', { signal });
  const rounds = (response.data || []).filter(round => String(round.projectId) === String(projectId))
    .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')) || String(a.id).localeCompare(String(b.id)));
  if (!requestId) return { requests: rounds, items: [] };
  const round = rounds.find(item => String(item.id) === String(requestId));
  const result = await api.get(`/api/feedback-requests/${requestId}/feedback`, { signal });
  return {
    requests: rounds,
    items: (result.data || []).map(item => ({
      ...item,
      roundNumber: roundNumberFor(rounds, requestId),
      requestStatus: round?.status,
      instructorName: item.instructorName || round?.instructorName,
    })),
  };
}

export default function useProjectFeedback(projectId, requestId) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...feedbackKeys.rounds(projectId), String(requestId ?? '')],
    queryFn: ({ signal }) => fetchRoundThreads(projectId, requestId, signal),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const { refetch } = query;
  const refresh = useCallback(async () => {
    const result = await refetch();
    return result.data?.items;
  }, [refetch]);

  // rationale: mirror the old hook — a 401/403 clears the list instead of
  // showing stale threads the account can no longer open.
  const revoked = query.error && [401, 403].includes(query.error.response?.status);

  return {
    requests: revoked ? [] : query.data?.requests || [],
    items: revoked ? [] : query.data?.items || [],
    loading: query.isLoading,
    error: query.error ? query.error.response?.status || 'network' : null,
    refresh,
    queryClient,
  };
}
