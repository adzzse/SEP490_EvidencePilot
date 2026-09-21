import DeleteConfirm from '../../ui/DeleteConfirm.jsx';
import { studentDisplayName } from '../../../utils/instructor/studentSearch.js';

export default function PaperSectionAssignment({
  sections,
  selectedSection,
  selectedStudentId,
  studentMembers,
  assignableMembers,
  selectedBulkIds,
  bulkAssignments,
  bulkTouchedIds,
  bulkOpen,
  projectReadOnly,
  sectionStructureSaving,
  labels,
  ct,
  onUpdateSection,
  onToggleBulkEditor,
  onToggleBulkSection,
  onUpdateBulkAssignment,
  onApplyBulkAssignment,
  onClearAllAssignments,
}) {
  return (
    <div data-testid="assigned-student-block" className="space-y-2">
      <div data-testid="assigned-student-label" className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{labels.assignedStudent}</div>
      <div data-testid="assignment-controls-row" className="flex flex-wrap items-center gap-2">
        {selectedSection.sectionType === 'REFERENCE' ? (
          <div className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800">{labels.referenceSharedEditors}</div>
        ) : (
          <select aria-label={labels.assignedStudent} value={selectedStudentId} onChange={event => onUpdateSection({ assignedUserId: event.target.value || null })} disabled={projectReadOnly || sectionStructureSaving} className="min-w-[13rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500 disabled:bg-slate-100">
            <option value="">{labels.unassigned}</option>
            {assignableMembers.map(member => <option key={member.userId} value={member.userId}>{studentDisplayName(member)}</option>)}
          </select>
        )}
        <button type="button" onClick={onToggleBulkEditor} aria-expanded={bulkOpen} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-600">{labels.bulkAssign}</button>
        {studentMembers.length > 0 && (
          <DeleteConfirm
            message={labels.unassignAllConfirm}
            onConfirm={onClearAllAssignments}
            triggerLabel={labels.unassignAll}
            confirmLabel={labels.unassignAll}
            cancelLabel={ct.cancel}
            disabled={projectReadOnly || sectionStructureSaving}
            className="rounded-lg bg-amber-100 px-2.5 py-2 text-[10px] font-bold text-amber-800 hover:bg-amber-200"
          >
            {labels.unassignAll}
          </DeleteConfirm>
        )}
      </div>

      {bulkOpen && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-3 text-[10px] text-slate-500">{labels.bulkAssignHint}</p>
          <div className="space-y-2">
            {sections.map(section => {
              const sectionId = String(section.id);
              const selectedForBulk = selectedBulkIds.includes(sectionId);
              return (
                <div key={section.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1.5">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-[10px] text-slate-600">
                    <input type="checkbox" data-testid={`bulk-section-${section.id}`} aria-label={`${labels.selectSection} ${section.sectionTitle}`} checked={selectedForBulk} onChange={() => onToggleBulkSection(section.id)} disabled={section.sectionType === 'REFERENCE' || projectReadOnly} />
                    <span className="truncate">{section.sectionTitle}</span>
                  </label>
                  {section.sectionType !== 'REFERENCE' && (
                    <select data-testid={`bulk-student-${section.id}`} aria-label={`${labels.bulkAssignmentStudent}: ${section.sectionTitle}`} value={bulkAssignments[sectionId] || ''} onChange={event => onUpdateBulkAssignment(section.id, event.target.value)} disabled={!selectedForBulk || projectReadOnly} className="min-w-44 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs disabled:bg-slate-100">
                      <option value="">{labels.unassigned}</option>
                      {assignableMembers.map(member => <option key={member.userId} value={member.userId}>{studentDisplayName(member)}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={onApplyBulkAssignment} disabled={bulkTouchedIds.length === 0 || projectReadOnly} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">{labels.applyAssignment}</button>
          </div>
        </div>
      )}
    </div>
  );
}
