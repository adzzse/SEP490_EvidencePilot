// rationale: overlapping passages are valid — this only reports them so the
// composer can warn, never to block. Half-open [from, to) intersection.

export function isOverlappable(item, activeRequestId, sectionId) {
  if (!item || String(item.requestId) !== String(activeRequestId)) return false;
  if (String(item.sectionId) !== String(sectionId)) return false;
  const original = item.anchor?.original;
  return original != null && original.from != null && original.to != null;
}

export function findOverlaps(candidate, items, scope) {
  if (!candidate || candidate.from == null || candidate.to == null
    || candidate.to <= candidate.from) {
    return { count: 0, exactDuplicate: false, ids: [] };
  }
  const ids = [];
  let exactDuplicate = false;
  for (const item of items || []) {
    if (!isOverlappable(item, scope?.requestId, scope?.sectionId)) continue;
    const { from, to } = item.anchor.original;
    if (candidate.from < to && from < candidate.to) {
      ids.push(item.id);
      if (candidate.from === from && candidate.to === to) exactDuplicate = true;
    }
  }
  return { count: ids.length, exactDuplicate, ids };
}
