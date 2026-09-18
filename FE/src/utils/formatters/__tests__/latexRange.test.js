import test from 'node:test';
import assert from 'node:assert/strict';
import { expandLatexRange, spansInBlock } from '../latexSourceMap.js';
import { texFish, texFishFirst, texFishSecond, texSample, texSampleCite } from './samples.js';

const text = (containsAnchor, containsFocus) => ({ kind: 'text', containsAnchor, containsFocus });
const cite = (containsAnchor, containsFocus) => ({ kind: 'cite', containsAnchor, containsFocus });
const none = kind => ({ kind, containsAnchor: false, containsFocus: false });

test('span-touching selection expands to BOLDS+braces', () => {
  const spans = spansInBlock(texFish, 0, texFish.length);
  // Partial selection inside the first bold ("fis") — flags carry no text.
  const result = expandLatexRange(spans, [text(true, true), text(false, false)]);
  assert.deepEqual(result, { from: texFishFirst.from, to: texFishFirst.to });
});

test('duplicate fish map by position, not search', () => {
  const spans = spansInBlock(texFish, 0, texFish.length);
  const result = expandLatexRange(spans, [text(false, false), text(true, true)]);
  assert.deepEqual(result, { from: texFishSecond.from, to: texFishSecond.to });
});

test('cite selection expands to the full \\cite span', () => {
  const spans = spansInBlock(texSample, 0, texSample.length);
  const result = expandLatexRange(spans, [text(false, false), cite(true, true)]);
  assert.deepEqual(result, { from: texSampleCite.from, to: texSampleCite.to });
});

test('prose selection with no touched construct refuses', () => {
  const spans = spansInBlock(texFish, 0, texFish.length);
  assert.deepEqual(
    expandLatexRange(spans, [text(false, false), text(false, false)]),
    { unmappable: 'no-construct' },
  );
});

test('straddling selection (anchor in, focus out) refuses', () => {
  const spans = spansInBlock(texFish, 0, texFish.length);
  assert.deepEqual(
    expandLatexRange(spans, [text(true, false), text(false, false)]),
    { unmappable: 'no-construct' },
  );
});

test('renderer surprise (element count differs) refuses', () => {
  const spans = spansInBlock(texFish, 0, texFish.length);
  assert.deepEqual(
    expandLatexRange(spans, [text(false, false)]),
    { unmappable: 'count-mismatch' },
  );
});

test('no indexOf-style word search in the mapping core', async () => {
  const { readFile } = await import('node:fs/promises');
  const code = await readFile(new URL('../latexSourceMap.js', import.meta.url), 'utf8');
  for (const needle of ['indexOf', 'lastIndexOf', '.search(', '.includes(']) {
    assert.equal(code.includes(needle), false, `banned word-search API: ${needle}`);
  }
});
