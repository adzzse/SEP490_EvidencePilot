import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/Student/SectionRequirementsPanel.jsx', import.meta.url), 'utf8');

// Exercise the component's async handlers without adding a DOM test dependency.
function harness(name) {
  const events = [];
  const requestRef = { current: 0 };
  const pending = Promise.withResolvers();
  const record = type => value => events.push([type, value]);
  const dependencies = {
    api: { post: () => pending.promise, delete: () => pending.promise },
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
  return { events, requestRef, pending, run };
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
    const data = { status, sectionId: 'section-a' };
    h.pending.resolve({ data });
    await done;
    assert.deepEqual(h.events.find(([type]) => type === 'evaluation'), ['evaluation', data]);
    assert.equal(h.events.some(([type]) => type === 'toast'), status === 'COMPLETED');
    assert.deepEqual(h.events.at(-1), ['busy', '']);
  }
});
