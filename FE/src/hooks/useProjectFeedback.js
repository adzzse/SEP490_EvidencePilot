import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api.js';
import { feedbackKeys } from '../services/feedbackKeys.js';

async function fetchProjectThreads(projectId, signal) {
  const response = await api.get('/api/feedback-requests', { signal });
  const rounds = (response.data || []).filter(round => String(round.projectId) === String(projectId))
    .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')) || String(a.id).localeCompare(String(b.id)));
  const groups = await Promise.all(rounds.map(async (round, index) => {
    const result = await api.get(`/api/feedback-requests/${round.id}/feedback`, { signal });
    return (result.data || []).map(item => ({
      ...item,
      roundNumber: rounds.length - index,
      requestStatus: round.status,
      instructorName: item.instructorName || round.instructorName,
    }));
  }));
  return { requests: rounds, items: groups.flat() };
}

export default function useProjectFeedback(projectId) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: feedbackKeys.rounds(projectId),
    queryFn: ({ signal }) => fetchProjectThreads(projectId, signal),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const refresh = async () => {
    const result = await query.refetch();
    return result.data?.items;
  };

  // ponytail: mirror the old hook — a 401/403 clears the list instead of
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
