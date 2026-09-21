const ACTIVE_JOB_STATUSES = new Set(['PENDING', 'PROCESSING']);

export function normalizeCitationReviewReload({ serverState = null, storedJob = null } = {}) {
  const review = serverState?.review || storedJob?.result || null;
  const jobId = serverState?.jobId || storedJob?.id || null;
  const active = serverState
    ? serverState.status === 'RUNNING'
    : Boolean(storedJob && ACTIVE_JOB_STATUSES.has(storedJob.status));
  const terminal = serverState
    ? serverState.status === 'COMPLETE' || serverState.status === 'FAILED'
    : Boolean(storedJob && !active);

  return {
    jobId,
    review,
    shouldPoll: active && review?.complete !== true,
    shouldClearJob: Boolean(jobId && terminal),
    errorCode: serverState?.errorCode || storedJob?.errorCode || null,
    errorMessage: serverState?.errorMessage || storedJob?.errorMessage || null,
    progress: {
      current: Math.max(0, Number(serverState?.finishedCount ?? storedJob?.progressCurrent) || 0),
      total: Math.max(0, Number(serverState?.totalCount ?? storedJob?.progressTotal) || 0),
    },
  };
}
