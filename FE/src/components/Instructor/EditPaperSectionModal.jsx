import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import PaperSectionSidebar from './sections/PaperSectionSidebar.jsx';
import PaperSectionEditorPane from './sections/PaperSectionEditorPane.jsx';

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

  const requestClose = useCallback(() => {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, requestClose]);

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

  const handleDrop = (fromIndex, toIndex) => {
    if (sectionStructureLocked || fromIndex == null || fromIndex === toIndex) return;
    const next = [...sections];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onDraftChange(next.map((section, index) => ({ ...section, sectionOrder: index })));
  };

  const handleDiscard = () => {
    setConfirmClose(false);
    onDiscard();
  };

  const handleSave = async () => {
    const saved = await onSave();
    if (saved !== false) {
      setSaveNotice(true);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.editPaperSections}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={event => { if (event.target === event.currentTarget) requestClose(); }}
    >
      <div className="relative flex h-[92vh] w-[94vw] max-h-none max-w-none overflow-hidden rounded-2xl border border-(--border) bg-(--surface) shadow-2xl">
        <PaperSectionSidebar
          paper={paper}
          sections={sections}
          selectedSection={selectedSection}
          sectionEvals={sectionEvals}
          projectMembers={projectMembers}
          selectedBulkIds={selectedBulkIds}
          renameSectionId={renameSectionId}
          renameTitle={renameTitle}
          paperRenameOpen={paperRenameOpen}
          paperRenameTitle={paperRenameTitle}
          projectReadOnly={projectReadOnly}
          sectionStructureLocked={sectionStructureLocked}
          sectionStructureSaving={sectionStructureSaving}
          conflictSectionId={conflictSectionId}
          labels={labels}
          ct={ct}
          paperFallback={t('paper')}
          untitledLabel={t('untitled')}
          onPaperRenameTitleChange={setPaperRenameTitle}
          onSavePaperRename={savePaperRename}
          onCancelPaperRename={() => setPaperRenameOpen(false)}
          onStartPaperRename={startPaperRename}
          onAddSection={onAddSection}
          onSelectSection={setSelectedSectionId}
          onToggleBulkSection={toggleBulkSection}
          onRenameTitleChange={setRenameTitle}
          onStartRename={startRename}
          onSaveRename={saveRename}
          onCancelRename={() => setRenameSectionId(null)}
          onDeleteSection={onDeleteSection}
          onReloadConflict={onReloadConflict}
          onDeleteSelectedSections={deleteSelectedSections}
          onDropSection={handleDrop}
        />

        <PaperSectionEditorPane
          sections={sections}
          selectedSection={selectedSection}
          sectionEvals={sectionEvals}
          assignableMembers={assignableMembers}
          studentMembers={studentMembers}
          selectedStudentId={selectedStudentId}
          selectedBulkIds={selectedBulkIds}
          bulkAssignments={bulkAssignments}
          bulkTouchedIds={bulkTouchedIds}
          bulkOpen={bulkOpen}
          mode={mode}
          dirty={dirty}
          saveNotice={saveNotice}
          standardSection={standardSection}
          projectReadOnly={projectReadOnly}
          sectionStructureLocked={sectionStructureLocked}
          sectionStructureSaving={sectionStructureSaving}
          labels={labels}
          ct={ct}
          closeLabel={t('close')}
          onModeChange={setMode}
          onRequestClose={requestClose}
          onUpdateSection={changes => selectedSection && updateSection(selectedSection.id, changes)}
          onToggleBulkEditor={toggleBulkEditor}
          onToggleBulkSection={toggleBulkSection}
          onUpdateBulkAssignment={updateBulkAssignment}
          onApplyBulkAssignment={applyBulkAssignment}
          onClearAllAssignments={clearAllAssignments}
          onOpenStandard={setStandardSectionId}
          onCloseStandard={() => setStandardSectionId(null)}
          onSaveStandard={onSaveStandard}
          onDiscard={handleDiscard}
          onSave={handleSave}
        />

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
    </div>,
    document.body
  );
}
