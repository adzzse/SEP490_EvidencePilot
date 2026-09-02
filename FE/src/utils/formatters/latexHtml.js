import katex from 'katex';

function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function isReferenceSectionTitle(title = '') {
  return ['references', 'reference', 'bibliography', 'works cited'].includes(title.trim().toLowerCase());
}

const HEADING_OPEN = /^\\(?:sub){0,2}section\*?\s*\{/;
const ENV_OPEN = /^\\begin\{(table\*?|equation\*?|align\*?|aligned\*?)\}/;
// Terminators that end a paragraph block. Lookaheads keep the cut at line start.
const PARA_TERM = /\n[ \t]*\r?\n|\\end\{document\}|\n(?=\\(?:sub){0,2}section\*?\s*\{)|\n(?=\\begin\{(?:table\*?|equation\*?|align\*?|aligned\*?)\})|\n(?=\\\[)|\n(?=\$\$)/g;

function matchBrace(src, openIdx) {
  let depth = 0;
  for (let k = openIdx; k < src.length; k++) {
    const c = src[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return k; }
  }
  return src.length;
}

/**
 * Split a LaTeX source string into ordered top-level blocks with exact
 * [start, end) offsets into the original string.
 *
 * Preamble regions (\documentclass/\usepackage/\begin{document}, leading
 * command runs) and unrenderable fragments produce NO blocks — they have no
 * rendered equivalent, so scroll sync must anchor past them.
 */
export function splitLatexBlocks(latex) {
  const src = String(latex || '');
  if (!src.trim()) return [];

  const blocks = [];
  let i = 0;

  const beginDoc = src.indexOf('\\begin{document}');
  if (beginDoc >= 0) i = beginDoc + '\\begin{document}'.length;

  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) break;
    if (src.startsWith('\\end{document}', i)) break;

    const rest = src.slice(i);

    const hm = rest.match(HEADING_OPEN);
    if (hm && (i === 0 || src[i - 1] === '\n')) {
      const close = matchBrace(src, i + hm[0].length - 1);
      let end = src.indexOf('\n', close);
      end = end === -1 ? src.length : end + 1;
      blocks.push({ start: i, end, type: 'heading' });
      i = end;
      continue;
    }

    const em = rest.match(ENV_OPEN);
    if (em) {
      const name = em[1];
      const token = `\\end{${name}}`;
      const closeIdx = src.indexOf(token, i + em[0].length);
      const end = closeIdx === -1 ? src.length : closeIdx + token.length;
      blocks.push({ start: i, end, type: name.startsWith('table') ? 'table' : 'display-math' });
      i = end;
      continue;
    }

    const isDisplayBracket = src.startsWith('\\[', i);
    if (isDisplayBracket || src.startsWith('$$', i)) {
      const closer = isDisplayBracket ? '\\]' : '$$';
      const closeIdx = src.indexOf(closer, i + closer.length);
      const end = closeIdx === -1 ? src.length : closeIdx + closer.length;
      blocks.push({ start: i, end, type: 'display-math' });
      i = end;
      continue;
    }

    // Paragraph: consume until blank line / special line-start / \end{document}
    PARA_TERM.lastIndex = i;
    const m = PARA_TERM.exec(src);
    let end = m ? m.index : src.length;
    if (end <= i) end = Math.min(i + 1, src.length); // safety against zero-length
    blocks.push({ start: i, end, type: 'paragraph' });
    i = end;
  }

  return blocks;
}

function katexHtml(eq, displayMode) {
  try {
    return katex.renderToString(eq.trim(), { displayMode, throwOnError: false });
  } catch {
    return `<span class="text-red-500">${escHtml(eq)}</span>`;
  }
}

function renderInline(text, mediaUrlMap, citationNumbers) {
  return String(text)
    .replace(/\\documentclass[^\n]*\n?/g, '')
    .replace(/\\usepackage[^\n]*\n?/g, '')
    .replace(/\\date\{[^}]*\}/g, '')
    .replace(/\\maketitle/g, '')
    .replace(/\\title\{([^}]*)\}/g, '<h1 class="text-2xl font-bold text-center mb-2">$1</h1>')
    .replace(/\\author\{([^}]*)\}/g, '<p class="text-sm text-center text-slate-500 mb-8">$1</p>')
    .replace(/\\textbf\{([^}]*)\}/g, '<strong>$1</strong>')
    .replace(/\\textit\{([^}]*)\}/g, '<em>$1</em>')
    .replace(/\\hl\{([^}]*)\}/g, '<span class="bg-yellow-200 px-1 rounded">$1</span>')
    .replace(/\\cite(?:\[[^\]]*\])?\{([^}]*)\}/g, (_, keys) => {
      const labels = keys.split(',').map(key => {
        const trimmed = key.trim();
        if (Object.prototype.hasOwnProperty.call(citationNumbers, trimmed)) {
          return citationNumbers[trimmed];
        }
        return /^ep[0-9a-f]{32}$/i.test(trimmed) ? '?' : escHtml(trimmed);
      });
      return `<span class="text-indigo-600 text-xs">[${labels.join(', ')}]</span>`;
    })
    .replace(/\\label\{[^}]*\}/g, '')
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g, (_, fn) => {
      const ref = fn.trim().replace(/^.*[\\/]/, '');
      const url = mediaUrlMap ? (mediaUrlMap[fn] || mediaUrlMap[ref]) : null;
      const alt = escHtml(ref);
      if (!url) return `<span class="text-red-500 text-xs">[missing image: ${alt}]</span>`;
      return `<img src="${url}" alt="${alt}" class="max-w-full my-2 rounded border" />`;
    })
    .replace(/\$(.+?)\$/gs, (_, eq) => katexHtml(eq, false));
}

function renderTable(blockSrc, mediaUrlMap, citationNumbers) {
  // Strip outer table environment, then convert tabular to an HTML table.
  const tabularMatch = blockSrc.match(/\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\}/);
  if (!tabularMatch) return renderInline(blockSrc, mediaUrlMap, citationNumbers);
  const rowsContent = tabularMatch[2];
  const rows = rowsContent.split(/\\\\/).map(r => r.trim()).filter(Boolean);
  const htmlRows = rows.map((row, ri) => {
    const cells = row.replace(/\\hline\s*/g, '').split('&').map(c => c.trim()).filter(Boolean);
    if (cells.length === 0) return '';
    const tag = ri === 0 ? 'th' : 'td';
    return `<tr>${cells.map(c => `<${tag} class="border border-gray-300 px-2 py-1">${escHtml(c)}</${tag}>`).join('')}</tr>`;
  }).filter(Boolean);
  return `<table class="min-w-full border-collapse my-4 text-xs">${htmlRows.join('')}</table>`;
}

function attrs(b) {
  return ` data-src-start="${b.start}" data-src-end="${b.end}"`;
}

/**
 * Render LaTeX to HTML where every rendered top-level block carries
 * data-src-start / data-src-end attributes mapping it back to its exact
 * character range in the source. Blocks with no rendered equivalent
 * (preamble, labels-only, comments) emit nothing.
 */
export function renderLatexToHtml(latex, mediaUrlMap, citationNumbers = {}) {
  if (!latex) return '<p class="text-slate-400 italic">No content to preview.</p>';
  const src = String(latex);

  const parts = splitLatexBlocks(src).map(b => {
    const seg = src.slice(b.start, b.end);
    let html = '';

    if (b.type === 'heading') {
      const m = seg.match(HEADING_OPEN);
      if (m) {
        const close = matchBrace(seg, m[0].length - 1);
        const title = seg.slice(m[0].length, close);
        const lvl = (m[0].match(/sub/g) || []).length;
        const tag = ['h2', 'h3', 'h4'][lvl];
        const cls = [
          'text-lg font-bold mt-6 mb-3 text-slate-800',
          'text-base font-semibold mt-4 mb-2 text-slate-700',
          'text-sm font-semibold mt-3 mb-2 text-slate-700',
        ][lvl];
        html = `<${tag} class="${cls}"${attrs(b)}>${title}</${tag}>`;
      }
    } else if (b.type === 'display-math') {
      const inner = seg
        .replace(/^\\\[\s*|\s*\\\]$/gs, '')
        .replace(/^\$\$\s*|\s*\$\$$/gs, '')
        .replace(/^\\begin\{[^}]+\}\s*/, '')
        .replace(/\s*\\end\{[^}]+\}$/s, '');
      html = `<p class="mb-4 leading-relaxed text-slate-700" data-display${attrs(b)}>${katexHtml(inner, true)}</p>`;
    } else if (b.type === 'table') {
      html = `<div class="mb-4 overflow-x-auto"${attrs(b)}>${renderTable(seg, mediaUrlMap, citationNumbers)}</div>`;
    } else {
      html = `<p class="mb-4 leading-relaxed text-slate-700" ${attrs(b)}>${renderInline(seg, mediaUrlMap, citationNumbers)}</p>`;
    }

    // Drop blocks with no visible output (no anchor possible).
    const visible = html.replace(/<[^>]+>/g, '').trim();
    if (!visible && !html.includes('<img') && !html.includes('katex')) return '';
    return html;
  }).filter(Boolean);

  return parts.join('\n');
}
