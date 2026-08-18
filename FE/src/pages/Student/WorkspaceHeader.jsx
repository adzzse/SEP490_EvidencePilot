import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';

export default function WorkspaceHeader({ project, notifications, unreadCount, showNotifications, setShowNotifications, onMarkNotificationRead, historyDisabled, handleRunAiReview, loadingAiReview, selectedPaper, onShowHistory, showExportMenu, setShowExportMenu, handleExportTexArchive, handleExportTraceabilityJson, handleExportTraceabilityCsv, isLocked }) {
  const { user } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const canExport = project?.status === 'APPROVED' || project?.status === 'ARCHIVED';
  const iconButton = 'p-2 hover:bg-(--surface-secondary) rounded-lg text-(--text-secondary) transition-colors disabled:opacity-30';

  const runMobileAction = (action) => {
    setShowMoreMenu(false);
    action();
  };

  const exportMenu = (
    <div className="py-1">
      <button onClick={() => { handleExportTexArchive(); setShowExportMenu(false); setShowMoreMenu(false); }} disabled={!canExport} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-(--text-primary) hover:bg-(--surface-secondary) transition-colors disabled:opacity-40 disabled:cursor-not-allowed">{t('exportTex')}</button>
      <button onClick={() => { handleExportTraceabilityJson(); setShowExportMenu(false); setShowMoreMenu(false); }} disabled={!canExport} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-(--text-primary) hover:bg-(--surface-secondary) transition-colors disabled:opacity-40 disabled:cursor-not-allowed">{t('exportTraceability')}</button>
      <button onClick={() => { handleExportTraceabilityCsv(); setShowExportMenu(false); setShowMoreMenu(false); }} disabled={!canExport} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-(--text-primary) hover:bg-(--surface-secondary) transition-colors disabled:opacity-40 disabled:cursor-not-allowed">{t('exportTraceabilityCsv')}</button>
    </div>
  );

  return (
    <header className="h-14 border-b border-(--border) bg-(--header-bg) backdrop-blur-md flex items-center px-2 sm:px-4 shrink-0 shadow-sm relative z-50">
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <Link to="/student/projects" data-tour="header-back" className={iconButton} aria-label={t('back')}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </Link>
        <div data-tour="header-logo" className="w-7 h-7 bg-(--brand) text-(--on-brand) rounded-lg text-xs flex items-center justify-center font-bold shadow-sm shrink-0">EP</div>
      </div>

      <div className="min-w-0 flex-1 flex justify-center px-2">
        <span data-tour="header-project-name" className="text-xs sm:text-sm font-bold text-(--text-primary) truncate max-w-full sm:max-w-[260px] lg:max-w-[360px]">{project?.title || t('project')}</span>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <div className="relative">
          <button data-tour="header-notifications" onClick={() => { setShowNotifications(!showNotifications); setShowMoreMenu(false); }} className={`relative ${iconButton}`} title={t('notifications')} aria-label={t('notifications')}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[9px] font-bold min-w-4 h-4 px-0.5 flex items-center justify-center rounded-full shadow-sm">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-1rem))] bg-(--surface) border border-(--border) rounded-xl shadow-xl z-[99999] max-h-96 overflow-y-auto">
              <div className="sticky top-0 bg-(--surface) border-b border-(--border-light) px-4 py-2.5 flex justify-between items-center">
                <span className="text-xs font-bold text-(--text-primary)">{t('notifications')}</span>
                <button onClick={() => setShowNotifications(false)} className={iconButton} aria-label={t('close')}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              {notifications.length === 0 ? (
                <div className="text-xs text-(--text-tertiary) italic text-center py-8">{t('noNotifications')}</div>
              ) : notifications.map((notification) => (
                <button key={notification.id} onClick={() => { if (!notification.read) onMarkNotificationRead(notification.id); }} className={`block w-full text-left px-4 py-3 border-b border-(--border-light) hover:bg-(--surface-secondary) transition-colors ${notification.read ? 'opacity-60' : 'bg-(--brand-soft)'}`}>
                  <p className="text-xs font-semibold text-(--text-primary)">{notification.message || notification.title || t('notifications')}</p>
                  <p className="text-[10px] text-(--text-tertiary) mt-0.5">{notification.createdAt ? new Date(notification.createdAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US') : ''}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-0.5 lg:gap-1">
          <button data-tour="header-history" onClick={onShowHistory} disabled={historyDisabled} className={iconButton} title={t('versionHistory')} aria-label={t('versionHistory')}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
          <button data-tour="header-dark-mode" onClick={toggleTheme} className={iconButton} title={theme === 'light' ? t('darkMode') : t('lightMode')} aria-label={theme === 'light' ? t('darkMode') : t('lightMode')}>
            {theme === 'light' ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
          </button>
          <button data-tour="header-language" onClick={toggleLanguage} className={`${iconButton} text-xs font-bold`} title={language === 'en' ? t('switchToVietnamese') : t('switchToEnglish')}>{language === 'en' ? 'VI' : 'EN'}</button>
          <button data-tour="header-ai-review" onClick={handleRunAiReview} disabled={!selectedPaper || isLocked || loadingAiReview} className="bg-(--brand) hover:bg-(--brand-hover) disabled:opacity-50 text-(--on-brand) p-2 lg:px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors" title={t('aiReview')}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            <span className="hidden lg:inline">{loadingAiReview ? t('loading') : t('aiReview')}</span>
          </button>
          <div className="relative">
            <button data-tour="header-export" onClick={() => { if (canExport) setShowExportMenu(!showExportMenu); }} disabled={!canExport} className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 lg:px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title={canExport ? t('export') : t('exportLocked')}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              <span className="hidden lg:inline">{t('export')}</span>
            </button>
            {showExportMenu && <div className="absolute right-0 top-full mt-2 w-60 bg-(--surface) border border-(--border) rounded-xl shadow-xl z-[99999]">{exportMenu}</div>}
          </div>
          <div data-tour="header-avatar" className="w-8 h-8 bg-(--brand) text-(--on-brand) rounded-full text-xs flex items-center justify-center font-bold shrink-0" title={user?.firstName ? `${user.firstName} ${user.lastName || ''}` : t('profile')}>
            {user?.firstName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          {project?.currentUserRole && <span className="hidden xl:inline text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider">{project.currentUserRole}</span>}
        </div>

        <div className="relative sm:hidden">
          <button onClick={() => { setShowMoreMenu(!showMoreMenu); setShowNotifications(false); }} className={iconButton} title={t('moreActions')} aria-label={showMoreMenu ? t('closeMenu') : t('openMenu')} aria-expanded={showMoreMenu}>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4z" /></svg>
          </button>
          {showMoreMenu && (
            <div className="absolute right-0 top-full mt-2 w-[min(18rem,calc(100vw-1rem))] bg-(--surface) border border-(--border) rounded-xl shadow-xl z-[99999] overflow-hidden">
              <button onClick={() => runMobileAction(onShowHistory)} disabled={historyDisabled} className="w-full text-left px-4 py-3 text-xs font-semibold text-(--text-primary) hover:bg-(--surface-secondary) disabled:opacity-40">{t('versionHistory')}</button>
              <button onClick={() => runMobileAction(toggleTheme)} className="w-full text-left px-4 py-3 text-xs font-semibold text-(--text-primary) hover:bg-(--surface-secondary)">{theme === 'light' ? t('darkMode') : t('lightMode')}</button>
              <button onClick={() => runMobileAction(toggleLanguage)} className="w-full text-left px-4 py-3 text-xs font-semibold text-(--text-primary) hover:bg-(--surface-secondary)">{t('language')}: {language === 'en' ? 'VI' : 'EN'}</button>
              <button onClick={() => runMobileAction(handleRunAiReview)} disabled={!selectedPaper || isLocked || loadingAiReview} className="w-full text-left px-4 py-3 text-xs font-bold text-(--brand) hover:bg-(--brand-soft) disabled:opacity-40">{loadingAiReview ? t('loading') : t('aiReview')}</button>
              {canExport && <div className="border-t border-(--border)"><p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wider text-emerald-700">{t('export')}</p>{exportMenu}</div>}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
