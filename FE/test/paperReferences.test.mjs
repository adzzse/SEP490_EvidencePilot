import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCitationNumbers,
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

test('paper references use persisted citation numbers with declaration-order fallback', () => {
  assert.deepEqual(buildCitationNumbers([
    { citationKey: 'epaaa', sourceId: 'a', citationNumber: 61 },
    { citationKey: 'epbbb', sourceId: 'b' },
  ]), { epaaa: 61, epbbb: 2 });
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
