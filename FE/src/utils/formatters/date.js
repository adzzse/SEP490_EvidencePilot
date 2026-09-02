import { DATE_FORMATS } from '../constants.js';

/**
 * Formats an ISO string or Date object to DD/MM/YYYY (default vi-VN).
 * @param {string|number|Date|null|undefined} dateInput 
 * @param {string} [lang='vi'] 
 * @returns {string} Formatted date string or '—'
 */
export function formatDate(dateInput, lang = 'vi') {
  if (!dateInput) return '—';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
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
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
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
