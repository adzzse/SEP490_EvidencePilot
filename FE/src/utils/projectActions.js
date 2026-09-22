const EDITABLE_STATUSES = new Set(['CREATED', 'ASSIGNED', 'IN_PROGRESS', 'RETURNED']);
const EXPORTABLE_STATUSES = new Set(['IN_PROGRESS', 'SUBMITTED_FOR_REVIEW', 'RETURNED', 'APPROVED', 'ARCHIVED', 'PENDING_DELETE']);

export function getProjectActions(project = {}) {
  if (!project.active) return ['restore'];

  if (project.deletionScheduledAt) {
    const actions = ['revokeDeletion'];
    const status = project.status;
    if (EXPORTABLE_STATUSES.has(status) && project.hasAuthoritativeData !== false) {
      actions.push('export');
    }
    return actions;
  }

  const status = project.status;
  const actions = [];

  if (EDITABLE_STATUSES.has(status)) {
    actions.push('edit', 'reExtract');
  }
  if (status === 'IN_PROGRESS' || status === 'SUBMITTED_FOR_REVIEW') {
    actions.push('complete');
  }
  if (status === 'APPROVED') {
    actions.push('archive');
  } else if (status === 'ARCHIVED') {
    actions.push('unarchive');
  }
  if (EXPORTABLE_STATUSES.has(status) && project.hasAuthoritativeData !== false) {
    actions.push('export');
  }
  if (EDITABLE_STATUSES.has(status)) actions.push('delete');
  return actions;
}

export function hasProjectAction(project, action) {
  return getProjectActions(project).includes(action);
}
