import assert from 'node:assert/strict';
import test from 'node:test';

import { assembleSourceRange } from '../previewSelection.js';

test('single fully selected node maps directly', () => {
  assert.deepEqual(
    assembleSourceRange([{ ss: 20, se: 24, from: 0, to: 4, length: 4 }]),
    { from: 20, to: 24 },
  );
});

test('single partial selection offsets inside the node span', () => {
  assert.deepEqual(
    assembleSourceRange([{ ss: 20, se: 24, from: 1, to: 3, length: 4 }]),
    { from: 21, to: 23 },
  );
});

test('adjacent nodes compose when source spans touch', () => {
  assert.deepEqual(
    assembleSourceRange([
      { ss: 0, se: 5, from: 3, to: 5, length: 5 },
      { ss: 5, se: 11, from: 0, to: 6, length: 6 },
    ]),
    { from: 3, to: 11 },
  );
});

test('gapped source spans refuse instead of bridging generated text', () => {
  assert.deepEqual(
    assembleSourceRange([
      { ss: 0, se: 5, from: 0, to: 5, length: 5 },
      { ss: 9, se: 14, from: 0, to: 5, length: 5 },
    ]),
    { unmappable: 'discontinuous-source' },
  );
});

test('empty selection refuses', () => {
  assert.deepEqual(assembleSourceRange([]), { unmappable: 'empty-selection' });
  assert.deepEqual(
    assembleSourceRange([{ ss: 4, se: 9, from: 2, to: 2, length: 5 }]),
    { unmappable: 'empty-selection' },
  );
});

test('unit-mapped nodes contribute only when fully selected', () => {
  assert.deepEqual(
    assembleSourceRange([{ ss: 30, se: 45, from: 0, to: 4, length: 4, unit: true }]),
    { from: 30, to: 45 },
  );
  assert.deepEqual(
    assembleSourceRange([{ ss: 30, se: 45, from: 1, to: 3, length: 4, unit: true }]),
    { unmappable: 'partial-unit-selection' },
  );
});

test('mismatched span length refuses', () => {
  assert.deepEqual(
    assembleSourceRange([{ ss: 10, se: 14, from: 0, to: 6, length: 6 }]),
    { unmappable: 'span-mismatch' },
  );
});
