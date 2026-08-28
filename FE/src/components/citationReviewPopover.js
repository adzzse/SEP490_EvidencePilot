export function hasNoEvidence(finding) {
  const evidence = finding?.evidence || [];
  return evidence.length === 0 || evidence.every(item => item.relation === 'NOT_FOUND');
}

export function wrapFindingIndex(index, count) {
  return count > 0 ? ((index % count) + count) % count : -1;
}

export function getEvidenceSource(sourceId, candidates = [], sources = []) {
  if (!sourceId) return null;
  const id = String(sourceId);
  return candidates.find(candidate => String(candidate.documentId) === id)
    || sources.find(source => String(source.id) === id)
    || null;
}

function sameId(left, right) {
  return left != null && right != null && String(left) === String(right);
}

export function buildSourceGroups(evidence = [], candidates = [], sources = []) {
  const groups = new Map();
  const passageByChunk = new Map();

  const ensureGroup = (documentId, candidate = null) => {
    const source = sources.find(item => sameId(item.id, documentId));
    const resolvedId = documentId || candidate?.documentId || source?.id;
    const key = resolvedId ? String(resolvedId) : `unknown-${groups.size}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        documentId: resolvedId || null,
        title: candidate?.title || source?.title || candidate?.sourceFilename || source?.originalFilename || '',
        sourceFilename: candidate?.sourceFilename || source?.originalFilename || '',
        authors: candidate?.authors || source?.authors || '',
        publicationYear: candidate?.publicationYear || source?.publicationYear || null,
        evidencePassages: [],
        relatedPassages: [],
      };
      groups.set(key, group);
    }
    return group;
  };

  evidence.forEach((item, index) => {
    const candidate = candidates.find(entry => sameId(entry.documentChunkId, item.chunkId)) || null;
    const documentId = item.sourceId || candidate?.documentId || null;
    const chunkId = item.chunkId || candidate?.documentChunkId || null;
    const passage = {
      key: chunkId ? String(chunkId) : `evidence-${index}`,
      documentId,
      chunkId,
      quote: item.quote || '',
      excerpt: item.quote || candidate?.excerpt || '',
      relation: item.relation || null,
      candidate,
      usedInReview: true,
    };
    ensureGroup(documentId, candidate).evidencePassages.push(passage);
    if (chunkId) passageByChunk.set(String(chunkId), passage);
  });

  candidates.forEach((candidate, index) => {
    const chunkKey = candidate.documentChunkId ? String(candidate.documentChunkId) : '';
    const existing = chunkKey ? passageByChunk.get(chunkKey) : null;
    if (existing) {
      existing.candidate = candidate;
      if (!existing.excerpt) existing.excerpt = candidate.excerpt || '';
      return;
    }
    ensureGroup(candidate.documentId, candidate).relatedPassages.push({
      key: chunkKey || `candidate-${index}`,
      documentId: candidate.documentId || null,
      chunkId: candidate.documentChunkId || null,
      quote: '',
      excerpt: candidate.excerpt || '',
      relation: null,
      candidate,
      usedInReview: false,
    });
  });

  return Array.from(groups.values());
}

export function splitPassageQuote(text, quote) {
  const content = String(text || '');
  const target = String(quote || '').trim();
  if (!target) return { before: content, match: '', after: '' };
  const exactIndex = content.indexOf(target);
  const index = exactIndex >= 0 ? exactIndex : content.toLowerCase().indexOf(target.toLowerCase());
  if (index < 0) return { before: content, match: '', after: '' };
  return {
    before: content.slice(0, index),
    match: content.slice(index, index + target.length),
    after: content.slice(index + target.length),
  };
}
