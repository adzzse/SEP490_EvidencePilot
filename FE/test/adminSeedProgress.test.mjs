import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/pages/Admin/components/DataManagementTab.jsx', import.meta.url), 'utf8');

test('admin seed progress renders live logs and distinguishes errors', () => {
  assert.match(source, /role="log"/);
  assert.match(source, /\{job && \(\s*<div className="space-y-1">[\s\S]*?role="log"/);
  assert.match(source, /job\.logs\?\.map/);
  assert.match(source, /entry\.level === 'ERROR'/);
});

test('admin seed polling is serialized and ignores stale responses', () => {
  assert.doesNotMatch(source, /setInterval/);
  assert.match(source, /const generation = \+\+pollGenerationRef\.current/);
  assert.match(source, /if \(generation !== pollGenerationRef\.current\) return/);
  assert.match(source, /pollRef\.current = setTimeout\(poll, 1000\)/);
});
