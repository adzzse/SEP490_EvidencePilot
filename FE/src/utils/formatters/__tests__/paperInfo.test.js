import assert from 'node:assert/strict';
import test from 'node:test';

import { mergePaperMetadata, parsePaperInfoSection } from '../paperInfo.js';

const section = contentTex => [{ sectionTitle: 'Paper Info', contentTex }];

test('parses all Paper Info fields', () => {
  const info = parsePaperInfoSection(section(
    '\\textbf{Title:} SPLADE v2\n\n'
    + '\\textbf{Authors:} Thibault Formal; Carlos Lassance\n\n'
    + '\\textbf{Affiliations:} Naver Labs Europe\n\n'
    + '\\textbf{Emails:} t@x.com; c@x.com\n\n'
    + '\\textbf{DOI:} 10.1234/abc\n\n'
    + '\\textbf{Keywords:} sparse, retrieval',
  ));

  assert.equal(info.title, 'SPLADE v2');
  assert.deepEqual(info.authors, ['Thibault Formal', 'Carlos Lassance']);
  assert.deepEqual(info.affiliations, ['Naver Labs Europe']);
  assert.deepEqual(info.emails, ['t@x.com', 'c@x.com']);
  assert.equal(info.doi, '10.1234/abc');
  assert.equal(info.keywords, 'sparse, retrieval');
});

test('returns null without a Paper Info section or without labeled lines', () => {
  assert.equal(parsePaperInfoSection([{ sectionTitle: 'Abstract', contentTex: 'x' }]), null);
  assert.equal(parsePaperInfoSection(section('just some text')), null);
  assert.equal(parsePaperInfoSection(section('\\textbf{Title:}')), null);
  assert.equal(parsePaperInfoSection([]), null);
});

test('matches section title case-insensitively and skips unknown labels', () => {
  const info = parsePaperInfoSection(
    [{ sectionTitle: 'paper info', contentTex: '\\textbf{Title:} T\n\n\\textbf{Foo:} bar' }],
  );
  assert.equal(info.title, 'T');
  assert.deepEqual(info.authors, []);
});

test('merge prefers section values and fills gaps from extraction metadata', () => {
  const api = {
    title: 'API title',
    authors: [{ name: 'A. Uthor', affiliations: ['Lab'] }],
    doi: '10.0/api',
    keywords: 'api kw',
  };
  const merged = mergePaperMetadata(api, {
    title: 'Edited title', authors: [], affiliations: [], emails: [], doi: '', keywords: '',
  });

  assert.equal(merged.title, 'Edited title');
  assert.deepEqual(merged.authors, ['A. Uthor']);
  assert.deepEqual(merged.affiliations, ['Lab']);
  assert.equal(merged.doi, '10.0/api');
  assert.equal(merged.keywords, 'api kw');
});

test('merge falls back fully without a Paper Info section', () => {
  const merged = mergePaperMetadata(null, null);
  assert.deepEqual(merged, { title: '', authors: [], affiliations: [], doi: '', keywords: '' });
});
