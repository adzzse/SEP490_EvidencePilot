import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import vi from './locales/vi.json';

export function normalizeLanguage(language) {
  return String(language || '').trim().toLowerCase().split('-')[0] === 'vi' ? 'vi' : 'en';
}

function getStoredLanguage() {
  try {
    return localStorage.getItem('app_lang');
  } catch {
    return 'en';
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, vi: { translation: vi } },
    lng: normalizeLanguage(getStoredLanguage()),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
