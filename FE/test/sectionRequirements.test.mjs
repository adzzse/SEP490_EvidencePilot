import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/Student/SectionRequirementsPanel.jsx', import.meta.url), 'utf8');

// Exercise the component's async handlers without adding a DOM test dependency.
function harness(name) {
  const events = [];
  const requestRef = { current: 0 };
  const pending = Promise.withResolvers();
  const jobPending = Promise.withResolvers();
  const record = type => value => events.push([type, value]);
  const dependencies = {
    api: { post: (...args) => { events.push(['post', args]); return pending.promise; }, delete: () => pending.promise },
    pollAiJob: (...args) => { events.push(['poll', args]); return jobPending.promise; },
    requestRef,
    isDirty: false,
    selectedPaper: { id: 'paper-a' },
    selectedSection: { id: 'section-a' },
    readinessSection: { currentInputFingerprint: 'fingerprint-a' },
    setBusy: record('busy'),
    setError: record('error'),
    setEvaluation: record('evaluation'),
    setReadinessSection: record('handoff'),
    onHandoffChanged: record('changed'),
    showToast: record('toast'),
    t: key => key,
  };
  const handler = source.split(`  const ${name} = `)[1].split('\n  };')[0] + '\n}';
  const run = new Function(...Object.keys(dependencies), `return (${handler});`)(...Object.values(dependencies));
  return { events, requestRef, pending, jobPending, run };
}

for (const action of ['runCheck', 'updateHandoff']) {
  for (const outcome of ['success', 'failure']) {
    test(`${action} ignores a late ${outcome} after selection/input invalidation`, async () => {
      const h = harness(action);
      const done = h.run(true);
      h.requestRef.current += 1;
      h.events.length = 0;
      if (outcome === 'success') h.pending.resolve({ data: { status: 'COMPLETED' } });
      else h.pending.reject(new Error('request failed'));
      await done;
      assert.deepEqual(h.events, []);
    });
  }
}

test('current self-check updates its result and only toasts for COMPLETED', async () => {
  for (const status of ['COMPLETED', 'SYSTEM_ERROR']) {
    const h = harness('runCheck');
    const done = h.run();
    assert.deepEqual(h.events.find(([type]) => type === 'post')[1],
      ['/api/papers/paper-a/sections/section-a/standard-evaluation/jobs']);
    assert.deepEqual(h.events.find(([type]) => type === 'busy'), ['busy', 'check']);
    const data = { status, sectionId: 'section-a' };
    h.pending.resolve({ data: { jobId: 'job-a' } });
    h.jobPending.resolve({ status: 'SUCCESS', result: data });
    await done;
    assert.deepEqual(h.events.find(([type]) => type === 'evaluation'), ['evaluation', data]);
    assert.equal(h.events.some(([type]) => type === 'toast'), status === 'COMPLETED');
    assert.deepEqual(h.events.at(-1), ['busy', '']);
  }
});

test('self-check discards a late job result after the input changes', async () => {
  const h = harness('runCheck');
  const done = h.run();
  h.pending.resolve({ data: { jobId: 'job-a' } });
  await Promise.resolve();
  const [, invalidate] = h.events.find(([type]) => type === 'poll')[1];
  assert.equal(invalidate(), false);
  h.requestRef.current += 1;
  assert.equal(invalidate(), true);
  h.events.length = 0;
  h.jobPending.resolve({ result: { status: 'COMPLETED' } });
  await done;
  assert.deepEqual(h.events, []);
});

test('self-check shows a failed job as an error and ends its pending state', async () => {
  const h = harness('runCheck');
  const done = h.run();
  h.pending.resolve({ data: { jobId: 'job-a' } });
  await Promise.resolve();
  h.jobPending.reject(new Error('job failed'));
  await done;
  assert.deepEqual(h.events.find(([type, value]) => type === 'error' && value), ['error', 'selfCheckFailed']);
  assert.deepEqual(h.events.at(-1), ['busy', '']);
  assert.equal(h.events.some(([type]) => type === 'evaluation'), false);
});
