import assert from 'node:assert/strict';
import test from 'node:test';

import { findOverlaps, isOverlappable } from '../feedbackOverlap.js';

const SCOPE = { requestId: 'round-1', sectionId: 'section-1' };

const item = (overrides = {}) => ({
  id: 'a',
  requestId: 'round-1',
  sectionId: 'section-1',
  anchor: { original: { from: 0, to: 24 } },
  ...overrides,
});

test('no overlap returns zero count', () => {
  assert.deepEqual(findOverlaps({ from: 0, to: 4 }, [], SCOPE), { count: 0, exactDuplicate: false, ids: [] });
  assert.deepEqual(findOverlaps({ from: 30, to: 40 }, [item()], SCOPE), { count: 0, exactDuplicate: false, ids: [] });
});

test('partial overlap is reported', () => {
  const result = findOverlaps({ from: 0, to: 10 }, [item()], SCOPE);
  assert.deepEqual(result, { count: 1, exactDuplicate: false, ids: ['a'] });
});

test('nested fish selection is reported', () => {
  // "The man has hooked a fish" is 0-24; "fish" is 20-24.
  const result = findOverlaps({ from: 20, to: 24 }, [item()], SCOPE);
  assert.deepEqual(result, { count: 1, exactDuplicate: false, ids: ['a'] });
});

test('exact duplicate range is flagged but listed', () => {
  const result = findOverlaps({ from: 0, to: 24 }, [item()], SCOPE);
  assert.deepEqual(result, { count: 1, exactDuplicate: true, ids: ['a'] });
});

test('whole-section feedback never counts as overlap', () => {
  const whole = item({ id: 'w', anchor: null });
  assert.deepEqual(findOverlaps({ from: 5, to: 9 }, [whole], SCOPE), { count: 0, exactDuplicate: false, ids: [] });
});

test('previous-round feedback never counts', () => {
  const old = item({ id: 'old', requestId: 'round-0' });
  assert.deepEqual(findOverlaps({ from: 0, to: 10 }, [old], SCOPE), { count: 0, exactDuplicate: false, ids: [] });
});

test('multiple overlapping ids are all returned', () => {
  const result = findOverlaps({ from: 5, to: 9 }, [item(), item({ id: 'b' })], SCOPE);
  assert.deepEqual(result, { count: 2, exactDuplicate: false, ids: ['a', 'b'] });
});

test('isOverlappable encodes the scope rule', () => {
  assert.equal(isOverlappable(item(), 'round-1', 'section-1'), true);
  assert.equal(isOverlappable(item({ requestId: 'round-0' }), 'round-1', 'section-1'), false);
  assert.equal(isOverlappable(item({ sectionId: 'other' }), 'round-1', 'section-1'), false);
  assert.equal(isOverlappable(item({ anchor: null }), 'round-1', 'section-1'), false);
  assert.equal(isOverlappable(item({ anchor: { original: null } }), 'round-1', 'section-1'), false);
});
