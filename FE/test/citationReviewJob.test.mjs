import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCitationReviewReload } from '../src/utils/citationReviewJob.js';

const partial = { complete: false, findings: [{ excerpt: 'partial' }] };
const complete = { complete: true, findings: [{ excerpt: 'done' }] };

test('reattaches an active job when the cached review is partial', () => {
  assert.deepEqual(
    normalizeCitationReviewReload({
      cachedReview: partial,
      storedJob: { id: 'job-1', status: 'PROCESSING', result: partial },
    }),
    {
      review: partial,
      shouldPoll: true,
      shouldClearJob: false,
    },
  );
});

test('keeps a partial cached result visible when no active job can be reattached', () => {
  assert.deepEqual(
    normalizeCitationReviewReload({ cachedReview: partial, storedJob: null }),
    {
      review: partial,
      shouldPoll: false,
      shouldClearJob: false,
    },
  );
});

test('clears a saved job after a terminal complete result', () => {
  assert.deepEqual(
    normalizeCitationReviewReload({
      cachedReview: complete,
      storedJob: { id: 'job-1', status: 'SUCCESS', result: complete },
    }),
    {
      review: complete,
      shouldPoll: false,
      shouldClearJob: true,
    },
  );
});

test('clears an active job when the cache is already terminal', () => {
  assert.equal(
    normalizeCitationReviewReload({
      cachedReview: complete,
      storedJob: { id: 'job-1', status: 'PROCESSING', result: null },
    }).shouldClearJob,
    true,
  );
});

test('uses a reattached job result when the cache has no response', () => {
  assert.deepEqual(
    normalizeCitationReviewReload({
      cachedReview: null,
      storedJob: { id: 'job-1', status: 'PROCESSING', result: partial },
    }),
    {
      review: partial,
      shouldPoll: true,
      shouldClearJob: false,
    },
  );
});
