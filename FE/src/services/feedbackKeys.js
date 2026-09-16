export const feedbackKeys = {
  all: ['feedback'],
  rounds: projectId => [...feedbackKeys.all, 'rounds', String(projectId ?? '')],
  threads: requestId => [...feedbackKeys.all, 'threads', String(requestId ?? '')],
  thread: id => [...feedbackKeys.all, 'thread', String(id ?? '')],
};

// Surgical cache write for mutations that return the full thread DTO
// (POST/PATCH thread, reply, state, anchor). The payload is post-commit
// truth — merge it, never invalidate-and-refetch (which would race the
// commit and ghost the user's change).
export function upsertThread(roundsData, thread) {
  if (!roundsData || !thread?.id) return roundsData;
  const items = roundsData.items || [];
  const index = items.findIndex(item => String(item.id) === String(thread.id));
  if (index < 0) {
    const roundIndex = (roundsData.requests || [])
      .findIndex(round => String(round.id) === String(thread.requestId));
    return {
      ...roundsData,
      items: [...items, {
        ...thread,
        roundNumber: roundIndex < 0 ? null : roundsData.requests.length - roundIndex,
        requestStatus: roundIndex < 0 ? null : roundsData.requests[roundIndex].status,
        instructorName: thread.instructorName
          || (roundIndex < 0 ? null : roundsData.requests[roundIndex].instructorName),
      }],
    };
  }
  return {
    ...roundsData,
    items: items.map(item => (String(item.id) === String(thread.id)
      ? { ...item, ...thread }
      : item)),
  };
}
