import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatCitation,
  isLatexDialect,
  rehypeAnchors,
  remarkAssetToggle,
  remarkLatexInline,
  resolveAssetUrl,
  resolveImageSrc,
} from '../markdownBlocks.js';

test('detects legacy LaTeX dialect and markdown content', () => {
  assert.equal(isLatexDialect('\\section{Intro}\nText.'), true);
  assert.equal(isLatexDialect('\\begin{tabular}{cc}\na & b\n\\end{tabular}'), true);
  assert.equal(isLatexDialect('## 3.1 SPLADE\n\n| a | b |\n|---|---|\n| 1 | 2 |\n'), false);
  assert.equal(isLatexDialect(''), false);
});

test('resolves asset urls from includegraphics, markdown images and bare names', () => {
  const map = { 'images/table1.jpg': 'https://cdn/table1.jpg' };
  assert.equal(
    resolveAssetUrl('see \\includegraphics[width=5cm]{images/table1.jpg} here', map),
    'https://cdn/table1.jpg',
  );
  assert.equal(
    resolveAssetUrl('see ![](images/table1.jpg) here', map),
    'https://cdn/table1.jpg',
  );
  assert.equal(
    resolveAssetUrl('cropped images/table1.jpg attached', map),
    'https://cdn/table1.jpg',
  );
  assert.equal(resolveAssetUrl('| a | b |\n| 1 | 2 |', map), null);
  assert.equal(resolveAssetUrl('| a | b |', {}), null);
});

test('resolves img src with basename fallback', () => {
  const map = { 'images/fig.jpg': 'https://cdn/fig.jpg' };
  assert.equal(resolveImageSrc('images/fig.jpg', map), 'https://cdn/fig.jpg');
  assert.equal(resolveImageSrc('fig.jpg', map), 'https://cdn/fig.jpg');
  assert.equal(resolveImageSrc('https://x/y.png', map), 'https://x/y.png');
  assert.equal(resolveImageSrc('missing.png', map), null);
});

test('formats citations with numbers, passthrough and masked keys', () => {
  const key = 'epeb7ecd9aeecc43fd8766a2ac965f5dc8';
  assert.equal(formatCitation(key, { [key]: 3 }), '[3]');
  assert.equal(formatCitation(`${key},smith2026`, {}), '[?, smith2026]');
});

test('remarkAssetToggle wraps table/math with offsets and asset url', () => {
  const source = '| a |\n|---|\n| 1 |\n\\includegraphics{images/t.jpg}';
  const table = {
    type: 'table',
    position: { start: { offset: 0 }, end: { offset: 19 } },
    children: [],
  };
  const para = { type: 'paragraph', children: [{ type: 'text', value: 'hi' }] };
  const tree = { type: 'root', children: [table, para] };
  remarkAssetToggle({ source, mediaUrlMap: { 'images/t.jpg': 'https://cdn/t.jpg' } })(tree);

  assert.equal(tree.children.length, 2);
  const wrapper = tree.children[0];
  assert.equal(wrapper.type, 'assetToggle');
  assert.equal(wrapper.data.hName, 'asset-toggle');
  assert.equal(wrapper.data.hProperties['data-variant'], 'table');
  assert.equal(wrapper.data.hProperties['data-src-start'], '0');
  assert.equal(wrapper.data.hProperties['data-src-end'], '19');
  assert.equal(wrapper.children[0], table);
  assert.equal(tree.children[1], para);
});

test('remarkAssetToggle attaches trailing figure paragraph and drops the duplicate', () => {
  const source = '| a |\n|---|\n| 1 |\n\n![](images/t.jpg)';
  const table = {
    type: 'table',
    position: { start: { offset: 0 }, end: { offset: 19 } },
    children: [],
  };
  const figure = {
    type: 'paragraph',
    position: { start: { offset: 21 }, end: { offset: 41 } },
    children: [{ type: 'image', url: 'images/t.jpg', title: null, alt: 't.jpg' }],
  };
  const after = { type: 'paragraph', children: [{ type: 'text', value: 'next' }] };
  const tree = { type: 'root', children: [table, figure, after] };
  remarkAssetToggle({ source, mediaUrlMap: { 'images/t.jpg': 'https://cdn/t.jpg' } })(tree);

  assert.equal(tree.children.length, 2);
  assert.equal(tree.children[0].data.hProperties['data-asset-url'], 'https://cdn/t.jpg');
  assert.equal(tree.children[1], after);
});

test('remarkAssetToggle wraps without url when no asset matches', () => {
  const table = {
    type: 'table',
    position: { start: { offset: 0 }, end: { offset: 10 } },
    children: [],
  };
  const tree = { type: 'root', children: [table] };
  remarkAssetToggle({ source: '| a |\n| 1 |', mediaUrlMap: {} })(tree);

  assert.equal(tree.children[0].type, 'assetToggle');
  assert.equal(tree.children[0].data.hProperties['data-asset-url'], '');
});

test('remarkLatexInline splits includegraphics and cite with exact offsets', () => {  const text = {
    type: 'text',
    value: 'see \\includegraphics{images/f.jpg} in \\cite{smith2026} ok',
    position: { start: { offset: 100 }, end: { offset: 100 + 57 } },
  };
  const tree = { type: 'root', children: [text] };
  remarkLatexInline({ citationNumbers: {} })(tree);

  const kinds = tree.children.map(n => n.type);
  assert.deepEqual(kinds, ['text', 'image', 'text', 'citation', 'text']);
  const image = tree.children[1];
  assert.equal(image.url, 'images/f.jpg');
  assert.equal(image.position.start.offset, 104);
  const citation = tree.children[3];
  assert.equal(citation.children[0].value, '[smith2026]');
  assert.equal(
    tree.children.map(n => n.position?.start?.offset ?? null).filter(v => v !== null).length,
    5,
  );
  // Offsets tile the original range without gaps.
  const joined = tree.children.map(n => n.position.end.offset - n.position.start.offset)
    .reduce((a, b) => a + b, 0);
  assert.equal(joined, 57);
});

test('rehypeAnchors tags top-level elements only and preserves existing', () => {
  const kept = {
    type: 'element',
    tagName: 'div',
    properties: { 'data-src-start': '5', 'data-src-end': '9' },
    position: { start: { offset: 5 }, end: { offset: 9 } },
    children: [],
  };
  const para = {
    type: 'element',
    tagName: 'p',
    properties: {},
    position: { start: { offset: 10 }, end: { offset: 20 } },
    children: [{ type: 'text', value: 'x', position: { start: { offset: 10 }, end: { offset: 11 } } }],
  };
  const tree = { type: 'root', children: [kept, para] };
  rehypeAnchors()(tree);

  assert.equal(kept.properties['data-src-start'], '5');
  assert.equal(para.properties['data-src-start'], '10');
  assert.equal(para.properties['data-src-end'], '20');
});

test('remarkLatexInline converts textbf to strong nodes', () => {
  const text = {
    type: 'text',
    value: 'see \\textbf{3.1 SPLADE} here',
    position: { start: { offset: 0 }, end: { offset: 27 } },
  };
  const tree = { type: 'root', children: [text] };
  remarkLatexInline({})(tree);

  assert.deepEqual(tree.children.map(n => n.type), ['text', 'strong', 'text']);
  assert.equal(tree.children[1].children[0].value, '3.1 SPLADE');
});

test('remarkLatexInline splits sup/sub into typed nodes with exact offsets', () => {
  const value = 'Elizamary Nascimento<sup>1*</sup> and H<sub>2</sub>O';
  const text = {
    type: 'text',
    value,
    position: { start: { offset: 10 }, end: { offset: 10 + value.length } },
  };
  const tree = { type: 'root', children: [text] };
  remarkLatexInline({})(tree);

  assert.deepEqual(
    tree.children.map(n => n.type),
    ['text', 'sup', 'text', 'sub', 'text'],
  );
  assert.equal(tree.children[1].data.hName, 'sup');
  assert.equal(tree.children[1].children[0].value, '1*');
  assert.equal(tree.children[3].data.hName, 'sub');
  assert.equal(tree.children[3].children[0].value, '2');
  const tiled = tree.children
    .map(n => n.position.end.offset - n.position.start.offset)
    .reduce((a, b) => a + b, 0);
  assert.equal(tiled, value.length);
  assert.equal(tree.children[0].position.start.offset, 10);
});
