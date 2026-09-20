import { Component, useMemo, useDeferredValue } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useMediaUrlMap } from '../../hooks/useMediaUrls.js';
import { renderLatexToHtml, applyChangeHighlights } from '../../utils/formatters/latexHtml.js';
import {
  isLatexDialect,
  rehypeAnchors,
  rehypeChangeRanges,
  rehypeSourceOffsets,
  remarkAssetToggle,
  remarkLatexInline,
  resolveImageSrc,
} from '../../utils/formatters/markdownBlocks.js';
import { resolvePreviewRange } from '../../utils/previewSelection.js';
import { resolveLatexRange } from '../../utils/formatters/latexSourceMap.js';
import { normalizeSource } from '../../utils/student/feedbackAnchors.js';
import AssetToggle from './AssetToggle.jsx';

function MissingImage({ alt }) {
  const { t } = useTranslation();
  return <span className="text-red-500 text-xs">{t('student.workspace.missingImage', { alt: alt || t('student.workspace.defaultImageAlt') })}</span>;
}

// rationale: injected <ins>/<del> diff tags can split a math block and make the
// KaTeX AST parser throw. Fall back to a raw preformatted string, never crash.
class PreviewDiffBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidUpdate(previous) {
    if (this.state.crashed
      && (previous.markdown !== this.props.markdown || previous.changeKey !== this.props.changeKey)) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ crashed: false });
    }
  }

  render() {
    if (this.state.crashed) {
      return <pre className="max-w-prose mx-auto whitespace-pre-wrap break-words text-xs text-slate-700">{this.props.markdown}</pre>;
    }
    return this.props.children;
  }
}

// Preview selections resolve through a source map — markdown text-node
// spans, or the legacy renderer's structural zip (inline elements ↔ scanned
// spans, both in order). Content no map covers (KaTeX output, headings,
// tables, prose around constructs) refuses with an unmappable code and the
// parent shows an honest banner. Never fall back to snippet search — indexOf
// resolves recurring words to their first occurrence (phantom duplicates).
function describePreviewSelection(container, source, legacy) {
  const selection = typeof window === 'undefined' ? null : window.getSelection();
  if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  if (!selection.toString().trim()) return null;
  const rect = range.getBoundingClientRect();
  const box = { left: rect.left, top: rect.top, bottom: rect.bottom };
  const mapped = legacy ? resolveLatexRange(container, source) : resolvePreviewRange(container);
  if (!mapped || mapped.unmappable) {
    return mapped ? { kind: 'preview-selection', rect: box, unmappable: mapped.unmappable } : null;
  }
  return { kind: 'preview-selection', rect: box, from: mapped.from, to: mapped.to };
}

export default function PreviewPane({
  sectionTitle,
  latex,
  mediaAssets,
  citationNumbers,
  onScroll,
  scrollRef,
  zoom = 100,
  // rationale: shared changeRanges from useInstructorReview — same model as the LaTeX editor.
  changeRanges = [],
  onPreviewSelect,
}) {
  const { t } = useTranslation();
  // rationale: shared hook — concurrent mounts reuse one in-flight /api/media/urls.
  const mediaUrlMap = useMediaUrlMap(mediaAssets);

  // rationale: keystrokes stay at 60fps — the full remark+KaTeX parse runs
  // against the deferred value while the editor updates instantly.
  const deferredLatex = useDeferredValue(latex);
  // rationale: normalize once so the parser, the source-offset serializer, and
  // the anchor contract all measure the same canonical source (raw \r\n
  // lengths would drift every from/to).
  const source = useMemo(() => normalizeSource(deferredLatex), [deferredLatex]);
  const useLegacy = isLatexDialect(source);
  const html = useMemo(
    () => applyChangeHighlights((useLegacy && renderLatexToHtml(source, mediaUrlMap, citationNumbers)), changeRanges, source),
    [changeRanges, citationNumbers, source, mediaUrlMap, useLegacy],
  );
  const markdown = useMemo(() => (!useLegacy ? String(source || '') : ''), [source, useLegacy]);
  const rehypePlugins = useMemo(
    // Pass plugin options as pairs. Calling either serializer here would hand
    // unified a transformer as an attacher and run it without a tree.
    () => [rehypeKatex, rehypeAnchors, [rehypeSourceOffsets, source], [rehypeChangeRanges, changeRanges]],
    [changeRanges, source],
  );
  const remarkPlugins = useMemo(
    () => [
      remarkGfm,
      remarkMath,
      [remarkLatexInline, { citationNumbers }],
      [remarkAssetToggle, { source: markdown, mediaUrlMap }],
    ],
    [citationNumbers, markdown, mediaUrlMap],
  );
  const components = useMemo(
    () => ({
      // rationale: hast data-* props arrive verbatim; no node handling needed
      // (top-level scroll anchors come from rehypeAnchors).
      'asset-toggle': ({ children, ...props }) => (
        <AssetToggle
          assetUrl={props['data-asset-url'] || null}
          variant={props['data-variant']}
          start={props['data-src-start']}
          end={props['data-src-end']}
        >
          {children}
        </AssetToggle>
      ),
      img: ({ src, alt }) => {
        const url = resolveImageSrc(src, mediaUrlMap);
        if (!url) return <MissingImage alt={alt} />;
        return <img src={url} alt={alt} loading="lazy" decoding="async" className="max-w-full my-2 rounded border" />;
      },
    }),
    [mediaUrlMap],
  );
  const heading = sectionTitle || '';

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto bg-white p-8"
      onScroll={onScroll}
      onMouseUp={event => onPreviewSelect?.(describePreviewSelection(event.currentTarget, source, useLegacy))}
    >
      <div style={{ zoom: zoom / 100 }}>
        {heading && <h2 className="max-w-prose mx-auto text-lg font-bold mb-3 text-slate-800">{heading}</h2>}
        {useLegacy ? (
          html && <div className="max-w-prose mx-auto whitespace-pre-wrap break-words preview-content" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          markdown.trim() !== '' && (
            <div className="max-w-prose mx-auto break-words preview-content">
              <PreviewDiffBoundary markdown={markdown} changeKey={changeRanges.length}>
              <ReactMarkdown
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
                components={components}
              >
                {markdown}
              </ReactMarkdown>
              </PreviewDiffBoundary>
            </div>
          )
        )}
        {(!source && !useLegacy && markdown.trim() === '') && (
          <p className="max-w-prose mx-auto text-slate-400 italic">{t('student.workspace.emptyPreview')}</p>
        )}
      </div>
    </div>
  );
}
