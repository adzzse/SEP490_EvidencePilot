import assert from 'node:assert/strict';
import test from 'node:test';

import { renderLatexToHtml, splitLatexBlocks } from './latexHtml.js';

const key = 'epeb7ecd9aeecc43fd8766a2ac965f5dc8';

test('renders generated citation numbers without exposing the internal key', () => {
  const html = renderLatexToHtml(`Supported claim \\cite{${key}}.`, {}, { [key]: 1 });

  assert.match(html, /\[1\]/);
  assert.doesNotMatch(html, new RegExp(key));
});

test('hides unresolved generated keys while preserving manual citation keys', () => {
  const html = renderLatexToHtml(`Claims \\cite{${key},smith2026}.`, {}, {});

  assert.match(html, /\[\?, smith2026\]/);
  assert.doesNotMatch(html, new RegExp(key));
});

test('renders subsubsection headings', () => {
  const html = renderLatexToHtml('\\subsubsection{Details}');

  assert.match(html, /<h4[^>]*>Details<\/h4>/);
});

function blockStarts(html) {
  return [...html.matchAll(/data-src-start="(\d+)"/g)].map(m => Number(m[1]));
}

test('blocks carry exact source offsets that round-trip to their content', () => {
  const latex = '\\section{Intro}\n\nFirst paragraph here.\n\nSecond one.\n';
  const html = renderLatexToHtml(latex);
  const starts = blockStarts(html);

  assert.equal(starts.length, 3);
  for (const s of starts) {
    const seg = latex.slice(s, latex.indexOf('\n', s));
    const roundTripped =
      latex.slice(s, latex.indexOf('\n', s)).trim().length > 0;
    assert.ok(roundTripped);
    // Each offset must point exactly at a non-whitespace source character.
    assert.ok(!/^\s/.test(latex.slice(s, s + 1)));
    void seg;
  }
  assert.match(latex.slice(starts[0], starts[0] + 8), /\\section/);
  assert.ok(latex.slice(starts[1]).startsWith('First'));
  assert.ok(latex.slice(starts[2]).startsWith('Second'));
});

test('preamble produces no anchor blocks', () => {
  const latex = '\\documentclass{article}\n\\usepackage{xcolor}\n\\begin{document}\n\nHello world.\n\\end{document}\n';
  const html = renderLatexToHtml(latex);

  assert.equal(blockStarts(html).length, 1);
  assert.ok(latex.slice(blockStarts(html)[0]).startsWith('Hello'));
});

test('headings, tables and display math each become individually anchored blocks', () => {
  const latex = [
    '\\section{Results}',
    '',
    'We measured things.',
    '',
    '\\begin{table}[h]\\begin{tabular}{|c|c|}A & B\\\\ C & D\\end{tabular}\\end{table}',
    '',
    '\\[',
    'E = mc^2',
    '\\]',
  ].join('\n');
  const html = renderLatexToHtml(latex);

  assert.equal(blockStarts(html).length, 4);
  assert.match(html, /<h2[^>]*data-src-start="0"/);
  assert.match(html, /<div[^>]*data-src-start="\d+"[^>]*><table/);
  assert.match(html, /katex/);

  const blocks = splitLatexBlocks(latex);
  assert.deepEqual(blocks.map(b => b.type), ['heading', 'paragraph', 'table', 'display-math']);
});

test('label-only lines emit no anchor', () => {
  const latex = '\\label{sec:x}\n\nVisible text.';
  const html = renderLatexToHtml(latex);

  assert.equal(blockStarts(html).length, 1);
  assert.match(html, /Visible text\./);
});
