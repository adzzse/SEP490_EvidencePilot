import assert from 'node:assert/strict';
import test from 'node:test';

import { getStudentSuggestions, paginateStudents } from '../studentSearch.js';

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

test('paginateStudents slices pages and clamps out-of-range pages', () => {
  const list = Array.from({ length: 20 }, (_, i) => ({ id: `s-${i}` }));
  assert.deepEqual(paginateStudents(list, 0, 8).items.map(s => s.id),
    ['s-0', 's-1', 's-2', 's-3', 's-4', 's-5', 's-6', 's-7']);
  assert.deepEqual(paginateStudents(list, 2, 8).items.map(s => s.id),
    ['s-16', 's-17', 's-18', 's-19']);
  assert.deepEqual(paginateStudents(list, 0, 8).totalPages, 3);
  assert.deepEqual(paginateStudents(list, 0, 8).total, 20);
  // clamps negative and overflowing pages instead of returning empty
  assert.deepEqual(paginateStudents(list, -5, 8).page, 0);
  assert.deepEqual(paginateStudents(list, 99, 8).page, 2);
  assert.deepEqual(paginateStudents(null, 0, 8).items, []);
  assert.deepEqual(paginateStudents([], 0, 8).totalPages, 1);
});
