import { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import 'vis-network/styles/vis-network.css';

export default function VisualSourceMap({
  sources = [],
  aiSourceMatches = {},
  isDark = false,
}) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const [networkReady, setNetworkReady] = useState(false);

  // Build nodes and edges from sources and citation matches
  const { nodes, edges } = useMemo(() => {
    const nodeList = [];
    const edgeList = [];

    // Create nodes from sources
    sources.forEach((source, index) => {
      nodeList.push({
        id: source.id,
        label: source.title || source.originalFilename || `Source ${index + 1}`,
        title: source.title || source.originalFilename,
        group: 'source',
        sourceData: source,
        shape: 'dot',
        size: 20,
        color: {
          background: isDark ? '#8b5cf6' : '#7c3aed',
          border: isDark ? '#c4b5fd' : '#5b21b6',
          highlight: { background: '#a78bfa', border: '#7c3aed' },
        },
        font: { color: isDark ? '#f8fafc' : '#1e293b', size: 12 },
      });
    });

    // Create edges from aiSourceMatches (citation connections)
    Object.entries(aiSourceMatches).forEach(([findingIndex, candidates]) => {
      candidates.forEach((candidate, candidateIndex) => {
        if (candidate.documentId || candidate.sourceId) {
          edgeList.push({
            id: `edge-${findingIndex}-${candidateIndex}`,
            from: candidate.documentId || candidate.sourceId,
            to: `finding-${findingIndex}`,
            arrows: 'to',
            color: { color: isDark ? '#64748b' : '#94a3b8' },
            width: 2,
            dashes: false,
          });
        }
      });
    });

    // Add finding nodes
    Object.entries(aiSourceMatches).forEach(([findingIndex, candidates]) => {
      if (candidates.length > 0) {
        nodeList.push({
          id: `finding-${findingIndex}`,
          label: `Finding ${parseInt(findingIndex) + 1}`,
          title: `Citation finding ${parseInt(findingIndex) + 1}`,
          group: 'finding',
          shape: 'box',
          size: 15,
          color: {
            background: isDark ? '#f59e0b' : '#d97706',
            border: isDark ? '#fbbf24' : '#b45309',
            highlight: { background: '#fcd34d', border: '#d97706' },
          },
          font: { color: isDark ? '#1e293b' : '#fff', size: 11 },
        });
      }
    });

    return { nodes: nodeList, edges: edgeList };
  }, [sources, aiSourceMatches, isDark]);

  useEffect(() => {
    if (!containerRef.current || networkRef.current) return;

    const network = new Network(containerRef.current, {
      nodes: new DataSet(nodes),
      edges: new DataSet(edges),
    }, {
      layout: {
        improvedLayout: true,
        hierarchical: false,
      },
      physics: {
        enabled: true,
        barnesHut: {
          gravitationalConstant: -2000,
          centralGravity: 0.3,
          springLength: 150,
          springConstant: 0.04,
          damping: 0.09,
        },
        stabilization: { iterations: 100 },
      },
      interaction: {
        hover: true,
        navigationButtons: true,
        keyboard: true,
        dragNodes: true,
        dragView: true,
        zoomView: true,
      },
      nodes: {
        borderWidth: 2,
        borderWidthSelected: 3,
        chosen: true,
      },
      edges: {
        smooth: { type: 'continuous', roundness: 0.5 },
      },
      groups: {
        source: { shape: 'dot' },
        finding: { shape: 'box' },
      },
    });

    networkRef.current = network;
    setNetworkReady(true);

    // Fit to view after stabilization
    network.once('stabilizationIterationsDone', () => {
      network.fit({ animation: { duration: 500 } });
    });

    return () => {
      network.destroy();
      networkRef.current = null;
      setNetworkReady(false);
    };
  }, []); // Only run once on mount

  // Update data when sources or matches change
  useEffect(() => {
    if (!networkRef.current) return;
    networkRef.current.body.data.nodes.update(nodes);
    networkRef.current.body.data.edges.update(edges);
  }, [nodes, edges]);

  // Update physics/theme when isDark changes
  useEffect(() => {
    if (!networkRef.current) return;
    networkRef.current.setOptions({
      nodes: {
        font: { color: isDark ? '#f8fafc' : '#1e293b' },
      },
      edges: {
        color: { color: isDark ? '#64748b' : '#94a3b8' },
      },
    });
  }, [isDark]);

  const fitGraph = () => {
    if (networkRef.current) {
      networkRef.current.fit({ animation: { duration: 500 } });
    }
  };

  if (sources.length === 0 && Object.keys(aiSourceMatches).length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-(--text-tertiary)">
        <svg className="w-10 h-10 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10 13a5 5 0 007.54.54l2-2a5 5 0 00-7.07-7.07l-1.15 1.15m2.68 5.38a5 5 0 00-7.54-.54l-2 2a5 5 0 007.07 7.07l1.15-1.15" /></svg>
        <p className="text-xs font-semibold">{t('visualMapEmpty') || 'No sources or citations to display'}</p>
        <p className="text-[10px] mt-1">{t('visualMapDesc') || 'Run AI Review to see source connections'}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden" style={{ backgroundColor: isDark ? '#18181b' : '#f8fafc' }}>
      <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full cursor-grab active:cursor-grabbing" />
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <button type="button" onClick={fitGraph} title={t('fitGraph') || 'Fit to view'}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-(--border) bg-(--surface)/90 text-(--text-secondary) shadow-sm backdrop-blur-sm transition-colors hover:bg-(--surface-secondary) hover:text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus)">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-(--border) bg-(--surface)/85 px-3 py-2 text-[10px] font-semibold text-(--text-secondary) shadow-sm backdrop-blur-sm">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2" style={{ background: isDark ? '#8b5cf6' : '#7c3aed', borderColor: isDark ? '#c4b5fd' : '#5b21b6' }} /> {t('sourceLegend') || 'Sources'}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border" style={{ background: isDark ? '#f59e0b' : '#d97706', borderColor: isDark ? '#fbbf24' : '#b45309' }} /> {t('findingLegend') || 'Findings'}</span>
      </div>
    </div>
  );
}