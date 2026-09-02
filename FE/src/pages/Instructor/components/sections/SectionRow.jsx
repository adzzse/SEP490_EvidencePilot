import { Draggable } from '@hello-pangea/dnd';
import DeleteConfirm from '../../../../components/DeleteConfirm.jsx';
import { studentDisplayName } from '../../studentSearch.js';

export default function SectionRow({
  section: s,
  index,
  isLocked,
  isReadOnly,
  isSaving,
  isConflict,
  isEditing,
  editingTitle,
  onStartRename,
  onSaveRename,
  onCancelRename,
  onEditingChange,
  onDelete,
  onAssign,
  onReloadConflict,
  evaluation,
  onConfigStandard,
  projectMembers,
  users,
  t,
  ct,
}) {
  return (
    <Draggable key={s.id} draggableId={String(s.id)} index={index} isDragDisabled={isLocked || isSaving}>
      {(dragProvided, snapshot) => (
        <div
          ref={dragProvided.innerRef}
          {...dragProvided.draggableProps}
          className={`flex items-center justify-between gap-3 rounded-lg px-3 py-3 text-xs sm:px-4 ${isConflict ? 'ring-2 ring-amber-400 bg-amber-50 border border-amber-300' : snapshot.isDragging ? 'border border-indigo-200 bg-[var(--brand-soft)] shadow-lg' : 'bg-[var(--surface-secondary)]'
            }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              {...dragProvided.dragHandleProps}
              className={`text-[var(--text-tertiary)] ${isLocked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
              title={isLocked ? t.unassignToReorder : t.dragToReorder}
            >
              {'\u283F'}
            </span>
            {isEditing ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={editingTitle}
                  onChange={e => onEditingChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') onSaveRename(s.id);
                    if (e.key === 'Escape') onCancelRename();
                  }}
                  className="bg-transparent outline-none border-b border-indigo-300 text-xs"
                />
                <button onClick={() => onSaveRename(s.id)} disabled={isSaving} className="rounded p-1 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50" title={ct.save} aria-label={ct.save}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg></button>
                <button onClick={onCancelRename} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-tertiary)] hover:text-[var(--text-primary)]" title={ct.cancel} aria-label={ct.cancel}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
              </div>
            ) : (
              <span className="font-medium truncate">{s.sectionTitle}</span>
            )}
            {s.version > 1 && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">v{s.version}</span>}
            {s.assignedUserId && (
              <span className="flex items-center gap-1 rounded bg-[var(--surface-tertiary)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--text-secondary)]">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current" strokeWidth="2"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                {studentDisplayName(projectMembers.find(m => String(m.userId) === String(s.assignedUserId)) ?? {})}
              </span>
            )}
            {/* Read-only lock badge — replaced by view standard button when section structure is locked */}
            {isLocked && (
              <button
                type="button"
                onClick={() => onConfigStandard(s.id)}
                disabled={isSaving}
                aria-label={t.configStandard || 'View Standard'}
                title={t.configStandard || 'View Standard'}
                className="rounded p-1 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-indigo-100 stroke-current" strokeWidth="2"><path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z" /><path d="M9 12l2 2 4-4" /></svg>
              </button>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              {!isLocked && !isEditing && (
                <button onClick={() => onStartRename(s)} disabled={isSaving} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand-foreground)] disabled:opacity-50" title={t.rename} aria-label={t.rename}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z" /><path d="m13 7 4 4" /></svg></button>
              )}
              {!isLocked && (
                <DeleteConfirm message={t.deleteSectionConfirm} onConfirm={() => onDelete(s.id)} triggerLabel={ct.delete} confirmLabel={ct.delete} cancelLabel={ct.cancel} disabled={isSaving} className="rounded p-1 text-[var(--text-tertiary)] hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6M14 10v6" /></svg></DeleteConfirm>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => onConfigStandard(s.id)}
                  disabled={isSaving}
                  className="rounded border border-indigo-200 bg-white px-2 py-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                >
                  Config Standard
                </button>
              )}
              <select
                value={s.assignedUserId || ''}
                onChange={e => { const v = e.target.value; onAssign(s.id, v ? v : null); }}
                disabled={isReadOnly || isSaving}
                className="max-w-36 max-h-60 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs outline-none overflow-y-auto disabled:bg-[var(--surface-tertiary)] disabled:text-[var(--text-tertiary)] sm:max-w-none"
              >
                <option value="">{t.unassigned}</option>
                {projectMembers
                  .filter(member => users.some(user => String(user.id) === String(member.userId)))
                  .map(member => (
                    <option key={member.userId} value={member.userId}>{studentDisplayName(member ?? {})}</option>
                  ))}
              </select>
              {isConflict && (
                <button onClick={() => onReloadConflict(s.id)} className="rounded bg-amber-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-amber-600">Reload</button>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
