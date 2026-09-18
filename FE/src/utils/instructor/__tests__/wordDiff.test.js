import assert from 'node:assert/strict';
import test from 'node:test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';

import { wordDiff, rangesFromOps, blockOverlapsRanges } from '../wordDiff.js';
import { applyChangeHighlights, renderLatexToHtml } from '../../formatters/latexHtml.js';
import { rehypeChangeRanges } from '../../formatters/markdownBlocks.js';

test('oversized inputs truncate honestly without ranges', () => {
  const big = Array.from({ length: 2100 }, (_, i) => `w${i}`).join(' ');
  const result = wordDiff(big, `${big} tail`);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.ranges, []);
});

test('identical texts produce no change ranges', () => {
  assert.deepEqual(wordDiff('same text', 'same text').ranges, []);
});

test('single-character replacement yields one minimal range', () => {
  const before = 'This is a test feedback, this is version 4';
  const after = 'This is a test feedback, this is version 5';
  const { ranges, truncated } = wordDiff(before, after);
  assert.equal(truncated, false);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].type, 'modified');
  assert.equal(after.slice(ranges[0].sourceStart, ranges[0].sourceEnd), '5');
});

test('inserted word yields one added range', () => {
  const before = 'Machine learning systems require testing.';
  const after = 'Machine learning systems require extensive testing.';
  const { ranges } = wordDiff(before, after);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].type, 'added');
  assert.equal(after.slice(ranges[0].sourceStart, ranges[0].sourceEnd).trim(), 'extensive');
});

test('deleted word yields no added range', () => {
  const { ranges } = wordDiff('require extensive testing.', 'require testing.');
  assert.deepEqual(ranges, []);
});

test('CRLF-only differences produce no ranges', () => {
  const { ranges } = wordDiff('line one\r\nline two', 'line one\nline two');
  assert.deepEqual(ranges, []);
});

test('empty baseline marks the whole insertion honestly', () => {
  const after = 'New paragraph.';
  const { ranges } = wordDiff('', after);
  assert.equal(ranges.length, 1);
  assert.equal(after.slice(ranges[0].sourceStart, ranges[0].sourceEnd), after);
});

test('added runs carry exact offsets into the after text', () => {
  const before = 'The quick brown fox jumps.';
  const after = 'The quick red fox jumped high.';
  const { ops, ranges } = wordDiff(before, after);
  // Non-deleted ops must reconstruct the after text exactly.
  assert.equal(ops.filter(([type]) => type !== -1).map(([, text]) => text).join(''), after);
  assert.ok(ranges.length > 0);
  let previousEnd = -1;
  for (const range of ranges) {
    assert.ok(range.sourceEnd > range.sourceStart);
    assert.ok(range.sourceStart >= previousEnd);
    assert.ok(after.slice(range.sourceStart, range.sourceEnd).trim() !== '');
    previousEnd = range.sourceEnd;
  }
  const covered = ranges.map(r => after.slice(r.sourceStart, r.sourceEnd)).join('|');
  assert.ok(covered.includes('red') || covered.includes('high'));
});

test('in-place replacement is typed as modified', () => {
  const { ranges } = wordDiff('the cat sat', 'the cat sit');
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].type, 'modified');
  assert.equal('the cat sit'.slice(ranges[0].sourceStart, ranges[0].sourceEnd), 'sit');
});

test('pure insertion is typed as added', () => {
  const after = 'Intro \\textbf{Hello World 2} end.';
  const { ranges } = wordDiff('Intro end.', after);
  assert.ok(ranges.length >= 1);
  assert.ok(ranges.every(r => r.type === 'added'));
  assert.ok(ranges.some(r => after.slice(r.sourceStart, r.sourceEnd).includes('Hello World 2')));
});

test('whitespace-only insertions produce no ranges', () => {
  assert.deepEqual(rangesFromOps([[0, 'a'], [1, '  '], [0, 'b']]), []);
});

test('blockOverlapsRanges matches half-open overlap', () => {
  const ranges = [{ sourceStart: 10, sourceEnd: 20 }];
  assert.equal(blockOverlapsRanges(0, 10, ranges), false);
  assert.equal(blockOverlapsRanges(0, 11, ranges), true);
  assert.equal(blockOverlapsRanges(19, 30, ranges), true);
  assert.equal(blockOverlapsRanges(20, 30, ranges), false);
  assert.equal(blockOverlapsRanges(0, 5, []), false);
});

test('latex preview does not whole-mark a block for a partial unmappable range', () => {
  const before = 'See $x$ here.';
  const after = 'See $y$ here.';
  const { ranges } = wordDiff(before, after);
  assert.ok(ranges.length > 0);
  const out = applyChangeHighlights(renderLatexToHtml(after), ranges, after);
  assert.doesNotMatch(out, /<p[^>]*preview-change-added/);
});

test('latex preview still marks a fully covered block', () => {
  const out = applyChangeHighlights(renderLatexToHtml('\\[y\\]'), wordDiff('\\[x\\]', '\\[y\\]').ranges, '\\[y\\]');
  assert.match(out, /preview-change-added/);
});

test('markdown fallback marks only fully covered elements', () => {
  const tree = () => ({ children: [
    { type: 'element', tagName: 'p', properties: {}, position: { start: { offset: 0 }, end: { offset: 10 } },
      children: [{ type: 'element', tagName: 'strong', children: [{ type: 'text', value: 'Hello' }] }] },
  ] });
  const partial = tree();
  rehypeChangeRanges([{ sourceStart: 0, sourceEnd: 5 }])(partial);
  assert.deepEqual(partial.children[0].properties.className || [], []);
  const full = tree();
  rehypeChangeRanges([{ sourceStart: 0, sourceEnd: 10 }])(full);
  assert.ok(full.children[0].properties.className.includes('preview-change-added'));
});

test('latex preview highlights the changed rendered words rather than the whole paragraph', () => {
  const before = 'First paragraph here.\n\nSecond with changes.\n';
  const after = 'First paragraph here.\n\nSecond with \\textbf{Hello World 2}.\n';
  const { ranges } = wordDiff(before, after);
  assert.ok(ranges.length > 0);
  const out = applyChangeHighlights(renderLatexToHtml(after), ranges, after);
  assert.match(out, /<strong><span class="preview-change-added">Hello World<\/span> <span class="preview-change-added">2<\/span><\/strong>/);
  assert.match(out, /<\/strong><span class="preview-change-added">\.<\/span>/);
  assert.doesNotMatch(out, /<p[^>]*preview-change-added/);
});

test('markdown preview splits positioned text at the shared change offsets', () => {
  const tree = { children: [
    { type: 'element', tagName: 'p', properties: {}, position: { start: { offset: 0 }, end: { offset: 10 } }, children: [{ type: 'text', value: 'First line', position: { start: { offset: 0 }, end: { offset: 10 } } }] },
    { type: 'element', tagName: 'p', properties: {}, position: { start: { offset: 11 }, end: { offset: 25 } }, children: [{ type: 'text', value: 'Hello World 2!', position: { start: { offset: 11 }, end: { offset: 25 } } }] },
  ] };
  rehypeChangeRanges([{ id: 'chg-0', type: 'added', sourceStart: 17, sourceEnd: 22 }])(tree);
  assert.deepEqual(tree.children[0].properties.className || [], []);
  assert.deepEqual(tree.children[1].children.map(node => node.type), ['text', 'element', 'text']);
  assert.equal(tree.children[1].children[1].children[0].value, 'World');
  assert.deepEqual(tree.children[1].properties.className || [], []);
});

test('rehype change plugin is safe when registered with unified options', () => {
  const ranges = [{ id: 'chg-0', type: 'added', sourceStart: 6, sourceEnd: 11 }];
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use([[rehypeChangeRanges, ranges]]);
  const tree = processor.runSync(processor.parse('Hello changed'));
  assert.equal(tree.children[0].children[1].type, 'element');
  assert.equal(tree.children[0].children[1].properties.className[0], 'preview-change-added');
});
