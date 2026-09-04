import { useState, useRef } from 'react';
// ponytail: @hello-pangea/dnd removed — native HTML5 draggable (few lines) covers vertical list reorder.
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
  sectionEvals = {},
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
}) {
  const [configSectionId, setConfigSectionId] = useState(null);
  const draggedIndexRef = useRef(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const anyDirty = JSON.stringify(sections) !== JSON.stringify(draftSections);
  const configSection = displaySections.find(s => String(s.id) === String(configSectionId)) || null;
  const configEval = configSection ? sectionEvals[String(configSection.id)] : null;

  if (!selectedPaper) return <p className="text-xs italic text-[var(--text-tertiary)]">{t.selectPaperSections}</p>;

  if (selectedPaper.processingStatus === 'PROCESSING' || selectedPaper.processingStatus === 'QUEUED') {
    return <p className="text-xs italic text-[var(--text-tertiary)]">{t.processingSections}</p>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3 h-full">
      {conflictSectionId && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 shrink-0" role="alert">{t.sectionConflict}</div>
      )}

      {displaySections.length === 0 ? (
        <p className="text-xs italic text-[var(--text-tertiary)]">{t.noSectionsHelp}</p>
      ) : (
        <div className="space-y-2 pr-1 flex-1 overflow-y-auto min-h-0">
          {displaySections.map((s, index) => (
            <SectionRow
              key={s.id}
              section={s}
              index={index}
              isLocked={sectionStructureLocked}
              isReadOnly={projectReadOnly}
              isSaving={sectionStructureSaving}
              isConflict={String(s.id) === String(conflictSectionId)}
              isEditing={String(s.id) === String(editingSectionId)}
              editingTitle={editingSectionTitle}
              isDragging={draggedIndex === index}
              onDragStart={() => { draggedIndexRef.current = index; setDraggedIndex(index); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = draggedIndexRef.current;
                const to = index;
                draggedIndexRef.current = null;
                setDraggedIndex(null);
                if (from == null || from === to) return;
                onDragEnd({ source: { index: from }, destination: { index: to } });
              }}
              onStartRename={onStartRename}
              onSaveRename={onSaveRename}
              onCancelRename={onCancelRename}
              onEditingChange={onEditingChange}
              onDelete={onDelete}
              onAssign={onAssign}
              onReloadConflict={onReloadConflict}
              onConfigStandard={(sid) => setConfigSectionId(sid)}
              projectMembers={projectMembers}
              users={users}
              t={t}
              ct={ct}
            />
          ))}
        </div>
      )}
      {anyDirty && <p className="mt-1 text-[10px] italic text-amber-700 shrink-0">{t.sectionsUnsaved}</p>}

      <StandardConfigModal
        open={!!configSection}
        section={configSection}
        initialRequirements={configEval?.requirements || []}
        isLocked={sectionStructureLocked}
        onClose={() => setConfigSectionId(null)}
        onSave={async (cfg) => {
          if (await onConfigSave(configSection.id, cfg)) setConfigSectionId(null);
        }}
        t={t}
        ct={ct}
      />
    </div>
  );
}
