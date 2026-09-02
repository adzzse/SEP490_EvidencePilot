import { useState, useEffect } from 'react';
import Modal from '../../ui/Modal.jsx';

export default function StandardConfigModal({ open, section, initialRequirements = [], initialThreshold = 70, isLocked, onSave, onClose, t, ct }) {
  const [requirements, setRequirements] = useState(initialRequirements);
  const [threshold, setThreshold] = useState(initialThreshold);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRequirements(initialRequirements || []);
      setThreshold(initialThreshold ?? 70);
      setInput('');
      setSaving(false);
    }
  }, [open, initialRequirements, initialThreshold]);

  const addReq = () => {
    const trimmed = input.trim();
    if (!trimmed || trimmed.length > 250 || requirements.length >= 15) return;
    if (isLocked) return;
    if (requirements.some(value => value.toLowerCase() === trimmed.toLowerCase())) return;
    setRequirements(prev => [...prev, trimmed]);
    setInput('');
  };
  const removeReq = (idx) => {
    if (isLocked) return;
    setRequirements(prev => prev.filter((_, i) => i !== idx));
  };
  const numericThreshold = Number(threshold);
  const thresholdValid = String(threshold).trim() !== ''
    && Number.isInteger(numericThreshold)
    && numericThreshold >= 0
    && numericThreshold <= 100;
  const handleSave = async () => {
    if (isLocked) { onClose(); return; }
    if (requirements.length === 0 || requirements.length > 15 || !thresholdValid) return;
    setSaving(true);
    try {
      await onSave({ requirements, passThreshold: numericThreshold });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={section ? `${t.configStandard} — ${section.sectionTitle}` : t.configStandard}>
      <div className="space-y-4 text-xs">
        {isLocked && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{t.standardLocked}</div>
        )}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t.standardRequirements} ({requirements.length}/15)</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {requirements.map((rq, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px]">
                {rq}
                {!isLocked && <button type="button" onClick={() => removeReq(idx)} aria-label={`${ct?.delete || 'Delete'}: ${rq}`} className="text-slate-400 hover:text-rose-600">×</button>}
              </span>
            ))}
            {requirements.length === 0 && <span className="text-[11px] italic text-slate-400">{t.noStandardRequirements}</span>}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={input} maxLength={250} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addReq(); }}} disabled={isLocked || saving} placeholder={t.addStandardRequirement} className="flex-1 rounded border border-[var(--border)] px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-50" />
            <button type="button" onClick={addReq} disabled={isLocked || saving || !input.trim() || requirements.length >= 15} className="rounded bg-[var(--brand)] px-3 py-1 font-bold text-white disabled:opacity-50">{ct?.add || 'Add'}</button>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t.standardThreshold}</p>
          <input type="number" min={0} max={100} step={1} value={threshold} onChange={e=>setThreshold(e.target.value)} disabled={isLocked || saving} aria-invalid={!thresholdValid} className="mt-1 w-24 rounded border border-[var(--border)] px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-50" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded bg-slate-100 px-3 py-1.5 font-semibold disabled:opacity-50">{ct?.cancel || 'Cancel'}</button>
          {!isLocked && <button type="button" onClick={handleSave} disabled={saving || requirements.length === 0 || !thresholdValid} className="rounded bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? ct?.saving : ct?.save}</button>}
        </div>
      </div>
    </Modal>
  );
}
