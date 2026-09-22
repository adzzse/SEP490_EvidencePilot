import test from 'node:test';
import assert from 'node:assert/strict';
import { targetsProject } from '../src/utils/entityEvents.js';

test('matches PROJECT events by id (id-only envelope)', () => {
  assert.equal(targetsProject({ entity: 'PROJECT', id: 'p1', action: 'DELETION_REVOKED' }, 'p1'), true);
  assert.equal(targetsProject({ entity: 'PROJECT', id: 'p1', action: 'STATUS_CHANGED' }, 'p2'), false);
});

test('matches DOCUMENT/FEEDBACK events by projectId', () => {
  assert.equal(targetsProject({ entity: 'DOCUMENT', id: 'd1', projectId: 'p1' }, 'p1'), true);
  assert.equal(targetsProject({ entity: 'DOCUMENT', id: 'd1', projectId: 'p1' }, 'p2'), false);
});

test('rejects missing event or project', () => {
  assert.equal(targetsProject(null, 'p1'), false);
  assert.equal(targetsProject({ entity: 'PROJECT', id: 'p1' }, null), false);
  assert.equal(targetsProject({ entity: 'PROJECT', id: 'p1' }, undefined), false);
});
