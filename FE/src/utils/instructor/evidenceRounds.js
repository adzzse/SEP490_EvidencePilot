// Keeps, per section, only the traces of that section's latest round.
// Reviews re-run per section, so older rounds linger in snapshots; counting
// every round double-counts identical findings across returns. Latest round
// is the one with the greatest trace createdAt (fallback: first seen).
export function latestRoundTraces(traces) {
  const list = Array.isArray(traces) ? traces : [];
  const latestBySection = new Map();
  for (const trace of list) {
    const key = String(trace?.sectionId);
    const at = trace?.createdAt ? Date.parse(trace.createdAt) : NaN;
    const current = latestBySection.get(key);
    if (!current || (!Number.isNaN(at) && (Number.isNaN(current.at) || at >= current.at))) {
      latestBySection.set(key, { at, roundId: String(trace?.roundId) });
    }
  }
  return list.filter(trace => {
    const current = latestBySection.get(String(trace?.sectionId));
    return current !== undefined && String(trace?.roundId) === current.roundId;
  });
}
