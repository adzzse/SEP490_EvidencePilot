import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCitationNumbers,
  buildReferenceEntries,
  isReferenceCandidate,
  referenceStatusOf,
} from '../src/utils/paperReferences.js';
import { API_ROUTES } from '../src/constants/apiRoutes.js';

test('paper references guard allows only declared reference candidates', () => {
  const ids = new Set(['source-1']);
  assert.equal(isReferenceCandidate({ documentId: 'source-1' }, ids), true);
  assert.equal(isReferenceCandidate({ documentId: 'source-2' }, ids), false);
  assert.equal(isReferenceCandidate({ documentId: undefined }, ids), false);
  assert.equal(isReferenceCandidate({ documentId: 'source-2' }, null), true);
  assert.equal(isReferenceCandidate({ documentId: 'source-2' }, undefined), true);
});

test('paper references status distinguishes available, missing, and processing', () => {
  assert.equal(referenceStatusOf({ retrievable: true, fileAvailable: true }), 'available');
  assert.equal(referenceStatusOf({ retrievable: false, fileAvailable: false }), 'missing');
  assert.equal(referenceStatusOf({ retrievable: false, fileAvailable: true }), 'processing');
});

test('paper references build citation numbers in declaration order', () => {
  assert.deepEqual(buildCitationNumbers([
    { citationKey: 'epaaa', sourceId: 'a' },
    { citationKey: 'epbbb', sourceId: 'b' },
  ]), { epaaa: 1, epbbb: 2 });
  assert.deepEqual(buildCitationNumbers([]), {});
  assert.deepEqual(buildCitationNumbers([{ sourceId: 'x' }]), {});
});

test('paper references routes match the backend contract', () => {
  assert.equal(API_ROUTES.PAPERS.REFERENCES('paper-1'), '/api/papers/paper-1/references');
  assert.equal(
    API_ROUTES.PAPERS.REFERENCE_CHECK('paper-1'),
    '/api/papers/paper-1/references/check',
  );
  assert.equal(
    API_ROUTES.PAPERS.REFERENCE_BY_ID('paper-1', 'source-2'),
    '/api/papers/paper-1/references/source-2',
  );
});

test('paper references preview contains only the declared list and preserves its order', () => {
  const entries = buildReferenceEntries([
    { citationKey: 'epaaa', title: 'First', authors: 'Writer', publicationYear: 2026, doi: 'https://doi.org/10.1/a' },
    { citationKey: 'epbbb', title: 'Missing PDF', retrievable: false },
  ]);
  assert.deepEqual(entries.map(entry => [entry.key, entry.number]), [['epaaa', 1], ['epbbb', 2]]);
  assert.equal(entries[0].reference, 'Writer. First. 2026. https://doi.org/10.1/a');
  assert.deepEqual(buildReferenceEntries([]), []);
});
