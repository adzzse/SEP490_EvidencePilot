export const feedbackKeys = {
  all: ['feedback'],
  rounds: projectId => [...feedbackKeys.all, 'rounds', String(projectId ?? '')],
  threads: requestId => [...feedbackKeys.all, 'threads', String(requestId ?? '')],
  thread: id => [...feedbackKeys.all, 'thread', String(id ?? '')],
};
