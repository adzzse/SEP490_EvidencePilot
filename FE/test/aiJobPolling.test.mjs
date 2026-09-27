import assert from 'node:assert/strict';
import test from 'node:test';
import { pollAiJob, getWithRetry, trackAiJob } from '../src/utils/aiJobPolling.js';
import { taskKey, readTask, writeTask } from '../src/utils/taskState.js';

function poll(job) {
  return (...args) => pollAiJob({ get: async () => ({ data: job }) }, ...args);
}

test('a stopped Citation Review exposes its incomplete checkpoint', async () => {
  const job = {
    kind: 'SECTION_CITATION_REVIEW', status: 'FAILED', progressCurrent: 1, progressTotal: 2,
    result: { complete: false, findings: [], limitations: ['Batch 2/2 has not been reviewed yet'] },
  };
  let progress;
  assert.equal(await poll(job)('job', null, value => { progress = value; }), job);
  assert.deepEqual(progress, { current: 1, total: 2 });
});

test('failure without a valid review checkpoint still rejects', async () => {
  for (const [kind, result] of [
    ['SECTION_CITATION_REVIEW', null],
    ['SECTION_CITATION_REVIEW', { complete: true }],
    ['SECTION_SUGGESTION', { complete: false }],
  ]) {
    await assert.rejects(poll({ kind, status: 'FAILED', result, errorMessage: 'HTTP 503' })('job'),
      error => error.message === 'HTTP 503' && error.status === 503);
  }
});

test('polling preserves successful results and ignores an invalidated selection', async () => {
  const job = { status: 'SUCCESS', result: { complete: true } };
  assert.equal(await poll(job)('job'), job);
  assert.equal(await poll(job)('job', () => true), null);
});

test('transient GET failure retries, permission failures stop, cancellation discards response', async () => {
  let calls = 0;
  const timer = globalThis.setTimeout;
  globalThis.setTimeout = callback => { callback(); };
  try {
    const api = { get: async () => {
      if (++calls === 1) throw { response: { status: 503 } };
      return { data: 'ready' };
    } };
    assert.equal((await getWithRetry(api, '/job')).data, 'ready');
    assert.equal(calls, 2);
    await assert.rejects(getWithRetry({ get: async () => { throw { response: { status: 403 } }; } }, '/job'));
    let aborted = false;
    assert.equal(await getWithRetry({ get: async () => { aborted = true; return {}; } }, '/job', () => aborted), null);
  } finally { globalThis.setTimeout = timer; }
});

test('saved job is reattached without submitting, scopes isolate users and stale inputs', async () => {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
  };
  const api = { defaults: { baseURL: 'fixture' }, get: async url => ({ data: { id: url, status: 'SUCCESS' } }) };
  const key = taskKey(api, 1, 'test', 10);
  let submissions = 0;
  const submit = async () => { submissions += 1; return { data: { jobId: 'saved' } }; };
  await trackAiJob(api, key, 'v1', submit);
  await trackAiJob(api, key, 'v1', submit);
  assert.equal(submissions, 1);
  assert.equal(await trackAiJob(api, key, 'v2', null), null);
  assert.equal(readTask(taskKey(api, 2, 'test', 10)), null);
  writeTask(key, null);
  assert.equal(readTask(key), null);
});
