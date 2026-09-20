export const API_ROUTES = Object.freeze({
  COLLECTIONS: Object.freeze({
    BASE: '/api/collections',
    CATEGORIES: '/api/collection-categories',
    BY_ID: (id) => `/api/collections/${id}`,
    SOURCES: (id) => `/api/collections/${id}/sources`,
    SOURCE_BY_ID: (collectionId, sourceId) => `/api/collections/${collectionId}/sources/${sourceId}`,
    LIBRARY_SOURCES: (id) => `/api/collections/${id}/library-sources`,
    CITATION_GRAPH: (id) => `/api/collections/${id}/citation-graph`,
    BATCH_SOURCES: (id) => `/api/collections/${id}/sources/batch`,
    SHARE_SOURCE: (collectionId, sourceId, projectId) =>
      `/api/collections/${collectionId}/sources/${sourceId}/share-to-project/${projectId}`,
  }),
  PROJECTS: Object.freeze({
    BASE: '/api/projects',
    BY_ID: (id) => `/api/projects/${id}`,
    RESTORE: (id) => `/api/projects/${id}/restore`,
    UNASSIGN_ALL: (projectId, userId) => `/api/projects/${projectId}/members/${userId}/unassign-all`,
    SOURCE_MAP: (id) => `/api/projects/${id}/source-map`,
  }),
  PAPERS: Object.freeze({
    REFERENCES: (paperId) => `/api/papers/${paperId}/references`,
    REFERENCE_CHECK: (paperId) => `/api/papers/${paperId}/references/check`,
    REFERENCE_BY_ID: (paperId, sourceId) => `/api/papers/${paperId}/references/${sourceId}`,
  }),
  SOURCES: Object.freeze({
    BASE: '/api/sources',
    BATCH: '/api/sources/batch',
    BY_ID: (id) => `/api/sources/${id}`,
    SHARE_TO_PROJECT: (sourceId, projectId) => `/api/sources/${sourceId}/share-to-project/${projectId}`,
  }),
  DOCUMENTS: Object.freeze({
    BASE: '/api/documents',
    BY_ID: (id) => `/api/documents/${id}`,
    DOWNLOAD: (id) => `/api/documents/${id}/download`,
    INGEST_DOI_BATCH: '/api/documents/ingest/doi/batch',
  }),
});
