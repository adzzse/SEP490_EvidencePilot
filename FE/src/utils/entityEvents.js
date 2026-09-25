// Matches a realtime entity event to a project whether the backend sent the
// project id as `projectId` (DOCUMENT/FEEDBACK events) or as `id`
// (PROJECT events are published id-only).
export function targetsProject(event, projectId) {
  if (!event || projectId === null || projectId === undefined) return false;
  const target = String(projectId);
  return [event.projectId, event.id]
    .filter(value => value !== null && value !== undefined)
    .some(value => String(value) === target);
}
