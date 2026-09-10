import { SKIP, visit } from 'unist-util-visit';

// ponytail: content from the AST ingestor is markdown (headings, | tables |,
// $$ math); legacy student/LaTeX docs stay on renderLatexToHtml.
export function isLatexDialect(src) {
  const s = String(src || '');
  return (
    /\\(?:sub){0,2}section\*?\{/.test(s)
    || /\\begin\{(document|tabular|table|equation|align)/.test(s)
    || /\\documentclass/.test(s)
  );
}

const INCLUDEGRAPHICS = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g;
const MD_IMAGE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
const CITE = /\\cite(?:\[[^\]]*\])?\{([^}]*)\}/g;
const TEXTBF = /\\textbf\{([^{}]*)\}/g;
// Preservation allowlist: only sup/sub survive as markup (no rehype-raw).
// Named backreference: numeric \1 would renumber when composed below.
const SUPSUB = /<(?<tag>sup|sub)(\s[^<>]*)?>([^<>]*)<\/\k<tag>>/gi;
const EP_KEY = /^ep[0-9a-f]{32}$/i;

function baseref(ref) {
  return String(ref || '').trim().replace(/^.*[\\/]/, '');
}

export function resolveAssetUrl(slice, mediaUrlMap) {
  if (!slice || !mediaUrlMap) return null;
  const refs = new Set();
  for (const m of String(slice).matchAll(INCLUDEGRAPHICS)) refs.add(m[1].trim());
  for (const m of String(slice).matchAll(MD_IMAGE)) refs.add(m[1].trim());
  for (const ref of refs) {
    if (!ref) continue;
    if (mediaUrlMap[ref]) return mediaUrlMap[ref];
    const base = baseref(ref);
    if (base && mediaUrlMap[base]) return mediaUrlMap[base];
  }
  // Bare known-asset reference from workspace state.
  for (const key of Object.keys(mediaUrlMap)) {
    if (!key) continue;
    if (slice.includes(key)) return mediaUrlMap[key];
    const base = baseref(key);
    if (base && base.length > 3 && slice.includes(base)) return mediaUrlMap[key];
  }
  return null;
}

export function resolveImageSrc(src, mediaUrlMap) {
  if (!src) return null;
  if (/^(https?:|blob:|data:)/i.test(src)) return src;
  if (mediaUrlMap && mediaUrlMap[src]) return mediaUrlMap[src];
  const base = baseref(src);
  if (!base || !mediaUrlMap) return null;
  if (mediaUrlMap[base]) return mediaUrlMap[base];
  for (const key of Object.keys(mediaUrlMap)) {
    if (baseref(key) === base) return mediaUrlMap[key];
  }
  return null;
}

export function formatCitation(keys, citationNumbers = {}) {
  return `[${String(keys)
    .split(',')
    .map(key => {
      const trimmed = key.trim();
      if (Object.prototype.hasOwnProperty.call(citationNumbers, trimmed)) {
        return citationNumbers[trimmed];
      }
      return EP_KEY.test(trimmed) ? '?' : trimmed;
    })
    .join(', ')}]`;
}

function offsetOf(node, at) {
  return node?.position?.start?.offset != null ? node.position.start.offset + at : undefined;
}

// Split \includegraphics{..} and \cite{..} inside text nodes into typed nodes
// (offsets stay exact so scroll-sync anchors keep working).
export function remarkLatexInline({ citationNumbers = {} } = {}) {
  return tree => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || typeof index !== 'number') return undefined;
      const value = node.value || '';
      const parts = [];
      const combined = new RegExp(
        `${INCLUDEGRAPHICS.source}|${CITE.source}|${TEXTBF.source}|${SUPSUB.source}`,
        'gi',
      );
      let last = 0;
      let changed = false;
      for (const m of value.matchAll(combined)) {
        changed = true;
        pushTextWithPos(parts, value.slice(last, m.index), node, last);
        if (m[1] !== undefined) {
          parts.push({
            type: 'image',
            url: m[1].trim(),
            title: null,
            alt: baseref(m[1]),
            position: subpos(node, m.index, m.index + m[0].length),
          });
        } else if (m[2] !== undefined) {
          parts.push({
            type: 'citation',
            data: {
              hName: 'span',
              hProperties: { className: ['text-indigo-600', 'text-xs'] },
            },
            children: [{ type: 'text', value: formatCitation(m[2], citationNumbers) }],
            position: subpos(node, m.index, m.index + m[0].length),
          });
        } else if (m[3] !== undefined) {
          parts.push({
            type: 'strong',
            children: [{ type: 'text', value: m[3] }],
            position: subpos(node, m.index, m.index + m[0].length),
          });
        } else {
          const tag = m[4].toLowerCase();
          parts.push({
            type: tag,
            data: { hName: tag },
            children: [{ type: 'text', value: m[6] }],
            position: subpos(node, m.index, m.index + m[0].length),
          });
        }
        last = m.index + m[0].length;
      }
      if (!changed) return undefined;
      pushTextWithPos(parts, value.slice(last), node, last);
      parent.children.splice(index, 1, ...parts);
      return [SKIP, index + parts.length];
    });
  };
}

function pushTextWithPos(parts, text, node, at) {
  if (!text) return;
  const start = offsetOf(node, at);
  parts.push({
    type: 'text',
    value: text,
    ...(start === undefined ? {} : { position: subpos(node, at, at + text.length) }),
  });
}

function subpos(node, from, to) {
  const base = node?.position?.start?.offset;
  if (base == null) return undefined;
  return { start: { offset: base + from }, end: { offset: base + to } };
}

// A paragraph that renders nothing but figure(s): ![..](..) and/or
// \includegraphics{..} plus whitespace.
function imageOnlyUrls(node) {
  if (!node || node.type !== 'paragraph' || !Array.isArray(node.children)) return null;
  const urls = [];
  let hasImage = false;
  for (const child of node.children) {
    if (child.type === 'image' && child.url) {
      urls.push(child.url);
      hasImage = true;
    } else if (child.type === 'text') {
      const rest = child.value
        .replace(INCLUDEGRAPHICS, '')
        .replace(MD_IMAGE, '')
        .trim();
      if (rest !== '') return null;
      for (const m of child.value.matchAll(INCLUDEGRAPHICS)) {
        urls.push(m[1].trim());
        hasImage = true;
      }
      for (const m of child.value.matchAll(MD_IMAGE)) {
        urls.push(m[1].trim());
        hasImage = true;
      }
    } else {
      return null;
    }
  }
  return hasImage ? urls : null;
}
// fallback when the block references a workspace media asset. Every wrapped
// block keeps data-src-* offsets for scroll sync.
export function remarkAssetToggle({ source = '', mediaUrlMap = {} } = {}) {
  const src = String(source);
  return tree => {
    visit(tree, (node, index, parent) => {
      if (!parent || typeof index !== 'number') return undefined;
      if (node.type !== 'table' && node.type !== 'math') return undefined;
      if (!node.position) return undefined;
      const start = node.position.start.offset;
      const end = node.position.end.offset;
      const slice = src.slice(start, end);
      let url = resolveAssetUrl(slice, mediaUrlMap);
      // Trailing figure paragraph belongs to this block: attach it and drop
      // the duplicate instead of rendering the image twice.
      const next = parent.children[index + 1];
      const trailing = imageOnlyUrls(next);
      if (!url && trailing) {
        for (const ref of trailing) {
          url = resolveImageSrc(ref, mediaUrlMap);
          if (url) break;
        }
      }
      if (trailing && url) parent.children.splice(index + 1, 1);
      const wrapper = {
        type: 'assetToggle',
        data: {
          hName: 'asset-toggle',
          hProperties: {
            'data-asset-url': url || '',
            'data-variant': node.type,
            'data-src-start': String(start),
            'data-src-end': String(end),
          },
        },
        children: [node],
        position: node.position,
      };
      parent.children.splice(index, 1, wrapper);
      return [SKIP, index + 1];
    });
  };
}

// Top-level-only scroll anchors (nested inline ranges would skew interpolation).
export function rehypeAnchors() {
  return tree => {
    for (const node of tree.children || []) {
      if (node.type !== 'element' || !node.position) continue;
      const { start, end } = node.position;
      if (start?.offset == null || end?.offset == null) continue;
      node.properties = node.properties || {};
      if (node.properties['data-src-start'] == null) {
        node.properties['data-src-start'] = String(start.offset);
      }
      if (node.properties['data-src-end'] == null) {
        node.properties['data-src-end'] = String(end.offset);
      }
    }
  };
}
