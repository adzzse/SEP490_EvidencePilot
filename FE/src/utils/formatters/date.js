import { DATE_FORMATS } from '../constants.js';

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
 * Formats an ISO string or Date object to DD/MM/YYYY (default vi-VN).
 * @param {string|number|Date|null|undefined} dateInput 
 * @param {string} [lang='vi'] 
 * @returns {string} Formatted date string or '—'
 */
export function formatDate(dateInput, lang = 'vi') {
  if (!dateInput) return '—';
  const d = toDate(dateInput);
  if (isNaN(d.getTime())) return '—';

  const locale = lang === 'en' ? DATE_FORMATS.LOCALE_EN : DATE_FORMATS.LOCALE_VI;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Formats an ISO string or Date object to HH:mm, DD/MM/YYYY.
 * @param {string|number|Date|null|undefined} dateInput 
 * @param {string} [lang='vi'] 
 * @returns {string} Formatted datetime string or '—'
 */
export function formatDateTime(dateInput, lang = 'vi') {
  if (!dateInput) return '—';
  const d = toDate(dateInput);
  if (isNaN(d.getTime())) return '—';

  const locale = lang === 'en' ? DATE_FORMATS.LOCALE_EN : DATE_FORMATS.LOCALE_VI;
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).format(d);
}
