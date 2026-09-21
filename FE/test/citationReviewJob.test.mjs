import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCitationReviewReload } from '../src/utils/citationReviewJob.js';

const partial = { complete: false, findings: [{ excerpt: 'partial' }] };
const complete = { complete: true, findings: [{ excerpt: 'done' }] };

test('reattaches an active job when the cached review is partial', () => {
  assert.deepEqual(
    normalizeCitationReviewReload({
      serverState: { status: 'RUNNING', review: partial },
      storedJob: { id: 'job-1', status: 'PROCESSING', result: partial },
    }),
    {
      jobId: 'job-1',
      review: partial,
      shouldPoll: true,
      shouldClearJob: false,
      errorCode: null,
      errorMessage: null,
      progress: { current: 0, total: 0 },
    },
  );
});

test('keeps a partial cached result visible when no active job can be reattached', () => {
  assert.deepEqual(
    normalizeCitationReviewReload({ serverState: { review: partial }, storedJob: null }),
    {
      jobId: null,
      review: partial,
      shouldPoll: false,
      shouldClearJob: false,
      errorCode: null,
      errorMessage: null,
      progress: { current: 0, total: 0 },
    },
  );
});

test('clears a saved job after a terminal complete result', () => {
  assert.deepEqual(
    normalizeCitationReviewReload({
      serverState: { status: 'COMPLETE', review: complete },
      storedJob: { id: 'job-1', status: 'SUCCESS', result: complete },
    }),
    {
      jobId: 'job-1',
      review: complete,
      shouldPoll: false,
      shouldClearJob: true,
      errorCode: null,
      errorMessage: null,
      progress: { current: 0, total: 0 },
    },
  );
});

test('keeps an active job when the server still reports it as running', () => {
  assert.equal(
    normalizeCitationReviewReload({
      serverState: { status: 'RUNNING', review: complete },
      storedJob: { id: 'job-1', status: 'PROCESSING', result: null },
    }).shouldClearJob,
    false,
  );
});

test('uses a reattached job result when the cache has no response', () => {
  assert.deepEqual(
    normalizeCitationReviewReload({
      serverState: null,
      storedJob: { id: 'job-1', status: 'PROCESSING', result: partial },
    }),
    {
      jobId: 'job-1',
      review: partial,
      shouldPoll: true,
      shouldClearJob: false,
      errorCode: null,
      errorMessage: null,
      progress: { current: 0, total: 0 },
    },
  );
});

test('reattaches from server state when localStorage is empty', () => {
  assert.deepEqual(normalizeCitationReviewReload({
    serverState: {
      jobId: 'job-1', status: 'RUNNING', finishedCount: 2, totalCount: 5,
      complete: false, review: partial,
    },
    storedJob: null,
  }), {
    jobId: 'job-1', review: partial, shouldPoll: true,
    shouldClearJob: false, errorCode: null, errorMessage: null,
    progress: { current: 2, total: 5 },
  });
});

test('exposes a terminal server failure without polling', () => {
  assert.deepEqual(normalizeCitationReviewReload({
    serverState: {
      jobId: 'job-2', status: 'FAILED', errorCode: 'CITATION_REVIEW_FAILED',
      errorMessage: 'Provider unavailable', review: null,
    },
  }), {
    jobId: 'job-2', review: null, shouldPoll: false, shouldClearJob: true,
    errorCode: 'CITATION_REVIEW_FAILED', errorMessage: 'Provider unavailable',
    progress: { current: 0, total: 0 },
  });
});
