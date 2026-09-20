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

function resolveDetail(node, labels) {
  if (node.citedByCount != null) {
    if (typeof labels === 'function') {
      return labels('instructor.collectionDetail.citedTimes', { count: node.citedByCount });
    }
    const template = labels?.citedTimes || 'Cited {{count}} times';
    return typeof template === 'string' ? template.replace('{{count}}', String(node.citedByCount)) : `Cited ${node.citedByCount} times`;
  }
  if (!node.title && !node.doi) {
    if (typeof labels === 'function') {
      return labels('instructor.collectionDetail.unresolvedReference');
    }
    return labels?.unresolvedReference || 'Unresolved reference';
  }
  if (!node.hasDoi) {
    if (typeof labels === 'function') {
      return labels('instructor.collectionDetail.noCitationData');
    }
    return labels?.noCitationData || 'No DOI — no citation data available';
  }
  return '';
}

export function collectionGraph(data, labels = {}) {
  const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const rawEdges = Array.isArray(data?.edges) ? data.edges : [];
  return {
    nodes: rawNodes.map(node => {
      const display = displayNode(node, !node.title && !node.doi ? 'unresolved' : node.inCollection ? 'source' : 'external');
      const detail = resolveDetail(node, labels);
      return { ...display, tooltip: [display.tooltip, detail].filter(Boolean).join(' · ') };
    }),
    edges: rawEdges.map((edge, index) => ({
      id: `citation:${index}`, kind: 'citation',
      from: String(edge.type === 'CITED_BY' ? edge.targetId : edge.sourceId),
      to: String(edge.type === 'CITED_BY' ? edge.sourceId : edge.targetId),
    })),
  };
}

export function projectGraph(data) {
  const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const rawEdges = Array.isArray(data?.edges) ? data.edges : [];
  return {
    nodes: rawNodes.map(node => displayNode(node, node.type === 'PROJECT' ? 'project' : 'source')),
    edges: rawEdges.map((edge, index) => ({
      id: `relation:${index}`, from: edge.sourceId, to: edge.targetId,
      kind: edge.type === 'PROJECT_SOURCE' ? 'membership' : 'citation',
    })),
  };
}
