// rationale: History shows ALL published root cards of the immediately
// previous round for this section — never a single latest, never older
// rounds. Previous round = array position after active in the canonical desc
// list (no second timestamp sort). createdAt ASC matches the threads tab.
// updatedAt never orders. Drafts are excluded.

export function selectPreviousCards(feedbackItems, orderedRequests, activeRequestId, sectionId) {
  const requests = orderedRequests || [];
  const activeIndex = requests.findIndex(request => String(request.id) === String(activeRequestId));
  if (activeIndex < 0 || activeIndex + 1 >= requests.length) return [];
  const previousId = requests[activeIndex + 1].id;
  return (feedbackItems || [])
    .filter(item => String(item.requestId) === String(previousId))
    .filter(item => String(item.sectionId) === String(sectionId))
    .filter(item => item.publishedAt != null)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}
