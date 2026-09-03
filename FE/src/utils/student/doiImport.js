export function prepareProjectDoiImport(input, projectId) {
  const seen = new Set();
  const dois = String(input || '')
    .split(/[\n,;]+/)
    .map(doi => doi.trim())
    .filter(doi => {
      const key = doi.toLowerCase();
      if (!doi || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (dois.length === 0) return null;

  return dois.length === 1
    ? {
        dois,
        url: '/api/documents/ingest/doi',
        body: { doi: dois[0], projectId },
      }
    : {
        dois,
        url: '/api/documents/ingest/doi/batch',
        body: { projectId, dois },
      };
}
