import { useState } from 'react';
import DeleteConfirm from '../../ui/DeleteConfirm.jsx';
import Dropdown from '../../ui/Dropdown.jsx';
import { studentDisplayName } from '../../../utils/instructor/studentSearch.js';

export default function PaperSectionAssignment({
  sections,
  selectedSection,
  selectedStudentId,
  studentMembers,
  assignableMembers,
  bulkAssignments,
  bulkTouchedIds,
  bulkOpen,
  projectReadOnly,
  sectionStructureSaving,
  labels,
  ct,
  onUpdateSection,
  onToggleBulkEditor,
  onUpdateBulkAssignment,
  onApplyBulkAssignment,
  onAssignBulkToStudent,
  onClearAllAssignments,
}) {
  const [assignAllStudent, setAssignAllStudent] = useState('');
  const memberOptions = (includeUnassignedLabel) => [
    { value: '', label: includeUnassignedLabel },
    ...assignableMembers.map(member => ({ value: member.userId, label: studentDisplayName(member) })),
  ];
  const assignableSections = sections.filter(section => section.sectionType !== 'REFERENCE');
  return (
    <div data-testid="assigned-student-block" className="space-y-2">
      <div data-testid="assigned-student-label" className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{labels.assignedStudent}</div>
      <div data-testid="assignment-controls-row" className="flex flex-wrap items-center gap-2">
        {selectedSection.sectionType === 'REFERENCE' ? (
          <div className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800">{labels.referenceSharedEditors}</div>
        ) : (
          <Dropdown
            ariaLabel={labels.assignedStudent}
            value={selectedStudentId || ''}
            options={memberOptions(labels.unassigned)}
            onChange={userId => onUpdateSection({ assignedUserId: userId || null })}
            disabled={projectReadOnly || sectionStructureSaving}
            className="min-w-[13rem] flex-1"
          />
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
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-[10px] text-slate-500">{labels.bulkAssignHint}</p>
            <Dropdown
              testId="bulk-assign-all-student"
              ariaLabel={labels.bulkAssignmentStudent}
              value={assignAllStudent}
              options={[{ value: '', label: labels.selectStudent }, ...assignableMembers.map(member => ({ value: member.userId, label: studentDisplayName(member) }))]}
              onChange={setAssignAllStudent}
              disabled={projectReadOnly || sectionStructureSaving}
              className="min-w-36"
            />
            <button type="button" onClick={() => { onAssignBulkToStudent(assignAllStudent); setAssignAllStudent(''); }} disabled={!assignAllStudent || assignableSections.length === 0 || projectReadOnly || sectionStructureSaving} className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50">{labels.bulkAssignAll}</button>
            <button type="button" onClick={onApplyBulkAssignment} disabled={bulkTouchedIds.length === 0 || projectReadOnly || sectionStructureSaving} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">{labels.applyAssignment}</button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {sections.map(section => {
              const sectionId = String(section.id);
              // ponytail: no select step — a row highlights as soon as it carries
              // an assignment; picking Unassigned clears it. Accepted
              // intentional (matches the assign-all bulk flow).
              const hasAssignee = Boolean(bulkAssignments[sectionId]);
              const rowDisabled = projectReadOnly || sectionStructureSaving;
              return (
                <div key={section.id} className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 ring-1 ring-inset ${hasAssignee ? 'bg-indigo-50/60 ring-indigo-300' : 'bg-white ring-transparent'}`}>
                  <span className="min-w-0 flex-1 truncate px-1 py-1.5 text-xs font-semibold text-slate-600">{section.sectionTitle}</span>
                  {section.sectionType !== 'REFERENCE' && (
                    <Dropdown
                      testId={`bulk-student-${section.id}`}
                      ariaLabel={`${labels.bulkAssignmentStudent}: ${section.sectionTitle}`}
                      value={bulkAssignments[sectionId] || ''}
                      options={memberOptions(labels.unassigned)}
                      onChange={userId => onUpdateBulkAssignment(section.id, userId)}
                      disabled={rowDisabled}
                      className="min-w-44"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
