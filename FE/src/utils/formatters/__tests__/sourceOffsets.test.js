import assert from 'node:assert/strict';
import test from 'node:test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';

import { remarkLatexInline, rehypeSourceOffsets } from '../markdownBlocks.js';

function hastOf(source) {
  const mdast = unified().use(remarkParse).use(remarkGfm).use(remarkMath)
    .use(remarkLatexInline, { citationNumbers: {} })
    .parse(source);
  const tree = unified().use(remarkRehype).runSync(mdast);
  unified().use(rehypeSourceOffsets, source).runSync(tree);
  return tree;
}

function spans(tree) {
  const found = [];
  const visit = node => {
    if (node.type === 'element' && node.properties?.['data-ss'] != null) found.push(node);
    (node.children || []).forEach(visit);
  };
  visit({ type: 'root', children: tree.children || [] });
  return found;
}

test('plain text nodes are wrapped with exact source spans', () => {
  const tree = hastOf('Hello world.');
  const wrapped = spans(tree);
  assert.ok(wrapped.length > 0);
  for (const span of wrapped) {
    const text = span.children.map(child => child.value || '').join('');
    const source = 'Hello world.';
    assert.equal(
      source.slice(Number(span.properties['data-ss']), Number(span.properties['data-se'])),
      text,
    );
  }
  // Full coverage: concatenated spans tile the paragraph source.
  const para = tree.children[0];
  const flat = [];
  const collect = node => {
    if (node.type === 'element' && node.properties?.['data-ss'] != null) {
      flat.push([Number(node.properties['data-ss']), Number(node.properties['data-se'])]);
      return;
    }
    (node.children || []).forEach(collect);
  };
  collect(para);
  flat.sort((a, b) => a[0] - b[0]);
  assert.deepEqual(flat, [[0, 12]]);
});

test('strong inner text is wrapped, command markup stays outside', () => {
  const tree = hastOf('A **machine learning** model.');
  const wrapped = spans(tree);
  const inner = wrapped.find(span =>
    span.children.some(child => child.value === 'machine learning'));
  assert.ok(inner, 'expected a wrapped span for the strong inner text');
  assert.equal(inner.properties['data-ss'], '4');
  assert.equal(inner.properties['data-se'], '20');
});

test('entity-decoded text is left unmapped', () => {
  const source = 'Fish &amp; chips.';
  const tree = hastOf(source);
  const wrapped = spans(tree);
  // '&amp;' decodes to '&': no source slice equals the rendered text, so the
  // node must stay unmapped rather than carry a wrong span.
  for (const span of wrapped) {
    const text = span.children.map(child => child.value || '').join('');
    assert.equal(source.slice(Number(span.properties['data-ss']), Number(span.properties['data-se'])), text);
  }
  const mappedText = wrapped.map(span => span.children.map(child => child.value || '').join('')).join('|');
  assert.ok(!mappedText.includes('&') || mappedText.includes('&amp;') === false);
});

test('KaTeX output carries no source spans', async () => {
  const source = 'Energy $E=mc^2$ here.';
  const mdast = unified().use(remarkParse).use(remarkMath).parse(source);
  const rehypeKatex = (await import('rehype-katex')).default;
  const tree = unified().use(remarkRehype).use(rehypeKatex).runSync(mdast);
  unified().use(rehypeSourceOffsets, source).runSync(tree);
  const wrapped = spans(tree);
  for (const span of wrapped) {
    const text = span.children.map(child => child.value || '').join('');
    assert.ok(!/[a-zA-Z]/.test(text) || text.includes('Energy') || text.includes('here'));
  }
  // The math itself must not resolve to a source span.
  const katex = [];
  const visit = node => {
    if (node.type === 'element'
      && (node.properties?.className || []).some(c => String(c).includes('katex'))) katex.push(node);
    (node.children || []).forEach(visit);
  };
  visit({ type: 'root', children: tree.children || [] });
  assert.ok(katex.length > 0);
  const inside = [];
  const collect = node => {
    if (node.type === 'element' && node.properties?.['data-ss'] != null) inside.push(node);
    (node.children || []).forEach(collect);
  };
  katex.forEach(collect);
  assert.deepEqual(inside, []);
});
