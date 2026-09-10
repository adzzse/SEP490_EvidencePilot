// Line-based detection of markdown table and math blocks inside editor text.
// Pure functions — shared by CodeMirror decorations and the asset-peek UI.

const PIPE_LINE = /^\s*\|/;
const MATH_FENCES = [
  { open: '$$', close: '$$' },
  { open: '\\[', close: '\\]' },
];
const MATH_ENV = /\\begin\{(equation\*?|align\*?|aligned\*?|gather\*?|math\*?)\}/;
const MATH_ENV_CLOSE = /\\end\{(equation\*?|align\*?|aligned\*?|gather\*?|math\*?)\}/;

function lineOffsets(text) {
  const lines = String(text || '').split('\n');
  const offsets = new Array(lines.length);
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    offsets[i] = pos;
    pos += lines[i].length + 1; // '\n'
  }
  return { lines, offsets };
}

// All table blocks as {from, to} char ranges: runs of >=2 pipe-lines.
export function findTableBlocks(text) {
  const { lines, offsets } = lineOffsets(text);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    if (!PIPE_LINE.test(lines[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && PIPE_LINE.test(lines[j])) j++;
    if (j - i >= 2) {
      blocks.push({ kind: 'table', from: offsets[i], to: offsets[j - 1] + lines[j - 1].length });
    }
    i = j;
  }
  return blocks;
}

// All math blocks as {from, to} ranges: $$..$$, \[..\], equation-like envs.
export function findMathBlocks(text) {
  const src = String(text || '');
  const blocks = [];
  const push = (from, to) => {
    if (to > from) blocks.push({ kind: 'math', from, to });
  };
  for (const { open, close } of MATH_FENCES) {
    let from = src.indexOf(open);
    while (from >= 0) {
      // Skip empty/inline-adjacent $$$$ runs: require a real closer ahead.
      const to = src.indexOf(close, from + open.length);
      if (to < 0) break;
      // Single-line $$x$$ still counts — cursor inside needs the peek too.
      push(from, to + close.length);
      from = src.indexOf(open, to + close.length);
    }
  }
  let envFrom = -1;
  const combined = new RegExp(`${MATH_ENV.source}|${MATH_ENV_CLOSE.source}`, 'g');
  for (const m of src.matchAll(combined)) {
    if (m[1] !== undefined && envFrom < 0) envFrom = m.index;
    else if (m[2] !== undefined && envFrom >= 0) {
      push(envFrom, m.index + m[0].length);
      envFrom = -1;
    }
  }
  return blocks.sort((a, b) => a.from - b.from);
}

// Block kind ('table' | 'math' | null) containing char offset pos.
export function findBlockAt(text, pos) {
  if (pos == null || pos < 0) return null;
  for (const block of findTableBlocks(text)) {
    if (pos >= block.from && pos <= block.to) return block;
  }
  for (const block of findMathBlocks(text)) {
    if (pos >= block.from && pos <= block.to) return block;
  }
  return null;
}

// 1-based line numbers covered by table/math blocks (for line decorations).
export function blockLineNumbers(text) {
  const { lines, offsets } = lineOffsets(text);
  const tableLines = new Set();
  const mathLines = new Set();
  const markLines = (from, to, set) => {
    for (let i = 0; i < lines.length; i++) {
      const start = offsets[i];
      const end = start + lines[i].length;
      if (start <= to && end >= from) set.add(i + 1);
    }
  };
  for (const b of findTableBlocks(text)) markLines(b.from, b.to, tableLines);
  for (const b of findMathBlocks(text)) markLines(b.from, b.to, mathLines);
  return { tableLines, mathLines };
}
