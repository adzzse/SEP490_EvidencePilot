import api from './api.js';

const PREFIX = 'ep_translate_vi:';
const hash = (s) => btoa(unescape(encodeURIComponent(s))).slice(0, 40);

export async function translateLazy(text, target = 'vi') {
  if (!text || target === 'en') return text;
  const key = `${PREFIX}${hash(text)}`;
  const cached = localStorage.getItem(key);
  if (cached) return cached;
  const { data } = await api.post('/api/translate', { text, target_language: target });
  const translated = data.translated_text || text;
  localStorage.setItem(key, translated);
  return translated;
}
