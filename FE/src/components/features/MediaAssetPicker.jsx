import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api.js';
import { useMediaUrls } from '../../hooks/useMediaUrls.js';
import Modal from '../ui/Modal.jsx';

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_COUNT = 5;

// Library picker for feedback attachments. Links existing project media by id
// (the backend clones bytes server-side into a feedback-owned key); nothing is
// uploaded here. Copy arrives via `labels` (already translated by the caller)
// because the locale catalog test only permits literal t() keys.
export default function MediaAssetPicker({ projectId, labels, value = [], onChange, disabled }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState([]);
  const urlsById = useMediaUrls(assets);
  const selectedIds = useMemo(() => new Set(value.map(entry => String(entry.id))), [value]);

  useEffect(() => {
    if (!open || !projectId) return undefined;
    let cancelled = false;
    setLoading(true);
    api.get(`/api/media/projects/${projectId}`)
      .then(response => {
        if (cancelled) return;
        setAssets((response.data || []).filter(asset => IMAGE_MIMES.has(asset.mimeType)));
        setPicked(value.map(entry => String(entry.id)));
      })
      .catch(() => { if (!cancelled) setAssets([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const toggle = id => {
    setPicked(previous => (previous.includes(id)
      ? previous.filter(entry => entry !== id)
      : previous.length >= MAX_COUNT ? previous : [...previous, id]));
  };

  const confirm = () => {
    onChange(picked.map(id => {
      const asset = assets.find(entry => String(entry.id) === String(id));
      return { id, texFilename: asset?.texFilename || String(id), url: urlsById[id] || null };
    }));
    setOpen(false);
  };

  const remove = id => onChange(value.filter(entry => String(entry.id) !== String(id)));

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(entry => (
            <span key={entry.id} className="relative shrink-0" title={entry.texFilename}>
              {entry.url
                ? <img src={entry.url} alt={entry.texFilename} className="h-14 w-14 rounded-lg border border-(--border) object-cover" />
                : <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-(--border) bg-(--surface-secondary) px-1 text-center text-[8px] font-bold text-(--text-secondary)">{entry.texFilename}</span>}
              <button
                type="button"
                onClick={() => remove(entry.id)}
                disabled={disabled}
                aria-label={t('delete')}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="rounded-lg border border-(--border) bg-(--surface) px-2.5 py-1.5 text-[10px] font-bold text-(--text-secondary) disabled:opacity-50"
      >
        {labels.selectMedia}{value.length > 0 ? ` (${value.length})` : ''}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={labels.title} wide>
        <div className="space-y-3 p-1 text-xs">
          {loading && <p role="status" className="py-4 text-center text-(--text-secondary)">{t('loading')}</p>}
          {!loading && assets.length === 0 && (
            <p className="py-4 text-center italic text-(--text-tertiary)">{labels.empty}</p>
          )}
          {!loading && assets.length > 0 && (
            <ul className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {assets.map(asset => {
                const active = picked.includes(String(asset.id));
                const url = urlsById[asset.id];
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      onClick={() => toggle(String(asset.id))}
                      aria-pressed={active}
                      title={asset.texFilename}
                      className={`relative block w-full overflow-hidden rounded-lg border-2 transition-colors ${active ? 'border-teal-600 ring-1 ring-teal-600' : 'border-(--border)'}`}
                    >
                      {url
                        ? <img src={url} alt={asset.texFilename} loading="lazy" className="aspect-square w-full object-cover" />
                        : <span className="flex aspect-square w-full items-center justify-center bg-(--surface-secondary) p-1 text-center text-[9px] font-bold text-(--text-secondary)">{asset.texFilename}</span>}
                      {active && (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-[10px] font-black text-white">✓</span>
                      )}
                    </button>
                    <p className="mt-1 truncate text-center text-[9px] text-(--text-secondary)">{asset.texFilename}</p>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={confirm}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-[11px] font-black text-white hover:bg-indigo-700"
            >
              {labels.done}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
