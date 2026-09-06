import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { DEFAULT_GRAPH_SETTINGS } from '../../constants/ui.js';

// Both callers supply display nodes and directed edges; API and document access stay in their screens.
export default forwardRef(function SourceGraph({
  data, isDark, settings = DEFAULT_GRAPH_SETTINGS, search = '', searchMode = 'filter',
  selectedId, onSelect, id, label, describedBy,
}, ref) {
  const containerRef = useRef(null);
  const runtimeRef = useRef(null);
  const current = useRef(null);
  current.current = { settings, search, searchMode, selectedId, onSelect };
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useImperativeHandle(ref, () => ({
    fit: () => runtimeRef.current?.network.fit({ animation: reducedMotion ? false : { duration: 250 } }),
    zoomBy: factor => {
      const network = runtimeRef.current?.network;
      if (network) network.moveTo({ scale: Math.max(0.18, Math.min(3, network.getScale() * factor)) });
    },
    focus: nodeId => {
      const network = runtimeRef.current?.network;
      if (network) network.focus(nodeId, { scale: Math.max(network.getScale(), 0.8), animation: reducedMotion ? false : { duration: 250 } });
    },
  }), [reducedMotion]);

  useEffect(() => {
    if (!data?.nodes.length || !containerRef.current) return;
    const palette = isDark ? {
      project: ['#059669', '#a7f3d0', '#10b981', '#d1fae5'],
      source: ['#8b5cf6', '#c4b5fd', '#a78bfa', '#ddd6fe'],
      external: ['#52525b', '#a1a1aa', '#71717a', '#d4d4d8'],
      unresolved: ['#854d0e', '#fbbf24', '#a16207', '#fde68a'],
    } : {
      project: ['#059669', '#064e3b', '#10b981', '#065f46'],
      source: ['#7c3aed', '#5b21b6', '#8b5cf6', '#4c1d95'],
      external: ['#cbd5e1', '#64748b', '#94a3b8', '#475569'],
      unresolved: ['#fef3c7', '#d97706', '#fcd34d', '#b45309'],
    };
    const neighborMap = new Map(data.nodes.map(node => [node.id, new Set()]));
    const inbound = new Map();
    data.edges.forEach(edge => {
      neighborMap.get(edge.from)?.add(edge.to);
      neighborMap.get(edge.to)?.add(edge.from);
      if (edge.kind === 'citation') inbound.set(edge.to, (inbound.get(edge.to) || 0) + 1);
    });
    const baseNodes = data.nodes.map(node => ({
      ...node, primary: node.kind === 'project' || node.kind === 'source',
      size: node.kind === 'project' ? 25 : Math.max(node.kind === 'source' ? 12 : 7,
        Math.min(24, 7 + Math.log2((inbound.get(node.id) || 0) + 1) * 4.5)),
    }));
    const hasProject = baseNodes.some(node => node.kind === 'project');
    const nodes = new DataSet(baseNodes.map((node, index) => {
      const tone = palette[node.kind];
      const tooltip = document.createElement('div');
      tooltip.textContent = node.tooltip; // vis-network string titles are HTML; source metadata must stay text.
      return {
        id: node.id, title: tooltip, label: node.label,
        shape: node.kind === 'project' ? 'diamond' : 'dot',
        ...(hasProject || reducedMotion ? {
          x: node.kind === 'project' ? 0 : Math.cos(index * 2.39996) * (100 + Math.sqrt(index) * 22),
          y: node.kind === 'project' ? 0 : Math.sin(index * 2.39996) * (100 + Math.sqrt(index) * 22),
        } : {}),
        color: { background: tone[0], border: tone[1], highlight: { background: tone[2], border: tone[3] }, hover: { background: tone[2], border: tone[3] } },
        font: { color: isDark ? '#e4e4e7' : '#334155', size: 12, face: 'Inter, system-ui, sans-serif',
          strokeWidth: 3, strokeColor: isDark ? '#18181b' : '#f8fafc', vadjust: 14 },
        size: node.size, borderWidth: node.primary ? 2 : 1, borderWidthSelected: 3,
      };
    }));
    const edges = new DataSet(data.edges.map(edge => ({
      ...edge, dashes: edge.kind === 'membership',
      arrows: { to: { enabled: edge.kind === 'citation', scaleFactor: 0.32 } },
    })));
    const initial = current.current.settings;
    const network = new Network(containerRef.current, { nodes, edges }, {
      layout: { improvedLayout: !hasProject && !reducedMotion, randomSeed: 42 },
      physics: { enabled: !reducedMotion, solver: 'forceAtlas2Based', stabilization: { enabled: false },
        forceAtlas2Based: { gravitationalConstant: -initial.repelForce, centralGravity: initial.centerForce,
          springLength: initial.linkDistance, springConstant: initial.linkForce, damping: 0.72, avoidOverlap: 0.8 } },
      edges: { smooth: { enabled: true, type: 'continuous', roundness: 0.1 }, color: { inherit: false }, hoverWidth: 1.5, selectionWidth: 2 },
      interaction: { dragNodes: true, dragView: true, zoomView: true, hover: true, hoverConnectedEdges: true,
        tooltipDelay: 220, keyboard: { enabled: true, bindToWindow: false } },
    });
    let hoverId = null;
    let focusIds = null;
    let visible = new Set();
    let labelMode = null;

    const refreshLabels = () => {
      const mode = focusIds ? 'focus' : network.getScale() >= current.current.settings.textFade ? 'all' : 'overview';
      if (mode === labelMode) return;
      labelMode = mode;
      nodes.update(baseNodes.map(node => ({
        id: node.id,
        label: visible.has(node.id) && node.kind !== 'unresolved'
          && (focusIds ? focusIds.has(node.id) : mode === 'all' || node.primary || (inbound.get(node.id) || 0) >= 3) ? node.label : '',
      })));
    };
    const refresh = () => {
      const { settings: options, search: query, searchMode: mode, selectedId: selected } = current.current;
      const normalized = query.trim().toLowerCase();
      const matches = new Set(baseNodes.filter(node => node.searchText.includes(normalized)).map(node => node.id));
      visible = new Set(baseNodes.filter(node => (options.showUnresolved || node.kind !== 'unresolved')
        && (mode !== 'filter' || !normalized || matches.has(node.id))).map(node => node.id));
      const focused = hoverId || selected;
      focusIds = focused && visible.has(focused) ? new Set([focused, ...neighborMap.get(focused)])
        : mode === 'highlight' && normalized ? new Set([...matches].flatMap(nodeId => [nodeId, ...neighborMap.get(nodeId)])) : null;
      nodes.update(baseNodes.map(node => ({ id: node.id, hidden: !visible.has(node.id),
        opacity: !focusIds || focusIds.has(node.id) ? 1 : 0.12, size: node.size * options.nodeSize })));
      edges.update(data.edges.map(edge => {
        const active = focusIds && (focused ? edge.from === focused || edge.to === focused : matches.has(edge.from) || matches.has(edge.to));
        const color = edge.kind === 'membership' ? (isDark ? '#71717a' : '#94a3b8') : (isDark ? '#a78bfa' : '#7c3aed');
        return { id: edge.id, hidden: !visible.has(edge.from) || !visible.has(edge.to),
          width: 0.7 * options.linkThickness,
          arrows: { to: { enabled: options.arrows && edge.kind === 'citation', scaleFactor: 0.32 } },
          color: { color, highlight: color, hover: color, opacity: active ? 0.85 : focusIds ? 0.04 : edge.kind === 'membership' ? 0.3 : 0.4 } };
      }));
      network.selectNodes(selected && visible.has(selected) ? [selected] : [], false);
      labelMode = null;
      refreshLabels();
    };
    const applySettings = () => {
      const options = current.current.settings;
      network.setOptions({ physics: { forceAtlas2Based: { gravitationalConstant: -options.repelForce,
        centralGravity: options.centerForce, springLength: options.linkDistance, springConstant: options.linkForce } } });
      refresh();
    };
    runtimeRef.current = { network, refresh, applySettings };
    refresh();
    network.once('stabilized', () => network.fit({ animation: reducedMotion ? false : { duration: 250 } }));
    if (reducedMotion) network.fit({ animation: false });
    network.on('hoverNode', ({ node }) => { hoverId = String(node); refresh(); });
    network.on('blurNode', () => { hoverId = null; refresh(); });
    network.on('dragEnd', () => { hoverId = null; refresh(); });
    network.on('zoom', () => {
      if (network.getScale() < 0.18) network.moveTo({ scale: 0.18 });
      refreshLabels();
    });
    network.on('click', ({ nodes: selected }) => current.current.onSelect?.(selected.length ? String(selected[0]) : null));
    return () => {
      runtimeRef.current = null;
      network.destroy();
    };
  }, [data, isDark, reducedMotion]);

  useEffect(() => { runtimeRef.current?.applySettings(); }, [settings]);
  useEffect(() => { runtimeRef.current?.refresh(); }, [search, searchMode, selectedId]);
  useEffect(() => {
    if (searchMode !== 'highlight' || !search.trim()) return;
    const matches = data.nodes.filter(node => node.searchText.includes(search.trim().toLowerCase())).map(node => node.id);
    if (matches.length) runtimeRef.current?.network.fit({ nodes: matches, maxZoomLevel: 1,
      animation: reducedMotion ? false : { duration: 250 } });
  }, [data, search, searchMode, reducedMotion]);

  return <div ref={containerRef} id={id} role="region" tabIndex={0} aria-label={label} aria-describedby={describedBy}
    className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
    style={{ backgroundColor: isDark ? '#18181b' : '#f8fafc' }} />;
});
