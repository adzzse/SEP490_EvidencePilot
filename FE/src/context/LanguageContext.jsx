import { createContext, useContext, useEffect, useState } from 'react';
import i18n from '../i18n';
import api from '../services/api.js';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem('app_lang') || 'en');

  useEffect(() => {
    if (i18n.language !== language) i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [language]);

  const changeLanguage = (next) => {
    localStorage.setItem('app_lang', next);
    setLanguage(next);
  };

  const toggleLanguage = () => {
    changeLanguage(language === 'vi' ? 'en' : 'vi');
  };

  // Lazy-load translation — only for rendered text, cached in localStorage
  const translateText = async (text, target = 'vi') => {
    if (!text || target === 'en') return text;
    const key = `ep_translate_${target}:${btoa(unescape(encodeURIComponent(text))).slice(0, 40)}`;
    const cached = localStorage.getItem(key);
    if (cached) return cached;
    try {
      const { data } = await api.post('/api/translate', { text, target_language: target });
      const translated = data.translated_text || text;
      localStorage.setItem(key, translated);
      return translated;
    } catch {
      return text;
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: changeLanguage, toggleLanguage, translateText }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

export default LanguageContext;
