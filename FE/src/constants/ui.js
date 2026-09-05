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

export const PROJECT_STATUS = Object.freeze({
  CREATED: 'CREATED',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED_FOR_REVIEW: 'SUBMITTED_FOR_REVIEW',
  RETURNED: 'RETURNED',
  APPROVED: 'APPROVED',
  ARCHIVED: 'ARCHIVED',
});

export const PROJECT_STATUSES = Object.freeze([
  PROJECT_STATUS.CREATED,
  PROJECT_STATUS.ASSIGNED,
  PROJECT_STATUS.IN_PROGRESS,
  PROJECT_STATUS.SUBMITTED_FOR_REVIEW,
  PROJECT_STATUS.RETURNED,
  PROJECT_STATUS.APPROVED,
  PROJECT_STATUS.ARCHIVED,
]);

export const DOCUMENT_PROCESSING_STATUS = Object.freeze({
  PENDING_UPLOAD: 'PENDING_UPLOAD',
  UPLOADED: 'UPLOADED',
  METADATA_FETCHED: 'METADATA_FETCHED',
  PDF_DOWNLOADED: 'PDF_DOWNLOADED',
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  RAW_EXTRACTED: 'RAW_EXTRACTED',
  READY: 'READY',
  COMPLETED: 'COMPLETED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
});

export const DOCUMENT_PROCESSING_STATUSES = Object.freeze([
  DOCUMENT_PROCESSING_STATUS.READY,
  DOCUMENT_PROCESSING_STATUS.COMPLETED,
  DOCUMENT_PROCESSING_STATUS.PROCESSING,
  DOCUMENT_PROCESSING_STATUS.QUEUED,
  DOCUMENT_PROCESSING_STATUS.UPLOADED,
  DOCUMENT_PROCESSING_STATUS.PENDING_UPLOAD,
  DOCUMENT_PROCESSING_STATUS.METADATA_FETCHED,
  DOCUMENT_PROCESSING_STATUS.PDF_DOWNLOADED,
  DOCUMENT_PROCESSING_STATUS.RAW_EXTRACTED,
  DOCUMENT_PROCESSING_STATUS.PARTIAL,
  DOCUMENT_PROCESSING_STATUS.FAILED,
]);

export const STATUS_COLOR_MAP = Object.freeze({
  READY: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
  PROCESSING: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  UPLOADED: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  QUEUED: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  PENDING_UPLOAD: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  METADATA_FETCHED: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  PDF_DOWNLOADED: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800',
  RAW_EXTRACTED: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200 dark:border-indigo-800',
  PARTIAL: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  FAILED: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800',
  DEFAULT: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
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

export const NOTIFICATION_HOVER_DEBOUNCE_MS = 1000;

export const ACCEPTED_DOCUMENT_EXTENSIONS = '.pdf,.docx,.md,.tex';
