import { useMemo, useDeferredValue } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useMediaUrlMap } from '../../hooks/useMediaUrls.js';
import { renderLatexToHtml } from '../../utils/formatters/latexHtml.js';
import {
  isLatexDialect,
  rehypeAnchors,
  remarkAssetToggle,
  remarkLatexInline,
  resolveImageSrc,
} from '../../utils/formatters/markdownBlocks.js';
import AssetToggle from './AssetToggle.jsx';

function MissingImage({ alt }) {
  return <span className="text-red-500 text-xs">[missing image: {alt || 'image'}]</span>;
}

export default function PreviewPane({
  sectionTitle,
  latex,
  mediaAssets,
  citationNumbers,
  generatedReferences = [],
  referencesTitle = 'References',
  onScroll,
  scrollRef,
  zoom = 100,
}) {
  // ponytail: shared hook — concurrent mounts reuse one in-flight /api/media/urls.
  const mediaUrlMap = useMediaUrlMap(mediaAssets);

  // ponytail: keystrokes stay at 60fps — the full remark+KaTeX parse runs
  // against the deferred value while the editor updates instantly.
  const deferredLatex = useDeferredValue(latex);
  const useLegacy = isLatexDialect(deferredLatex);
  const html = useMemo(
    () => (useLegacy && (!deferredLatex && generatedReferences.length > 0
      ? ''
      : renderLatexToHtml(deferredLatex, mediaUrlMap, citationNumbers))),
    [citationNumbers, generatedReferences.length, deferredLatex, mediaUrlMap, useLegacy],
  );
  const markdown = useMemo(() => (!useLegacy ? String(deferredLatex || '') : ''), [deferredLatex, useLegacy]);
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
  const heading = sectionTitle || (generatedReferences.length > 0 ? referencesTitle : '');

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto bg-white p-8" onScroll={onScroll}>
      <div style={{ zoom: zoom / 100 }}>
        {heading && <h2 className="max-w-prose mx-auto text-lg font-bold mb-3 text-slate-800">{heading}</h2>}
        {useLegacy ? (
          html && <div className="max-w-prose mx-auto whitespace-pre-wrap break-words preview-content" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          markdown.trim() !== '' && (
            <div className="max-w-prose mx-auto break-words preview-content">
              <ReactMarkdown
                remarkPlugins={remarkPlugins}
                rehypePlugins={[rehypeKatex, rehypeAnchors]}
                components={components}
              >
                {markdown}
              </ReactMarkdown>
            </div>
          )
        )}
        {(!deferredLatex && generatedReferences.length === 0 && !useLegacy && markdown.trim() === '') && (
          <p className="max-w-prose mx-auto text-slate-400 italic">No content to preview.</p>
        )}
        {generatedReferences.length > 0 && (
          <section className="max-w-prose mx-auto text-slate-700">
            <ol className="space-y-3 text-sm">
              {generatedReferences.map(reference => (
                <li key={reference.key} className="flex gap-2 leading-relaxed">
                  <span className="shrink-0 text-indigo-700">[{reference.number}]</span>
                  <span>{reference.reference}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
