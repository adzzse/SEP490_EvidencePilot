import assert from 'node:assert/strict';
import test from 'node:test';

import { renderLatexToHtml } from './latexHtml.js';

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
