export function taskKey(api, userId, ...scope) {
  return userId ? `ep-task:${JSON.stringify([api.defaults.baseURL, String(userId), ...scope])}` : null;
}

export function readTask(key) {
  try { return key ? JSON.parse(sessionStorage.getItem(key)) : null; }
  catch { return null; }
}

export function writeTask(key, value) {
  if (!key) return;
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch { /* browser storage may be unavailable */ }
}
