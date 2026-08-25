import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import PreviewPane from '../../components/PreviewPane';
import { isReferenceSectionTitle } from '../../components/latexHtml.js';

export default function FullPaperPreview({ sections, paperTitle, mediaAssets, citationPreview, onClose }) {
  const { t } = useTranslation();
  const sectionRefs = useRef({});
  const generatedReferences = citationPreview?.references || [];
  const hasReferenceSection = sections.some(section =>
    isReferenceSectionTitle(section.sectionTitle));

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex w-full h-full max-w-[90vw] max-h-[90vh] m-auto bg-(--surface) rounded-2xl shadow-2xl border border-(--border) overflow-hidden">
        {/* Left: Pages */}
        <div className="hidden md:flex w-56 bg-(--surface-secondary) border-r border-(--border) flex-col shrink-0">
          <div className="px-4 py-3 border-b border-(--border) flex items-center justify-between shrink-0">
            <h3 className="text-xs font-bold text-(--text-primary) uppercase tracking-wider">{t('pages')} ({sections.length})</h3>
            <span className="text-[9px] text-(--text-tertiary) font-mono">{paperTitle}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sections.map((sec, i) => (
              <button key={sec.id}
                onClick={() => sectionRefs.current[sec.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="w-full text-left text-xs p-2 rounded-lg hover:bg-(--surface-tertiary) flex items-center gap-2 transition-colors border border-transparent hover:border-(--border) text-(--text-primary)">
                <span className="w-5 h-5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 flex items-center justify-center text-[9px] font-bold shrink-0">{i + 1}</span>
                <span className="truncate">{sec.sectionTitle || t('untitled')}</span>
                <span className="text-[9px] text-(--text-tertiary) font-mono ml-auto shrink-0">v{sec.version || 1}</span>
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-(--border) shrink-0">
            <button onClick={onClose} className="w-full text-xs font-semibold text-(--text-secondary) hover:text-(--text-primary) py-1.5 rounded-lg hover:bg-(--surface-tertiary) transition-colors">
              {t('close')}
            </button>
          </div>
        </div>

        {/* Right: Full compiled preview */}
        <div className="flex-1 bg-white overflow-y-auto p-4 sm:p-8 relative">
          <button onClick={onClose} className="md:hidden sticky top-0 ml-auto mb-2 p-2 rounded-lg bg-white border border-slate-200 text-slate-600 shadow-sm" aria-label={t('close')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          {sections.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-16">{t('noSections')}</p>
          ) : (
            <>
              {sections.map((sec, i) => {
                const referenceSection = isReferenceSectionTitle(sec.sectionTitle);
                return (
                  <div key={sec.id} ref={el => { sectionRefs.current[sec.id] = el; }}>
                    <PreviewPane
                      sectionTitle={sec.sectionTitle}
                      latex={sec.contentTex || ''}
                      mediaAssets={mediaAssets}
                      citationNumbers={citationPreview?.citationNumbers}
                      generatedReferences={referenceSection ? generatedReferences : []}
                      referencesTitle={sec.sectionTitle || 'References'}
                    />
                    {(i < sections.length - 1 || (!hasReferenceSection && generatedReferences.length > 0))
                      && <hr className="my-8 border-(--border)" />}
                  </div>
                );
              })}
              {!hasReferenceSection && generatedReferences.length > 0 && (
                <PreviewPane
                  latex=""
                  mediaAssets={mediaAssets}
                  citationNumbers={citationPreview?.citationNumbers}
                  generatedReferences={generatedReferences}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
