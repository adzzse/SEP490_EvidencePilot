import { ChangeSet } from '@codemirror/state';

export const normalizeSource = value => (value ?? '').replace(/\r\n?/g, '\n');

export async function sourceFingerprint(source) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeSource(source)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function changeSpans(changes) {
  const spans = [];
  changes.iterChanges((from, to, _fromB, _toB, insert) => spans.push({ from, to, insert: insert.toString() }));
  return spans;
}

// Keep edits made during a Save as a tail based on that Save's acknowledged text.
export function createChangeTracker(savedContent, displayedContent = savedContent) {
  let base = normalizeSource(savedContent);
  let content = normalizeSource(displayedContent);
  let sequence = 0;
  let events = base === content ? [] : [{ sequence: ++sequence, changes: ChangeSet.of({ from: 0, to: base.length, insert: content }, base.length) }];
  return {
    record(changes, nextContent) {
      events.push({ sequence: ++sequence, changes });
      content = nextContent;
    },
    snapshot() {
      const composed = events.reduce((result, event) => result.compose(event.changes), ChangeSet.empty(base.length));
      return { baseContent: base, content, changes: changeSpans(composed), sequence };
    },
    acknowledge(snapshot) {
      if (snapshot.baseContent !== base) return false;
      base = snapshot.content;
      events = events.filter(event => event.sequence > snapshot.sequence);
      return true;
    },
    get baseContent() { return base; },
    get content() { return content; },
  };
}

export function recoverAnchor(anchor, text, hash) {
  const original = anchor?.original;
  if (!original) return { ...anchor, current: { ...anchor?.current, from: null, to: null } };
  if (hash === original.fingerprint || text === anchor.originalSource) {
    return { ...anchor, originalSource: text, current: { ...anchor.current, status: 'ATTACHED', from: original.from, to: original.to } };
  }
  let found = null;
  let count = 0;
  if (original.exact) {
    for (let at = text.indexOf(original.exact); at >= 0; at = text.indexOf(original.exact, at + 1)) {
      if (text.slice(Math.max(0, at - original.prefix.length), at) === original.prefix
          && text.startsWith(original.suffix, at + original.exact.length)) {
        found = at;
        count++;
      }
    }
  }
  return { ...anchor, current: { ...anchor.current, status: count === 1 ? 'ATTACHED' : 'DETACHED',
    from: count === 1 ? found : null, to: count === 1 ? found + original.exact.length : null } };
}

export function resolveAnchor(anchor, source, version, hash) {
  if (!anchor) return { original: null, current: { status: 'UNLOCATED', from: null, to: null } };
  if (anchor.original && (anchor.original.representation !== 'latex-source-lf-v1' || anchor.original.offsetUnit !== 'utf16')) {
    return { ...anchor, current: { status: 'UNLOCATED', from: null, to: null } };
  }
  const current = anchor.current;
  if (current?.contentVersion === version && current?.fingerprint === hash) {
    return { ...anchor, originalSource: anchor.original?.fingerprint === hash ? source : undefined };
  }
  return recoverAnchor(anchor, source, hash);
}

function mapPosition(position, association, changes) {
  let delta = 0;
  for (const change of changes) {
    if (position < change.from) break;
    if (position <= change.to) {
      if (change.from === change.to) return change.from + delta + (association > 0 ? change.insert.length : 0);
      if (position === change.from) return change.from + delta;
      if (position === change.to) return change.from + delta + change.insert.length;
      return change.from + delta + (association > 0 ? change.insert.length : 0);
    }
    delta += change.insert.length - (change.to - change.from);
  }
  return position + delta;
}

export function remapAnchor(anchor, after, changes) {
  const current = anchor.current;
  if (!anchor.original) return anchor;
  if (current.from == null || current.to == null || changes.some(change =>
    change.from <= current.from && change.to >= current.to && (change.from < current.from || change.to > current.to))) {
    return recoverAnchor(anchor, after);
  }
  const from = mapPosition(current.from, 1, changes);
  const to = mapPosition(current.to, -1, changes);
  return { ...anchor, current: { ...current,
    status: from >= to ? 'DETACHED' : after.slice(from, to) === anchor.original.exact ? 'ATTACHED' : 'MODIFIED',
    from: from >= to ? null : from, to: from >= to ? null : to } };
}

// Human line span for a canonical source range (1-based, over normalized
// text so offsets line up with stored anchors). Null when there is no range.
export function selectionLines(text, from, to) {
  const source = normalizeSource(text);
  if (!Number.isInteger(from) || !Number.isInteger(to) || source.length === 0) return null;
  const start = Math.max(0, Math.min(from, source.length));
  const end = Math.max(0, Math.min(to, source.length));
  if (end <= start) return null;
  const lineAt = offset => source.slice(0, offset).split('\n').length;
  return { first: lineAt(start), last: lineAt(Math.max(start, end - 1)) };
}
