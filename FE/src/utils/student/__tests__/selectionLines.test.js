import assert from 'node:assert/strict';
import test from 'node:test';

import { selectionLines } from '../feedbackAnchors.js';

test('single-line selection reports one line', () => {
  assert.deepEqual(selectionLines('Alpha beta\ngamma', 0, 5), { first: 1, last: 1 });
});

test('multi-line selection spans lines', () => {
  assert.deepEqual(selectionLines('l1\nl2\nl3\nl4', 0, 8), { first: 1, last: 3 });
});

test('CRLF input is normalized before counting', () => {
  assert.deepEqual(selectionLines('l1\r\nl2\r\nl3', 4, 6), { first: 2, last: 2 });
});

test('out-of-range offsets clamp to the document', () => {
  assert.deepEqual(selectionLines('ab', -4, 99), { first: 1, last: 1 });
});

test('empty or inverted ranges yield null', () => {
  assert.equal(selectionLines('ab', 2, 2), null);
  assert.equal(selectionLines('ab', 2, 1), null);
  assert.equal(selectionLines('', 0, 0), null);
});
