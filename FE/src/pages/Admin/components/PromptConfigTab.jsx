import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminTour } from '../../../hooks/useAdminTour.js';

const MODELS = ['ollama-local', 'remote-gpt', 'remote-gemini'];
const KEYS = ['CITATION_REVIEW', 'CHECK_STANDARD'];

function PromptConfigSection({ api }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ template_key: 'CITATION_REVIEW', version: '', model: MODELS[0], system_text: '' });
  const [validation, setValidation] = useState(null);
  const [defaults, setDefaults] = useState({});
  const [err, setErr] = useState('');
  const [toast, setToast] = useState(null);

  const fetchAll = useCallback(async (signal) => {
    setLoading(true);
    try {
      const r = await api.get('/api/admin/prompts', { signal });
      setItems(r.data || []);
    } catch { /* silent */ }
    finally { if (!signal || !signal.aborted) setLoading(false); }
  }, [api]);

  useEffect(() => {
    const ac = new AbortController();
    fetchAll(ac.signal);
    api.get('/api/admin/prompts/defaults', { signal: ac.signal }).then((r) => setDefaults(r.data || {})).catch(() => {});
    return () => ac.abort();
  }, [fetchAll, api]);

  const tourSteps = useCallback(() => [
    { popover: { title: t('admin.promptConfig'), description: t('admin.guidePromptDesc'), side: 'center' } },
    { element: '[data-guide="prompt-list"]', popover: { title: t('admin.promptVersions'), description: t('admin.guidePromptList'), side: 'right' } },
    { element: '[data-guide="prompt-editor"]', popover: { title: t('admin.promptEditor'), description: t('admin.guidePromptEditor'), side: 'left' } },
    { popover: { title: t('admin.done'), description: t('admin.guidePromptDone'), side: 'center' } },
  ], [t]);
  const { start } = useAdminTour('prompts', tourSteps);

  const save = async (e) => {
    e.preventDefault(); setErr(''); setValidation(null);
    try {
      const r = await api.post('/api/admin/prompts', form);
      setItems((p) => [r.data, ...p]);
      setForm((f) => ({ ...f, version: '', system_text: '' }));
      setToast(t('admin.promptSavedDraft'));
    } catch (e2) { setErr(e2.response?.data?.message || e2.message); }
  };

  const validate = async (id) => {
    try {
      const r = await api.post(`/api/admin/prompts/${id}/validate`);
      setValidation(r.data);
    } catch (e) { setErr(e.response?.data?.message || e.message); }
  };

  const activate = async (id) => {
    try {
      await api.post(`/api/admin/prompts/${id}/activate`);
      fetchAll(new AbortController().signal);
      setToast(t('admin.promptActivated'));
    } catch (e) { setErr(e.response?.data?.message || e.message); }
  };

  return (
    <div className="p-8 space-y-6 bg-(--page-bg)">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-(--border) pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-(--brand-foreground) tracking-tight">{t('admin.promptConfig')}</h1>
          <p className="text-(--text-secondary) text-xs mt-1">{t('admin.promptConfigSub')}</p>
        </div>
        <button onClick={start} className="px-4 py-2 text-xs font-bold text-(--text-secondary) bg-(--surface) border border-(--border) rounded-xl hover:bg-(--surface-secondary) shadow-sm transition">{t('admin.viewGuide')}</button>
      </div>
      {err && <div className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-100 font-semibold">{err}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div data-guide="prompt-list" className="bg-(--surface) rounded-2xl border border-(--border) p-6 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider">{t('admin.promptVersions')}</h3>
          {loading ? <div className="animate-pulse space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 bg-gray-200 rounded" />)}</div>
            : items.length === 0 ? <p className="text-xs text-(--text-tertiary)">{t('admin.noPrompts')}</p>
            : items.map((p) => (
              <div key={p.id} className="border border-(--border) rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{p.template_key} · {p.version}</p>
                  <p className="text-[10px] text-(--text-tertiary) font-mono">{p.model} · {p.createdAt}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.active && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">{t('admin.active')}</span>}
                  <button onClick={() => validate(p.id)} className="px-2 py-1 text-[10px] font-bold border border-(--border) rounded-lg hover:bg-(--surface-secondary)">{t('admin.promptValidate')}</button>
                  {!p.active && <button onClick={() => activate(p.id)} className="px-2 py-1 text-[10px] font-bold bg-[#0c162e] text-white rounded-lg">{t('admin.activate')}</button>}
                </div>
              </div>
            ))}
          {validation && (
            <div className={`text-xs p-2.5 rounded-lg border font-semibold ${validation.valid ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
              {validation.valid ? t('admin.promptValid') : (validation.errors || []).join('; ')}
            </div>
          )}
        </div>
        <form data-guide="prompt-editor" onSubmit={save} className="bg-(--surface) rounded-2xl border border-(--border) p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider">{t('admin.promptEditor')}</h3>
          <div className="flex gap-3">
            <select value={form.template_key} onChange={(e) => setForm((f) => ({ ...f, template_key: e.target.value }))} className="px-3 py-2 border border-(--border) rounded-xl text-xs font-semibold">
              {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <select value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} className="px-3 py-2 border border-(--border) rounded-xl text-xs font-semibold" title={t('admin.promptModelHint')}>
              {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} placeholder="v5" aria-label={t('admin.promptVersions')} maxLength={50} required className="flex-1 px-3 py-2 border border-(--border) rounded-xl text-xs font-mono" />
          </div>
          <textarea value={form.system_text} onChange={(e) => setForm((f) => ({ ...f, system_text: e.target.value }))} rows={18} aria-label={t('admin.promptEditor')} maxLength={48000} required placeholder={defaults[form.template_key] || t('admin.promptSystemPlaceholder')} className="w-full px-3 py-2 border border-(--border) rounded-xl text-xs font-mono whitespace-pre-wrap" />
          <p className="text-[10px] text-(--text-tertiary)">{t('admin.promptModelHint')}</p>
          <div className="flex justify-between items-center">
            <button type="button" onClick={() => setForm((f) => ({ ...f, system_text: defaults[f.template_key] || '' }))} disabled={!defaults[form.template_key]} className="px-3 py-2 text-xs font-bold text-(--text-secondary) border border-(--border) rounded-xl hover:bg-(--surface-secondary) disabled:opacity-40">{t('admin.loadOriginal')}</button>
            <button type="submit" className="px-4 py-2 bg-[#0c162e] text-white rounded-xl text-xs font-bold">{t('admin.saveDraft')}</button>
          </div>
        </form>
      </div>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-xl border bg-(--surface) text-xs font-bold">{toast}</div>}
    </div>
  );
}

export { PromptConfigSection };
