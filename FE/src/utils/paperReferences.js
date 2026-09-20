// Paper-scoped References: explicit source subset selected for one paper.
// Sources stay project-wide; these helpers keep every References consumer
// (insertion guards, status badges, citation numbers) on the same semantics.

export function isReferenceCandidate(candidate, referenceSourceIds) {
  if (!referenceSourceIds) return true;
  if (!candidate?.documentId) return false;
  return referenceSourceIds.has(String(candidate.documentId));
}

export function referenceStatusOf(reference) {
  if (reference?.retrievable) return 'available';
  if (!reference?.fileAvailable) return 'missing';
  return 'processing';
}

export function buildCitationNumbers(references = []) {
  const numbers = {};
  references.forEach((reference, index) => {
    if (reference?.citationKey) numbers[reference.citationKey] = reference.citationNumber || index + 1;
  });
  return numbers;
}
