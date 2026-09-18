import assert from 'node:assert/strict';
import test from 'node:test';

import {
  latestReturnedRequest,
  previousRequest,
  roundNumberFor,
  selectFeedbackForRound,
  selectVisibleStudentFeedback,
} from '../reviewRounds.js';

const requests = [
  { id: 'round-c', status: 'PENDING', requestedAt: '2026-09-18T08:00:00Z' },
  { id: 'round-b', status: 'RETURNED', requestedAt: '2026-09-17T08:00:00Z' },
  { id: 'round-a', status: 'RETURNED', requestedAt: '2026-09-16T08:00:00Z' },
];

const item = (overrides = {}) => ({
  id: 'one',
  requestId: 'round-b',
  sectionId: 'section-1',
  publishedAt: '2026-09-17T09:05:00Z',
  createdAt: '2026-09-17T09:00:00Z',
  updatedAt: '2026-09-17T09:00:00Z',
  assignedUserId: 'member-1',
  ...overrides,
});

test('roundNumberFor matches the legacy length-minus-index labels', () => {
  assert.equal(roundNumberFor(requests, 'round-c'), 3);
  assert.equal(roundNumberFor(requests, 'round-b'), 2);
  assert.equal(roundNumberFor(requests, 'round-a'), 1);
  assert.equal(roundNumberFor(requests, 'missing'), null);
  assert.equal(roundNumberFor([], 'round-a'), null);
});

test('latestReturnedRequest skips PENDING and honors desc order', () => {
  assert.equal(latestReturnedRequest(requests)?.id, 'round-b');
  assert.equal(latestReturnedRequest([{ id: 'x', status: 'PENDING' }]), null);
  assert.equal(latestReturnedRequest([]), null);
});

test('previousRequest finds the earlier RETURNED round after active', () => {
  assert.equal(previousRequest(requests, 'round-c')?.id, 'round-b');
  assert.equal(previousRequest(requests, 'round-b')?.id, 'round-a');
  assert.equal(previousRequest(requests, 'round-a'), null);
  assert.equal(previousRequest(requests, 'missing'), null);
});

test('selectFeedbackForRound filters request, section, and drafts', () => {
  const items = [
    item({ id: 'keep' }),
    item({ id: 'draft', publishedAt: null }),
    item({ id: 'other-round', requestId: 'round-a' }),
    item({ id: 'other-section', sectionId: 'section-9' }),
  ];
  assert.deepEqual(
    selectFeedbackForRound(items, { requestId: 'round-b', sectionId: 'section-1' }).map(i => i.id),
    ['keep'],
  );
});

test('selectFeedbackForRound can include drafts for the active authoring set', () => {
  const items = [item({ id: 'draft', publishedAt: null }), item({ id: 'keep' })];
  assert.deepEqual(
    selectFeedbackForRound(items, { requestId: 'round-b', sectionId: 'section-1', publishedOnly: false })
      .map(i => i.id),
    ['draft', 'keep'],
  );
});

test('selectVisibleStudentFeedback scopes members to their sections', () => {
  const items = [
    item({ id: 'mine', assignedUserId: 'member-1' }),
    item({ id: 'theirs', assignedUserId: 'member-2' }),
    item({ id: 'unassigned', assignedUserId: null }),
  ];
  const scope = { requestId: 'round-b' };
  assert.deepEqual(
    selectVisibleStudentFeedback(items, scope, 'member-1').map(i => i.id),
    ['mine'],
  );
  assert.deepEqual(
    selectVisibleStudentFeedback(items, scope, null).map(i => i.id),
    ['mine', 'theirs', 'unassigned'],
  );
});

test('selectVisibleStudentFeedback orders by createdAt ascending', () => {
  const items = [
    item({ id: 'newer', createdAt: '2026-09-17T10:00:00Z' }),
    item({ id: 'older', createdAt: '2026-09-17T08:00:00Z' }),
  ];
  assert.deepEqual(
    selectVisibleStudentFeedback(items, { requestId: 'round-b' }, null).map(i => i.id),
    ['older', 'newer'],
  );
});
