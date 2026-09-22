import test from 'node:test';
import assert from 'node:assert/strict';
import { getProjectActions } from '../src/utils/projectActions.js';

test('only approved projects expose archive', () => {
  assert.deepEqual(getProjectActions({ status: 'APPROVED', active: true }), [
    'archive',
    'export',
  ]);
});

test('only archived projects expose unarchive', () => {
  assert.deepEqual(getProjectActions({ status: 'ARCHIVED', active: true }), [
    'unarchive',
    'export',
  ]);
});

test('editable workflow states expose edit, re-extract, export, and trash', () => {
  for (const status of ['RETURNED']) {
    assert.deepEqual(getProjectActions({ status, active: true }), [
      'edit',
      'reExtract',
      'export',
      'delete',
    ], status);
  }
});

test('setup-only states do not expose an authoritative export', () => {
  for (const status of ['CREATED', 'ASSIGNED']) {
    assert.deepEqual(getProjectActions({ status, active: true }), [
      'edit',
      'reExtract',
      'delete',
    ], status);
  }
});

test('completion follows the backend transition contract', () => {
  assert.ok(getProjectActions({ status: 'IN_PROGRESS', active: true }).includes('complete'));
  assert.ok(getProjectActions({ status: 'SUBMITTED_FOR_REVIEW', active: true }).includes('complete'));
  assert.ok(!getProjectActions({ status: 'RETURNED', active: true }).includes('complete'));
  assert.ok(!getProjectActions({ status: 'SUBMITTED_FOR_REVIEW', active: true }).includes('delete'));
});

test('trash exposes only restore', () => {
  assert.deepEqual(getProjectActions({ status: 'IN_PROGRESS', active: false }), ['restore']);
});

test('scheduled project exposes only revoke plus its read-only export action', () => {
  assert.deepEqual(getProjectActions({
    active: true,
    status: 'IN_PROGRESS',
    deletionScheduledAt: '2026-10-22T03:00:00',
  }), ['revokeDeletion', 'export']);

  assert.deepEqual(getProjectActions({
    active: true,
    status: 'CREATED',
    deletionScheduledAt: '2026-10-22T03:00:00',
  }), ['revokeDeletion']);

  assert.deepEqual(getProjectActions({
    active: true,
    status: 'PENDING_DELETE',
    deletionScheduledAt: '2026-10-22T03:00:00',
  }), ['revokeDeletion', 'export']);

  assert.deepEqual(getProjectActions({ status: 'PENDING_DELETE', active: true }), ['export']);
});
