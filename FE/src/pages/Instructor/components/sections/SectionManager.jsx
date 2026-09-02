import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import { useState } from 'react';
import SectionRow from './SectionRow.jsx';
import StandardConfigModal from './StandardConfigModal.jsx';

export default function SectionManager({
  selectedPaper,
  sections, // server truth
  draftSections, // buffer
  displaySections,
  conflictSectionId,
  sectionStructureLocked,
  projectReadOnly,
  sectionStructureSaving,
  sectionEvals,
  t,
  ct,
  users,
  projectMembers,
  editingSectionId,
  editingSectionTitle,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onEditingChange,
  onDelete,
  onAssign,
  onReloadConflict,
  onDragEnd,
  onConfigSave,
  onEvaluateStandard,
  evaluatingSectionId,
}) {
  const [configSectionId, setConfigSectionId] = useState(null);
  const anyDirty = JSON.stringify(sections) !== JSON.stringify(draftSections);
  const configSection = displaySections.find(s => String(s.id) === String(configSectionId)) || null;
  const configEval = configSection ? sectionEvals[String(configSection.id)] : null;

  if (!selectedPaper) return <p className="text-xs italic text-[var(--text-tertiary)]">{t.selectPaperSections}</p>;

  if (selectedPaper.processingStatus === 'PROCESSING' || selectedPaper.processingStatus === 'QUEUED') {
    return <p className="text-xs italic text-[var(--text-tertiary)]">{t.processingSections}</p>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3 h-full">
      {displaySections.some(section => sectionEvals[String(section.id)]?.status !== 'PASSED') && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{t.standardAttentionRequired}</div>
      )}
      {conflictSectionId && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 shrink-0" role="alert">{t.sectionConflict}</div>
      )}

      {displaySections.length === 0 ? (
        <p className="text-xs italic text-[var(--text-tertiary)]">{t.noSectionsHelp}</p>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="sections">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 pr-1 flex-1 overflow-y-auto min-h-0">
                {displaySections.map((s, index) => (
                  <SectionRow
                    key={s.id}
                    section={s}
                    index={index}
                    isLocked={sectionStructureLocked}
                    isReadOnly={projectReadOnly}
                    isSaving={sectionStructureSaving}
                    isConflict={String(s.id)===String(conflictSectionId)}
                    isEditing={String(s.id)===String(editingSectionId)}
                    editingTitle={editingSectionTitle}
                    onStartRename={onStartRename}
                    onSaveRename={onSaveRename}
                    onCancelRename={onCancelRename}
                    onEditingChange={onEditingChange}
                    onDelete={onDelete}
                    onAssign={onAssign}
                    onReloadConflict={onReloadConflict}
                    evaluation={sectionEvals[String(s.id)]}
                    onConfigStandard={(sid)=> setConfigSectionId(sid)}
                    onEvaluateStandard={onEvaluateStandard}
                    isEvaluating={String(s.id) === String(evaluatingSectionId)}
                    projectMembers={projectMembers}
                    users={users}
                    t={t}
                    ct={ct}
                  />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
      {anyDirty && <p className="mt-1 text-[10px] italic text-amber-700 shrink-0">{t.sectionsUnsaved}</p>}

      <StandardConfigModal
        open={!!configSection}
        section={configSection}
        initialRequirements={configEval?.requirements || []}
        initialThreshold={configEval?.passThreshold ?? 70}
        isLocked={sectionStructureLocked}
        onClose={()=> setConfigSectionId(null)}
        onSave={async (cfg)=> {
          if (await onConfigSave(configSection.id, cfg)) setConfigSectionId(null);
        }}
        t={t}
        ct={ct}
      />
    </div>
  );
}
