import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockLineNumbers,
  findBlockAt,
  findMathBlocks,
  findTableBlocks,
} from '../editorAssetBlocks.js';

test('finds pipe-line runs of 2+ lines as table blocks', () => {
  const text = ['# T', '', '| a | b |', '|---|---|', '| 1 | 2 |', '', 'para'].join('\n');
  const blocks = findTableBlocks(text);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'table');
  assert.equal(text.slice(blocks[0].from, blocks[0].to).split('\n').length, 3);
});

test('ignores single pipe lines and indented code', () => {
  assert.deepEqual(findTableBlocks('a | b'), []);
  assert.deepEqual(findTableBlocks('| solo |'), []);
});

test('finds $$, \\[..\\] and equation env math blocks', () => {
  const text = 'a\n\n$$x^2$$\n\n\\[y\\]\n\n\\begin{equation}\nz\n\\end{equation}\n';
  const blocks = findMathBlocks(text);
  assert.equal(blocks.length, 3);
  assert.ok(blocks.every(b => b.kind === 'math' && b.to > b.from));
  assert.ok(text.slice(blocks[0].from, blocks[0].to).includes('x^2'));
});

test('finds multiline display math as one block', () => {
  const text = '$$\n\\sum_i w_j\n$$';
  const blocks = findMathBlocks(text);
  assert.equal(blocks.length, 1);
  assert.equal(text.slice(blocks[0].from, blocks[0].to), text);
});

test('findBlockAt resolves table vs math vs none by offset', () => {
  const text = ['| a |', '|---|', '| 1 |', '', '$$x$$', '', 'tail'].join('\n');
  assert.equal(findBlockAt(text, 2)?.kind, 'table');
  assert.equal(findBlockAt(text, text.indexOf('$$x$$') + 1)?.kind, 'math');
  assert.equal(findBlockAt(text, text.indexOf('tail')), null);
  assert.equal(findBlockAt(text, -1), null);
});

test('blockLineNumbers marks 1-based lines per kind', () => {
  const text = ['| a |', '|---|', '', '$$x$$'].join('\n');
  const { tableLines, mathLines } = blockLineNumbers(text);
  assert.deepEqual([...tableLines].sort(), [1, 2]);
  assert.deepEqual([...mathLines].sort(), [4]);
});
