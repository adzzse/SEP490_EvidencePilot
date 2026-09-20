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

test('collectionGraph handles translation function, empty labels, and null data without throwing', () => {
  // Test with i18n translation function t(key, options)
  const fakeT = (key, opts) => {
    if (key === 'instructor.collectionDetail.citedTimes') return `Cited ${opts?.count} times (t)`;
    if (key === 'instructor.collectionDetail.unresolvedReference') return 'Unresolved (t)';
    if (key === 'instructor.collectionDetail.noCitationData') return 'No DOI (t)';
    return key;
  };

  const testNodes = [
    { id: '1', title: 'Paper 1', authors: 'Jane Doe', publicationYear: 2023, citedByCount: 42, hasDoi: true, inCollection: true },
    { id: '2', title: '', doi: '', inCollection: false },
    { id: '3', title: 'Paper 3', authors: 'John Doe', hasDoi: false, inCollection: true },
  ];

  const graphWithT = collectionGraph({ nodes: testNodes, edges: [] }, fakeT);
  assert.ok(graphWithT.nodes[0].tooltip.includes('Cited 42 times (t)'));
  assert.ok(graphWithT.nodes[1].tooltip.includes('Unresolved (t)'));
  assert.ok(graphWithT.nodes[2].tooltip.includes('No DOI (t)'));

  // Test with empty labels {} and node with citedByCount (must not throw undefined.replace)
  const graphWithEmpty = collectionGraph({ nodes: testNodes, edges: [] }, {});
  assert.ok(graphWithEmpty.nodes[0].tooltip.includes('Cited 42 times'));
  assert.ok(graphWithEmpty.nodes[1].tooltip.includes('Unresolved reference'));
  assert.ok(graphWithEmpty.nodes[2].tooltip.includes('No DOI — no citation data available'));

  // Test with null/undefined data
  const emptyGraph = collectionGraph(null);
  assert.deepEqual(emptyGraph.nodes, []);
  assert.deepEqual(emptyGraph.edges, []);

  const emptyProject = projectGraph(null);
  assert.deepEqual(emptyProject.nodes, []);
  assert.deepEqual(emptyProject.edges, []);
});
