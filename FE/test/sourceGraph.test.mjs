import assert from 'node:assert/strict';
import test from 'node:test';

import { collectionGraph } from '../src/utils/sourceGraph.js';

test('collection graph keeps the full paper title and cited-by count', () => {
  const graph = collectionGraph({
    nodes: [{ id: 'paper-1', title: 'A complete paper title that must not be shortened', authors: 'Ada Lovelace',
      doi: '10.1000/paper-1', publicationYear: 2024, citedByCount: 58, hasDoi: true, inCollection: true }],
    edges: [],
  }, { citedTimes: 'Cited {{count}} times', unresolvedReference: 'Unresolved', noCitationData: 'Unavailable' });

  assert.equal(graph.nodes[0].tooltip,
    'A complete paper title that must not be shortened · Ada Lovelace · 2024 · 10.1000/paper-1 · Cited 58 times');
});
