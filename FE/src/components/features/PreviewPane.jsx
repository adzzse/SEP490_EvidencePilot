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
  remarkAssetToggle,
  remarkLatexInline,
  resolveImageSrc,
} from '../../utils/formatters/markdownBlocks.js';
import AssetToggle from './AssetToggle.jsx';
import GeneratedReferences from './GeneratedReferences.jsx';

function MissingImage({ alt }) {
  const { t } = useTranslation();
  return <span className="text-red-500 text-xs">{t('student.workspace.missingImage', { alt: alt || t('student.workspace.defaultImageAlt') })}</span>;
}

// ponytail: injected <ins>/<del> diff tags can split a math block and make the
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

// Preview text has no source map (block-level data-src-* only; KaTeX has
// none at all) — every non-collapsed selection is unmappable by construction.
// Never return offsets or searchable snippets; the parent routes to the Editor.
function describePreviewSelection(container) {
  const selection = typeof window === 'undefined' ? null : window.getSelection();
  if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  if (!selection.toString().trim()) return null;
  const rect = range.getBoundingClientRect();
  return { kind: 'preview-selection', rect: { left: rect.left, top: rect.top, bottom: rect.bottom } };
}

export default function PreviewPane({
  sectionTitle,
  latex,
  mediaAssets,
  citationNumbers,
  generatedReferences = [],
  referencesTitle,
  onScroll,
  scrollRef,
  zoom = 100,
  // ponytail: shared changeRanges from useInstructorReview — same model as the LaTeX editor.
  changeRanges = [],
  onPreviewSelect,
}) {
  const { t } = useTranslation();
  // ponytail: shared hook — concurrent mounts reuse one in-flight /api/media/urls.
  const mediaUrlMap = useMediaUrlMap(mediaAssets);

  // ponytail: keystrokes stay at 60fps — the full remark+KaTeX parse runs
  // against the deferred value while the editor updates instantly.
  const deferredLatex = useDeferredValue(latex);
  const useLegacy = isLatexDialect(deferredLatex);
  const html = useMemo(
    () => applyChangeHighlights((useLegacy && (!deferredLatex && generatedReferences.length > 0
      ? ''
      : renderLatexToHtml(deferredLatex, mediaUrlMap, citationNumbers))), changeRanges, deferredLatex),
    [changeRanges, citationNumbers, generatedReferences.length, deferredLatex, mediaUrlMap, useLegacy],
  );
  const markdown = useMemo(() => (!useLegacy ? String(deferredLatex || '') : ''), [deferredLatex, useLegacy]);
  const rehypePlugins = useMemo(
    // Pass changeRanges as plugin options. Calling rehypeChangeRanges here
    // would hand unified a transformer as an attacher and run it without a tree.
    () => [rehypeKatex, rehypeAnchors, [rehypeChangeRanges, changeRanges]],
    [changeRanges],
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
      // ponytail: hast data-* props arrive verbatim; no node handling needed
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
  const heading = sectionTitle || (generatedReferences.length > 0 ? referencesTitle || t('references') : '');

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto bg-white p-8"
      onScroll={onScroll}
      onMouseUp={event => onPreviewSelect?.(describePreviewSelection(event.currentTarget))}
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
        {(!deferredLatex && generatedReferences.length === 0 && !useLegacy && markdown.trim() === '') && (
          <p className="max-w-prose mx-auto text-slate-400 italic">{t('student.workspace.emptyPreview')}</p>
        )}
        <GeneratedReferences references={generatedReferences} className="max-w-prose mx-auto text-slate-700" />
      </div>
    </div>
  );
}
