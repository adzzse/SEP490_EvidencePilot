const ACTIVE_EXTRACTION_STATES = new Set([
  'PENDING_UPLOAD',
  'UPLOADED',
  'PDF_DOWNLOADED',
  'QUEUED',
  'PROCESSING',
  'RAW_EXTRACTED',
]);

export const hasActiveExtraction = (sources = []) =>
  Array.isArray(sources)
  && sources.some(source => ACTIVE_EXTRACTION_STATES.has(source?.processingStatus));
