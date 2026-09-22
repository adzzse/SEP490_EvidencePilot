import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const TRUE_DELETE_FILES = [
  'src/components/Instructor/SourceLibraryPanel.jsx',
  'src/pages/Instructor/CollectionDetail.jsx',
  'src/pages/Instructor/CollectionList.jsx',
  'src/pages/Instructor/ProjectManagement.jsx',
  'src/pages/Instructor/ProjectDetail.jsx',
  'src/pages/Student/WorkspaceLayout.jsx',
  'src/pages/Admin/components/UsersTab.jsx',
  'src/pages/Admin/components/SettingsTab.jsx',
];

async function read(relPath) {
  return await readFile(new URL(`../${relPath}`, import.meta.url), 'utf8');
}

function sliceBetween(content, startMarker, endMarker) {
  const startIndex = content.indexOf(startMarker);
  assert.ok(startIndex !== -1, `Could not find start marker: ${startMarker}`);
  const endIndex = content.indexOf(endMarker, startIndex);
  assert.ok(endIndex !== -1, `Could not find end marker: ${endMarker}`);
  return content.slice(startIndex, endIndex);
}

test('true delete UI uses the app-level provider and no route owns UndoToast', async () => {
  const app = await read('src/App.jsx');
  assert.match(app, /<UndoDeleteProvider>/);
  for (const file of TRUE_DELETE_FILES) {
    const source = await read(file);
    assert.match(source, /useUndoDelete/);
    assert.doesNotMatch(source, /<UndoToast/);
  }
});

test('remove and unlink handlers do not enter the undo-delete window', async () => {
  const detail = await read('src/pages/Instructor/ProjectDetail.jsx');
  const removeSource = sliceBetween(detail,
    'const handleRemoveSource =', 'const toggleProjectSourceSelection =');
  assert.match(removeSource, /\/unshare/);
  assert.doesNotMatch(removeSource, /startDelete\(/);
});
