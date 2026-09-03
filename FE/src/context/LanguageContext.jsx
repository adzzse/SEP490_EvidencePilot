import { createContext, useContext, useEffect, useState } from 'react';
import i18n from '../i18n';

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
