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
  }),
  SOURCES: Object.freeze({
    BASE: '/api/sources',
    BATCH: '/api/sources/batch',
    BY_ID: (id) => `/api/sources/${id}`,
  }),
  DOCUMENTS: Object.freeze({
    BASE: '/api/documents',
    BY_ID: (id) => `/api/documents/${id}`,
    DOWNLOAD: (id) => `/api/documents/${id}/download`,
    INGEST_DOI_BATCH: '/api/documents/ingest/doi/batch',
  }),
});
