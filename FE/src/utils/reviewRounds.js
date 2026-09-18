// ponytail: one definition of review rounds for both roles. Requests arrive
// newest-first; round numbers count from the oldest. updatedAt never orders.

export function roundNumberFor(requests, requestId) {
  const list = requests || [];
  const index = list.findIndex(request => String(request.id) === String(requestId));
  return index < 0 ? null : list.length - index;
}

export function latestReturnedRequest(requests) {
  return (requests || []).find(request => request?.status === 'RETURNED') || null;
}

export function previousRequest(requests, activeRequestId) {
  const list = requests || [];
  const activeIndex = list.findIndex(request => String(request.id) === String(activeRequestId));
  if (activeIndex < 0) return null;
  return list.slice(activeIndex + 1).find(request => request?.status === 'RETURNED') || null;
}

function inSection(item, sectionId) {
  return sectionId == null || String(item.sectionId) === String(sectionId);
}

export function selectFeedbackForRound(items, { requestId, sectionId, publishedOnly = true } = {}) {
  return (items || [])
    .filter(item => String(item.requestId) === String(requestId))
    .filter(item => inSection(item, sectionId))
    .filter(item => !publishedOnly || item.publishedAt != null)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

export function selectVisibleStudentFeedback(items, { requestId } = {}, assigneeId = null) {
  return (items || [])
    .filter(item => String(item.requestId) === String(requestId))
    .filter(item => item.publishedAt != null)
    .filter(item => assigneeId == null || String(item.assignedUserId) === String(assigneeId))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}
