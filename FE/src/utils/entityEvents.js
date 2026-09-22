// Matches a realtime entity event to a project whether the backend sent the
// project id as `projectId` (DOCUMENT/FEEDBACK events) or as `id`
// (PROJECT events are published id-only).
export function targetsProject(event, projectId) {
  if (!event || projectId === null || projectId === undefined) return false;
  return String(event.projectId || event.id) === String(projectId);
}
