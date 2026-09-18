import assert from 'node:assert/strict';
import test from 'node:test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';

import { remarkLatexInline } from '../markdownBlocks.js';

// B0 verification probes: confirm what the remark/rehype tree actually
// exposes before building the Preview source map on top of it.
function parseMarkdown(source) {
  return unified().use(remarkParse).use(remarkGfm).use(remarkMath)
    .use(remarkLatexInline, { citationNumbers: {} })
    .parse(source);
}

function toHast(mdast) {
  return unified().use(remarkRehype).use(rehypeKatex).runSync(
    unified().use(remarkParse).parse('x'));
}

test('B0: inline text/strong/em/code nodes carry exact source offsets', () => {
  const source = 'Hello **bold** and `code` end.';
  const tree = parseMarkdown(source);
  const texts = [];
  const visit = node => {
    if ((node.type === 'text' || node.type === 'inlineCode') && node.position) texts.push(node);
    (node.children || []).forEach(visit);
  };
  visit(tree);
  assert.ok(texts.length > 0);
  for (const node of texts) {
    const { start, end } = node.position;
    assert.ok(Number.isInteger(start.offset) && Number.isInteger(end.offset));
    // Offsets are exact: slicing the source reproduces meaningful text.
    const slice = source.slice(start.offset, end.offset);
    assert.ok(slice.length > 0);
    assert.ok(node.type !== 'text' || slice === node.value);
  }
  // The strong node spans its full markup, inner text spans the words.
  const strongs = [];
  const visit2 = node => {
    if (node.type === 'strong' && node.position) strongs.push(node);
    (node.children || []).forEach(visit2);
  };
  visit2(tree);
  assert.equal(strongs.length, 1);
  assert.equal(source.slice(strongs[0].position.start.offset, strongs[0].position.end.offset), '**bold**');
});

test('B0: strong children split with exact positions', () => {
  const tree = parseMarkdown('A **machine learning** model.');
  const strongs = [];
  const visit = node => {
    if ((node.type === 'strong' || node.type === 'emphasis') && node.position) strongs.push(node);
    (node.children || []).forEach(visit);
  };
  visit(tree);
  assert.equal(strongs.length, 1);
  assert.equal(strongs[0].position.start.offset, 2);
});

test('B0: math nodes lose usable positions after rehype-katex', async () => {
  const mdast = unified().use(remarkParse).use(remarkMath).parse('Energy $E=mc^2$ here.');
  const hast = await unified().use(remarkRehype).use(rehypeKatex).run(mdast);
  const katexSpans = [];
  const visit = node => {
    if (node.type === 'element'
      && (node.properties?.className || []).some(c => String(c).includes('katex'))) katexSpans.push(node);
    (node.children || []).forEach(visit);
  };
  visit({ type: 'root', children: hast.children || [] });
  assert.ok(katexSpans.length > 0, 'expected rendered KaTeX output');
  const mapped = katexSpans.filter(node => node.position
    && Number.isInteger(node.position.start?.offset)
    && Number.isInteger(node.position.end?.offset));
  // KaTeX replaces math nodes with generated markup: no source positions survive.
  assert.equal(mapped.length, 0);
});

test('B0: duplicate text occurrences are distinguishable only by offset', () => {
  const source = 'A fish is different from another fish.';
  const tree = parseMarkdown(source);
  const hits = [];
  const visit = node => {
    if (node.type === 'text' && node.position && node.value.includes('fish')) hits.push(node);
    (node.children || []).forEach(visit);
  };
  visit(tree);
  // Plain text without markup stays ONE node: both occurrences share it and
  // are told apart only by intra-node offsets (no text search allowed).
  assert.equal(hits.length, 1);
  const [node] = hits;
  const first = node.value.indexOf('fish');
  const second = node.value.indexOf('fish', first + 1);
  assert.ok(first >= 0 && second > first);
  assert.equal(
    source.slice(node.position.start.offset + first, node.position.start.offset + first + 4),
    'fish');
  assert.equal(
    source.slice(node.position.start.offset + second, node.position.start.offset + second + 4),
    'fish');
  assert.notEqual(
    node.position.start.offset + first,
    node.position.start.offset + second);
});
