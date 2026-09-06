import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { API_ROUTES } from '../../constants/apiRoutes.js';
import { projectGraph, sourceAuthors } from '../../utils/sourceGraph.js';
import api from '../../services/api.js';
import SourceGraph from './SourceGraph.jsx';
import FileViewerModal from './FileViewerModal.jsx';

export default function VisualSourceMap({ projectId, onClose }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const dialogRef = useRef(null);
  const graphRef = useRef(null);
  const viewerRef = useRef(null);
  const viewerOpener = useRef(null);
  const [request, setRequest] = useState(0);
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [viewerSource, setViewerSource] = useState(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); opener?.focus(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, data: null, error: null });
    setSelectedId(null);
    api.get(API_ROUTES.PROJECTS.SOURCE_MAP(projectId), { signal: controller.signal })
      .then(response => {
        if (!controller.signal.aborted) setState({ loading: false, data: response.data, error: null });
      })
      .catch(error => {
        if (!controller.signal.aborted) setState({ loading: false, data: null,
          error: error.response?.status === 403 ? 'accessDenied' : 'loadError' });
      });
    return () => controller.abort();
  }, [projectId, request]);

  useEffect(() => {
    if (viewerSource) viewerRef.current?.querySelector('button:not(:disabled)')?.focus();
    else viewerOpener.current?.focus();
  }, [viewerSource]);

  const graph = useMemo(() => state.data ? projectGraph(state.data) : null, [state.data]);
  const sources = state.data?.nodes.filter(node => node.type === 'SOURCE') || [];
  const citations = state.data?.edges.filter(edge => edge.type === 'CITES') || [];
  const selected = state.data?.nodes.find(node => node.id === selectedId);
  const selectedSource = selected?.type === 'SOURCE' ? selected : null;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredSources = sources.filter(node =>
    `${node.title || ''} ${node.doi || ''} ${sourceAuthors(node.authors)} ${node.publicationYear || ''}`.toLowerCase().includes(normalizedSearch));
  const buttonClass = 'inline-flex min-h-9 items-center justify-center rounded-lg border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-semibold text-(--text-primary) hover:bg-(--surface-secondary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand) disabled:opacity-40 cursor-pointer';
  const nodeTitle = node => node.title || node.originalFilename || node.doi || t('sourceMap.unnamed');
  const selectSource = nodeId => { setSelectedId(nodeId); graphRef.current?.focus(nodeId); };
  const closeViewer = () => setViewerSource(null);

  const relationList = direction => {
    const related = citations.filter(edge => (direction === 'outgoing' ? edge.sourceId : edge.targetId) === selectedId);
    return <section aria-label={t(`sourceMap.${direction}`)} className="space-y-2">
      <h3 className="text-xs font-bold text-(--text-primary)">{t(`sourceMap.${direction}`)} ({related.length})</h3>
      {related.length === 0 ? <p className="text-xs text-(--text-tertiary)">{t('sourceMap.noRecordedLinks')}</p>
        : <ul className="space-y-1">{related.map(edge => {
          const node = sources.find(source => source.id === (direction === 'outgoing' ? edge.targetId : edge.sourceId));
          return <li key={node.id}><button type="button" onClick={() => selectSource(node.id)}
            className="w-full rounded-lg border border-(--border) bg-(--surface-secondary) px-3 py-2 text-left text-xs text-(--text-primary) hover:border-(--brand) focus-visible:ring-2 focus-visible:ring-(--brand) cursor-pointer">
            {nodeTitle(node)}
          </button></li>;
        })}</ul>}
    </section>;
  };

  return <dialog ref={dialogRef} aria-labelledby="project-source-map-title"
    onCancel={event => { event.preventDefault(); if (viewerSource) closeViewer(); else onClose(); }}
    className="fixed inset-0 m-auto h-[90dvh] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[1440px] overflow-hidden rounded-2xl border border-(--border) bg-(--surface) p-0 font-sans text-(--text-primary) shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm">
    <div inert={Boolean(viewerSource)} className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--border) px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id="project-source-map-title" className="text-sm font-bold">{t('sourceMap.title')}</h2>
          {state.data && <p className="truncate text-xs text-(--text-secondary)">{state.data.project.title}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label={t('close')} className={buttonClass}>✕</button>
      </header>

      {state.loading ? <div role="status" className="flex flex-1 items-center justify-center text-sm text-(--text-secondary)">{t('loading')}</div>
        : state.error ? <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm">{t(`sourceMap.${state.error}`)}</p>
          <button type="button" onClick={() => setRequest(value => value + 1)} className={buttonClass}>{t('sourceMap.retry')}</button>
        </div>
          : state.data && <>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-(--border) px-4 py-3">
              <input type="search" value={search} onChange={event => { setSearch(event.target.value); setSelectedId(null); }}
                aria-label={t('sourceMap.search')} placeholder={t('sourceMap.search')}
                className="min-h-9 min-w-0 flex-1 basis-48 rounded-lg border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-(--brand)" />
              <button type="button" onClick={() => graphRef.current?.zoomBy(1.2)} aria-label={t('sourceMap.zoomIn')} className={buttonClass}>+</button>
              <button type="button" onClick={() => graphRef.current?.zoomBy(1 / 1.2)} aria-label={t('sourceMap.zoomOut')} className={buttonClass}>−</button>
              <button type="button" onClick={() => graphRef.current?.fit()} className={buttonClass}>{t('sourceMap.fit')}</button>
              <button type="button" onClick={() => setRequest(value => value + 1)} className={buttonClass}>{t('sourceMap.reload')}</button>
              <p className="basis-full text-xs text-(--text-secondary)">{t('sourceMap.counts', { sources: sources.length, citations: citations.length })}</p>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
              <div className="relative min-h-[220px] flex-1 overflow-hidden">
                <SourceGraph ref={graphRef} data={graph} isDark={theme === 'dark'} search={search} searchMode="highlight"
                  selectedId={selectedId} onSelect={setSelectedId} id="project-source-map-canvas"
                  label={t('sourceMap.graphLabel')} describedBy="project-source-map-legend" />
                {sources.length === 0 && <p className="pointer-events-none absolute inset-x-4 top-4 rounded-lg bg-(--surface)/95 p-3 text-center text-xs text-(--text-secondary)">{t('sourceMap.empty')}</p>}
              </div>

              <aside aria-label={t('sourceMap.details')} className="max-h-[38dvh] w-full shrink-0 space-y-4 overflow-y-auto border-t border-(--border) bg-(--surface) p-4 md:max-h-none md:w-80 md:border-l md:border-t-0">
                {selectedSource ? <>
                  <button type="button" onClick={() => { setSelectedId(null); setSearch(''); }} className={buttonClass}>{t('sourceMap.allSources')}</button>
                  <h3 className="break-words text-sm font-bold">{nodeTitle(selectedSource)}</h3>
                  <dl className="space-y-2 text-xs">
                    {selectedSource.authors && <div><dt className="font-semibold text-(--text-tertiary)">{t('sourceMap.authors')}</dt><dd>{sourceAuthors(selectedSource.authors)}</dd></div>}
                    {selectedSource.publicationYear && <div><dt className="font-semibold text-(--text-tertiary)">{t('sourceMap.year')}</dt><dd>{selectedSource.publicationYear}</dd></div>}
                    {selectedSource.doi && <div><dt className="font-semibold text-(--text-tertiary)">DOI</dt><dd className="break-all">{selectedSource.doi}</dd></div>}
                    {selectedSource.processingStatus && <div><dt className="font-semibold text-(--text-tertiary)">{t('sourceMap.status')}</dt><dd>{t(`sourceMap.processing.${selectedSource.processingStatus}`, { defaultValue: selectedSource.processingStatus })}</dd></div>}
                  </dl>
                  {selectedSource.fileAvailable ? <button type="button" className={buttonClass} onClick={() => {
                    viewerOpener.current = document.activeElement;
                    setViewerSource(selectedSource);
                  }}>{t('sourceMap.openSource')}</button> : <p className="text-xs text-(--text-tertiary)">{t('sourceMap.fileUnavailable')}</p>}
                  {relationList('outgoing')}
                  {relationList('incoming')}
                </> : <>
                  <h3 className="text-sm font-bold">{state.data.project.title}</h3>
                  <p className="text-xs text-(--text-secondary)">{t('sourceMap.membershipDescription')}</p>
                  {sources.length > 0 && citations.length === 0 && <p className="rounded-lg bg-(--surface-secondary) p-3 text-xs text-(--text-secondary)">{t('sourceMap.noCitations')}</p>}
                </>}

                <section aria-label={t('sources')} className="space-y-2 border-t border-(--border) pt-3">
                  <h3 className="text-xs font-bold">{t('sources')} ({filteredSources.length})</h3>
                  {filteredSources.length === 0 && normalizedSearch && <p className="text-xs text-(--text-tertiary)">{t('sourceMap.noMatches')}</p>}
                  <ul className="space-y-1">{filteredSources.map(node => <li key={node.id}>
                    <button type="button" onClick={() => selectSource(node.id)} aria-pressed={selectedId === node.id}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs focus-visible:ring-2 focus-visible:ring-(--brand) cursor-pointer ${selectedId === node.id ? 'border-(--brand) bg-(--surface-secondary)' : 'border-(--border) hover:bg-(--surface-secondary)'}`}>
                      {nodeTitle(node)}
                    </button>
                  </li>)}</ul>
                </section>
              </aside>
            </div>

            <footer className="shrink-0 space-y-2 border-t border-(--border) bg-(--surface-secondary) px-4 py-3 text-xs text-(--text-secondary)">
              <div id="project-source-map-legend" className="flex flex-wrap items-center gap-x-5 gap-y-1 font-semibold">
                <span><span aria-hidden="true" className="mr-1.5 text-emerald-600">◆</span>{t('sourceMap.project')}</span>
                <span><span aria-hidden="true" className="mr-1.5 text-violet-500">●</span>{t('sourceMap.source')}</span>
                <span><span aria-hidden="true" className="mr-1.5">┄</span>{t('sourceMap.membership')}</span>
                <span><span aria-hidden="true" className="mr-1.5 text-violet-500">→</span>{t('sourceMap.citation')}</span>
              </div>
              <ul className="space-y-1">{state.data.limitations.map(code => <li key={code}>{t(`sourceMap.limitations.${code}`)}</li>)}</ul>
            </footer>
          </>}
    </div>
    {viewerSource && <div ref={viewerRef}>
      <FileViewerModal fileUrl={API_ROUTES.DOCUMENTS.DOWNLOAD(viewerSource.documentId)}
        fileName={viewerSource.originalFilename || nodeTitle(viewerSource)} onClose={closeViewer} />
    </div>}
  </dialog>;
}
