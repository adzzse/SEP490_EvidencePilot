import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../../components/ui/Modal.jsx';
import { useAdminTour } from '../../../hooks/useAdminTour.js';

const KEYS = ['CITATION_REVIEW', 'CHECK_STANDARD'];
const CASES = ['SUPPORTED', 'MISSING', 'UNTRUSTED'];
const codePoints = (value) => Array.from(value || '').length;
const errorMessage = (error) => error.response?.data?.message || error.message;

function PromptConfigSection({ api }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [effective, setEffective] = useState([]);
  const [defaults, setDefaults] = useState({});
  const [config, setConfig] = useState(null);
  const [modelDraft, setModelDraft] = useState([]);
  const [key, setKey] = useState(KEYS[0]);
  const [form, setForm] = useState({ version: '', system_text: '' });
  const [openedId, setOpenedId] = useState(null);
  const [editorMode, setEditorMode] = useState('view');
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState(null);
  const [trial, setTrial] = useState(null);
  const [trialCase, setTrialCase] = useState(CASES[0]);
  const [trialChain, setTrialChain] = useState(false);
  const [pending, setPending] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [confirm, setConfirm] = useState(null);
  const requestSeq = useRef(0);
  const validationSeq = useRef(0);
  const trialSeq = useRef(0);
  const keyRef = useRef(KEYS[0]);
  const dirtyRef = useRef(false);
  const lastTrigger = useRef(null);

  const openEffective = useCallback((allEffective, selectedKey) => {
    const current = allEffective.find((value) => value.template_key === selectedKey);
    if (!current) return;
    setForm({ version: current.version, system_text: current.system_text });
    setOpenedId(current.id);
    setEditorMode('view');
    setDirty(false);
    dirtyRef.current = false;
    setValidation(null);
    setTrial(null);
  }, []);

  const fetchAll = useCallback(async (signal, preserveModel = false) => {
    const seq = ++requestSeq.current;
    setLoading(true); setErr('');
    try {
      const [list, originals, active, generation] = await Promise.all([
        api.get('/api/admin/prompts', { signal }),
        api.get('/api/admin/prompts/defaults', { signal }),
        api.get('/api/admin/prompts/effective', { signal }),
        api.get('/api/admin/ai/configuration', { signal }),
      ]);
      if (seq !== requestSeq.current || signal?.aborted) return;
      const nextEffective = active.data || [];
      setItems(list.data || []);
      setDefaults(originals.data || {});
      setEffective(nextEffective);
      setConfig(generation.data);
      if (!preserveModel) setModelDraft(generation.data?.modelIds || []);
      if (!dirtyRef.current) openEffective(nextEffective, keyRef.current);
    } catch (error) {
      if (!signal?.aborted) setErr(errorMessage(error));
    } finally {
      if (seq === requestSeq.current && !signal?.aborted) setLoading(false);
    }
  }, [api, openEffective]);

  useEffect(() => {
    const controller = new AbortController();
    fetchAll(controller.signal);
    return () => controller.abort();
  }, [fetchAll]);

  const invalidateChecks = () => {
    validationSeq.current += 1;
    trialSeq.current += 1;
    setPending((current) => current === 'validate' || current === 'trial' ? '' : current);
    setValidation(null);
    setTrial(null);
  };

  const changeKey = (nextKey) => {
    if (nextKey === key) return;
    if (dirty && !window.confirm(t('admin.aiDiscardDraft'))) return;
    keyRef.current = nextKey;
    setKey(nextKey);
    openEffective(effective, nextKey);
  };

  const openVersion = (prompt) => {
    if (dirty && !window.confirm(t('admin.aiDiscardDraft'))) return;
    setForm({ version: prompt.version, system_text: prompt.system_text });
    setOpenedId(prompt.id);
    setEditorMode('view'); setDirty(false); dirtyRef.current = false; invalidateChecks();
  };

  const cloneVersion = (prompt) => {
    if (dirty && !window.confirm(t('admin.aiDiscardDraft'))) return;
    setForm({ version: '', system_text: prompt.system_text });
    setOpenedId(null);
    setEditorMode('draft'); setDirty(true); dirtyRef.current = true; invalidateChecks();
  };

  const useDefault = () => cloneVersion({ system_text: defaults[key] || '' });

  const updateDraft = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true); dirtyRef.current = true; invalidateChecks();
  };

  const save = async (event) => {
    event.preventDefault();
    if (codePoints(form.system_text) > 8000) return setErr(t('admin.aiPromptTooLong'));
    setPending('save'); setErr(''); setStatus('');
    try {
      const response = await api.post('/api/admin/prompts', {
        template_key: key, version: form.version, system_text: form.system_text,
      });
      setItems((current) => [response.data, ...current]);
      setOpenedId(response.data.id); setEditorMode('view'); setDirty(false); dirtyRef.current = false;
      setStatus(t('admin.promptSavedDraft'));
    } catch (error) { setErr(errorMessage(error)); }
    finally { setPending(''); }
  };

  const validate = async (id = openedId) => {
    if (!id) return;
    const seq = ++validationSeq.current;
    setPending('validate'); setErr(''); setStatus('');
    try {
      const response = await api.post(`/api/admin/prompts/${id}/validate`);
      if (seq === validationSeq.current) {
        setValidation(response.data);
        setStatus(response.data.valid ? t('admin.promptValid') : (response.data.errors || []).join('; '));
      }
    } catch (error) { if (seq === validationSeq.current) setErr(errorMessage(error)); }
    finally { setPending((current) => current === 'validate' ? '' : current); }
  };

  const runTrial = async () => {
    if (editorMode === 'draft' || !config?.catalog || !openedId && form.version !== 'code-default') return;
    const models = trialChain ? modelDraft : modelDraft.slice(0, 1);
    const seq = ++trialSeq.current;
    setPending('trial'); setErr(''); setStatus(''); setTrial(null);
    try {
      const response = await api.post('/api/admin/prompts/try', {
        template_key: key,
        template_id: openedId,
        case_id: trialCase,
        model_ids: models,
        catalog_fingerprint: config.catalog.catalogFingerprint,
      }, { timeout: 70000 });
      if (seq === trialSeq.current) {
        setTrial(response.data);
        setStatus(response.data.expectationMatched ? t('admin.aiTrialMatched') : t('admin.aiTrialMismatch'));
      }
    } catch (error) { if (seq === trialSeq.current) setErr(errorMessage(error)); }
    finally { setPending((current) => current === 'trial' ? '' : current); }
  };

  const updateModel = (index, value) => {
    setModelDraft((current) => {
      const next = [...current]; next[index] = value;
      return next.filter((model, position) => position === 0 || model);
    });
    trialSeq.current += 1; setTrial(null);
  };

  const showConfirm = (value, event) => {
    lastTrigger.current = event.currentTarget;
    setConfirm(value);
  };
  const closeConfirm = () => {
    setConfirm(null);
    requestAnimationFrame(() => lastTrigger.current?.focus());
  };

  const applyModel = async () => {
    setPending('model'); setErr('');
    try {
      await api.put('/api/admin/ai/configuration', {
        expectedRevision: config.revision,
        catalogFingerprint: config.catalog.catalogFingerprint,
        modelIds: modelDraft,
      });
      closeConfirm(); setStatus(t('admin.aiModelApplied'));
      await fetchAll(undefined);
    } catch (error) {
      setErr(errorMessage(error)); closeConfirm();
      if (error.response?.status === 409) await fetchAll(undefined, true);
    } finally { setPending(''); }
  };

  const applyPrompt = async () => {
    const current = effective.find((value) => value.template_key === key);
    setPending('prompt'); setErr('');
    try {
      await api.post(`/api/admin/prompts/${confirm.prompt.id}/activate`, {
        expectedActiveFingerprint: current.fingerprint,
        expectedGenerationFingerprint: config.fingerprint,
      });
      closeConfirm(); setStatus(t('admin.promptActivated'));
      await fetchAll(undefined);
    } catch (error) {
      setErr(errorMessage(error)); closeConfirm();
      if (error.response?.status === 409) await fetchAll(undefined, true);
    } finally { setPending(''); }
  };

  const downloadTrial = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(trial, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `ai-trial-${key}-${trial.caseId}.json`; link.click();
    URL.revokeObjectURL(url);
  };

  const tourSteps = useCallback(() => [
    { popover: { title: t('admin.promptConfig'), description: t('admin.guidePromptDesc'), side: 'center' } },
    { element: '[data-guide="ai-model"]', popover: { title: t('admin.aiModelSelection'), description: t('admin.aiModelScope'), side: 'right' } },
    { element: '[data-guide="prompt-editor"]', popover: { title: t('admin.promptEditor'), description: t('admin.guidePromptEditor'), side: 'left' } },
  ], [t]);
  const { start } = useAdminTour('prompts', tourSteps);

  const currentPrompt = effective.find((value) => value.template_key === key);
  const versions = items.filter((item) => item.template_key === key);
  const catalog = config?.catalog;
  const modelChanged = config && JSON.stringify(modelDraft) !== JSON.stringify(config.modelIds || []);
  const promptCount = codePoints(form.system_text);

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-(--page-bg)">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-(--border) pb-5">
        <div><h1 className="text-2xl sm:text-3xl font-extrabold text-(--brand-foreground)">{t('admin.promptConfig')}</h1><p className="text-(--text-secondary) text-xs mt-1">{t('admin.promptConfigSub')}</p></div>
        <button type="button" onClick={start} className="px-4 py-2 text-xs font-bold border border-(--border) rounded-xl">{t('admin.viewGuide')}</button>
      </header>

      {err && <div role="alert" className="text-xs text-rose-700 bg-rose-50 p-3 rounded-xl border border-rose-200">{err} <button type="button" onClick={() => fetchAll(undefined, true)} className="underline font-bold">{t('admin.aiRetry')}</button></div>}
      {status && <div role="status" className="text-xs text-emerald-700 bg-emerald-50 p-3 rounded-xl border border-emerald-200">{status}</div>}
      {loading && <div role="status" className="text-xs text-(--text-tertiary)">{t('admin.loading')}</div>}

      <section data-guide="ai-model" className="bg-(--surface) rounded-2xl border border-(--border) p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div><h2 className="font-bold">{t('admin.aiModelSelection')}</h2><p className="text-xs text-(--text-secondary)">{t('admin.aiModelScope')}</p></div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${config?.serviceStatus === 'AVAILABLE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{config?.serviceStatus ? t(`admin.aiStatus${config.serviceStatus}`) : t('admin.aiUnavailable')}</span>
        </div>
        {config?.provider && <p className="text-xs">{t('admin.aiProvider')}: <span className="font-mono">{config.provider}</span></p>}
        {config?.persisted && <p className="text-xs">{t('admin.aiSavedSelection')}: <span className="font-mono">{(config.modelIds || []).join(' → ')}</span></p>}
        {!catalog ? <p className="text-xs text-amber-700">{t('admin.aiCatalogUnavailable')}</p> : catalog.allowedModels.length === 1 ? <p className="text-xs font-mono">{catalog.allowedModels[0]}</p> : (
          <div className="grid sm:grid-cols-3 gap-3">
            {[0, 1, 2].map((index) => <label key={index} className="text-xs font-semibold">{index === 0 ? t('admin.aiPrimaryModel') : t('admin.aiFallbackModel', { index })}<select aria-label={index === 0 ? t('admin.aiPrimaryModel') : t('admin.aiFallbackModel', { index })} value={modelDraft[index] || ''} onChange={(event) => updateModel(index, event.target.value)} className="mt-1 w-full px-3 py-2 border border-(--border) rounded-xl bg-(--surface)" required={index === 0}><option value="">{t('admin.aiNoFallback')}</option>{catalog.allowedModels.map((model) => <option key={model} value={model} disabled={modelDraft.some((chosen, chosenIndex) => chosen === model && chosenIndex !== index)}>{model}</option>)}</select></label>)}
          </div>
        )}
        <div className="flex justify-end"><button type="button" disabled={!catalog || !modelChanged || !modelDraft[0] || pending === 'model'} onClick={(event) => showConfirm({ type: 'model' }, event)} className="px-4 py-2 bg-[#0c162e] text-white rounded-xl text-xs font-bold disabled:opacity-40">{t('admin.aiApplyModel')}</button></div>
      </section>

      <div className="grid xl:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.4fr)] gap-6">
        <section data-guide="prompt-list" className="bg-(--surface) rounded-2xl border border-(--border) p-5 space-y-4">
          <label className="text-xs font-bold">{t('admin.aiFunction')}<select aria-label={t('admin.aiFunction')} value={key} onChange={(event) => changeKey(event.target.value)} className="mt-1 w-full px-3 py-2 border border-(--border) rounded-xl bg-(--surface)">{KEYS.map((value) => <option key={value} value={value}>{t(`admin.aiKey${value}`)}</option>)}</select></label>
          {currentPrompt && <div className={`rounded-xl border p-3 text-xs ${currentPrompt.configurationValid ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50'}`}><p className="font-bold">{t('admin.aiEffectivePrompt')}: {currentPrompt.version}</p><p>{currentPrompt.source === 'CODE_DEFAULT' ? t('admin.aiCodeDefault') : t('admin.aiDatabaseVersion')}</p>{!currentPrompt.configurationValid && <p className="text-rose-700">{currentPrompt.configurationErrors.join('; ')}</p>}<div className="mt-2 flex gap-2"><button type="button" onClick={() => openVersion(currentPrompt)} className="underline">{t('admin.aiOpen')}</button><button type="button" onClick={() => cloneVersion(currentPrompt)} className="underline">{t('admin.aiClone')}</button></div></div>}
          <h3 className="text-xs font-bold uppercase tracking-wider">{t('admin.promptVersions')}</h3>
          {versions.length === 0 ? <p className="text-xs text-(--text-tertiary)">{t('admin.noPrompts')}</p> : versions.map((prompt) => <div key={prompt.id} className="border border-(--border) rounded-xl p-3 text-xs"><div className="flex justify-between gap-2"><button type="button" onClick={() => openVersion(prompt)} className="font-bold text-left hover:underline">{prompt.version}</button>{prompt.active && <span className="text-emerald-700 font-bold">{t('admin.active')}</span>}</div><p className="text-[10px] text-(--text-tertiary)">{prompt.createdAt}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => cloneVersion(prompt)} className="underline">{t('admin.aiClone')}</button><button type="button" onClick={() => validate(prompt.id)} className="underline">{t('admin.promptValidate')}</button>{!prompt.active && <button type="button" onClick={(event) => showConfirm({ type: 'prompt', prompt }, event)} className="font-bold underline">{t('admin.activate')}</button>}</div></div>)}
        </section>

        <section data-guide="prompt-editor" className="space-y-4">
          <form onSubmit={save} className="bg-(--surface) rounded-2xl border border-(--border) p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{t('admin.promptEditor')}</h2><span className="text-[10px] font-mono">{promptCount}/8000</span></div>
            {editorMode === 'view' ? <div className="flex gap-2"><button type="button" onClick={() => cloneVersion({ system_text: form.system_text })} className="px-3 py-2 text-xs font-bold border border-(--border) rounded-xl">{t('admin.aiClone')}</button><button type="button" onClick={useDefault} className="px-3 py-2 text-xs font-bold border border-(--border) rounded-xl">{t('admin.aiUseDefault')}</button></div> : null}
            <label className="block text-xs font-semibold">{t('admin.aiVersion')}<input value={form.version} onChange={(event) => updateDraft('version', event.target.value)} readOnly={editorMode === 'view'} maxLength={50} required className="mt-1 w-full px-3 py-2 border border-(--border) rounded-xl bg-(--surface)" /></label>
            <label className="block text-xs font-semibold">{t('admin.aiPromptContent')}<textarea value={form.system_text} onChange={(event) => updateDraft('system_text', event.target.value)} readOnly={editorMode === 'view'} rows={18} required className={`mt-1 w-full px-3 py-2 border rounded-xl text-xs font-mono bg-(--surface) ${promptCount > 8000 ? 'border-rose-500' : 'border-(--border)'}`} /></label>
            {editorMode === 'draft' && <div className="flex justify-between gap-3"><button type="button" onClick={useDefault} className="px-3 py-2 text-xs font-bold border border-(--border) rounded-xl">{t('admin.aiUseDefault')}</button><button type="submit" disabled={pending === 'save' || promptCount > 8000} className="px-4 py-2 bg-[#0c162e] text-white rounded-xl text-xs font-bold disabled:opacity-40">{pending === 'save' ? t('admin.working') : t('admin.saveDraft')}</button></div>}
          </form>

          <section className="bg-(--surface) rounded-2xl border border-(--border) p-5 sm:p-6 space-y-4">
            <h2 className="font-bold">{t('admin.aiValidateAndTrial')}</h2>
            <div className="grid sm:grid-cols-2 gap-3"><label className="text-xs font-semibold">{t('admin.aiTrialCase')}<select value={trialCase} onChange={(event) => { setTrialCase(event.target.value); invalidateChecks(); }} className="mt-1 w-full px-3 py-2 border border-(--border) rounded-xl bg-(--surface)">{CASES.map((value) => <option key={value} value={value}>{t(`admin.aiCase${value}`)}</option>)}</select></label><label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={trialChain} onChange={(event) => { setTrialChain(event.target.checked); invalidateChecks(); }} />{t('admin.aiTrialWholeChain')}</label></div>
            <div className="flex flex-wrap gap-2"><button type="button" disabled={!openedId || pending === 'validate'} onClick={() => validate()} className="px-3 py-2 text-xs font-bold border border-(--border) rounded-xl disabled:opacity-40">{t('admin.promptValidate')}</button><button type="button" disabled={editorMode === 'draft' || !catalog || !modelDraft[0] || pending === 'trial'} onClick={runTrial} className="px-3 py-2 text-xs font-bold bg-[#0c162e] text-white rounded-xl disabled:opacity-40">{pending === 'trial' ? t('admin.working') : t('admin.aiRunTrial')}</button>{trial && <button type="button" onClick={downloadTrial} className="px-3 py-2 text-xs font-bold border border-(--border) rounded-xl">{t('admin.aiDownloadTrial')}</button>}</div>
            {validation && <p className="text-xs">{validation.valid ? t('admin.promptValid') : validation.errors.join('; ')}</p>}
            {trial && <div className="rounded-xl bg-(--surface-secondary) p-3 text-xs space-y-1"><p><b>{t('admin.aiExpectedActual')}:</b> {trial.caseId} · {trial.expectationMatched ? t('admin.aiMatched') : t('admin.aiMismatch')}</p><p><b>{t('admin.aiActualModel')}:</b> {trial.model}</p><p><b>{t('admin.aiDuration')}:</b> {trial.durationMs} ms</p><p className="font-mono break-all">{trial.promptFingerprint} · {trial.generationFingerprint}</p></div>}
          </section>
        </section>
      </div>

      <Modal open={Boolean(confirm)} onClose={closeConfirm} title={t('admin.aiConfirmApply')} closeLabel={t('close')}>
        {confirm?.type === 'model' ? <div className="space-y-4 text-sm"><p>{t('admin.aiModelScope')}</p><p className="font-mono">{(config?.modelIds || []).join(' → ')}<br />↓<br />{modelDraft.join(' → ')}</p><button type="button" disabled={pending === 'model'} onClick={applyModel} className="w-full px-4 py-2 bg-[#0c162e] text-white rounded-xl font-bold">{t('admin.aiApplyModel')}</button></div> : confirm?.prompt && <div className="space-y-4 text-sm"><p>{t('admin.aiPromptApplySummary', { before: currentPrompt?.version, after: confirm.prompt.version })}</p>{!trial && <p className="text-amber-700">{t('admin.aiNotTrialed')}</p>}<button type="button" disabled={pending === 'prompt'} onClick={applyPrompt} className="w-full px-4 py-2 bg-[#0c162e] text-white rounded-xl font-bold">{t('admin.activate')}</button></div>}
      </Modal>
    </div>
  );
}

export { PromptConfigSection };
