import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileFiles, listUploadDocuments } from '../src/utils/uploadRecovery.js';

test('receipts consume each new hash once, preserve failed files and block a pending transfer', () => {
  const entries = [
    { file: { name: 'a.pdf', size: 10 }, hash: 'a' },
    { file: { name: 'b.pdf', size: 20 }, hash: 'b', failure: { retryable: false } },
  ];
  const record = { entries, baselineIds: ['old'] };
  const result = reconcileFiles(record, [
    { id: 'old', fileHashSha256: 'b' },
    { id: 'accepted', fileHashSha256: 'a' },
    { id: 'receiving', originalFilename: 'b.pdf', fileSizeBytes: 20, processingStatus: 'PENDING_UPLOAD' },
  ]);
  assert.deepEqual(result.entries, [entries[1]]);
  assert.equal(result.accepted[0].id, 'accepted');
  assert.equal(result.pending, true);
  const duplicates = reconcileFiles({ entries: [entries[0], entries[0]], baselineIds: [] }, [{ id: 'one', fileHashSha256: 'a' }]);
  assert.equal(duplicates.entries.length, 1);
});

test('receipt discovery includes every page', async () => {
  const calls = [];
  const api = { get: async (_, config) => {
    calls.push(config.params.page);
    return { data: { content: [{ id: config.params.page }], last: config.params.page === 1 } };
  } };
  assert.deepEqual(await listUploadDocuments(api, '/documents'), [{ id: 0 }, { id: 1 }]);
  assert.deepEqual(calls, [0, 1]);
});
