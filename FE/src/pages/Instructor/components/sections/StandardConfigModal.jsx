import { useState, useEffect } from 'react';
import { Modal } from '../../../../components';

export default function StandardConfigModal({ open, section, initialRequirements = [], initialThreshold = 70, isLocked, onSave, onClose, t, ct }) {
  const [requirements, setRequirements] = useState(initialRequirements);
  const [threshold, setThreshold] = useState(initialThreshold);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (open) {
      setRequirements(initialRequirements || []);
      setThreshold(initialThreshold ?? 70);
    }
  }, [open, initialRequirements, initialThreshold]);

  const addReq = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (isLocked) return;
    setRequirements(prev => [...prev, trimmed]);
    setInput('');
  };
  const removeReq = (idx) => {
    if (isLocked) return;
    setRequirements(prev => prev.filter((_, i) => i !== idx));
  };
  const handleSave = () => {
    if (isLocked) { onClose(); return; }
    onSave({ requirements, passThreshold: Math.min(100, Math.max(0, Number(threshold) || 0)) });
  };

  return (
    <Modal open={open} onClose={onClose} title={section ? `Config Standard — ${section.sectionTitle}` : 'Config Standard'}>
      <div className="space-y-4 text-xs">
        {isLocked && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Standard is locked while section is assigned — read-only. Unassign every section to edit.</div>
        )}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Requirements</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {requirements.map((rq, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px]">
                {rq}
                {!isLocked && <button onClick={() => removeReq(idx)} className="text-slate-400 hover:text-rose-600">×</button>}
              </span>
            ))}
            {requirements.length === 0 && <span className="text-[11px] italic text-slate-400">No requirements — add one</span>}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addReq(); }}} disabled={isLocked} placeholder="Add requirement and press Enter" className="flex-1 rounded border border-[var(--border)] px-2 py-1 disabled:opacity-50" />
            <button onClick={addReq} disabled={isLocked || !input.trim()} className="rounded bg-[var(--brand)] px-3 py-1 font-bold text-white disabled:opacity-50">Add</button>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Pass threshold %</p>
          <input type="number" min={0} max={100} value={threshold} onChange={e=>setThreshold(e.target.value)} disabled={isLocked} className="mt-1 w-24 rounded border border-[var(--border)] px-2 py-1 disabled:opacity-50" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded bg-slate-100 px-3 py-1.5 font-semibold">{ct?.cancel || 'Cancel'}</button>
          {!isLocked && <button onClick={handleSave} className="rounded bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-700">Save</button>}
        </div>
      </div>
    </Modal>
  );
}
