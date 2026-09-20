import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDate, formatDateTime, formatDateTimeSeconds } from '../date.js';

test('formatDate formats valid dates into DD-MM-YYYY for vi', () => {
  const dateStr = '2026-09-02T15:30:00Z';
  const result = formatDate(dateStr, 'vi');
  assert.match(result, /\d{2}-\d{2}-\d{4}/);
});

test('formatDate returns fallback for invalid or missing dates', () => {
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate(undefined), '—');
  assert.equal(formatDate('invalid-date'), '—');
});

test('formatDateTime returns hours and minutes along with date', () => {
  const dateStr = '2026-09-02T15:30:00Z';
  const result = formatDateTime(dateStr, 'vi');
  assert.match(result, /\d{2}:\d{2}/);
  assert.match(result, /\d{2}-\d{2}-\d{4}/);
});

test('formatDateTime treats timezone-less API datetimes as UTC', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'Asia/Bangkok';
  try {
    assert.match(formatDateTime('2026-09-02T15:30:00', 'vi'), /22:30/);
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('formatDateTime stays in Vietnam time regardless of machine timezone', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    assert.equal(formatDateTime('2026-09-02T15:30:00Z', 'en'), '22:30 02-09-2026');
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('formatDateTimeSeconds includes seconds for detailed history', () => {
  assert.equal(formatDateTimeSeconds('2026-09-02T15:30:04Z'), '22:30:04 02-09-2026');
});
