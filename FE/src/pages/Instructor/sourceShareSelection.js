const SHAREABLE_STATUSES = ['READY', 'COMPLETED'];

export function isSourceShareable(source) {
  return SHAREABLE_STATUSES.includes(source?.processingStatus);
}

export function isSourceSharedWithProject(source, projectId) {
  return (Array.isArray(source?.projectIds) ? source.projectIds : [])
    .some(id => String(id) === String(projectId));
}

export function getBlockedSources(collectionSources, selectedSourceIds) {
  const sources = (Array.isArray(collectionSources) ? collectionSources : [])
    .filter(source => source?.id != null);
  const selected = new Set((Array.isArray(selectedSourceIds) ? selectedSourceIds : []).map(String));
  return sources
    .filter(source => selected.has(String(source.id)) && !isSourceShareable(source))
    .map(source => ({
      id: source.id,
      title: source.title || source.originalFilename || source.id,
      status: source.processingStatus || 'UNKNOWN',
    }));
}

export function getSourceShareChanges(collectionSources, projectId, selectedSourceIds) {
  const sources = (Array.isArray(collectionSources) ? collectionSources : [])
    .filter(source => source?.id != null);
  const selected = new Set((Array.isArray(selectedSourceIds) ? selectedSourceIds : []).map(String));
  const shared = new Set(sources
    .filter(source => isSourceSharedWithProject(source, projectId))
    .map(source => String(source.id)));

  return {
    toShare: sources
      .filter(source => selected.has(String(source.id)) && !shared.has(String(source.id)))
      .map(source => source.id),
    toUnshare: sources
      .filter(source => shared.has(String(source.id)) && !selected.has(String(source.id)))
      .map(source => source.id),
  };
}
