import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/pages/Student/WorkspaceLayout.jsx', import.meta.url), 'utf8');
const handler = source.split('  const pollAiJob = ')[1].split('\n  };')[0] + '\n}';

function poll(job) {
  return new Function('api', 't', `return (${handler});`)(
    { get: async () => ({ data: job }) }, key => key,
  );
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
