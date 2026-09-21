import { useRef } from 'react';
import DeleteConfirm from '../../ui/DeleteConfirm.jsx';
import { studentDisplayName } from '../../../utils/instructor/studentSearch.js';

export default function PaperSectionSidebar({
  paper,
  sections,
  selectedSection,
  sectionEvals,
  projectMembers,
  selectedBulkIds,
  renameSectionId,
  renameTitle,
  paperRenameOpen,
  paperRenameTitle,
  projectReadOnly,
  sectionStructureLocked,
  sectionStructureSaving,
  conflictSectionId,
  labels,
  ct,
  paperFallback,
  untitledLabel,
  onPaperRenameTitleChange,
  onSavePaperRename,
  onCancelPaperRename,
  onStartPaperRename,
  onAddSection,
  onSelectSection,
  onToggleBulkSection,
  onRenameTitleChange,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onDeleteSection,
  onReloadConflict,
  onDeleteSelectedSections,
  onDropSection,
}) {
  const dragIndexRef = useRef(null);

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-(--border) bg-(--surface-secondary) md:flex" aria-label={labels.editPaperSections}>
      <div className="flex items-center justify-between gap-2 border-b border-(--border) px-4 py-3">
        {paperRenameOpen ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input
              autoFocus
              data-testid="paper-name-input"
              aria-label={labels.paperName}
              value={paperRenameTitle}
              onChange={event => onPaperRenameTitleChange(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') onSavePaperRename(); if (event.key === 'Escape') onCancelPaperRename(); }}
              className="min-w-0 flex-1 rounded border border-(--border) bg-(--surface) px-2 py-1 text-xs font-semibold text-(--text-primary)"
            />
            <button type="button" data-testid="save-paper-name" onClick={onSavePaperRename} aria-label={labels.savePaperName} className="rounded p-1 text-emerald-600 hover:bg-emerald-50">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg>
            </button>
            <button type="button" onClick={onCancelPaperRename} aria-label={labels.cancelPaperRename} className="rounded p-1 text-(--text-tertiary) hover:bg-(--surface-tertiary)">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <span className="min-w-0 truncate text-xs font-bold text-(--text-primary)" title={paper?.originalFilename || paper?.title || paperFallback}>
              {paper?.originalFilename || paper?.title || paperFallback}
            </span>
            {!projectReadOnly && (
              <button type="button" data-testid="rename-paper" onClick={onStartPaperRename} aria-label={labels.renamePaper} title={labels.renamePaper} className="shrink-0 rounded p-1 text-(--text-tertiary) hover:bg-(--brand-soft) hover:text-(--brand-foreground)">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z" /><path d="m13 7 4 4" /></svg>
              </button>
            )}
          </div>
        )}
        <button type="button" data-testid="add-section" onClick={onAddSection} aria-label={labels.addSection} disabled={sectionStructureLocked || sectionStructureSaving || projectReadOnly} className="shrink-0 rounded-lg bg-(--brand) px-2.5 py-1.5 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">+ {labels.addSection}</button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {sections.map((section, index) => {
          const selected = String(section.id) === String(selectedSection?.id);
          const locked = sectionStructureLocked || sectionStructureSaving;
          const standardConfigured = Boolean(sectionEvals[String(section.id)]?.requirements?.length);
          return (
            <div
              key={section.id}
              draggable={!locked}
              onDragStart={() => { dragIndexRef.current = index; }}
              onDragOver={event => event.preventDefault()}
              onDrop={() => { onDropSection(dragIndexRef.current, index); dragIndexRef.current = null; }}
              className={`rounded-lg border p-2 ${selected ? 'border-indigo-400 bg-(--surface)' : 'border-transparent hover:border-(--border) hover:bg-(--surface-tertiary)'}`}
              data-testid={String(section.id) === String(conflictSectionId) ? `section-conflict-${section.id}` : undefined}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  aria-label={`${labels.selectSection} ${section.sectionTitle}`}
                  checked={selectedBulkIds.includes(String(section.id))}
                  onChange={() => onToggleBulkSection(section.id)}
                  disabled={section.sectionType === 'REFERENCE' || projectReadOnly}
                  className="mt-1 h-3.5 w-3.5 shrink-0"
                />
                {renameSectionId != null && String(renameSectionId) === String(section.id) ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-100 text-[9px] font-bold text-indigo-700">{index + 1}</span>
                    <input
                      autoFocus
                      data-testid={`rename-input-${section.id}`}
                      aria-label={labels.sectionTitle}
                      value={renameTitle}
                      onChange={event => onRenameTitleChange(event.target.value)}
                      onKeyDown={event => { if (event.key === 'Enter') onSaveRename(section.id); if (event.key === 'Escape') onCancelRename(); }}
                      className="min-w-0 flex-1 rounded border border-(--border) bg-(--surface) px-2 py-1 text-xs font-semibold text-(--text-primary)"
                    />
                    <button type="button" data-testid={`save-rename-${section.id}`} onClick={() => onSaveRename(section.id)} aria-label={ct.save} className="rounded p-1 text-emerald-600 hover:bg-emerald-50">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg>
                    </button>
                  </div>
                ) : (
                  <button type="button" data-testid={`section-nav-${section.id}`} onClick={() => onSelectSection(section.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-2 text-xs font-semibold text-(--text-primary)">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-100 text-[9px] font-bold text-indigo-700">{index + 1}</span>
                      <span className="truncate">{section.sectionTitle || untitledLabel}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1 pl-7 text-[9px] text-(--text-tertiary)">
                      <span>{section.assignedUserId ? studentDisplayName(projectMembers.find(member => String(member.userId) === String(section.assignedUserId)) || {}) : labels.unassigned}</span>
                      <span>·</span>
                      <span>{standardConfigured ? labels.standardConfigured : labels.standardNotConfigured}</span>
                    </span>
                  </button>
                )}
                <div className="flex shrink-0 items-center gap-0.5">
                  {!locked && (
                    <button type="button" data-testid={`rename-section-${section.id}`} onClick={() => onStartRename(section)} aria-label={`${labels.rename}: ${section.sectionTitle}`} title={labels.rename} className="rounded p-1 text-(--text-tertiary) hover:bg-(--brand-soft) hover:text-(--brand-foreground)">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z" /><path d="m13 7 4 4" /></svg>
                    </button>
                  )}
                  {!locked && (
                    <span data-testid={`delete-section-${section.id}`}>
                      <DeleteConfirm
                        message={labels.deleteSectionConfirm}
                        onConfirm={() => onDeleteSection(section.id)}
                        triggerLabel={`${labels.deleteSection}: ${section.sectionTitle}`}
                        confirmLabel={ct.delete}
                        cancelLabel={ct.cancel}
                        disabled={sectionStructureSaving}
                        className="rounded p-1 text-rose-600 hover:bg-rose-50"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                      </DeleteConfirm>
                    </span>
                  )}
                  {String(section.id) === String(conflictSectionId) && (
                    <button type="button" onClick={() => onReloadConflict(section.id)} className="rounded px-1.5 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-50">{labels.reloadSection}</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div data-testid="selected-sections-footer" className="flex items-center justify-between gap-2 border-t border-(--border) p-3">
        <span className="text-[10px] font-semibold text-(--text-secondary)">{labels.selectedSections(selectedBulkIds.length)}</span>
        <DeleteConfirm
          message={labels.deleteSelectedSectionsConfirm}
          onConfirm={onDeleteSelectedSections}
          triggerLabel={labels.deleteSelectedSections}
          confirmLabel={ct.delete}
          cancelLabel={ct.cancel}
          disabled={selectedBulkIds.length === 0 || sectionStructureLocked || sectionStructureSaving || projectReadOnly}
          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
        >
          <span className="flex items-center gap-1 text-[10px] font-bold"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>{labels.deleteSelectedSections}</span>
        </DeleteConfirm>
      </div>
    </aside>
  );
}
