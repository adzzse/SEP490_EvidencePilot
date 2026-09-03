export const COLLECTION_DETAIL_TABS = Object.freeze({
  DOCUMENTS: 'documents',
  CONNECTED_MAP: 'connectedMap',
  VISUALIZE_MAP: 'visualizeMap',
});

export const COLLECTION_DETAIL_TAB_KEYS = Object.freeze([
  COLLECTION_DETAIL_TABS.DOCUMENTS,
  COLLECTION_DETAIL_TABS.CONNECTED_MAP,
  COLLECTION_DETAIL_TABS.VISUALIZE_MAP,
]);

export const COLLECTION_DETAIL_TAB_IDS = Object.freeze([
  'documents-tab',
  'connected-map-tab',
  'visualize-map-tab',
]);

export const DOCUMENT_PROCESSING_STATUS = Object.freeze({
  READY: 'READY',
  COMPLETED: 'COMPLETED',
  PROCESSING: 'PROCESSING',
  UPLOADED: 'UPLOADED',
  QUEUED: 'QUEUED',
  FAILED: 'FAILED',
});

export const STATUS_COLOR_MAP = Object.freeze({
  READY: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PROCESSING: 'bg-amber-100 text-amber-700 border-amber-200',
  UPLOADED: 'bg-amber-100 text-amber-700 border-amber-200',
  QUEUED: 'bg-amber-100 text-amber-700 border-amber-200',
  FAILED: 'bg-rose-100 text-rose-700 border-rose-200',
  DEFAULT: 'bg-gray-100 text-gray-500 border-gray-200',
});

export const DEFAULT_GRAPH_SETTINGS = Object.freeze({
  arrows: true,
  showUnresolved: true,
  textFade: 1.1,
  nodeSize: 1,
  linkThickness: 1,
  centerForce: 0.01,
  repelForce: 70,
  linkForce: 0.06,
  linkDistance: 160,
});

export const USER_ROLES = Object.freeze({
  STUDENT: 'STUDENT',
  INSTRUCTOR: 'INSTRUCTOR',
  ADMIN: 'ADMIN',
});

export const CITATION_STANDARDS = Object.freeze([
  'IEEE',
  'ACM',
  'SPRINGER_LNCS',
  'APA',
  'MLA',
  'CUSTOM',
]);

export const DATE_FORMATS = Object.freeze({
  LOCALE_VI: 'vi-VN',
  LOCALE_EN: 'en-US',
  DEFAULT_LOCALE: 'vi-VN',
});

export const NOTIFICATION_HOVER_DEBOUNCE_MS = 300;

export const ACCEPTED_DOCUMENT_EXTENSIONS = '.pdf,.docx,.md,.tex';
