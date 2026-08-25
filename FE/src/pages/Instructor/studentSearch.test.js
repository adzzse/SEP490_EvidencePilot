import assert from 'node:assert/strict';
import test from 'node:test';

import { getStudentSuggestions } from './studentSearch.js';

const users = [
  { id: 'student-1', role: 'STUDENT', firstName: 'Đỗ', lastName: 'Hoàng Anh', studentCode: 'SE170001' },
  { id: 'student-2', role: 'STUDENT', firstName: 'Nguyễn', lastName: 'Minh', studentCode: 'SE180002' },
  { id: 'instructor-1', role: 'INSTRUCTOR', firstName: 'Hoàng', lastName: 'Anh', studentCode: null },
];

test('suggests available students by accent-insensitive name or student code', () => {
  assert.deepEqual(
    getStudentSuggestions(users, [], 'do hoang').map(student => student.id),
    ['student-1'],
  );
  assert.deepEqual(
    getStudentSuggestions(users, [], '180002').map(student => student.id),
    ['student-2'],
  );
});

test('does not suggest instructors or existing project members', () => {
  assert.deepEqual(
    getStudentSuggestions(users, [{ userId: 'student-1' }], '').map(student => student.id),
    ['student-2'],
  );
});

test('returns no suggestions when user data is unavailable or malformed', () => {
  assert.deepEqual(getStudentSuggestions(null, null, 'student'), []);
  assert.deepEqual(getStudentSuggestions([null, { role: 'STUDENT' }], undefined, ''), []);
});
