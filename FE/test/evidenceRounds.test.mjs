import test from 'node:test';
import assert from 'node:assert/strict';
import { latestRoundTraces } from '../src/utils/instructor/evidenceRounds.js';

const trace = (sectionId, roundId, createdAt, id) => ({ id, sectionId, roundId, createdAt });

test('keeps only the latest round per section', () => {
  const traces = [
    ...[1, 2, 3, 4, 5].map(i => trace('s1', 'r1', '2026-10-01T10:00:00Z', `r1-${i}`)),
    ...[1, 2, 3, 4, 5].map(i => trace('s1', 'r2', '2026-10-10T10:00:00Z', `r2-${i}`)),
  ];
  const kept = latestRoundTraces(traces);
  assert.equal(kept.length, 5);
  assert.ok(kept.every(t => t.roundId === 'r2'));
});

test('resolves latest round independently per section', () => {
  const traces = [
    trace('s1', 'r1', '2026-10-01T10:00:00Z', 'a'),
    trace('s1', 'r2', '2026-10-10T10:00:00Z', 'b'),
    trace('s2', 'r1', '2026-10-01T10:00:00Z', 'c'),
  ];
  const kept = latestRoundTraces(traces);
  assert.deepEqual(kept.map(t => t.id), ['b', 'c']);
});

test('passes through single-round and empty inputs', () => {
  assert.deepEqual(latestRoundTraces([]), []);
  assert.deepEqual(latestRoundTraces(null), []);
  const single = [trace('s1', 'r1', '2026-10-01T10:00:00Z', 'a')];
  assert.deepEqual(latestRoundTraces(single), single);
});
