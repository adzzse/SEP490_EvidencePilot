import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminTour } from '../../../hooks/useAdminTour.js';

function ProgressBar({ value }) {
  return (
    <div className="w-full h-2.5 bg-(--surface-secondary) border border-(--border) rounded-full overflow-hidden">
      <div className="h-full bg-emerald-600 transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function DataManagementSection({ api }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState(null);
  const [job, setJob] = useState(null);
  const pollRef = useRef(null);

  const tourSteps = useCallback(() => [
    { popover: { title: t('admin.dataManagement'), description: t('admin.guideDataDesc'), side: 'center' } },
    { element: '[data-guide="backup-btn"]', popover: { title: t('admin.backupData'), description: t('admin.guideDataBackup'), side: 'bottom' } },
    { element: '[data-guide="seed-template"]', popover: { title: t('admin.seedTemplate'), description: t('admin.guideDataTemplate'), side: 'bottom' } },
    { element: '[data-guide="seed-btn"]', popover: { title: t('admin.insertData'), description: t('admin.guideDataSeed'), side: 'bottom' } },
    { popover: { title: t('admin.done'), description: t('admin.guideDataDone'), side: 'center' } },
  ], [t]);
  const { start } = useAdminTour('data', tourSteps);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const pollJob = useCallback((jobId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await api.get(`/api/admin/seed/jobs/${jobId}`);
        setJob(r.data);
        if (r.data.status === 'DONE' || r.data.status === 'FAILED') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(null);
          if (r.data.status === 'DONE') {
            const res = r.data.result || {};
            const total = Object.values(res).reduce((a, b) => a + (b || 0), 0);
            setMsg(t('admin.seedDone', { count: total }));
          } else {
            setErr((r.data.errors || []).slice(0, 5).join('; ') || t('admin.seedFailed'));
          }
        }
      } catch (e) { /* keep polling */ }
    }, 1000);
  }, [api, t]);

  const backup = async () => {
    setBusy('backup'); setErr(''); setMsg('');
    try {
      const r = await api.get('/api/admin/backup/csv', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = `backup-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
      setMsg(t('admin.backupDone'));
    } catch (e) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(null); }
  };

  const downloadTemplate = async () => {
    setErr(''); setMsg('');
    try {
      const r = await api.get('/api/admin/seed/template', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'seed-template-bundle.zip';
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { setErr(e.response?.data?.message || e.message); }
  };

  const previewFile = async (file, isZip) => {
    if (!file) return;
    setBusy('preview'); setErr(''); setMsg(''); setPreview(null);
    try {
      if (isZip) {
        setMsg(t('admin.zipNoPreview'));
        return;
      }
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/api/admin/seed/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(r.data);
      if (!r.data.valid) setErr((r.data.errors || []).slice(0, 8).join('; '));
    } catch (e) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(null); }
  };

  const uploadFile = async (file, isZip) => {
    if (!file) return;
    if (!window.confirm(t('admin.confirmSeedDemo'))) return;
    setBusy('upload'); setErr(''); setMsg(''); setJob({ status: 'QUEUED', processed: 0, total: 1, progress: 0, currentStep: '', errors: [] });
    try {
      const fd = new FormData();
      fd.append('file', file);
      const endpoint = isZip ? '/api/admin/seed/upload-zip' : '/api/admin/seed/upload';
      // large bundles take minutes to transfer — progress polling starts after 202
      const r = await api.post(endpoint, fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 600000 });
      pollJob(r.data.jobId);
      setMsg(t('admin.seedStarted'));
    } catch (e) {
      setBusy(null);
      setErr(e.response?.data?.errors?.join('; ') || e.response?.data?.message || e.message);
    }
  };

  return (
    <div className="p-8 space-y-6 bg-(--page-bg)">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-(--border) pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-(--brand-foreground) tracking-tight">{t('admin.dataManagement')}</h1>
          <p className="text-(--text-secondary) text-xs mt-1">{t('admin.dataManagementSub')}</p>
        </div>
        <button onClick={start} className="px-4 py-2 text-xs font-bold text-(--text-secondary) bg-(--surface) border border-(--border) rounded-xl hover:bg-(--surface-secondary) shadow-sm transition">{t('admin.viewGuide')}</button>
      </div>
      {err && <div className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-100 font-semibold">{err}</div>}
      {msg && <div className="text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-100 font-semibold">{msg}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-(--surface) rounded-2xl border border-(--border) p-6 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider">{t('admin.backupData')}</h3>
          <p className="text-xs text-(--text-secondary)">{t('admin.backupHint')}</p>
          <button data-guide="backup-btn" onClick={backup} disabled={busy === 'backup'} className="px-4 py-2 bg-[#0c162e] text-white rounded-xl text-xs font-bold disabled:opacity-50">
            {busy === 'backup' ? t('admin.working') : t('admin.backupData')}
          </button>
        </div>
        <div className="bg-(--surface) rounded-2xl border border-(--border) p-6 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider">{t('admin.insertData')}</h3>
          <p className="text-xs text-(--text-secondary)">{t('admin.seedHint')}</p>
          <div className="flex flex-wrap gap-2">
            <button data-guide="seed-template" onClick={downloadTemplate} className="px-4 py-2 border border-(--border) rounded-xl text-xs font-bold hover:bg-(--surface-secondary)">{t('admin.seedTemplate')}</button>
          </div>
          <div data-guide="seed-btn" className="space-y-3">
          <label className="block text-[11px] font-bold text-(--text-secondary) uppercase tracking-wider">{t('admin.excelUpload')}</label>
          <input type="file" accept=".xlsx" disabled={busy === 'upload' || busy === 'preview'} onChange={(e) => previewFile(e.target.files?.[0], false)} className="text-xs" />
          <label className="block text-[11px] font-bold text-(--text-secondary) uppercase tracking-wider">{t('admin.zipUpload')}</label>
          <input type="file" accept=".zip" disabled={busy === 'upload' || busy === 'preview'} onChange={(e) => uploadFile(e.target.files?.[0], true)} className="text-xs" />
          <p className="text-[10px] text-(--text-tertiary)">seed.xlsx + papers/&lt;slug&gt;/&lt;slug&gt;.&#123;pdf,docx,tex&#125; + images/ — {t('admin.zipHint')}</p>
          {preview && (
            <div className="text-xs border border-(--border) rounded-xl p-3 space-y-1">
              <p className="font-bold">{preview.valid ? t('admin.previewPass') : t('admin.previewFail')}</p>
              {Object.entries(preview.rows || {}).map(([k, v]) => <p key={k} className="font-mono">{k}: {v}</p>)}
              {preview.invitations && (
                <p className="font-mono text-amber-600">{t('admin.previewInvitations', { invite: preview.invitations.willInvite ?? 0, silent: preview.invitations.silentActive ?? 0 })}</p>
              )}
              {preview.uniqueDois != null && (
                <p className="font-mono text-sky-600">{t('admin.previewDois', { count: preview.uniqueDois })}</p>
              )}
              {(preview.errors || []).slice(0, 8).map((e, i) => <p key={i} className="text-rose-600">{e}</p>)}
              {preview.valid && (
                <button onClick={(e) => uploadFile(document.querySelector('input[type=file]')?.files?.[0], false)} className="px-3 py-1.5 bg-[#0c162e] text-white rounded-lg text-[11px] font-bold">{t('admin.confirmInsert')}</button>
              )}
            </div>
          )}
          {job && (job.status === 'RUNNING' || job.status === 'QUEUED') && (
            <div className="space-y-2" aria-live="polite">
              <p className="text-xs font-bold">{t('admin.seeding', { step: job.currentStep || '…', done: job.processed, total: job.total })}</p>
              <ProgressBar value={job.progress || 0} />
            </div>
          )}
          {job && job.status === 'DONE' && job.result && (
            <div className="text-xs font-mono border border-(--border) rounded-xl p-3">
              {Object.entries(job.result).map(([k, v]) => <p key={k}>{k}: {v}</p>)}
              {(job.errors || []).slice(0, 5).map((e, i) => <p key={i} className="text-amber-600">{e}</p>)}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { DataManagementSection };
