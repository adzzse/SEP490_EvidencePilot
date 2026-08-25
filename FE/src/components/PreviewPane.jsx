import { useMemo, useEffect, useState } from 'react';
import api from '../api.js';
import { renderLatexToHtml } from './latexHtml.js';

export default function PreviewPane({
  sectionTitle,
  latex,
  mediaAssets,
  citationNumbers,
  generatedReferences = [],
  referencesTitle = 'References',
}) {
  const [mediaUrlMap, setMediaUrlMap] = useState({});

  useEffect(() => {
    if (!mediaAssets || mediaAssets.length === 0) {
      setMediaUrlMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api.post('/api/media/urls', { ids: mediaAssets.map(a => a.id) });
        const urls = r.data || {};
        if (cancelled) return;
        const map = {};
        for (const asset of mediaAssets) {
          const url = urls[asset.id];
          if (url) map[asset.texFilename] = url;
        }
        setMediaUrlMap(map);
      } catch {
        if (!cancelled) setMediaUrlMap({});
      }
    })();
    return () => { cancelled = true; };
  }, [mediaAssets]);

  const html = useMemo(
    () => (!latex && generatedReferences.length > 0
      ? ''
      : renderLatexToHtml(latex, mediaUrlMap, citationNumbers)),
    [citationNumbers, generatedReferences.length, latex, mediaUrlMap],
  );
  const heading = sectionTitle || (generatedReferences.length > 0 ? referencesTitle : '');

  return (
    <div className="h-full overflow-y-auto bg-white p-8">
      {heading && <h2 className="max-w-prose mx-auto text-lg font-bold mb-3 text-slate-800">{heading}</h2>}
      {html && <div className="max-w-prose mx-auto whitespace-pre-wrap break-words preview-content" dangerouslySetInnerHTML={{ __html: html }} />}
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
  );
}
