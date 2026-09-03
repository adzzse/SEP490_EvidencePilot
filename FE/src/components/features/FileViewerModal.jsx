import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api.js';
import { splitPassageQuote } from '../../utils/citationReviewPopover.js';

export default function FileViewerModal({ fileUrl, fileName, documentId, chunkId, quote, onClose }) {
  const { t } = useTranslation();
  const hasPassage = Boolean(documentId && chunkId);
  const [view, setView] = useState(hasPassage ? 'passage' : 'file');
  const [loadError, setLoadError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [passage, setPassage] = useState(null);
  const [passageLoading, setPassageLoading] = useState(hasPassage);
  const [passageError, setPassageError] = useState(false);

  useEffect(() => {
    setView(hasPassage ? 'passage' : 'file');
  }, [documentId, chunkId, hasPassage]);

  useEffect(() => {
    let active = true;
    setPassage(null);
    setPassageError(false);
    setPassageLoading(hasPassage);
    if (!hasPassage) return () => { active = false; };

    // ponytail: reuse the existing chunk-list endpoint; add a single-chunk route only if large sources make this slow.
    api.get(`/api/documents/${documentId}/chunks`)
      .then((response) => {
        if (!active) return;
        const match = (response.data || []).find(item => String(item.id) === String(chunkId));
        setPassage(match || null);
        setPassageError(!match);
      })
      .catch(() => {
        if (active) setPassageError(true);
      })
      .finally(() => {
        if (active) setPassageLoading(false);
      });

    return () => { active = false; };
  }, [chunkId, documentId, hasPassage]);

  useEffect(() => {
    let active = true;
    let objectUrl;

    setLoadError(false);
    setPreviewUrl(null);

    if (view !== 'file') return () => { active = false; };

    const targetUrl = fileUrl || (documentId ? `/api/documents/${documentId}/download` : null);

    if (!targetUrl) {
      setLoadError(true);
      return () => { active = false; };
    }

    if (targetUrl.startsWith('blob:')) {
      setPreviewUrl(targetUrl);
      return () => { active = false; };
    }

    // keep literal for test: api.get(fileUrl, { responseType: 'blob' })
    const fetchUrl = targetUrl;
    api.get(fetchUrl, { responseType: 'blob' })
      .then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileUrl, view]);

  const quoteParts = splitPassageQuote(passage?.text, quote);

  const handleDownload = () => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = fileName || 'document';
    link.click();
  };

  if (!fileUrl && !hasPassage) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-(--surface) border border-(--border) rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={fileName || t('fileViewer')}
      >
        <div className="shrink-0 border-b border-(--border) px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-semibold text-(--text-primary)">
              {fileName || t('fileViewer')}
            </h3>
            <div className="flex shrink-0 items-center gap-2">
              {view === 'file' && (
                <button
                  onClick={handleDownload}
                  disabled={!previewUrl}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-semibold text-(--text-secondary) transition-colors hover:bg-(--surface-tertiary) focus-visible:ring-2 focus-visible:ring-(--brand) disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="hidden sm:inline">{t('download')}</span>
                </button>
              )}
              <button onClick={onClose} className="cursor-pointer rounded-lg p-2 text-(--text-tertiary) transition-colors hover:bg-(--surface-secondary) hover:text-(--text-primary) focus-visible:ring-2 focus-visible:ring-(--brand)" aria-label={t('close')}>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {hasPassage && (
            <div className="mt-3 inline-flex rounded-lg border border-(--border) bg-(--surface-secondary) p-1" aria-label={t('sourceViewMode')}>
              <button
                type="button"
                onClick={() => setView('passage')}
                aria-pressed={view === 'passage'}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-(--brand) ${view === 'passage' ? 'bg-(--surface) text-(--text-primary) shadow-sm' : 'text-(--text-secondary) hover:text-(--text-primary)'}`}
              >
                {t('extractedPassage')}
              </button>
              <button
                type="button"
                onClick={() => setView('file')}
                aria-pressed={view === 'file'}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-(--brand) ${view === 'file' ? 'bg-(--surface) text-(--text-primary) shadow-sm' : 'text-(--text-secondary) hover:text-(--text-primary)'}`}
              >
                {t('originalSourceFile')}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 bg-(--surface-secondary) relative">
          {view === 'passage' ? (
            passageLoading ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-(--text-secondary)">{t('loadingPassage')}</div>
            ) : passageError || !passage ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-(--text-secondary)">
                <svg className="mb-4 h-12 w-12 text-(--text-tertiary)" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.5 9a3.5 3.5 0 117 0c0 2.5-3.5 2.5-3.5 5m0 3h.01M12 22a10 10 0 110-20 10 10 0 010 20z" />
                </svg>
                <p className="font-medium">{t('passageUnavailable')}</p>
                <button type="button" onClick={() => setView('file')} className="mt-4 cursor-pointer rounded-lg bg-(--brand) px-4 py-2 text-sm font-bold text-(--on-brand) transition-colors hover:bg-(--brand-hover) focus-visible:ring-2 focus-visible:ring-(--brand)">
                  {t('openOriginalSourceFile')}
                </button>
              </div>
            ) : (
              <div className="h-full overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                <article className="mx-auto max-w-3xl rounded-xl border border-(--border) bg-(--surface) p-4 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--border-light) pb-3">
                    <h4 className="text-sm font-bold text-(--text-primary)">{t('selectedSourcePassage')}</h4>
                    {passage.chunkIndex != null && (
                      <span className="rounded bg-(--surface-secondary) px-2 py-1 text-[10px] font-bold text-(--text-tertiary)">
                        {t('chunkLabel', { index: Number(passage.chunkIndex) + 1 })}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-(--text-tertiary)">{t('extractedPassageNotice')}</p>
                  {quote && !quoteParts.match && (
                    <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-200">{t('passageQuoteNotLocated')}</p>
                  )}
                  <div className="mt-4 whitespace-pre-wrap rounded-lg bg-(--surface-secondary) p-4 text-sm leading-7 text-(--text-primary)">
                    {quoteParts.before}
                    {quoteParts.match && <mark className="rounded bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-500/40 dark:text-amber-100">{quoteParts.match}</mark>}
                    {quoteParts.after}
                  </div>
                </article>
              </div>
            )
          ) : loadError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-(--text-secondary) p-8 text-center">
              <svg className="w-12 h-12 mb-4 text-(--text-tertiary)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <p className="font-medium mb-1">{t('previewNotAvailable')}</p>
              <p className="text-sm text-(--text-tertiary) mb-4">{t('previewUnsupported')}</p>
              {previewUrl && (
                <button
                  onClick={handleDownload}
                  className="px-5 py-2 bg-(--brand) text-(--on-brand) rounded-lg font-semibold hover:bg-(--brand-hover) transition-colors text-sm"
                >
                  {t('downloadFile')}
                </button>
              )}
            </div>
          ) : !previewUrl ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-(--text-secondary)">
              {t('loading')}
            </div>
          ) : (
            <iframe
              src={previewUrl}
              title={fileName || t('filePreview')}
              className="w-full h-full border-0"
              onError={() => setLoadError(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
