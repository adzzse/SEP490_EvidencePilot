import test from 'node:test';
import assert from 'node:assert/strict';
import { ChangeSet, Text } from '@codemirror/state';
import { changeSpans, createChangeTracker, normalizeSource, placeFeedbackCards, remapAnchor, resolveAnchor, sourceFingerprint } from './feedbackAnchors.js';

async function target(source, from, to) {
  const hash = await sourceFingerprint(source);
  return { original: { representation: 'latex-source-lf-v1', offsetUnit: 'utf16', contentVersion: 1,
    fingerprint: hash, from, to, exact: source.slice(from, to), prefix: source.slice(Math.max(0, from - 64), from), suffix: source.slice(to, to + 64) },
  current: { status: 'ATTACHED', contentVersion: 1, fingerprint: hash, from, to } };
}

test('change spans preserve simultaneous edits and the tail typed during Save', () => {
  const base = 'one target tail';
  const tracker = createChangeTracker(base);
  const first = ChangeSet.of([{ from: 0, insert: '😀' }, { from: 5, to: 8, insert: 'XYZ' }], base.length);
  const afterFirst = first.apply(Text.of([base])).toString();
  tracker.record(first, afterFirst);
  const snapshot = tracker.snapshot();
  assert.deepEqual(snapshot.changes, [{ from: 0, to: 0, insert: '😀' }, { from: 5, to: 8, insert: 'XYZ' }]);
  const later = ChangeSet.of({ from: afterFirst.length, insert: '\nMore' }, afterFirst.length);
  tracker.record(later, later.apply(Text.of([afterFirst])).toString());
  assert.equal(tracker.acknowledge(snapshot), true);
  const tail = tracker.snapshot();
  assert.equal(tail.baseContent, afterFirst);
  assert.deepEqual(tail.changes, [{ from: afterFirst.length, to: afterFirst.length, insert: '\nMore' }]);
  assert.equal(tracker.acknowledge(snapshot), false);
});

test('offsets and fingerprints normalize CRLF without normalizing Vietnamese or emoji', async () => {
  assert.equal(normalizeSource('Tiếng Việt 😀\r\nDòng 2'), 'Tiếng Việt 😀\nDòng 2');
  assert.equal(await sourceFingerprint('A\r\n😀B'), await sourceFingerprint('A\n😀B'));
  const anchor = await target('Tiếng Việt 😀\nDòng 2', 11, 13);
  assert.equal(anchor.original.exact, '😀');
  assert.equal(resolveAnchor(anchor, 'Tiếng Việt 😀\nDòng 2', 1, anchor.current.fingerprint).current.from, 11);
});

test('mapped interior edits survive a new saved version and unsaved tail', async () => {
  const base = 'one target tail';
  const anchor = await target(base, 4, 10);
  const changes = ChangeSet.of([{ from: 0, insert: '😀' }, { from: 5, to: 8, insert: 'XYZ' }], base.length);
  const after = changes.apply(Text.of([base])).toString();
  const mapped = remapAnchor(anchor, after, changeSpans(changes));
  assert.deepEqual([mapped.current.from, mapped.current.to, mapped.current.status], [6, 12, 'MODIFIED']);
  const saved = { ...mapped, current: { ...mapped.current, contentVersion: 2, fingerprint: await sourceFingerprint(after) } };
  const restored = resolveAnchor(saved, after, 2, await sourceFingerprint(after));
  assert.equal(restored.current.status, 'MODIFIED');
  assert.equal(remapAnchor(restored, `prefix ${after}`, [{ from: 0, to: 0, insert: 'prefix ' }]).current.from, 13);
  assert.equal(restored.original.exact, 'target');
});

test('complete deletion detaches and undo restores only the correct original occurrence', async () => {
  const source = 'A target B target C';
  const anchor = resolveAnchor(await target(source, 2, 8), source, 1, await sourceFingerprint(source));
  const deleted = remapAnchor(anchor, 'A  B target C', [{ from: 2, to: 8, insert: '' }]);
  assert.equal(deleted.current.status, 'DETACHED');
  assert.equal(deleted.current.from, null);
  const undone = remapAnchor(deleted, source, [{ from: 2, to: 2, insert: 'target' }]);
  assert.equal(undone.current.from, 2);
  assert.equal(undone.current.status, 'ATTACHED');
  const ambiguous = await target('target', 0, 6);
  assert.equal(resolveAnchor(ambiguous, 'target target', 2, await sourceFingerprint('target target')).current.status, 'DETACHED');
});

test('restored local drafts use a conservative replacement and cards never overlap', async () => {
  const tracker = createChangeTracker('A target B', 'A new target B');
  const anchor = await target('A target B', 2, 8);
  assert.equal(remapAnchor(anchor, tracker.snapshot().content, tracker.snapshot().changes).current.status, 'DETACHED');
  const cards = Array.from({ length: 5 }, (_, id) => ({ id, top: 70, height: 80 + id * 8 }));
  const placed = placeFeedbackCards(cards, 4).sort((a, b) => a.y - b.y);
  assert.equal(placed.find(card => card.id === 4).y, 70);
  placed.slice(1).forEach((card, i) => assert.ok(card.y >= placed[i].y + placed[i].height + 10));
});
