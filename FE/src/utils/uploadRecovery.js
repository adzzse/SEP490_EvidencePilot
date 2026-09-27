import { getWithRetry } from './aiJobPolling.js';

function uploadStorage(key, value, write) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('evidence-pilot-uploads', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('uploads');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('uploads', write ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('uploads');
      const operation = write ? (value === null ? store.delete(key) : store.put(value, key)) : store.get(key);
      transaction.oncomplete = () => { db.close(); resolve(operation.result ?? null); };
      transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  });
}

export const readUpload = key => key ? uploadStorage(key, null, false) : Promise.resolve(null);
export const writeUpload = (key, value) => uploadStorage(key, value, true);

export async function listUploadDocuments(api, url) {
  const documents = [];
  for (let page = 0; ; page += 1) {
    const { data } = await getWithRetry(api, url, null, { params: { page, size: 100 } });
    documents.push(...(Array.isArray(data) ? data : data?.content || []));
    if (Array.isArray(data) || data?.last !== false) return documents;
  }
}

export async function prepareUpload(api, url, files) {
  const documents = await listUploadDocuments(api, url);
  const entries = await Promise.all(files.map(async file => {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return { file, hash };
  }));
  return { entries, baselineIds: documents.map(doc => String(doc.id)), status: 'interrupted', failed: [] };
}

export function reconcileFiles(record, documents) {
  const candidates = documents.filter(doc => !record.baselineIds.includes(String(doc.id)));
  const accepted = [];
  const entries = record.entries.filter(entry => {
    const index = candidates.findIndex(doc => doc.fileHashSha256 === entry.hash);
    if (index < 0) return true;
    accepted.push(...candidates.splice(index, 1));
    return false;
  });
  const pending = entries.some(({ file }) => candidates.some(doc => doc.processingStatus === 'PENDING_UPLOAD'
    && doc.originalFilename === file.name && Number(doc.fileSizeBytes) === file.size));
  return { ...record, entries, accepted, pending };
}
