import PreviewPane from '../../features/PreviewPane';
import PaperSectionAssignment from './PaperSectionAssignment.jsx';
import PaperSectionStandards from './PaperSectionStandards.jsx';

export default function PaperSectionEditorPane({
  paper,
  sections,
  selectedSection,
  sectionEvals,
  assignableMembers,
  studentMembers,
  selectedStudentId,
  selectedBulkIds,
  bulkAssignments,
  bulkTouchedIds,
  bulkOpen,
  mode,
  dirty,
  saveNotice,
  standardSection,
  projectReadOnly,
  sectionStructureLocked,
  sectionStructureSaving,
  labels,
  ct,
  closeLabel,
  paperFallback,
  onModeChange,
  onRequestClose,
  onUpdateSection,
  onToggleBulkEditor,
  onToggleBulkSection,
  onUpdateBulkAssignment,
  onApplyBulkAssignment,
  onClearAllAssignments,
  onOpenStandard,
  onCloseStandard,
  onSaveStandard,
  onDiscard,
  onSave,
}) {
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white" aria-label={labels.paperEditor}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{paper?.originalFilename || paper?.title || paperFallback}</p>
          <h1 className="truncate text-lg font-bold text-slate-900">{labels.editPaperSections}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button type="button" onClick={() => onModeChange('edit')} className={`rounded px-2 py-1 text-[10px] font-bold ${mode === 'edit' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{labels.editMode}</button>
            <button type="button" onClick={() => onModeChange('preview')} className={`rounded px-2 py-1 text-[10px] font-bold ${mode === 'preview' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{labels.previewMode}</button>
          </div>
          <button type="button" onClick={onRequestClose} aria-label={labels.closeEditor} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">×</button>
        </div>
      </div>

      {mode === 'preview' ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          {sections.map(section => (
            <div key={section.id} className="mb-8">
              <PreviewPane sectionTitle={section.sectionTitle} latex={section.contentTex || ''} mediaAssets={[]} citationNumbers={{}} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          {!selectedSection ? (
            <p className="py-16 text-center text-sm italic text-slate-400">{labels.noSectionsHelp}</p>
          ) : (
            <div className="mx-auto max-w-4xl space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor="edit-paper-section-title" className="text-[10px] font-black uppercase tracking-wider text-slate-400">{labels.sectionTitle}</label>
                  <input id="edit-paper-section-title" aria-label={labels.sectionTitle} value={selectedSection.sectionTitle || ''} onChange={event => onUpdateSection({ sectionTitle: event.target.value })} readOnly={sectionStructureLocked || projectReadOnly} className="mt-1 w-full border-b-2 border-slate-200 px-0 py-2 text-2xl font-bold text-slate-900 outline-none focus:border-indigo-500 read-only:opacity-60" />
                </div>
              </div>

              <PaperSectionAssignment
                sections={sections}
                selectedSection={selectedSection}
                selectedStudentId={selectedStudentId}
                studentMembers={studentMembers}
                assignableMembers={assignableMembers}
                selectedBulkIds={selectedBulkIds}
                bulkAssignments={bulkAssignments}
                bulkTouchedIds={bulkTouchedIds}
                bulkOpen={bulkOpen}
                projectReadOnly={projectReadOnly}
                sectionStructureSaving={sectionStructureSaving}
                labels={labels}
                ct={ct}
                onUpdateSection={changes => onUpdateSection(changes)}
                onToggleBulkEditor={onToggleBulkEditor}
                onToggleBulkSection={onToggleBulkSection}
                onUpdateBulkAssignment={onUpdateBulkAssignment}
                onApplyBulkAssignment={onApplyBulkAssignment}
                onClearAllAssignments={onClearAllAssignments}
              />

              <PaperSectionStandards
                selectedSection={selectedSection}
                standardSection={standardSection}
                sectionEvals={sectionEvals}
                sectionStructureLocked={sectionStructureLocked}
                projectReadOnly={projectReadOnly}
                labels={{ ...labels, close: closeLabel }}
                ct={ct}
                onOpenStandard={onOpenStandard}
                onCloseStandard={onCloseStandard}
                onSaveStandard={onSaveStandard}
              />

              <label htmlFor="edit-paper-section-content" className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{labels.sectionContent}</label>
              <textarea id="edit-paper-section-content" aria-label={labels.sectionContent} value={selectedSection.contentTex || ''} onChange={event => onUpdateSection({ contentTex: event.target.value })} readOnly={projectReadOnly} rows={20} className="w-full resize-y rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs leading-6 text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 read-only:bg-slate-100 read-only:opacity-70" />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="min-h-5">
          {saveNotice && <p data-testid="paper-save-notice" role="status" className="text-[10px] font-bold text-emerald-600">{labels.changesSaved}</p>}
          {!saveNotice && <p className="text-[10px] italic text-slate-500">{dirty ? labels.sectionsUnsaved : labels.noUnsavedChanges}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDiscard} disabled={!dirty || sectionStructureSaving} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50">{labels.discardChanges}</button>
          <button type="button" onClick={onSave} disabled={!dirty || sectionStructureSaving || projectReadOnly} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{labels.saveChanges}</button>
        </div>
      </div>
    </section>
  );
}
