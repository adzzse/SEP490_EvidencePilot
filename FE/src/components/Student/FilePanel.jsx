import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api.js';
import DeleteConfirm from '../ui/DeleteConfirm.jsx';

export default function FilePanel({ compact, isOpen, width, onResizeStart, sections, assignedSections, selectedSectionId, onSelectSection, selectedPaper, onSelectPaper, onViewFullPaper, papers, onUploadPaper, sources, onUploadSource, onDeleteSource, mediaAssets, onUploadMedia, onDeleteMedia, onInsertMedia, showToast, isLocked, onSaveDraft, saveStatus }) {
  const { t } = useTranslation();
  const [mediaSearchQuery, setMediaSearchQuery] = useState('');
  const [hoveredMedia, setHoveredMedia] = useState(null);
  const [mediaUrlMap, setMediaUrlMap] = useState({});

  // Signed URLs are not part of the list response — fetch them like PreviewPane does.
  useEffect(() => {
    if (!mediaAssets || mediaAssets.length === 0) {
      setMediaUrlMap({});
      return undefined;
    }
    let cancelled = false;
    api.post('/api/media/urls', { ids: mediaAssets.map(a => a.id) })
      .then(r => { if (!cancelled) setMediaUrlMap(r.data || {}); })
      .catch(() => { if (!cancelled) setMediaUrlMap({}); });
    return () => { cancelled = true; };
  }, [mediaAssets]);

  if (!isOpen) return null;
  const saveLabel = saveStatus === 'saving' ? t('saving') : saveStatus === 'saved' ? t('saved') : saveStatus === 'error' ? t('saveFailed') : null;

  const handleMediaEnter = (m, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredMedia({ id: m.id, top: rect.top, left: rect.right });
  };

  const hoveredAsset = hoveredMedia ? mediaAssets.find(m => String(m.id) === String(hoveredMedia.id)) : null;
  const previewSrc = hoveredMedia && mediaUrlMap[hoveredMedia.id] ? mediaUrlMap[hoveredMedia.id] : null;

  return (
    <>
      <aside data-tour="file-panel" style={{ width: compact ? 'min(20rem, calc(100vw - 3.5rem))' : width }} className={`bg-(--surface-secondary) border-r border-(--border) flex flex-col shrink-0 z-30 backdrop-blur-sm ${compact ? 'absolute inset-y-0 left-14 shadow-xl' : 'relative'}`}>
        <div className="px-4 py-2.5 border-b border-(--border) bg-(--surface-tertiary)/40 flex items-center justify-between">
          <span className="text-xs font-bold text-(--text-primary) truncate max-w-[180px]">{selectedPaper?.originalFilename || selectedPaper?.title || t('paper')}</span>
          {selectedPaper && (
            <button onClick={onViewFullPaper} className="ml-2 text-xs font-medium text-(--brand) hover:underline hidden sm:inline-flex items-center gap-1" title={t('viewFullPaper')}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              {t('viewFullPaper')}
            </button>
          )}
        </div>
        <div className="px-3 py-2 border-b border-(--border) flex items-center justify-between">
          <span className="text-[10px] font-bold text-(--text-secondary) tracking-wider uppercase">{t('sections')}</span>
          {saveLabel && <span className="text-[10px] font-bold text-indigo-600">{saveLabel}</span>}
        </div>
        <div className="p-2 flex-1 max-h-[45%] overflow-y-auto border-b border-(--border)">
          {sections.length === 0 ? (
            <div className="text-xs text-(--text-tertiary) italic text-center py-4">{t('noSections')}</div>
          ) : (
            sections.map(sec => {
              const isAssigned = assignedSections.some(s => String(s.id) === String(sec.id));
              const isSelected = String(sec.id) === String(selectedSectionId);
              return (
                <div key={sec.id} onClick={() => onSelectSection(sec)} className={`flex items-center justify-between text-xs font-medium p-2 rounded-md cursor-pointer transition-all mt-1 group ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 border border-indigo-100 dark:border-indigo-800 shadow-sm' : isAssigned ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-(--text-primary)' : 'text-(--text-secondary) hover:bg-(--surface-tertiary)'}`}>
                  <div className="flex items-center gap-2 truncate">
                    {isAssigned ? (
                      <svg className="w-3.5 h-3.5 shrink-0 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 shrink-0 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    )}
                    <span className="truncate max-w-[120px]" title={sec.sectionTitle}>{sec.sectionTitle || t('untitled')}</span>
                    <span className="text-[9px] text-(--text-tertiary) font-mono">#{(sec.sectionOrder ?? 0) + 1}</span>
                  </div>
                  {isAssigned && (
                    <span
                      title={t(sec.handoffConfirmedById ? 'handoffStateConfirmed' : 'handoffStateUnconfirmed')}
                      aria-label={t(sec.handoffConfirmedById ? 'handoffStateConfirmed' : 'handoffStateUnconfirmed')}
                      className={`shrink-0 text-[10px] font-black ${sec.handoffConfirmedById ? 'text-emerald-600' : 'text-amber-600'}`}
                    >
                      {sec.handoffConfirmedById ? '✓' : '○'}
                    </span>
                  )}
                  <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded shrink-0">v{sec.version || 1}</span>
                  {isSelected && isAssigned && onSaveDraft && (
                    <button onClick={(e) => { e.stopPropagation(); onSaveDraft(); }} disabled={isLocked || saveStatus === 'saving'} className="text-xs font-bold text-white bg-(--brand) hover:bg-(--brand-hover) disabled:cursor-not-allowed disabled:opacity-50 px-2 py-1 rounded shrink-0 cursor-pointer" title={isLocked ? t('saveReadOnly') : t('saveSection')}>{t('save')}</button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-3 border-b border-(--border) flex justify-between items-center bg-(--surface-tertiary)/40">
          <span className="text-[11px] font-bold text-(--text-secondary) tracking-wider uppercase">{t('mediaAssets')}</span>
          {!isLocked && (
            <label className="text-(--text-tertiary) hover:text-indigo-600 transition-colors cursor-pointer" title={t('uploadMedia')}>
              <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onUploadMedia(e.target.files[0]); }} />
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            </label>
          )}
        </div>
        <div className="px-3 py-2 border-b border-(--border) bg-(--surface-tertiary)/40">
          <input type="text" placeholder={t('searchMedia') || 'Search media...'} value={mediaSearchQuery} onChange={(e) => setMediaSearchQuery(e.target.value)} className="w-full text-xs border border-(--border) rounded-lg px-2 py-1 bg-(--surface) outline-none focus:ring-1 focus:ring-indigo-500 text-(--text-primary)" />
        </div>
        <div className="p-2 flex-1 overflow-y-auto">
          {mediaAssets.length === 0 ? (
            <div className="text-xs text-(--text-tertiary) italic text-center py-4">{t('noMedia')}</div>
          ) : (
            mediaAssets.filter(m => m.texFilename.toLowerCase().includes(mediaSearchQuery.toLowerCase())).map(m => (
              <div key={m.id} onClick={() => onInsertMedia?.(m.texFilename)} onMouseEnter={(e) => handleMediaEnter(m, e)} onMouseLeave={() => setHoveredMedia(null)} className={`flex items-center justify-between text-xs font-medium p-2 rounded-md transition-all mt-1 group text-(--text-secondary) ${onInsertMedia ? 'hover:bg-(--surface-tertiary) cursor-pointer' : 'cursor-default opacity-60'}`}>
                <div className="flex items-center gap-2 truncate">
                  <svg className="w-3.5 h-3.5 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="truncate" title={m.texFilename}>{m.texFilename}</span>
                </div>
                <DeleteConfirm message={t('deleteMediaConfirm')} onConfirm={() => onDeleteMedia(m.id)} triggerLabel={t('deleteMedia')} confirmLabel={t('delete')} cancelLabel={t('cancel')} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-600 transition-all p-0.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </DeleteConfirm>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Hover preview portal — appended to document.body so no sidebar overflow can clip it */}
      {hoveredMedia && previewSrc && hoveredAsset && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none w-64 bg-(--surface) border border-(--border) rounded-lg shadow-xl p-1 animate-in fade-in duration-100"
          style={{ left: Math.min(hoveredMedia.left + 8, window.innerWidth - 272), top: Math.max(8, Math.min(hoveredMedia.top, window.innerHeight - 280)) }}
        >
          <img src={previewSrc} alt={hoveredAsset.texFilename} className="w-full h-auto max-h-64 object-contain rounded" />
          <p className="text-[10px] text-center text-(--text-secondary) mt-1 truncate">{hoveredAsset.texFilename}</p>
        </div>,
        document.body,
      )}
    </>
  );
}
