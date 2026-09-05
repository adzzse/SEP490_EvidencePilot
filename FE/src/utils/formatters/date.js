function toDate(dateInput) {
  if (dateInput instanceof Date) return dateInput;
  // Backend LocalDateTime values are UTC but have no offset in JSON.
  const normalized = typeof dateInput === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(dateInput)
    ? `${dateInput}Z`
    : dateInput;
  return new Date(normalized);
}

/**
 * Formats an ISO string or Date object to DD-MM-YYYY.
 * @param {string|number|Date|null|undefined} dateInput
 * @param {string} [lang='vi']
 * @returns {string} Formatted date string or '—'
 */
export function formatDate(dateInput, lang = 'vi') {
  if (!dateInput) return '—';
  const d = toDate(dateInput);
  if (isNaN(d.getTime())) return '—';
  void lang;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/**
 * Formats an ISO string or Date object to HH:mm DD-MM-YYYY.
 * @param {string|number|Date|null|undefined} dateInput
 * @param {string} [lang='vi']
 * @returns {string} Formatted datetime string or '—'
 */
export function formatDateTime(dateInput, lang = 'vi') {
  if (!dateInput) return '—';
  const d = toDate(dateInput);
  if (isNaN(d.getTime())) return '—';
  void lang;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}
