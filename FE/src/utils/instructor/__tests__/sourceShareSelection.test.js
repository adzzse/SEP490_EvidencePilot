import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSourceShareChanges,
  getBlockedSources,
  isSourceShareable,
  isSourceSharedWithProject,
} from '../sourceShareSelection.js';

test('changes only sources from the selected collection for the target project', () => {
  const sources = [
    { id: 'keep', projectIds: ['project-a'] },
    { id: 'remove', projectIds: ['project-a'] },
    { id: 'add', projectIds: [] },
    { id: 'shared-elsewhere', projectIds: ['project-b'] },
  ];

  assert.deepEqual(
    getSourceShareChanges(sources, 'project-a', ['keep', 'add', 'shared-elsewhere', 'outside']),
    { toShare: ['add', 'shared-elsewhere'], toUnshare: ['remove'] },
  );
});

test('isSourceShareable accepts only READY or COMPLETED', () => {
  assert.equal(isSourceShareable({ processingStatus: 'READY' }), true);
  assert.equal(isSourceShareable({ processingStatus: 'COMPLETED' }), true);
  assert.equal(isSourceShareable({ processingStatus: 'PROCESSING' }), false);
  assert.equal(isSourceShareable({ processingStatus: 'METADATA_FETCHED' }), false);
  assert.equal(isSourceShareable({ processingStatus: undefined }), false);
});

test('a legacy linked source remains selectable only to unshare', () => {
  const source = { id: 'legacy', projectIds: ['project-a'], processingStatus: 'PROCESSING' };

  assert.equal(isSourceSharedWithProject(source, 'project-a'), true);
  assert.equal(isSourceShareable(source), false);
  assert.equal(isSourceSharedWithProject(source, 'project-b'), false);
});

test('getBlockedSources lists selected non-shareable sources with title and status', () => {
  const sources = [
    { id: 'ready', title: 'Ready paper', processingStatus: 'READY' },
    { id: 'busy', title: 'Still processing', processingStatus: 'PROCESSING' },
    { id: 'no-status', title: null, originalFilename: 'legacy.pdf', processingStatus: null },
  ];

  assert.deepEqual(
    getBlockedSources(sources, ['ready', 'busy', 'no-status', 'missing']),
    [
      { id: 'busy', title: 'Still processing', status: 'PROCESSING' },
      { id: 'no-status', title: 'legacy.pdf', status: 'UNKNOWN' },
    ],
  );
});

test('missing or malformed collection data produces no share operations', () => {
  assert.equal(isSourceSharedWithProject({ projectIds: 'project-a' }, 'project-a'), false);
  assert.deepEqual(getBlockedSources([null, { projectIds: 'bad' }], null), []);
  assert.deepEqual(getSourceShareChanges([null, { projectIds: 'bad' }], 'project-a', null), {
    toShare: [],
    toUnshare: [],
  });
});
