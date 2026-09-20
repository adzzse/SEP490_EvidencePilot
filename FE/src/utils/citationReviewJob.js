const ACTIVE_JOB_STATUSES = new Set(['PENDING', 'PROCESSING']);

export function normalizeCitationReviewReload({ cachedReview = null, storedJob = null } = {}) {
  const review = cachedReview || storedJob?.result || null;
  const active = Boolean(storedJob && ACTIVE_JOB_STATUSES.has(storedJob.status));

  return {
    review,
    shouldPoll: active && review?.complete !== true,
    shouldClearJob: Boolean(storedJob && (review?.complete === true || !active)),
  };
}
