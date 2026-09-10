import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Wraps a rendered table/math block. When the block references a workspace
// media asset, offers [Rendered Text] | [Original Image] — tables default to
// the extracted image for structural fidelity, math defaults to text.
export default function AssetToggle({
  assetUrl,
  variant,
  start,
  end,
  children,
}) {
  const { t } = useTranslation();
  const defaultView = variant === 'table' && assetUrl ? 'image' : 'text';
  const [view, setView] = useState(defaultView);
  useEffect(() => {
    setView(variant === 'table' && assetUrl ? 'image' : 'text');
  }, [variant, assetUrl]);

  return (
    <div data-src-start={start} data-src-end={end} className="mb-4">
      {assetUrl && (
        <div className="flex items-center gap-1 mb-1" role="group" aria-label={t('originalImage')}>
          <button
            type="button"
            onClick={() => setView('text')}
            aria-pressed={view === 'text'}
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors ${view === 'text' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {t('renderedText')}
          </button>
          <button
            type="button"
            onClick={() => setView('image')}
            aria-pressed={view === 'image'}
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors ${view === 'image' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {t('originalImage')}
          </button>
        </div>
      )}
      {view === 'image' && assetUrl ? (
        <img src={assetUrl} alt={t('originalImage')} loading="lazy" decoding="async" className="max-w-full my-2 rounded border" />
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </div>
  );
}
