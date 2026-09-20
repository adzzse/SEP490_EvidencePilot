import assert from 'node:assert/strict';
import test from 'node:test';
import { isAccountRevokedError, isProjectMembershipDenied } from '../authz.js';

test('classifies only the account-inactive 403 as global revocation', () => {
  assert.equal(isAccountRevokedError({ response: { status: 403, data: { message: 'Account is not active' } } }), true);
  assert.equal(isAccountRevokedError({ response: { status: 403, data: { message: 'Project access denied' } } }), false);
  assert.equal(isAccountRevokedError({ response: { status: 401, data: { message: 'Account is not active' } } }), false);
});

test('classifies project membership denial without treating role denial as removal', () => {
  assert.equal(isProjectMembershipDenied({ response: { status: 403, data: { message: 'Project access denied' } } }), true);
  assert.equal(isProjectMembershipDenied({ response: { status: 403, data: { message: 'Write access denied to project' } } }), true);
  assert.equal(isProjectMembershipDenied({ response: { status: 403, data: { message: 'Requires role: INSTRUCTOR' } } }), false);
});
