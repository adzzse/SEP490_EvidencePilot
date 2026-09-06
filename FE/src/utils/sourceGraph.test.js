import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionGraph, projectGraph, sourceAuthors } from './sourceGraph.js';

test('source graph adapters preserve direction, membership and plain metadata', () => {
  assert.equal(sourceAuthors('["Alice", "Bob", null]'), 'Alice, Bob');
  assert.equal(sourceAuthors('Alice & Bob'), 'Alice & Bob');
  const nodes = [{ id: 'a', title: '<img onerror=alert(1)>', authors: '["Alice Smith"]', publicationYear: 2024, inCollection: true }, { id: 'b', doi: '10.1234/b' }];
  const collection = collectionGraph({ nodes, edges: [{ sourceId: 'a', targetId: 'b', type: 'CITED_BY' }] }, {});
  assert.equal(collection.nodes[0].label, 'Alice, 2024');
  assert.ok(collection.nodes[0].tooltip.includes('<img onerror=alert(1)>'));
  assert.deepEqual([collection.edges[0].from, collection.edges[0].to], ['b', 'a']);
  const project = projectGraph({ nodes: [{ id: 'p', type: 'PROJECT', title: 'Project' }, ...nodes], edges: [
    { sourceId: 'p', targetId: 'a', type: 'PROJECT_SOURCE' }, { sourceId: 'a', targetId: 'b', type: 'CITES' },
  ] });
  assert.equal(project.nodes[0].kind, 'project');
  assert.deepEqual(project.edges.map(({ from, to, kind }) => [from, to, kind]), [['p', 'a', 'membership'], ['a', 'b', 'citation']]);
});
