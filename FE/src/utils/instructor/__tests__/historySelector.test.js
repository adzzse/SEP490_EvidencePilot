import assert from 'node:assert/strict';
import test from 'node:test';

import { selectPreviousCards } from '../historySelector.js';

const requests = [
  { id: 'round-c', status: 'PENDING', requestedAt: '2026-09-18T08:00:00Z' },
  { id: 'round-b', status: 'RETURNED', requestedAt: '2026-09-17T08:00:00Z' },
  { id: 'round-a', status: 'RETURNED', requestedAt: '2026-09-16T08:00:00Z' },
];

const item = (overrides = {}) => ({
  id: 'one',
  requestId: 'round-b',
  sectionId: 'section-1',
  content: 'Previous feedback.',
  createdAt: '2026-09-17T09:00:00Z',
  updatedAt: '2026-09-17T09:00:00Z',
  publishedAt: '2026-09-17T09:05:00Z',
  ...overrides,
});

test('returns all published previous-round cards in createdAt order', () => {
  const items = [
    item({ id: 'newer', createdAt: '2026-09-17T10:00:00Z' }),
    item({ id: 'older', createdAt: '2026-09-17T08:00:00Z' }),
  ];
  assert.deepEqual(
    selectPreviousCards(items, requests, 'round-c', 'section-1').map(i => i.id),
    ['older', 'newer'],
  );
});

test('excludes drafts, other sections, and other rounds', () => {
  const items = [
    item({ id: 'draft', publishedAt: null, createdAt: '2026-09-17T11:00:00Z' }),
    item({ id: 'wrong-section', sectionId: 'section-9' }),
    item({ id: 'current-round', requestId: 'round-c' }),
    item({ id: 'older-round', requestId: 'round-a' }),
    item({ id: 'kept' }),
  ];
  assert.deepEqual(
    selectPreviousCards(items, requests, 'round-c', 'section-1').map(i => i.id),
    ['kept'],
  );
});

test('updatedAt edits never reorder history', () => {
  const items = [
    item({ id: 'older', createdAt: '2026-09-17T08:00:00Z', updatedAt: '2026-09-17T12:00:00Z' }),
    item({ id: 'newer', createdAt: '2026-09-17T10:00:00Z', updatedAt: '2026-09-17T10:00:00Z' }),
  ];
  assert.deepEqual(
    selectPreviousCards(items, requests, 'round-c', 'section-1').map(i => i.id),
    ['older', 'newer'],
  );
});

test('previous round means array position after active', () => {
  const items = [
    item({ id: 'x', requestId: 'round-a' }),
    item({ id: 'y', requestId: 'round-b' }),
  ];
  assert.deepEqual(
    selectPreviousCards(items, requests, 'round-c', 'section-1').map(i => i.id),
    ['y'],
  );
  assert.deepEqual(
    selectPreviousCards(items, requests, 'round-b', 'section-1').map(i => i.id),
    ['x'],
  );
});

test('single round or unknown active yields empty', () => {
  assert.deepEqual(selectPreviousCards([item({ requestId: 'round-c' })], requests, 'round-c', 'section-1'), []);
  assert.deepEqual(selectPreviousCards([item()], requests, 'missing', 'section-1'), []);
  assert.deepEqual(selectPreviousCards([], requests, 'round-c', 'section-1'), []);
});
