import { StandardConfigEditor } from './StandardConfigModal.jsx';

export default function PaperSectionStandards({
  selectedSection,
  standardSection,
  sectionEvals,
  sectionStructureLocked,
  projectReadOnly,
  labels,
  ct,
  onOpenStandard,
  onCloseStandard,
  onSaveStandard,
}) {
  return (
    <div data-testid="standards-block" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div data-testid="standards-label" className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{labels.standards}</div>
        <button type="button" onClick={() => onOpenStandard(selectedSection.id)} disabled={sectionStructureLocked || projectReadOnly} className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{labels.configStandard}</button>
      </div>
      <div data-testid="standards-requirements" className="space-y-1">
        {sectionEvals[String(selectedSection.id)]?.requirements?.length ? (
          sectionEvals[String(selectedSection.id)].requirements.map((requirement, index) => (
            <div key={`${requirement}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">{requirement}</div>
          ))
        ) : (
          <p className="text-xs italic text-slate-400">{labels.noStandardRequirements}</p>
        )}
      </div>

      {standardSection && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-indigo-900">{labels.configStandard} - {standardSection.sectionTitle}</h3>
            <button type="button" onClick={onCloseStandard} className="rounded px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-white">{labels.close}</button>
          </div>
          <StandardConfigEditor
            open
            initialRequirements={sectionEvals[String(standardSection.id)]?.requirements || []}
            isLocked={sectionStructureLocked || projectReadOnly}
            onSave={async config => {
              const saved = await onSaveStandard(standardSection.id, config);
              if (saved) onCloseStandard();
            }}
            onClose={onCloseStandard}
            t={labels}
            ct={ct}
          />
        </div>
      )}
    </div>
  );
}
