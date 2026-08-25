import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getSourceDownloadUrl } from '../src/pages/Student/sourceDownload.js';

test('source preview uses the authenticated download route and releases its blob URL', async () => {
  const contextPanel = await readFile(new URL('../src/pages/Student/ContextPanel.jsx', import.meta.url), 'utf8');
  const fileViewer = await readFile(new URL('../src/components/FileViewerModal.jsx', import.meta.url), 'utf8');

  assert.match(contextPanel, /fileUrl: `\/api\/documents\/\$\{src\.id\}\/download`/);
  assert.match(fileViewer, /api\.get\(fileUrl, \{ responseType: 'blob' \}\)/);
  assert.match(fileViewer, /URL\.createObjectURL\(response\.data\)/);
  assert.match(fileViewer, /URL\.revokeObjectURL\(objectUrl\)/);
});

test('instructor source library previews stored PDFs through the authenticated viewer', async () => {
  const sourceLibrary = await readFile(new URL('../src/pages/Instructor/SourceLibraryPanel.jsx', import.meta.url), 'utf8');

  assert.match(sourceLibrary, /import FileViewerModal from '\.\.\/\.\.\/components\/FileViewerModal'/);
  assert.match(sourceLibrary, /import useUndoDelete, \{ UndoToast \} from '\.\.\/\.\.\/components\/UndoDelete\.jsx'/);
  assert.match(sourceLibrary, /Number\(source\.fileSizeBytes\) > 0/);
  assert.match(sourceLibrary, /fileUrl: `\/api\/documents\/\$\{source\.id\}\/download`/);
  assert.match(sourceLibrary, /<FileViewerModal/);
});

test('metadata-only source exposes the failed upstream download URL', async () => {
  const processingError = 'PDF download not completed: Download failed: HTTP 403 for https://downloads.hindawi.com/paper.pdf. Metadata saved.';
  const contextPanel = await readFile(new URL('../src/pages/Student/ContextPanel.jsx', import.meta.url), 'utf8');

  assert.equal(getSourceDownloadUrl(processingError), 'https://downloads.hindawi.com/paper.pdf');
  assert.equal(getSourceDownloadUrl('No open-access PDF available for this DOI'), null);
  assert.match(contextPanel, /metadataFetchedDescription/);
  assert.match(contextPanel, /sourceDownloadFailureReason/);
  assert.match(contextPanel, /href=\{sourceDownloadUrl\}/);
});

test('metadata failure URL parsing rejects malformed input and strips sentence punctuation', () => {
  assert.equal(getSourceDownloadUrl(null), null);
  assert.equal(getSourceDownloadUrl('Download failed for https://.'), null);
  assert.equal(
    getSourceDownloadUrl('Download failed for https://example.com/paper.pdf). Metadata saved.'),
    'https://example.com/paper.pdf',
  );
});
