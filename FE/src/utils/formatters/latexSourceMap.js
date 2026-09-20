// rationale: offset-preserving scanner for LaTeX inline constructs — returns
// exact canonical spans, never rendered text. The legacy renderer
// (renderLatexToHtml) emits plain HTML with no positions, so B5 maps a
// Preview DOM range by matching its text against these spans; escaped
// constructs (\$, \\textbf) are skipped, never mapped.

// Balanced one level: \textbf{a {b} c} matches whole; deeper nesting refuses
// (falls back to the honest banner instead of a wrong span).
const braced = name => new RegExp(`(?<!\\\\)\\\\${name}\\{(?:[^{}]|\\{[^{}]*\\})*\\}`, 'gd');
const PATTERNS = [
  { type: 'cite', re: /(?<!\\)\\cite\{[^}]*\}/gd },
  { type: 'ref', re: /(?<!\\)\\ref\{[^}]*\}/gd },
  { type: 'textbf', re: braced('textbf') },
  { type: 'textit', re: braced('textit') },
  { type: 'emph', re: braced('emph') },
  { type: 'bold', re: /\*\*(.+?)\*\*/gd },
  // Inline $…$ only: (?<!\\) guards an escaped opener, (?<!\$)/​(?!\$) on
  // both sides skips display $$…$$, and \\. lets an escaped \$ live inside
  // without closing early.
  { type: 'math', re: /(?<!\\)(?<!\$)\$(?!\$)(?:[^$\\]|\\.)+?\$(?!\$)/gd },
];

const TEXT_TYPES = new Set(['textbf', 'textit', 'emph', 'bold']);
const CITE_TYPES = new Set(['cite']);

// rationale: pure structural core — the DOM adapter feeds one flag object per
// rendered inline element in document order; no text, no nodes, no search.
// kind 'text' pairs with textbf/textit/emph/bold spans, 'cite' with cite
// spans. Duplicate constructs map by POSITION (nth flag ↔ nth span) —
// recurring words can never collapse to their first occurrence.
export function expandLatexRange(spans, elements) {
  const markup = spans.filter(s => TEXT_TYPES.has(s.type));
  const cites = spans.filter(s => CITE_TYPES.has(s.type));
  const textEls = elements.filter(e => e.kind === 'text');
  const citeEls = elements.filter(e => e.kind === 'cite');
  // Any renderer surprise (nested-brace breakage, \cite[opt], escaped
  // constructs the renderer still expands) refuses instead of mis-anchoring.
  if (textEls.length !== markup.length || citeEls.length !== cites.length) {
    return { unmappable: 'count-mismatch' };
  }
  const pairs = [
    ...markup.map((span, i) => ({ span, el: textEls[i] })),
    ...cites.map((span, i) => ({ span, el: citeEls[i] })),
  ];
  const hit = pairs.find(({ el }) => el.containsAnchor && el.containsFocus);
  if (!hit) return { unmappable: 'no-construct' };
  return { from: hit.span.from, to: hit.span.to };
}

// Spans of one legacy block (absolute source offsets), split by element kind.
export function spansInBlock(source, start, end) {
  return scanLatexInline(source).filter(s => s.from >= start && s.to <= end);
}

const closest = (node, selector) =>
  (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(selector) || null;

function endNode(selection, which) {
  try {
    return which === 'anchor' ? selection.anchorNode : selection.focusNode;
  } catch {
    return null;
  }
}

// Legacy LaTeX HTML has no text-node offsets — map structurally: the block's
// rendered inline elements zip 1:1 with the block's scanned spans (both in
// order). Anything else (prose, tables, display math, media) refuses.
export function resolveLatexRange(container, source) {
  const selection = typeof window === 'undefined' ? null : window.getSelection();
  if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  if (!selection.toString().trim()) return null;
  const anchorNode = endNode(selection, 'anchor');
  const focusNode = endNode(selection, 'focus');
  if (closest(anchorNode, '.katex') || closest(focusNode, '.katex')) return { unmappable: 'katex-output' };
  if (closest(anchorNode, 'table') || closest(focusNode, 'table')) return { unmappable: 'table-content' };
  if (closest(anchorNode, 'img') || closest(focusNode, 'img')) return { unmappable: 'media-content' };
  const block = closest(anchorNode, '[data-src-start]');
  if (!block || !block.contains(focusNode) || block.hasAttribute('data-display')) {
    return { unmappable: block?.hasAttribute?.('data-display') ? 'display-math' : 'cross-block' };
  }
  const start = Number(block.dataset.srcStart);
  const end = Number(block.dataset.srcEnd);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return { unmappable: 'cross-block' };
  const spans = spansInBlock(source, start, end);
  if (!spans.some(s => TEXT_TYPES.has(s.type) || CITE_TYPES.has(s.type))) {
    return { unmappable: 'no-construct' };
  }
  const flags = [
    ...[...block.querySelectorAll('strong, em')].map(el => ({
      kind: 'text', containsAnchor: el.contains(anchorNode), containsFocus: el.contains(focusNode),
    })),
    ...[...block.querySelectorAll('span.text-indigo-600')].map(el => ({
      kind: 'cite', containsAnchor: el.contains(anchorNode), containsFocus: el.contains(focusNode),
    })),
  ];
  const mapped = expandLatexRange(spans, flags);
  if (mapped.unmappable) return mapped;
  return { from: mapped.from, to: mapped.to };
}
export function scanLatexInline(source) {
  const text = String(source ?? '');
  const found = [];
  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      found.push({ type, from: match.indices[0][0], to: match.indices[0][1] });
    }
  }
  // First span wins on overlap (sorted by start, longest first) — a bold
  // wrapper beats the cite inside it, never double-maps one range.
  found.sort((a, b) => a.from - b.from || b.to - a.to);
  const spans = [];
  for (const span of found) {
    if (spans.length > 0 && span.from < spans[spans.length - 1].to) continue;
    spans.push(span);
  }
  return spans;
}
