import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// ponytail: grandfathered native <select> files. New filters use the shared
// Dropdown (5-row cap, hidden scrollbar); form fields with native validation
// may keep <select> but must be added here deliberately in review. Ceiling:
// the list rots as new selects land. Revisit: each migration removes its
// row (incremental — one batch at a time).
const GRANDFATHERED = new Set([
  'src/components/Instructor/SourceLibraryPanel.jsx',
  'src/pages/Admin/components/AuditLogsTab.jsx',
  'src/pages/Profile.jsx',
  'src/pages/Admin/components/NotificationsTab.jsx',
  'src/pages/Admin/components/UsersTab.jsx',
  'src/pages/Admin/components/PromptConfigTab.jsx',
  'src/components/features/UniversalDocumentIngestionModal.jsx',
  'src/pages/Instructor/CollectionList.jsx',
  'src/pages/Instructor/ReviewRequests.jsx',
  'src/components/Instructor/sections/SectionRow.jsx',
  'src/pages/Instructor/ProjectManagement.jsx',
  'src/pages/Instructor/CollectionDetail.jsx',
  'src/pages/Instructor/ProjectDetail.jsx',
  'src/components/Student/FeedbackPanel.jsx',
]);

const root = join(fileURLToPath(import.meta.url), '..', '..');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.jsx?$/.test(entry)) out.push(full);
  }
  return out;
}

test('no new native <select> outside the grandfather list', () => {
  const offenders = [];
  for (const file of walk(join(root, 'src'))) {
    const text = readFileSync(file, 'utf8');
    // Match JSX tags at line start (after whitespace); ignores `<select>`
    // mentions inside // or {/* */} comments.
    if (/(^|\n)\s*<select[\s>]/.test(text)) {
      const rel = relative(root, file).replaceAll('\\', '/');
      if (!GRANDFATHERED.has(rel)) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], `new native <select> in: ${offenders.join(', ')}`);
});

test('shared Dropdown keeps the 5-row/scroll/keyboard contract', () => {
  const src = readFileSync(join(root, 'src/components/ui/Dropdown.jsx'), 'utf8');
  assert.match(src, /maxVisibleRows = 5/);
  assert.match(src, /overflow-y-auto/);
  assert.match(src, /scrollbar-width:none/);
  assert.match(src, /scrollIntoView/);
  assert.match(src, /role="listbox"/);
  assert.match(src, /Escape/);
});
