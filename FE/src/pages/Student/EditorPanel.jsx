import { useState, useRef, useEffect, useCallback } from 'react';
import LatexEditor from '../../components/LatexEditor';
import PreviewPane from '../../components/PreviewPane';
import VisualSourceMap from '../../components/VisualSourceMap.jsx';
import { useTranslation } from 'react-i18next';

export default function EditorPanel({
  compact,
  selectedPaper, selectedSectionId, assignedSections, canEditCurrentSection, currentSection, displayContent, updateCode,
  editorWidth, onEditorResizeStart,
  saveStatus, lastSaved, handleSaveDraft,
  insertLatexTag, insertSymbol, handleFindReplace, handleDownloadTex,
  showSymbolMenu, setShowSymbolMenu, showTextSizeMenu, setShowTextSizeMenu,
  showSearchPanel, setShowSearchPanel, searchQuery, setSearchQuery, replaceQuery, setReplaceQuery,
  textSize, setTextSize, showToast, editorRef, mediaAssets, isLocked,
  findings = [], onFindingClick,
  sources = [], aiSourceMatches = {}
}) {
  const { t } = useTranslation();
  const isOwnSection = canEditCurrentSection
    ?? (assignedSections && assignedSections.some(s => String(s.id) === String(selectedSectionId)));
  const [previewZoom, setPreviewZoom] = useState(100);
  const [showVisualMap, setShowVisualMap] = useState(false);
  const generatedReferences = [];
  const previewOuterRef = useRef(null);

  // --- Anchor-only sync engine (Overleaf-style) ---
  const zoomScaleRef = useRef(1);
  const contentKeyRef = useRef(displayContent);
  const blocksCacheRef = useRef({ key: null, items: [] });
  const editorScrollHandlerRef = useRef(null);
  const editorScrollBridge = useCallback(() => { editorScrollHandlerRef.current?.(); }, []);

  contentKeyRef.current = displayContent;
  useEffect(() => { zoomScaleRef.current = previewZoom / 100; }, [previewZoom]);

  // Recreated per section so locks/anchors reset; both panes start at top.
  useEffect(() => {
    const container = previewOuterRef.current;
    if (!container) return undefined;

    let frame = null;
    let pending = null;
    let lock = null;
    let lastToPreview = null;
    let lastToEditor = null;

    const getBlocks = () => {
      if (blocksCacheRef.current.key !== contentKeyRef.current) {
        blocksCacheRef.current = {
          key: contentKeyRef.current,
          items: Array.from(container.querySelectorAll('[data-src-start]')).map(el => ({
            el,
            start: Number(el.getAttribute('data-src-start')),
          })),
        };
      }
      return blocksCacheRef.current.items;
    };

    const alignBlockTop = (el) => {
      const scale = zoomScaleRef.current || 1;
      const delta = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
      container.scrollTop += delta / scale;
    };

    const runFromEditor = () => {
      const blocks = getBlocks();
      if (!blocks.length || !editorRef.current?.getTopVisibleOffset) return;
      const offset = editorRef.current.getTopVisibleOffset();
      let target = null;
      for (const b of blocks) {
        if (b.start <= offset) target = b;
        else break;
      }
      if (!target) target = blocks[0]; // preamble / unrenderable region → anchor to first block
      if (target.start === lastToPreview) return; // idempotent anchor — no jitter
      lastToPreview = target.start;
      lock = 'preview';
      if (target === blocks[0] && offset <= blocks[0].start) container.scrollTop = 0;
      else alignBlockTop(target.el);
      requestAnimationFrame(() => { lock = null; });
    };

    const runFromPreview = () => {
      const blocks = getBlocks();
      if (!blocks.length || !editorRef.current?.scrollToOffset) return;
      const cTop = container.getBoundingClientRect().top;
      let target = blocks[0];
      for (const b of blocks) {
        if (b.el.getBoundingClientRect().top <= cTop + 1) target = b;
        else break;
      }
      if (target.start === lastToEditor) return;
      lastToEditor = target.start;
      lock = 'editor';
      editorRef.current.scrollToOffset(target.start);
      requestAnimationFrame(() => { lock = null; });
    };

    const flush = () => {
      frame = null;
      const side = pending;
      pending = null;
      if (side === 'editor') runFromEditor();
      else if (side === 'preview') runFromPreview();
    };
    const schedule = (side) => {
      pending = side;
      if (frame == null) frame = requestAnimationFrame(flush);
    };

    editorScrollHandlerRef.current = () => { if (lock !== 'editor') schedule('editor'); };
    const onPreviewScroll = () => { if (lock !== 'preview') schedule('preview'); };

    container.addEventListener('scroll', onPreviewScroll, { passive: true });

    // Reset both panes for the new section.
    container.scrollTop = 0;
    editorRef.current?.scrollToTop?.();

    return () => {
      container.removeEventListener('scroll', onPreviewScroll);
      editorScrollHandlerRef.current = null;
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [selectedSectionId]);

  return (
    <div id="editor-preview-container" className="flex-1 min-w-0 flex overflow-hidden bg-(--surface-tertiary)/50 p-2 gap-2">
      <div style={{ width: compact ? '100%' : `${editorWidth}%`, flexGrow: 0, flexShrink: 0 }} className="bg-(--surface) rounded-lg shadow-sm border border-(--border) flex flex-col overflow-hidden min-w-0">
        <div data-tour="editor-toolbar" className="h-10 border-b border-(--border-light) flex items-center justify-between px-3 bg-(--surface) shadow-sm shrink-0 z-10">
          <div className="flex items-center gap-2 truncate">
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded tracking-wide font-mono">LaTeX</span>
            <span data-tour="editor-section-name" className="text-xs font-bold text-(--text-primary) truncate">{currentSection ? currentSection.sectionTitle : selectedPaper ? selectedPaper.originalFilename : 'document.tex'}</span>
            {currentSection && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded shrink-0">v{currentSection.version || 1}</span>}
          </div>
          <div className="flex items-center gap-3">
            {(isLocked || (currentSection && !isOwnSection)) && (
              <span className="text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800">{t('readOnly')}</span>
            )}
            <button onClick={handleSaveDraft} disabled={saveStatus === 'saving' || !isOwnSection || isLocked} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-colors disabled:opacity-50 ${saveStatus === 'saving' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30' : saveStatus === 'saved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : saveStatus === 'error' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30' : 'bg-(--surface-tertiary) text-(--text-secondary) hover:bg-(--border)'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              {saveStatus === 'saving' ? t('saving') : saveStatus === 'saved' ? t('saved') : saveStatus === 'error' ? t('error') : t('save')}
              {lastSaved && saveStatus !== 'saving' && <span className="text-[9px] opacity-60 ml-0.5">{lastSaved.toLocaleTimeString()}</span>}
            </button>
          </div>
        </div>
        <div className="bg-(--surface-secondary) border-b border-(--border) flex flex-col shrink-0 select-none">
          <div className="h-9 flex items-center justify-between px-3 border-b border-(--border-light) gap-1">
            <div className={`flex-1 flex items-center gap-1 min-w-0 pr-2 ${!isOwnSection || isLocked ? 'pointer-events-none opacity-30' : ''}`}>
              <div className="relative">
                <button onClick={() => { if (!isOwnSection || isLocked) return; setShowTextSizeMenu(!showTextSizeMenu); setShowSymbolMenu(false); }} className={`h-7 px-1.5 flex items-center gap-1 hover:bg-(--surface-tertiary) rounded text-(--text-primary) font-extrabold text-xs transition-colors cursor-pointer ${!isOwnSection || isLocked ? 'opacity-30 pointer-events-none' : ''}`} title={t('headingFontSize')}>
                  <span>TT</span><span className="text-[7px]">▼</span>
                </button>
                {showTextSizeMenu && (
                  <div className="absolute left-0 mt-1 bg-(--surface) border border-(--border) rounded-lg shadow-xl py-1 w-32 z-50 animate-in fade-in duration-105">
                    <button onClick={() => { insertLatexTag('section'); setShowTextSizeMenu(false); }} className="w-full text-left px-3 py-1.5 hover:bg-(--surface-secondary) text-xs font-bold text-(--text-primary) cursor-pointer">{t('section')}</button>
                    <button onClick={() => { insertLatexTag('subsection'); setShowTextSizeMenu(false); }} className="w-full text-left px-3 py-1.5 hover:bg-(--surface-secondary) text-xs font-semibold text-(--text-primary) cursor-pointer">{t('subsection')}</button>
                    <button onClick={() => { insertLatexTag('subsubsection'); setShowTextSizeMenu(false); }} className="w-full text-left px-3 py-1.5 hover:bg-(--surface-secondary) text-xs text-(--text-primary) cursor-pointer">{t('subsubsection')}</button>
                    <hr className="border-(--border) my-1" />
                    <button onClick={() => { insertLatexTag('large'); setShowTextSizeMenu(false); }} className="w-full text-left px-3 py-1.5 hover:bg-(--surface-secondary) text-xs text-(--text-primary) cursor-pointer">{t('largeFont')}</button>
                    <button onClick={() => { insertLatexTag('small'); setShowTextSizeMenu(false); }} className="w-full text-left px-3 py-1.5 hover:bg-(--surface-secondary) text-xs text-(--text-primary) cursor-pointer">{t('smallFont')}</button>
                  </div>
                )}
              </div>
              <button onClick={() => insertLatexTag('bold')} className="w-7 h-7 flex items-center justify-center hover:bg-(--surface-tertiary) rounded text-(--text-primary) font-extrabold font-serif cursor-pointer font-bold" title={t('bold')}>B</button>
              <button onClick={() => insertLatexTag('italic')} className="w-7 h-7 flex items-center justify-center hover:bg-(--surface-tertiary) rounded text-(--text-primary) italic font-serif cursor-pointer" title={t('italic')}>I</button>
              <button onClick={() => insertLatexTag('hl')} className="w-7 h-7 flex items-center justify-center hover:bg-(--surface-tertiary) rounded text-amber-600 font-bold cursor-pointer" title={t('highlight')}>Hl</button>
              <button onClick={() => insertLatexTag('inline-math')} className="w-7 h-7 flex items-center justify-center hover:bg-(--surface-tertiary) rounded text-(--text-primary) font-serif text-xs cursor-pointer" title={t('inlineMath')}>$</button>
              <button onClick={() => insertLatexTag('equation')} className="w-7 h-7 flex items-center justify-center hover:bg-(--surface-tertiary) rounded text-(--text-primary) font-serif text-xs cursor-pointer" title={t('equation')}>∑</button>
              <div className="relative">
                <button onClick={() => { setShowSymbolMenu(!showSymbolMenu); setShowTextSizeMenu(false); }} className="w-7 h-7 flex items-center justify-center hover:bg-(--surface-tertiary) rounded text-(--text-primary) font-bold cursor-pointer" title={t('greekSymbols')}>Ω</button>
                {showSymbolMenu && (
                  <div className="absolute right-0 mt-1 bg-(--surface) border border-(--border) rounded-lg shadow-xl p-2 w-48 z-50 animate-in fade-in duration-105">
                    <div className="grid grid-cols-4 gap-1">
                      {[{ code: '\\alpha', char: 'α' }, { code: '\\beta', char: 'β' }, { code: '\\gamma', char: 'γ' }, { code: '\\delta', char: 'δ' }, { code: '\\epsilon', char: 'ε' }, { code: '\\theta', char: 'θ' }, { code: '\\lambda', char: 'λ' }, { code: '\\pi', char: 'π' }, { code: '\\omega', char: 'ω' }, { code: '\\sigma', char: 'σ' }, { code: '\\infty', char: '∞' }, { code: '\\pm', char: '±' }, { code: '\\approx', char: '≈' }, { code: '\\neq', char: '≠' }, { code: '\\le', char: '≤' }, { code: '\\ge', char: '≥' }].map(sym => (
                        <button key={sym.code} onClick={() => { insertSymbol(sym.code); setShowSymbolMenu(false); }} className="h-7 hover:bg-(--surface-tertiary) rounded text-xs font-semibold text-(--text-primary) flex items-center justify-center cursor-pointer hover:text-indigo-600" title={sym.code}>{sym.char}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="w-px h-4 bg-(--border) mx-1"></div>
              <button onClick={() => insertLatexTag('link')} className="w-7 h-7 flex items-center justify-center hover:bg-(--surface-tertiary) rounded text-(--text-primary) cursor-pointer" title={t('insertLink')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              </button>
              <button onClick={() => insertLatexTag('comment')} className="w-7 h-7 flex items-center justify-center hover:bg-(--surface-tertiary) rounded text-(--text-primary) cursor-pointer" title={t('insertComment')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              </button>
              <button onClick={() => insertLatexTag('label')} className="w-7 h-7 flex items-center justify-center hover:bg-(--surface-tertiary) rounded text-(--text-primary) cursor-pointer" title={t('insertLabel')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </button>
              <button onClick={() => insertLatexTag('cite')} className="w-7 h-7 flex items-center justify-center hover:bg-(--surface-tertiary) rounded text-(--text-primary) cursor-pointer" title={t('insertCitation')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              </button>
              <button onClick={() => insertLatexTag('figure')} className="w-7 h-7 flex items-center justify-center hover:bg-(--surface-tertiary) rounded text-(--text-primary) cursor-pointer" title={t('insertFigure')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </button>
              <button onClick={() => insertLatexTag('table')} className="w-7 h-7 flex items-center justify-center hover:bg-(--surface-tertiary) rounded text-(--text-primary) cursor-pointer" title={t('insertTable')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setShowSearchPanel(!showSearchPanel)} className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${showSearchPanel ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700' : 'hover:bg-(--surface-tertiary) text-(--text-primary)'}`} title={t('findReplace')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>
            </div>
          </div>
          <div className="h-8 flex items-center justify-between px-3 bg-(--surface-secondary)/70 border-t border-(--border-light) gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-(--text-tertiary) font-extrabold tracking-wider">{t('textSize')}</span>
              <input type="range" min="10" max="24" value={textSize} onChange={(e) => setTextSize(parseInt(e.target.value))} className="w-16 h-1 bg-(--border) rounded-lg appearance-none cursor-pointer accent-indigo-600" title={t('editorFontSize')} />
              <span className="text-[10px] text-(--text-secondary) font-mono font-bold">{textSize}px</span>
            </div>
            <button onClick={handleDownloadTex} className="text-xs font-bold text-(--brand) hover:text-(--brand-hover) flex items-center gap-1 cursor-pointer" title={t('downloadTexTitle')}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              {t('downloadTex')}
            </button>
          </div>
          {showSearchPanel && (
            <div className="bg-(--surface-secondary) border-t border-(--border) p-2 flex flex-col gap-2 animate-in slide-in-from-top duration-200">
              <div className="flex items-center gap-2">
                <input type="text" placeholder={t('searchPlaceholder')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 bg-(--surface) border border-(--border) rounded px-2 py-1 text-xs outline-none focus:border-indigo-400 font-mono text-(--text-primary)" />
                <input type="text" placeholder={t('replacePlaceholder')} value={replaceQuery} onChange={(e) => setReplaceQuery(e.target.value)} className="flex-1 bg-(--surface) border border-(--border) rounded px-2 py-1 text-xs outline-none focus:border-indigo-400 font-mono text-(--text-primary)" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => handleFindReplace(false)} disabled={!isOwnSection || isLocked} className="bg-(--surface) border border-(--border) hover:bg-(--surface-secondary) text-(--text-secondary) text-xs font-bold px-2 py-1 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-40">{t('replace')}</button>
                <button onClick={() => handleFindReplace(true)} disabled={!isOwnSection || isLocked} className="bg-(--brand) hover:bg-(--brand-hover) text-(--on-brand) text-xs font-bold px-2 py-1 rounded cursor-pointer shadow-sm disabled:cursor-not-allowed disabled:opacity-40">{t('replaceAll')}</button>
              </div>
            </div>
          )}
        </div>
        {currentSection && (
          <div className="shrink-0 flex items-center gap-0 border-b border-(--border) bg-(--surface-secondary)/70 px-3 py-2 font-mono text-xs" title={t('readOnly')}>
            <span className="text-indigo-600">{'\\section{'}</span>
            <span className="min-w-0 truncate font-semibold text-(--text-primary)">{currentSection.sectionTitle}</span>
            <span className="text-indigo-600">{'}'}</span>
            <span className="ml-auto pl-3 text-[9px] font-sans font-bold uppercase tracking-wide text-(--text-tertiary)">{t('readOnly')}</span>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">
          <LatexEditor key={selectedSectionId || 'no-section'} ref={editorRef} content={displayContent} onChange={isOwnSection && !isLocked ? updateCode : undefined} readOnly={!isOwnSection || isLocked} fontSize={textSize} findings={findings} onFindingClick={onFindingClick} onScroll={editorScrollBridge} />
        </div>
      </div>
      <div onMouseDown={onEditorResizeStart} className={`${compact ? 'hidden' : 'flex'} w-1.5 hover:bg-indigo-500 cursor-col-resize self-stretch transition-all shrink-0 z-10 relative group items-center justify-center border-l border-r border-(--border)`} title={t('dragToResize')}>
        <div className="h-6 w-0.5 bg-(--border) group-hover:bg-indigo-500 rounded"></div>
      </div>
      <div style={{ width: `${100 - editorWidth}%`, flexGrow: 0, flexShrink: 0 }} className={`${compact ? 'hidden' : 'flex'} bg-(--surface) rounded-xl shadow-sm border border-(--border) flex-col overflow-hidden`}>
        <div className="h-11 border-b border-(--border-light) flex items-center justify-between px-4 bg-(--surface)">
          <div className="flex items-center gap-2 text-sm font-bold text-(--text-primary)">
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            {t('preview')}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowVisualMap(!showVisualMap)} className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${showVisualMap ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700' : 'hover:bg-(--surface-secondary) text-(--text-primary)'}`} title={t('visualSourceMap') || 'Visual Map of Sources'}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 13a5 5 0 007.54.54l2-2a5 5 0 00-7.07-7.07l-1.15 1.15m2.68 5.38a5 5 0 00-7.54-.54l-2 2a5 5 0 007.07 7.07l1.15-1.15" /></svg>
            </button>
            <button onClick={() => setPreviewZoom(p => Math.min(200, p + 10))} className="text-xs font-bold text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--surface-secondary) px-1.5 py-0.5 rounded transition-colors">+</button>
            <span className="text-xs font-mono text-(--text-primary) min-w-[36px] text-center">{previewZoom}%</span>
            <button onClick={() => setPreviewZoom(p => Math.max(50, p - 10))} className="text-xs font-bold text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--surface-secondary) px-1.5 py-0.5 rounded transition-colors">−</button>
          </div>
        </div>
        <div ref={previewOuterRef} className="flex-1 min-h-0 overflow-auto flex justify-center relative">
          <div style={{ transform: `scale(${previewZoom / 100})`, transformOrigin: 'center top' }}>
            <PreviewPane
              sectionTitle={currentSection?.sectionTitle}
              latex={displayContent}
              mediaAssets={mediaAssets}
              generatedReferences={generatedReferences}
              referencesTitle={currentSection?.sectionTitle || 'References'}
            />
          </div>
          {showVisualMap && (
            <div className="absolute inset-0 z-10 bg-(--surface)/95 backdrop-blur-sm">
              <div className="h-full">
                <VisualSourceMap
                  sources={sources}
                  aiSourceMatches={aiSourceMatches}
                  isDark={document.documentElement.classList.contains('dark')}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
