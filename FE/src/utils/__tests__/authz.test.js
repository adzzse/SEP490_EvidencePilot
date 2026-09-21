import assert from 'node:assert/strict';
import test from 'node:test';
import { isAccountRevokedError, isProjectMembershipDenied } from '../authz.js';

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
