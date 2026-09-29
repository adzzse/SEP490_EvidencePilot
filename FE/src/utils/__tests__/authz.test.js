import assert from 'node:assert/strict';
import test from 'node:test';
import { isAccountRevokedError, isProjectMembershipDenied, isSelfAccountChangeEvent, isLinkAllowedForRole } from '../authz.js';

test('classifies only the account-inactive 403 as global revocation', () => {
  assert.equal(isAccountRevokedError({ response: { status: 403, data: { code: 'ACCOUNT_BANNED', message: 'Tài khoản bị vô hiệu' } } }), true);
  assert.equal(isAccountRevokedError({ response: { status: 403, data: { message: 'Account is not active' } } }), false);
  assert.equal(isAccountRevokedError({ response: { status: 401, data: { code: 'ACCOUNT_BANNED' } } }), false);
});

test('classifies project membership denial without treating role denial as removal', () => {
  assert.equal(isProjectMembershipDenied({ response: { status: 403, data: { code: 'PROJECT_MEMBERSHIP_REQUIRED', message: 'Không còn là thành viên' } } }), true);
  assert.equal(isProjectMembershipDenied({ response: { status: 403, data: { code: 'PROJECT_ROLE_REQUIRED', message: 'Project access denied' } } }), false);
  assert.equal(isProjectMembershipDenied({ response: { status: 403, data: { message: 'Project access denied' } } }), false);
});

test('flags only a status change for the signed-in user as a self account event', () => {
  assert.equal(isSelfAccountChangeEvent({ entity: 'USER', id: 'u-1', action: 'STATUS_CHANGED' }, 'u-1'), true);
  assert.equal(isSelfAccountChangeEvent({ entity: 'USER', id: 'u-2', action: 'STATUS_CHANGED' }, 'u-1'), false);
  assert.equal(isSelfAccountChangeEvent({ entity: 'USER', id: null, action: 'STATUS_CHANGED' }, 'u-1'), false);
  assert.equal(isSelfAccountChangeEvent({ entity: 'PROJECT', id: 'u-1', action: 'STATUS_CHANGED' }, 'u-1'), false);
  assert.equal(isSelfAccountChangeEvent({ entity: 'USER', id: 'u-1', action: 'READY' }, 'u-1'), false);
  assert.equal(isSelfAccountChangeEvent(null, 'u-1'), false);
  assert.equal(isSelfAccountChangeEvent({ entity: 'USER', id: 'u-1', action: 'STATUS_CHANGED' }, null), false);
});
test('role gate keeps activity navigation inside role pages', () => {
  assert.equal(isLinkAllowedForRole('/admin/dashboard?tab=users', 'ADMIN'), true);
  assert.equal(isLinkAllowedForRole('/instructor/projects/1', 'INSTRUCTOR'), true);
  assert.equal(isLinkAllowedForRole('/student/projects/1', 'STUDENT'), true);
  assert.equal(isLinkAllowedForRole('/instructor/source-library', 'ADMIN'), false);
  assert.equal(isLinkAllowedForRole('/student/projects/1', 'INSTRUCTOR'), false);
  assert.equal(isLinkAllowedForRole('/admin/dashboard', 'STUDENT'), false);
  assert.equal(isLinkAllowedForRole(null, 'ADMIN'), false);
  assert.equal(isLinkAllowedForRole('/admin/dashboard', null), false);
});