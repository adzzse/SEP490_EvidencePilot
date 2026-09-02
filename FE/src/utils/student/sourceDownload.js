export function getSourceDownloadUrl(processingError) {
  const candidate = typeof processingError === 'string'
    ? processingError.match(/https?:\/\/[^\s"'<>]+/)?.[0]?.replace(/[),.;]+$/, '')
    : null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.hostname ? url.href : null;
  } catch {
    return null;
  }
}
