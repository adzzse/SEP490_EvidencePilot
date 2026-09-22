export function toDate(dateInput) {
  if (dateInput instanceof Date) return dateInput;
  // Backend LocalDateTime values are UTC but have no offset in JSON.
  const normalized = typeof dateInput === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(dateInput)
    ? `${dateInput}Z`
    : dateInput;
return new Date(normalized);
}

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function vietnamParts(dateInput, includeSeconds = false) {
  const date = toDate(dateInput);
  if (isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VIETNAM_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
}

/**
 * Formats an ISO string or Date object to DD/MM/YYYY.
 * @param {string|number|Date|null|undefined} dateInput
 * @param {string} [lang='vi']
 * @returns {string} Formatted date string or '—'
 */
export function formatDate(dateInput, lang = 'vi') {
  if (!dateInput) return '—';
  const parts = vietnamParts(dateInput);
  if (!parts) return '—';
  void lang;
  return `${parts.day}/${parts.month}/${parts.year}`;
}

/**
 * Formats an ISO string or Date object to HH:mm DD/MM/YYYY.
 * @param {string|number|Date|null|undefined} dateInput
 * @param {string} [lang='vi']
 * @returns {string} Formatted datetime string or '—'
 */
export function formatDateTime(dateInput, lang = 'vi') {
  if (!dateInput) return '—';
  const parts = vietnamParts(dateInput);
  if (!parts) return '—';
  void lang;
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
}

export function formatDateTimeSeconds(dateInput, lang = 'vi') {
  if (!dateInput) return '—';
  const parts = vietnamParts(dateInput, true);
  if (!parts) return '—';
  void lang;
  return `${parts.hour}:${parts.minute}:${parts.second} ${parts.day}/${parts.month}/${parts.year}`;
}
