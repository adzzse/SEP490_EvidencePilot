export function sourceAuthors(authors) {
  if (!authors) return '';
  try {
    const parsed = JSON.parse(authors);
    if (Array.isArray(parsed)) return parsed.filter(name => typeof name === 'string').join(', ');
  } catch { /* Uploaded source metadata can contain plain author text. */ }
  return String(authors);
}

function displayNode(node, kind) {
  const title = node.title || node.originalFilename || node.doi || '';
  const authors = sourceAuthors(node.authors);
  const firstAuthor = authors.split(',')[0]?.trim().split(' ')[0];
  const label = kind === 'project' ? title
    : firstAuthor ? `${firstAuthor}${node.publicationYear ? `, ${node.publicationYear}` : ''}` : title;
  return {
    id: String(node.id), kind,
    label: label.length > 26 ? label.slice(0, 24) + '…' : label,
    tooltip: [title, authors, node.publicationYear, node.doi].filter(Boolean).join(' · '),
    searchText: `${title} ${authors} ${node.publicationYear || ''} ${node.doi || ''}`.toLowerCase(),
  };
}

export function collectionGraph(data, labels) {
  return {
    nodes: data.nodes.map(node => {
      const display = displayNode(node, !node.title && !node.doi ? 'unresolved' : node.inCollection ? 'source' : 'external');
      const detail = node.citedByCount != null ? labels.citedTimes.replace('{{count}}', node.citedByCount)
        : !node.title && !node.doi ? labels.unresolvedReference : !node.hasDoi ? labels.noCitationData : '';
      return { ...display, tooltip: [display.tooltip, detail].filter(Boolean).join(' · ') };
    }),
    edges: data.edges.map((edge, index) => ({
      id: `citation:${index}`, kind: 'citation',
      from: String(edge.type === 'CITED_BY' ? edge.targetId : edge.sourceId),
      to: String(edge.type === 'CITED_BY' ? edge.sourceId : edge.targetId),
    })),
  };
}

export function projectGraph(data) {
  return {
    nodes: data.nodes.map(node => displayNode(node, node.type === 'PROJECT' ? 'project' : 'source')),
    edges: data.edges.map((edge, index) => ({
      id: `relation:${index}`, from: edge.sourceId, to: edge.targetId,
      kind: edge.type === 'PROJECT_SOURCE' ? 'membership' : 'citation',
    })),
  };
}
