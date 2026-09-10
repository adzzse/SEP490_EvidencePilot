import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api.js';

// Shared signed-URL fetcher for workspace media assets. Concurrent mounts
// (FilePanel + PreviewPane + editor peek) share one in-flight POST instead of
// each firing their own. URLs are presigned and expiring, so only the
// in-flight request is deduped — never the resolved values.
const inflight = new Map();

function fetchUrls(ids) {
  const key = [...ids].sort().join(',');
  if (!inflight.has(key)) {
    const done = api
      .post('/api/media/urls', { ids })
      .then(r => r.data || {})
      .catch(() => ({}))
      .finally(() => inflight.delete(key));
    inflight.set(key, done);
  }
  return inflight.get(key);
}

export function useMediaUrls(mediaAssets) {
  const [urlsById, setUrlsById] = useState({});
  const idsKey = (mediaAssets || []).map(a => a.id).filter(Boolean).join(',');

  useEffect(() => {
    if (!idsKey) {
      setUrlsById({});
      return undefined;
    }
    let cancelled = false;
    fetchUrls(idsKey.split(',')).then(urls => {
      if (!cancelled) setUrlsById(urls);
    });
    return () => { cancelled = true; };
  }, [idsKey]);

  return urlsById;
}

// texFilename -> signed URL, matching the preview renderer's lookup.
// Identity stays stable across renders unless the resolved URLs change,
// so downstream remark-plugin memos don't rebuild (which would re-parse).
export function useMediaUrlMap(mediaAssets) {
  const urlsById = useMediaUrls(mediaAssets);
  const assetsRef = useRef(mediaAssets);
  assetsRef.current = mediaAssets;
  return useMemo(() => {
    const map = {};
    for (const asset of assetsRef.current || []) {
      const url = urlsById[asset.id];
      if (url) map[asset.texFilename] = url;
    }
    return map;
  }, [urlsById]);
}
