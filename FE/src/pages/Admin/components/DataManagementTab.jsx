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
  const [job, setJob] = useState(null);
  const [zipName, setZipName] = useState('');
  const pollRef = useRef(null);
  const pollGenerationRef = useRef(0);
  const logRef = useRef(null);

  const tourSteps = useCallback(() => [
    { popover: { title: t('admin.dataManagement'), description: t('admin.guideDataDesc'), side: 'center' } },
    { element: '[data-guide="backup-btn"]', popover: { title: t('admin.backupData'), description: t('admin.guideDataBackup'), side: 'bottom' } },
    { element: '[data-guide="seed-template"]', popover: { title: t('admin.seedTemplate'), description: t('admin.guideDataTemplate'), side: 'bottom' } },
    { element: '[data-guide="seed-btn"]', popover: { title: t('admin.insertData'), description: t('admin.guideDataSeed'), side: 'bottom' } },
    { popover: { title: t('admin.done'), description: t('admin.guideDataDone'), side: 'center' } },
  ], [t]);
  const { start } = useAdminTour('data', tourSteps);

  useEffect(() => () => {
    pollGenerationRef.current += 1;
    if (pollRef.current) clearTimeout(pollRef.current);
  }, []);
  useEffect(() => {
    if (job?.logs?.length) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [job?.logs?.length]);

  const pollJob = useCallback((jobId) => {
    const generation = ++pollGenerationRef.current;
    if (pollRef.current) clearTimeout(pollRef.current);
    const poll = async () => {
      try {
        const r = await api.get(`/api/admin/seed/jobs/${jobId}`);
        if (generation !== pollGenerationRef.current) return;
        setJob(r.data);
        if (['DONE', 'PARTIAL', 'FAILED'].includes(r.data.status)) {
          pollRef.current = null;
          setBusy(null);
          if (r.data.status === 'DONE') {
            setMsg(t('admin.seedDone', { count: r.data.successfulRows ?? 0 }));
          } else {
            setMsg('');
            setErr(r.data.status === 'PARTIAL'
              ? t('admin.seedPartial', { success: r.data.successfulRows ?? 0, failed: r.data.failedRows ?? 0, skipped: r.data.skippedRows ?? 0 })
              : t('admin.seedFailed'));
          }
          return;
        }
      } catch (e) {
        if (generation !== pollGenerationRef.current) return;
        if ([401, 403, 404].includes(e.response?.status)) {
          pollRef.current = null;
          setBusy(null); setJob(null); setMsg('');
          setErr(e.response.status === 404 ? t('admin.seedJobExpired') : e.response?.data?.message || e.message);
          return;
        }
      }
      pollRef.current = setTimeout(poll, 1000);
    };
    pollRef.current = setTimeout(poll, 1000);
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

  const backupSeedBundle = async () => {
    setBusy('seed-bundle'); setErr(''); setMsg('');
    try {
      const r = await api.get('/api/admin/backup/seed-bundle', { responseType: 'blob', timeout: 600000 });
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url; a.download = `seed-backup-${new Date().toISOString().slice(0, 10)}.zip`;
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

  const uploadFile = async (file) => {
    if (!file) return;
    if (!window.confirm(t('admin.confirmSeedDemo'))) return;
    setBusy('upload'); setErr(''); setMsg(''); setJob({ status: 'QUEUED', processed: 0, total: 1, progress: 0, currentStep: '', errors: [], logs: [] });
    try {
      const fd = new FormData();
      fd.append('file', file);
      // large bundles take minutes to transfer — progress polling starts after 202
      const r = await api.post('/api/admin/seed/upload-zip', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 600000 });
      pollJob(r.data.jobId);
      setMsg(t('admin.seedStarted'));
    } catch (e) {
      setBusy(null);
      setJob(null);
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
      {err && <div role="alert" className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-100 font-semibold">{err}</div>}
      {msg && <div role="status" className="text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-100 font-semibold">{msg}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-(--surface) rounded-2xl border border-(--border) p-6 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider">{t('admin.backupData')}</h3>
          <p className="text-xs text-(--text-secondary)">{t('admin.backupHint')}</p>
          <button data-guide="backup-btn" onClick={backup} disabled={busy === 'backup'} className="px-4 py-2 bg-[#0c162e] text-white rounded-xl text-xs font-bold disabled:opacity-50">
            {busy === 'backup' ? t('admin.working') : t('admin.backupData')}
          </button>
          <p className="text-xs text-(--text-secondary)">{t('admin.backupSeedHint')}</p>
          <button onClick={backupSeedBundle} disabled={busy === 'seed-bundle'} className="px-4 py-2 border border-(--border) rounded-xl text-xs font-bold hover:bg-(--surface-secondary) disabled:opacity-50">
            {busy === 'seed-bundle' ? t('admin.working') : t('admin.backupSeedBundle')}
          </button>
        </div>
        <div className="bg-(--surface) rounded-2xl border border-(--border) p-6 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider">{t('admin.insertData')}</h3>
          <p className="text-xs text-(--text-secondary)">{t('admin.seedHint')}</p>
          <div className="flex flex-wrap gap-2">
            <button data-guide="seed-template" onClick={downloadTemplate} className="px-4 py-2 border border-(--border) rounded-xl text-xs font-bold hover:bg-(--surface-secondary)">{t('admin.seedTemplate')}</button>
          </div>
          <div data-guide="seed-btn" className="space-y-3">
          <span className="block text-[11px] font-bold text-(--text-secondary) uppercase tracking-wider">{t('admin.zipUpload')}</span>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="seed-zip" className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2 text-xs font-bold text-(--text-primary) transition hover:bg-(--surface-tertiary) has-disabled:cursor-not-allowed has-disabled:opacity-50">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              {t('admin.chooseFile')}
              <input id="seed-zip" type="file" accept=".zip" disabled={busy === 'upload'} onChange={(e) => { const file = e.target.files?.[0]; setZipName(file ? file.name : ''); uploadFile(file); e.target.value = ''; }} className="sr-only" />
            </label>
            {zipName && <span className="min-w-0 truncate text-xs text-(--text-secondary)" title={zipName}>{zipName}</span>}
          </div>
          <p className="text-[10px] text-(--text-tertiary)">seed.xlsx + papers/&lt;slug&gt;/&lt;slug&gt;.&#123;pdf,docx,tex&#125; + images/ — {t('admin.zipHint')}</p>
          {job && (job.status === 'RUNNING' || job.status === 'QUEUED') && (
            <div className="space-y-2" aria-live="polite">
              <p className="text-xs font-bold">{t('admin.seeding', { step: job.currentStep || '…', done: job.processed, total: job.total })}</p>
              <ProgressBar value={job.progress || 0} />
            </div>
          )}
          {job && (
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-(--text-secondary)">{t('admin.seedLogs')}</p>
              <div ref={logRef} role="log" aria-live="polite" aria-relevant="additions text" className="min-h-12 max-h-64 overflow-y-auto rounded-xl border border-(--border) bg-(--surface-secondary) p-3 font-mono text-[11px]">
                {job.logs?.map((entry, index) => (
                  <p key={index} className={entry.level === 'ERROR' ? 'text-rose-600' : entry.level === 'WARN' ? 'text-amber-700' : 'text-(--text-secondary)'}>
                    [{entry.level}] {entry.message}
                  </p>
                ))}
              </div>
            </div>
          )}
          {job && ['DONE', 'PARTIAL', 'FAILED'].includes(job.status) && job.result && (
            <div className="text-xs font-mono border border-(--border) rounded-xl p-3">
              {Object.entries(job.result).map(([k, v]) => <p key={k}>{k}: {v}</p>)}
              {!job.logs?.length && job.errors?.length > 0 && (
                <details className="mt-2 text-amber-700">
                  <summary className="cursor-pointer">{t('admin.seedErrors', { count: job.errors.length })}</summary>
                  <ul className="mt-2 space-y-1">{job.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
                </details>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { DataManagementSection };
