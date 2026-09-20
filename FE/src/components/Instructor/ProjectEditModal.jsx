import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';

export default function ProjectEditModal({ open, project, saving, onClose, onSave, t }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(project?.title || '');
    setDescription(project?.description || '');
  }, [open, project]);

  const submit = event => {
    event.preventDefault();
    if (!title.trim() || saving) return;
    onSave({ title: title.trim(), description: description.trim() || null });
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={t('instructor.projectManagement.editProject')}
      closeLabel={t('close')}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="project-edit-title" className="text-xs font-bold text-(--text-secondary)">
            {t('instructor.projectManagement.projectTitle')}
          </label>
          <input
            id="project-edit-title"
            value={title}
            onChange={event => setTitle(event.target.value)}
            className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2.5 text-sm text-(--text-primary) outline-none focus:ring-2 focus:ring-(--focus)"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="project-edit-description" className="text-xs font-bold text-(--text-secondary)">
            {t('instructor.projectManagement.description')}
          </label>
          <textarea
            id="project-edit-description"
            value={description}
            onChange={event => setDescription(event.target.value)}
            rows={4}
            className="w-full resize-none rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2.5 text-sm text-(--text-primary) outline-none focus:ring-2 focus:ring-(--focus)"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-(--text-secondary) transition-colors hover:bg-(--surface-secondary) disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="rounded-xl bg-(--brand) px-4 py-2 text-xs font-bold text-(--on-brand) shadow-sm transition-colors hover:bg-(--brand-hover) disabled:opacity-50"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
