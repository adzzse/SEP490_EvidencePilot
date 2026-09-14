import { createContext, useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeLanguage } from '../i18n';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const { i18n } = useTranslation();
  const language = normalizeLanguage(i18n.resolvedLanguage || i18n.language);

  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
      return;
    }
    try {
      localStorage.setItem('app_lang', language);
    } catch {
      // Persistence is best-effort; runtime language still belongs to i18next.
    }
    document.documentElement.lang = language;
  }, [i18n, language]);

  const changeLanguage = (next) => i18n.changeLanguage(normalizeLanguage(next));

  const toggleLanguage = () => {
    changeLanguage(language === 'vi' ? 'en' : 'vi');
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: changeLanguage, toggleLanguage }}>
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
