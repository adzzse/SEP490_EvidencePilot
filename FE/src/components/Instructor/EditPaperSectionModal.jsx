import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PreviewPane from '../features/PreviewPane';
import DeleteConfirm from '../ui/DeleteConfirm.jsx';
import { StandardConfigEditor } from './sections/StandardConfigModal.jsx';
import { studentDisplayName } from '../../utils/instructor/studentSearch.js';

function moveSection(sections, from, to) {
  if (from === to || from == null || to == null) return sections;
  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((section, index) => ({ ...section, sectionOrder: index }));
}

export default function EditPaperSectionModal({
  open,
  paper,
  sections,
  serverSections,
  sectionEvals = {},
  projectMembers = [],
  users = [],
  projectReadOnly,
  sectionStructureLocked,
  sectionStructureSaving,
  conflictSectionId,
  onClose,
  onDraftChange,
  onSave,
  onDiscard,
  onAddSection,
  onDeleteSection,
  onSavePaperRename,
  onStartRename,
  onSaveRename,
  onReloadConflict,
  onSaveStandard,
  onUnassignAll,
  t: labels,
  ct,
}) {
  const { t } = useTranslation();
  const dialogRef = useRef(null);
  const dragIndexRef = useRef(null);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [selectedBulkIds, setSelectedBulkIds] = useState([]);
  const [bulkAssignments, setBulkAssignments] = useState({});
  const [bulkTouchedIds, setBulkTouchedIds] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [mode, setMode] = useState('edit');
  const [confirmClose, setConfirmClose] = useState(false);
  const [standardSectionId, setStandardSectionId] = useState(null);
  const [renameSectionId, setRenameSectionId] = useState(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [paperRenameOpen, setPaperRenameOpen] = useState(false);
  const [paperRenameTitle, setPaperRenameTitle] = useState('');
  const [saveNotice, setSaveNotice] = useState(false);

  const dirty = JSON.stringify(sections) !== JSON.stringify(serverSections);
  const selectedSection = useMemo(
    () => sections.find(section => String(section.id) === String(selectedSectionId)) || sections[0] || null,
    [sections, selectedSectionId],
  );
  const standardSection = sections.find(section => String(section.id) === String(standardSectionId)) || null;
  const studentMembers = useMemo(
    () => projectMembers.filter(member => member.userRole === 'STUDENT'),
    [projectMembers],
  );
  const assignableMembers = useMemo(
    () => studentMembers.filter(member => users.length === 0 || users.some(user => String(user.id) === String(member.userId))),
    [studentMembers, users],
  );
  const selectedStudentId = selectedSection?.assignedUserId || '';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  useEffect(() => {
    if (!sections.some(section => String(section.id) === String(selectedSectionId))) {
      setSelectedSectionId(sections[0]?.id || null);
    }
    setSelectedBulkIds(current => current.filter(sectionId => sections.some(section => String(section.id) === String(sectionId))));
  }, [sections, selectedSectionId]);

  useEffect(() => {
    if (!open) {
      setConfirmClose(false);
      setSelectedBulkIds([]);
      setBulkAssignments({});
      setBulkTouchedIds([]);
      setBulkOpen(false);
      setMode('edit');
      setStandardSectionId(null);
      setRenameSectionId(null);
      setPaperRenameOpen(false);
      setSaveNotice(false);
    }
  }, [open]);

  const requestClose = () => {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  const updateSection = (sectionId, changes) => {
    setSaveNotice(false);
    onDraftChange(sections.map(section => String(section.id) === String(sectionId)
      ? { ...section, ...changes }
      : section));
  };

  const toggleBulkSection = (sectionId) => {
    const id = String(sectionId);
    const selected = selectedBulkIds.includes(id);
    setSelectedBulkIds(current => selected
      ? current.filter(selectedId => selectedId !== id)
      : [...current, id]);
    setBulkTouchedIds(current => current.includes(id) ? current : [...current, id]);
    if (selected) setBulkAssignments(current => ({ ...current, [id]: '' }));
  };

  const toggleBulkEditor = () => {
    if (!bulkOpen) {
      const assignments = Object.fromEntries(sections
        .filter(section => section.sectionType !== 'REFERENCE')
        .map(section => [String(section.id), section.assignedUserId || '']));
      setBulkAssignments(assignments);
      setBulkTouchedIds([]);
      setSelectedBulkIds(sections
        .filter(section => section.sectionType !== 'REFERENCE' && section.assignedUserId)
        .map(section => String(section.id)));
    }
    setBulkOpen(value => !value);
  };

  const updateBulkAssignment = (sectionId, userId) => {
    const id = String(sectionId);
    setBulkAssignments(current => ({ ...current, [id]: userId }));
    setBulkTouchedIds(current => current.includes(id) ? current : [...current, id]);
  };

  const applyBulkAssignment = () => {
    if (bulkTouchedIds.length === 0) return;
    setSaveNotice(false);
    onDraftChange(sections.map(section => bulkTouchedIds.includes(String(section.id)) && section.sectionType !== 'REFERENCE'
      ? { ...section, assignedUserId: bulkAssignments[String(section.id)] || null }
      : section));
    setBulkTouchedIds([]);
  };

  const startRename = (section) => {
    setRenameSectionId(section.id);
    setRenameTitle(section.sectionTitle || '');
    onStartRename?.(section);
  };

  const saveRename = (sectionId) => {
    const title = renameTitle.trim();
    if (!title) return;
    onSaveRename?.(sectionId, title);
    updateSection(sectionId, { sectionTitle: title });
    setRenameSectionId(null);
  };

  const startPaperRename = () => {
    setPaperRenameTitle(paper?.originalFilename || paper?.title || '');
    setPaperRenameOpen(true);
  };

  const savePaperRename = async () => {
    const title = paperRenameTitle.trim();
    if (!title || !paper?.id) return;
    await onSavePaperRename?.(paper.id, title);
    setPaperRenameOpen(false);
  };

  const deleteSelectedSections = async () => {
    const sectionIds = selectedBulkIds.filter(id => sections.some(section => String(section.id) === String(id)));
    setSelectedBulkIds([]);
    await Promise.all(sectionIds.map(sectionId => onDeleteSection(sectionId)));
  };

  const clearAllAssignments = () => {
    onUnassignAll?.();
    setBulkAssignments({});
    setBulkTouchedIds([]);
    setSelectedBulkIds([]);
  };

  const handleDrop = (toIndex) => {
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    if (sectionStructureLocked || fromIndex == null || fromIndex === toIndex) return;
    onDraftChange(moveSection(sections, fromIndex, toIndex));
  };

  const handleDiscard = () => {
    setConfirmClose(false);
    onDiscard();
  };

  const handleStandardClose = () => setStandardSectionId(null);

  const handleSave = async () => {
    const saved = await onSave();
    if (saved !== false) {
      setSaveNotice(true);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={event => { event.preventDefault(); requestClose(); }}
      onClick={event => { if (event.target === dialogRef.current) requestClose(); }}
      aria-label={labels.editPaperSections}
      className="fixed inset-0 m-auto h-[92vh] w-[94vw] max-h-none max-w-none rounded-2xl border-0 bg-transparent p-0 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex h-full w-full overflow-hidden rounded-2xl border border-(--border) bg-(--surface)">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-(--border) bg-(--surface-secondary) md:flex" aria-label={labels.editPaperSections}>
          <div className="flex items-center justify-between gap-2 border-b border-(--border) px-4 py-3">
            {paperRenameOpen ? (
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <input
                  autoFocus
                  data-testid="paper-name-input"
                  aria-label={labels.paperName}
                  value={paperRenameTitle}
                  onChange={event => setPaperRenameTitle(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') savePaperRename(); if (event.key === 'Escape') setPaperRenameOpen(false); }}
                  className="min-w-0 flex-1 rounded border border-(--border) bg-(--surface) px-2 py-1 text-xs font-semibold text-(--text-primary)"
                />
                <button type="button" data-testid="save-paper-name" onClick={savePaperRename} aria-label={labels.savePaperName} className="rounded p-1 text-emerald-600 hover:bg-emerald-50">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg>
                </button>
                <button type="button" onClick={() => setPaperRenameOpen(false)} aria-label={labels.cancelPaperRename} className="rounded p-1 text-(--text-tertiary) hover:bg-(--surface-tertiary)">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <span className="min-w-0 truncate text-xs font-bold text-(--text-primary)" title={paper?.originalFilename || paper?.title || t('paper')}>
                  {paper?.originalFilename || paper?.title || t('paper')}
                </span>
                {!projectReadOnly && (
                  <button type="button" data-testid="rename-paper" onClick={startPaperRename} aria-label={labels.renamePaper} title={labels.renamePaper} className="shrink-0 rounded p-1 text-(--text-tertiary) hover:bg-(--brand-soft) hover:text-(--brand-foreground)">
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
                  onDrop={() => handleDrop(index)}
                  className={`rounded-lg border p-2 ${selected ? 'border-indigo-400 bg-(--surface)' : 'border-transparent hover:border-(--border) hover:bg-(--surface-tertiary)'}`}
                  data-testid={String(section.id) === String(conflictSectionId) ? `section-conflict-${section.id}` : undefined}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      aria-label={`${labels.selectSection} ${section.sectionTitle}`}
                      checked={selectedBulkIds.includes(String(section.id))}
                      onChange={() => toggleBulkSection(section.id)}
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
                          onChange={event => setRenameTitle(event.target.value)}
                          onKeyDown={event => { if (event.key === 'Enter') saveRename(section.id); if (event.key === 'Escape') setRenameSectionId(null); }}
                          className="min-w-0 flex-1 rounded border border-(--border) bg-(--surface) px-2 py-1 text-xs font-semibold text-(--text-primary)"
                        />
                        <button type="button" data-testid={`save-rename-${section.id}`} onClick={() => saveRename(section.id)} aria-label={ct.save} className="rounded p-1 text-emerald-600 hover:bg-emerald-50">
                          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg>
                        </button>
                      </div>
                    ) : (
                    <button type="button" data-testid={`section-nav-${section.id}`} onClick={() => setSelectedSectionId(section.id)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-2 text-xs font-semibold text-(--text-primary)">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-100 text-[9px] font-bold text-indigo-700">{index + 1}</span>
                        <span className="truncate">{section.sectionTitle || t('untitled')}</span>
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
                        <button type="button" data-testid={`rename-section-${section.id}`} onClick={() => startRename(section)} aria-label={`${labels.rename}: ${section.sectionTitle}`} title={labels.rename} className="rounded p-1 text-(--text-tertiary) hover:bg-(--brand-soft) hover:text-(--brand-foreground)">
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
              onConfirm={deleteSelectedSections}
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

        <section className="flex min-w-0 flex-1 flex-col bg-white" aria-label={labels.paperEditor}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{paper?.originalFilename || paper?.title || t('paper')}</p>
              <h1 className="truncate text-lg font-bold text-slate-900">{labels.editPaperSections}</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button type="button" onClick={() => setMode('edit')} className={`rounded px-2 py-1 text-[10px] font-bold ${mode === 'edit' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{labels.editMode}</button>
                <button type="button" onClick={() => setMode('preview')} className={`rounded px-2 py-1 text-[10px] font-bold ${mode === 'preview' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{labels.previewMode}</button>
              </div>
              <button type="button" onClick={requestClose} aria-label={labels.closeEditor} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">×</button>
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
                      <input id="edit-paper-section-title" aria-label={labels.sectionTitle} value={selectedSection.sectionTitle || ''} onChange={event => updateSection(selectedSection.id, { sectionTitle: event.target.value })} readOnly={sectionStructureLocked || projectReadOnly} className="mt-1 w-full border-b-2 border-slate-200 px-0 py-2 text-2xl font-bold text-slate-900 outline-none focus:border-indigo-500 read-only:opacity-60" />
                    </div>
                  </div>

                  <div data-testid="assigned-student-block" className="space-y-2">
                    <div data-testid="assigned-student-label" className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{labels.assignedStudent}</div>
                    <div data-testid="assignment-controls-row" className="flex flex-wrap items-center gap-2">
                      {selectedSection.sectionType === 'REFERENCE' ? (
                        <div className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800">{labels.referenceSharedEditors}</div>
                      ) : (
                        <select aria-label={labels.assignedStudent} value={selectedStudentId} onChange={event => updateSection(selectedSection.id, { assignedUserId: event.target.value || null })} disabled={projectReadOnly || sectionStructureSaving} className="min-w-[13rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500 disabled:bg-slate-100">
                          <option value="">{labels.unassigned}</option>
                          {assignableMembers.map(member => <option key={member.userId} value={member.userId}>{studentDisplayName(member)}</option>)}
                        </select>
                      )}
                      <button type="button" onClick={toggleBulkEditor} aria-expanded={bulkOpen} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-600">{labels.bulkAssign}</button>
                      {studentMembers.length > 0 && (
                        <DeleteConfirm
                          message={labels.unassignAllConfirm}
                          onConfirm={clearAllAssignments}
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
                                  <input type="checkbox" data-testid={`bulk-section-${section.id}`} aria-label={`${labels.selectSection} ${section.sectionTitle}`} checked={selectedForBulk} onChange={() => toggleBulkSection(section.id)} disabled={section.sectionType === 'REFERENCE' || projectReadOnly} />
                                  <span className="truncate">{section.sectionTitle}</span>
                                </label>
                                {section.sectionType !== 'REFERENCE' && (
                                  <select data-testid={`bulk-student-${section.id}`} aria-label={`${labels.bulkAssignmentStudent}: ${section.sectionTitle}`} value={bulkAssignments[sectionId] || ''} onChange={event => updateBulkAssignment(section.id, event.target.value)} disabled={!selectedForBulk || projectReadOnly} className="min-w-44 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs disabled:bg-slate-100">
                                    <option value="">{labels.unassigned}</option>
                                    {assignableMembers.map(member => <option key={member.userId} value={member.userId}>{studentDisplayName(member)}</option>)}
                                  </select>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button type="button" onClick={applyBulkAssignment} disabled={bulkTouchedIds.length === 0 || projectReadOnly} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">{labels.applyAssignment}</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div data-testid="standards-block" className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div data-testid="standards-label" className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{labels.standards}</div>
                      <button type="button" onClick={() => setStandardSectionId(selectedSection.id)} disabled={sectionStructureLocked || projectReadOnly} className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{labels.configStandard}</button>
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
                  </div>

                  {standardSection && (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="text-xs font-bold text-indigo-900">{labels.configStandard} - {standardSection.sectionTitle}</h3>
                        <button type="button" onClick={handleStandardClose} className="rounded px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-white">{t('close')}</button>
                      </div>
                      <StandardConfigEditor
                        open={Boolean(standardSection)}
                        initialRequirements={sectionEvals[String(standardSection.id)]?.requirements || []}
                        isLocked={sectionStructureLocked || projectReadOnly}
                        onSave={async config => {
                          const saved = await onSaveStandard(standardSection.id, config);
                          if (saved) setStandardSectionId(null);
                        }}
                        onClose={handleStandardClose}
                        t={labels}
                        ct={ct}
                      />
                    </div>
                  )}

                  <label htmlFor="edit-paper-section-content" className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{labels.sectionContent}</label>
                  <textarea id="edit-paper-section-content" aria-label={labels.sectionContent} value={selectedSection.contentTex || ''} onChange={event => updateSection(selectedSection.id, { contentTex: event.target.value })} readOnly={projectReadOnly} rows={20} className="w-full resize-y rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs leading-6 text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 read-only:bg-slate-100 read-only:opacity-70" />
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
              <button type="button" onClick={handleDiscard} disabled={!dirty || sectionStructureSaving} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50">{labels.discardChanges}</button>
              <button type="button" onClick={handleSave} disabled={!dirty || sectionStructureSaving || projectReadOnly} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{labels.saveChanges}</button>
            </div>
          </div>
        </section>

        {confirmClose && (
          <div role="alertdialog" aria-label={labels.discardUnsavedChanges} className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 p-4">
            <div className="w-full max-w-sm rounded-xl border border-(--border) bg-(--surface) p-4 shadow-2xl">
              <p className="text-sm font-bold text-(--text-primary)">{labels.discardUnsavedChanges}</p>
              <p className="mt-1 text-xs text-(--text-secondary)">{labels.discardUnsavedChangesHint}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmClose(false)} className="rounded-lg bg-(--surface-tertiary) px-3 py-2 text-xs font-semibold text-(--text-secondary)">{labels.keepEditing}</button>
                <button type="button" onClick={handleDiscard} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">{labels.discardChanges}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
