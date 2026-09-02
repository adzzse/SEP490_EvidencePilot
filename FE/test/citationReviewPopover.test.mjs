import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSourceGroups,
  getEvidenceSource,
  hasNoEvidence,
  splitPassageQuote,
  wrapFindingIndex,
} from '../src/utils/citationReviewPopover.js';

test('citation review popover derives evidence and navigation state', () => {
  assert.equal(hasNoEvidence({ evidence: [] }), true);
  assert.equal(hasNoEvidence({ evidence: [{ relation: 'NOT_FOUND' }] }), true);
  assert.equal(hasNoEvidence({ evidence: [{ relation: 'CONTRADICTS' }] }), false);
  assert.equal(wrapFindingIndex(-1, 3), 2);
  assert.equal(wrapFindingIndex(3, 3), 0);
  assert.equal(getEvidenceSource('source-1', [
    { documentId: 'source-1', title: 'Candidate title' },
  ], [
    { id: 'source-1', title: 'Project source title' },
  ])?.title, 'Candidate title');
});

test('citation review groups evidence and related passages by source without duplicating chunks', () => {
  const groups = buildSourceGroups([
    { sourceId: 'source-1', chunkId: 'chunk-1', quote: 'Exact evidence', relation: 'SUPPORTS' },
  ], [
    { documentId: 'source-1', documentChunkId: 'chunk-1', title: 'Paper A', excerpt: 'Exact evidence', similarityScore: 0.9 },
    { documentId: 'source-1', documentChunkId: 'chunk-2', title: 'Paper A', excerpt: 'Another passage', similarityScore: 0.7 },
    { documentId: 'source-2', documentChunkId: 'chunk-3', title: 'Paper B', excerpt: 'Related only', similarityScore: 0.6 },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, 'Paper A');
  assert.equal(groups[0].evidencePassages.length, 1);
  assert.equal(groups[0].evidencePassages[0].candidate.documentChunkId, 'chunk-1');
  assert.equal(groups[0].relatedPassages.length, 1);
  assert.equal(groups[1].evidencePassages.length, 0);
  assert.equal(groups[1].relatedPassages.length, 1);
});

test('source passage quote split preserves source casing for highlighting', () => {
  assert.deepEqual(splitPassageQuote('Before Exact Evidence after', 'exact evidence'), {
    before: 'Before ',
    match: 'Exact Evidence',
    after: ' after',
  });
  assert.equal(splitPassageQuote('Full passage', 'missing').match, '');
});
