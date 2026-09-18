// ponytail: Preview DOM selection → canonical LF source offsets. Every mapped
// text run carries data-ss/data-se (emitted by the renderers); generated
// output (KaTeX, tables, pills) carries none and refuses honestly. This module
// is dependency-free so Playwright can import it straight from the dev server.
// Never text-search: duplicates disambiguate by DOM position, not indexOf.

function offsetInAncestor(node, ancestor) {
  let offset = 0;
  const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT);
  let current = walker.firstChild();
  while (current && current !== node) {
    offset += (current.textContent || '').length;
    current = walker.nextNode();
  }
  return current === node ? offset : -1;
}

export function assembleSourceRange(segments) {
  const list = segments || [];
  if (!list.length) return { unmappable: 'empty-selection' };
  let from = null;
  let to = null;
  for (const seg of list) {
    const len = seg.length;
    if (!Number.isInteger(seg.ss) || !Number.isInteger(seg.se)
      || !Number.isInteger(seg.from) || !Number.isInteger(seg.to)
      || seg.from < 0 || seg.to > len || seg.from >= seg.to) {
      return { unmappable: 'empty-selection' };
    }
    let segFrom;
    let segTo;
    if (seg.unit) {
      if (seg.from !== 0 || seg.to !== len) return { unmappable: 'partial-unit-selection' };
      segFrom = seg.ss;
      segTo = seg.se;
    } else {
      if (seg.se - seg.ss !== len) return { unmappable: 'span-mismatch' };
      segFrom = seg.ss + seg.from;
      segTo = seg.ss + seg.to;
    }
    if (from === null) {
      from = segFrom;
      to = segTo;
      continue;
    }
    if (segFrom !== to) return { unmappable: 'discontinuous-source' };
    to = segTo;
  }
  if (from === null) return { unmappable: 'empty-selection' };
  return { from, to };
}

export function resolvePreviewRange(container) {
  const selection = typeof window === 'undefined' ? null : window.getSelection();
  if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
    return { unmappable: 'empty-selection' };
  }
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return { unmappable: 'outside-preview' };
  if (!selection.toString().trim()) return { unmappable: 'empty-selection' };
  const segments = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.firstChild();
  while (node) {
    if (range.intersectsNode(node)) {
      const text = node.textContent || '';
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : text.length;
      if (end > start) {
        const anchor = node.parentElement ? node.parentElement.closest('[data-ss]') : null;
        const total = anchor ? anchor.textContent.length : -1;
        const base = anchor ? offsetInAncestor(node, anchor) : -1;
        if (!anchor || base < 0) return { unmappable: 'unmapped-content' };
        segments.push({
          ss: Number(anchor.getAttribute('data-ss')),
          se: Number(anchor.getAttribute('data-se')),
          unit: anchor.hasAttribute('data-sunit'),
          // Offsets are relative to the mapped span so decorator wrappers
          // (diff highlights) between span and text do not shift the math.
          from: base + start,
          to: base + end,
          length: total,
        });
      }
    }
    node = walker.nextNode();
  }
  return assembleSourceRange(segments);
}
