// ponytail: word-level diff for submitted-vs-baseline compare. No dependency; capped changed window, truncates safely.
const MAX_TOKENS = 2000;

function tokenize(text) {
  return text.split(/(\s+)/).filter(t => t.length > 0);
}

// Full LCS table (Uint16 rows; capped changed inputs keep it to ~8MB transient), then backtrack.
function lcsOps(a, b) {
  const n = a.length;
  const m = b.length;
  const table = [new Uint16Array(m + 1)];
  for (let i = 1; i <= n; i += 1) {
    const row = new Uint16Array(m + 1);
    const prev = table[i - 1];
    for (let j = 1; j <= m; j += 1) {
      row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
    table.push(row);
  }
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push([0, a[i - 1]]);
      i -= 1;
      j -= 1;
    } else if (table[i - 1][j] >= table[i][j - 1]) {
      ops.push([-1, a[i - 1]]);
      i -= 1;
    } else {
      ops.push([1, b[j - 1]]);
      j -= 1;
    }
  }
  while (i > 0) { ops.push([-1, a[i - 1]]); i -= 1; }
  while (j > 0) { ops.push([1, b[j - 1]]); j -= 1; }
  return ops.reverse();
}

function merge(ops) {
  const merged = [];
  for (const [type, text] of ops) {
    const last = merged[merged.length - 1];
    if (last && last[0] === type) last[1] += text;
    else merged.push([type, text]);
  }
  return merged;
}

export function wordDiff(before, after) {
  const a = before || '';
  const b = after || '';
  if (a === b) return { ops: [[0, b]], truncated: false, ranges: [] };
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  let start = 0;
  let aEnd = aTokens.length;
  let bEnd = bTokens.length;
  if (aEnd > MAX_TOKENS || bEnd > MAX_TOKENS) {
    while (start < aEnd && start < bEnd && aTokens[start] === bTokens[start]) start += 1;
    while (aEnd > start && bEnd > start && aTokens[aEnd - 1] === bTokens[bEnd - 1]) { aEnd -= 1; bEnd -= 1; }
  }
  const aChanged = aTokens.slice(start, aEnd);
  const bChanged = bTokens.slice(start, bEnd);
  if (aChanged.length > MAX_TOKENS || bChanged.length > MAX_TOKENS) {
    // ponytail: a whole-document range would mislead — report truncation with
    // no ranges and let the UI say so honestly instead of lighting everything.
    return { ops: [[-1, a], [1, b]], truncated: true, ranges: [] };
  }
  const ops = merge([
    ...(start ? [[0, aTokens.slice(0, start).join('')]] : []),
    ...lcsOps(aChanged, bChanged),
    ...(aEnd < aTokens.length ? [[0, aTokens.slice(aEnd).join('')]] : []),
  ]);
  return { ops, truncated: false, ranges: rangesFromOps(ops) };
}

// ponytail: shared change model — the LaTeX editor, Preview, and the
// right-side diff all consume these ranges (offsets into the AFTER text,
// i.e. the submitted section content). One diff, three views.
export function rangesFromOps(ops) {
  const ranges = [];
  const list = ops || [];
  let afterCursor = 0;
  list.forEach(([type, text], index) => {
    const len = (text || '').length;
    if (type === 1 && len > 0 && text.trim() !== '') {
      ranges.push({
        id: `chg-${ranges.length}`,
        // An insertion glued to a deletion (either side — LCS backtrack
        // order varies) is an in-place modification.
        type: list[index - 1]?.[0] === -1 || list[index + 1]?.[0] === -1 ? 'modified' : 'added',
        sourceStart: afterCursor,
        sourceEnd: afterCursor + len,
      });
    }
    if (type !== -1) afterCursor += len;
  });
  return ranges;
}

// ponytail: Preview blocks carry [start, end) source anchors; a block is
// highlighted when it overlaps any added/modified range.
export function blockOverlapsRanges(start, end, ranges) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return false;
  return (ranges || []).some(r => r.sourceStart < end && r.sourceEnd > start);
}
