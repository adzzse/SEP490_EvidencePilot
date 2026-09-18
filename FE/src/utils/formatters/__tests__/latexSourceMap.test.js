import test from 'node:test';
import assert from 'node:assert/strict';
import { scanLatexInline } from '../latexSourceMap.js';
import {
  mdSample, mdSampleBold, mdSampleMath,
  texSample, texSampleTextbf, texSampleCite,
  texFish, texFishFirst, texFishSecond,
} from './samples.js';

test('markdown bold maps to the exact BOLDS span', () => {
  const spans = scanLatexInline(mdSample);
  assert.deepEqual(spans.find(s => s.type === 'bold'), { type: 'bold', ...mdSampleBold });
});

test('inline math maps; display math refuses', () => {
  const spans = scanLatexInline(mdSample);
  assert.deepEqual(spans.find(s => s.type === 'math'), { type: 'math', ...mdSampleMath });
  assert.equal(scanLatexInline('Alpha $$x^2$$ gamma.').some(s => s.type === 'math'), false);
});

test('textbf and cite map to exact spans', () => {
  const spans = scanLatexInline(texSample);
  assert.deepEqual(spans.find(s => s.type === 'textbf'), { type: 'textbf', ...texSampleTextbf });
  assert.deepEqual(spans.find(s => s.type === 'cite'), { type: 'cite', ...texSampleCite });
});

test('duplicate fish map by position, not search', () => {
  const spans = scanLatexInline(texFish).filter(s => s.type === 'textbf');
  assert.deepEqual(spans, [
    { type: 'textbf', ...texFishFirst },
    { type: 'textbf', ...texFishSecond },
  ]);
});

test('escaped constructs are skipped, never mapped', () => {
  const spans = scanLatexInline('Cost \\$5 and $x$ here. \\\\textbf{no}.');
  assert.deepEqual(spans.filter(s => s.type === 'math').map(({ from, to }) => ({ from, to })), [{ from: 13, to: 16 }]);
  assert.equal(spans.some(s => s.type === 'textbf'), false);
});

test('one-level nested braces match whole', () => {
  assert.deepEqual(scanLatexInline('\\textbf{a {b} c}'), [{ type: 'textbf', from: 0, to: 16 }]);
});
