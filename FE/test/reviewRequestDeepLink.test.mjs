import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Review Requests deep links use bounded lookups', () => {
  const source = readFileSync(new URL(
    '../src/pages/Instructor/ReviewRequests.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /api\.get\(['"]\/api\/feedback-requests['"]\)/);
  assert.match(source, /\/api\/feedback-requests\/\$\{encodeURIComponent\(reviewLink\)\}/);
  assert.match(source, /feedback-requests\/queue\?page=0&size=1&projectId=/);
});
