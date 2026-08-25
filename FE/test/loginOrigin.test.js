import assert from 'node:assert/strict';
import test from 'node:test';
import { getPostLoginDestination, rememberLoginOrigin } from '../src/pages/loginOrigin.js';

const baseOrigin = 'https://evidencepilot.test';

test('keeps valid private origins for the signed-in role', () => {
  assert.equal(
    getPostLoginDestination('/instructor/projects/project-1?tab=members', 'INSTRUCTOR', baseOrigin),
    '/instructor/projects/project-1?tab=members',
  );
  assert.equal(
    getPostLoginDestination('/student/projects/project-1', 'STUDENT', baseOrigin),
    '/student/projects/project-1',
  );
  assert.equal(
    getPostLoginDestination('/instructor/collections', 'ADMIN', baseOrigin),
    '/instructor/collections',
  );
});

test('falls back for public, foreign, unknown, or role-mismatched origins', () => {
  assert.equal(getPostLoginDestination('/', 'ADMIN', baseOrigin), '/admin/dashboard');
  assert.equal(getPostLoginDestination('/login', 'ADMIN', baseOrigin), '/admin/dashboard');
  assert.equal(getPostLoginDestination('/about', 'INSTRUCTOR', baseOrigin), '/instructor/dashboard');
  assert.equal(getPostLoginDestination('//other.example/path', 'INSTRUCTOR', baseOrigin), '/instructor/dashboard');
  assert.equal(getPostLoginDestination('/instructor/not-a-route', 'INSTRUCTOR', baseOrigin), '/instructor/dashboard');
  assert.equal(getPostLoginDestination('/admin/dashboard', 'INSTRUCTOR', baseOrigin), '/instructor/dashboard');
  assert.equal(getPostLoginDestination(null, 'STUDENT', baseOrigin), '/student/projects');
});

test('login redirect survives unavailable session storage', () => {
  const writes = [];
  const storage = { setItem: (...args) => writes.push(args) };

  rememberLoginOrigin('/student/projects/project-1', '?tab=sources', storage);
  rememberLoginOrigin('/login', '', storage);

  assert.deepEqual(writes, [[
    'login_origin',
    '/student/projects/project-1?tab=sources',
  ]]);
  assert.doesNotThrow(() => rememberLoginOrigin('/student/projects', '', {
    setItem: () => { throw new Error('storage disabled'); },
  }));
});
