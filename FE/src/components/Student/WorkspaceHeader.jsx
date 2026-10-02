import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import TourLauncher from '../ui/TourLauncher.jsx';
import NotificationBell from '../ui/NotificationBell.jsx';
import ProfileModal from '../ui/ProfileModal.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';
import SectionStandardsTab from '../Instructor/review/SectionStandardsTab.jsx';
import { formatDateTime } from '../../utils/formatters/date.js';

export default function WorkspaceHeader({ workspaceMode = 'student', project, notifications, unreadCount, showNotifications, setShowNotifications, onMarkNotificationRead, onMarkAllNotificationsRead, onOpenNotification, historyDisabled, onShowHistory, showExportMenu, setShowExportMenu, handleExportTexArchive, handleExportTraceabilityJson, handleExportTraceabilityCsv, tourSteps, tourKey, reviewAction = null, reviewRound = null, review = null, reviewSection = null, reviewTools = null }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { language, toggleLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  // rationale: review-only header menus share the hook-owned round state (no duplicate source)
  const [showRoundMenu, setShowRoundMenu] = useState(false);
  const [showStandards, setShowStandards] = useState(false);
  const [showMobileStandards, setShowMobileStandards] = useState(false);
  const isReview = workspaceMode === 'review';
  const activeRound = reviewRound?.orderedRequests?.find(r => String(r.id) === String(reviewRound.activeRequestId)) || reviewRound?.orderedRequests?.[0] || null;
  const canExport = project?.status === 'APPROVED' || project?.status === 'ARCHIVED';
  const iconButton = 'p-2 hover:bg-(--surface-secondary) rounded-lg text-(--text-secondary) transition-colors disabled:opacity-30';

  const runMobileAction = (action) => {
    setShowMoreMenu(false);
    action();
  };
  const handleLogout = () => { logout(); navigate('/'); };

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
        <Link to={workspaceMode === 'review' ? '/instructor/requests' : '/student/projects'} data-tour="header-back" className={iconButton} aria-label={t('back')}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </Link>
        <div data-tour="header-logo" className="w-7 h-7 bg-(--brand) text-(--on-brand) rounded-lg text-xs flex items-center justify-center font-bold shadow-sm shrink-0">EP</div>
        {isReview && reviewRound?.orderedRequests?.length > 0 && (
          <div className="relative shrink-0">
            <button type="button" onClick={() => { setShowRoundMenu(!showRoundMenu); setShowMoreMenu(false); }} aria-expanded={showRoundMenu} aria-label={t('instructor.review.reviewRound')}
              title={activeRound ? formatDateTime(activeRound.requestedAt, language) : undefined}
              className="flex h-7 max-w-[110px] sm:max-w-[160px] items-center gap-1 rounded-lg border border-(--border) bg-(--surface-secondary) px-2 text-[11px] font-bold text-(--text-secondary) hover:text-(--text-primary) focus-visible:ring-2 focus-visible:ring-(--brand)">
              <span className="truncate">{activeRound ? formatDateTime(activeRound.requestedAt, language) : ''}</span>
              <svg className={`w-3 h-3 shrink-0 transition-transform ${showRoundMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showRoundMenu && (
              <div className="absolute left-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] bg-(--surface) border border-(--border) rounded-xl shadow-xl z-[99999] max-h-80 overflow-y-auto py-1">
                {reviewRound.orderedRequests.map(req => (
                  <button key={req.id} type="button" onClick={() => { reviewRound.setActiveRequestId(req.id); setShowRoundMenu(false); }}
                    aria-pressed={String(req.id) === String(reviewRound.activeRequestId)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-(--surface-secondary) ${String(req.id) === String(reviewRound.activeRequestId) ? 'font-bold text-(--brand-foreground)' : 'text-(--text-secondary)'}`}>
                    <span className="truncate">{String(req.id) === String(reviewRound.activeRequestId) ? '✓ ' : ''}{formatDateTime(req.requestedAt, language)}</span>
                    <StatusBadge status={req.status} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 flex justify-center items-center gap-1.5 px-2">
        <span data-tour="header-project-name" className="text-xs sm:text-sm font-bold text-(--text-primary) truncate max-w-full sm:max-w-[260px] lg:max-w-[360px]">{project?.title || t('project')}</span>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <NotificationBell
          open={showNotifications}
          onOpenChange={setShowNotifications}
          onOpenNotification={async (notification) => { await onOpenNotification?.(notification); }}
          onMarkNotificationRead={onMarkNotificationRead}
          onMarkAllNotificationsRead={onMarkAllNotificationsRead}
          onToggleExtra={() => setShowMoreMenu(false)}
          tourId="header-notifications"
          alertMessage={reviewAction?.error || ''}
        />

        <div className="hidden sm:flex items-center gap-0.5 lg:gap-1">
          {workspaceMode !== 'review' && <button data-tour="header-history" onClick={onShowHistory} disabled={historyDisabled} className={iconButton} title={t('versionHistory')} aria-label={t('versionHistory')}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>}
          <button data-tour="header-dark-mode" onClick={toggleTheme} className={iconButton} title={theme === 'light' ? t('darkMode') : t('lightMode')} aria-label={theme === 'light' ? t('darkMode') : t('lightMode')}>
            {theme === 'light' ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
          </button>
          {tourSteps && <TourLauncher steps={tourSteps} tourKey={tourKey || 'student-workspace'} className={`${iconButton} w-8 h-8 flex items-center justify-center`} />}
          <div className="flex bg-(--surface-secondary) p-0.5 rounded-lg border border-(--border) text-[10px] font-bold">
            <button onClick={() => language !== 'en' && toggleLanguage()} className={`px-2 py-1 rounded-md transition ${language === 'en' ? 'bg-(--surface) text-(--text-primary) shadow-sm' : 'text-(--text-tertiary)'}`}>EN</button>
            <button onClick={() => language !== 'vi' && toggleLanguage()} className={`px-2 py-1 rounded-md transition ${language === 'vi' ? 'bg-(--surface) text-(--text-primary) shadow-sm' : 'text-(--text-tertiary)'}`}>VN</button>
          </div>
          {isReview && review && (
              <div className="relative">
                <button type="button" onClick={() => { setShowStandards(!showStandards); setShowRoundMenu(false); setShowMoreMenu(false); }} className="flex h-8 items-center gap-1 rounded-lg border border-(--border) bg-(--surface) px-2 text-xs font-bold text-(--text-secondary) transition-colors hover:text-(--text-primary)" title={t('instructor.review.standardsTab')} aria-label={t('instructor.review.standardsTab')} aria-expanded={showStandards}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span className="hidden lg:inline">{t('instructor.review.standardsTab')}</span>
                </button>
                {showStandards && (
                  <div className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-1rem))] bg-(--surface) border border-(--border) rounded-xl shadow-xl z-[99999] max-h-96 overflow-y-auto hide-scrollbar p-1">
                    <div className="sticky top-0 bg-(--surface) px-3 py-2 flex justify-between items-center">
                      <span className="text-xs font-bold text-(--text-primary)">{t('instructor.review.standardsTab')}</span>
                      <button type="button" onClick={() => setShowStandards(false)} className={iconButton} aria-label={t('close')}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                    <div className="px-3 pb-3">
                      <SectionStandardsTab review={review} selectedSection={reviewSection} />
                    </div>
                  </div>
                )}
              </div>
          )}
          {workspaceMode !== 'review' && reviewAction && (() => {
            const total = Number(reviewAction.progress?.total) || 0;
            const current = Number(reviewAction.progress?.current) || 0;
            const percent = reviewAction.busy && total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
            const busyLabel = reviewAction.busy ? (percent > 0 ? `${percent}%` : t('loading')) : reviewAction.label;
            return (
            <span className="relative inline-flex items-center gap-1 group">
              <button type="button" data-tour="header-ai-review" onClick={reviewAction.onClick} disabled={reviewAction.disabled || reviewAction.busy}
                aria-label={busyLabel}
                className="flex h-8 items-center gap-1 rounded-lg bg-(--brand) px-2 text-xs font-bold text-(--on-brand) transition-colors hover:bg-(--brand-hover) disabled:opacity-50">
                {reviewAction.busy ? (
                  <div className="h-4 w-4 border-[2px] border-(--on-brand)/50 rounded-full animate-spin border-l-transparent" role="status">
                    <span className="sr-only">Loading...</span>
                  </div>
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                )}
                <span className="hidden lg:inline">{busyLabel}</span>
              </button>
              <div
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-(--border) bg-(--surface) px-3 py-2 text-[11px] font-normal leading-relaxed text-(--text-secondary) shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-opacity whitespace-normal text-left"
              >
                <p className="font-bold text-(--text-primary)">{reviewAction.busy ? t('reviewing') : reviewAction.description}</p>
                {!reviewAction.isReferenceCheck && <p className="mt-1">{t('citationReviewTooltipLimits')}</p>}
              </div>
            </span>
            );
          })()}
          {isReview && reviewTools && (() => {
            const total = Number(reviewTools.citationProgress?.total) || 0;
            const current = Number(reviewTools.citationProgress?.current) || 0;
            const percent = reviewTools.citationBusy && total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
            const citationLabel = reviewTools.citationBusy ? (percent > 0 ? `${percent}%` : t('loading')) : t('citationReview');
            return (
            <span className="inline-flex items-center gap-1.5">
              {reviewTools.isReferenceSection ? (
                <button type="button" onClick={reviewTools.onRunReferenceCheck} disabled={reviewTools.referenceDisabled || reviewTools.referenceBusy}
                  aria-label={t('refCheckAction')}
                  title={t('refCheckDescription')}
                  className="flex h-8 items-center gap-1 rounded-lg border border-(--border) bg-(--surface) px-2 text-xs font-bold text-(--text-secondary) transition-colors hover:text-(--text-primary) disabled:opacity-50">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                  <span className="hidden lg:inline">{reviewTools.referenceBusy ? t('loading') : t('refCheckAction')}</span>
                </button>
              ) : (
                <>
                  <button type="button" onClick={reviewTools.onRunCitationReview} disabled={reviewTools.citationDisabled || reviewTools.citationBusy || reviewTools.citationReadOnly}
                    aria-label={t('citationReview')}
                    title={reviewTools.citationError
                      || (reviewTools.citationReadOnly ? t('instructor.review.citationReadOnly')
                      : reviewTools.citationCount === 0 && reviewTools.cooldownRemainingSec > 0
                        ? t('instructor.review.citationCooldown', { remaining: `${Math.floor(reviewTools.cooldownRemainingSec / 60)}:${String(reviewTools.cooldownRemainingSec % 60).padStart(2, '0')}` })
                      : reviewTools.citationCount === 0 && reviewTools.runBlockedReason === 'historical' ? t('instructor.review.historicalRoundNotice')
                      : reviewTools.citationCount === 0 && reviewTools.runBlockedReason === 'no-pending' ? t('instructor.review.citationRunNeedsPending')
                      : reviewTools.citationCount === 0 && reviewTools.runBlockedReason === 'locked' ? t('projectLocked')
                      : t('citationReviewDescription'))}
                    className="flex h-8 items-center gap-1 rounded-lg bg-(--brand) px-2 text-xs font-bold text-(--on-brand) transition-colors hover:bg-(--brand-hover) disabled:opacity-50">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                    <span className="hidden lg:inline">{citationLabel}</span>
                  </button>
                </>
              )}
            </span>
            );
          })()}
          {workspaceMode !== 'review' && canExport && (
          <div className="relative">
            <button data-tour="header-export" onClick={() => setShowExportMenu(!showExportMenu)} className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 lg:px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors" title={t('export')}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              <span className="hidden lg:inline">{t('export')}</span>
            </button>
            {showExportMenu && <div className="absolute right-0 top-full mt-2 w-60 bg-(--surface) border border-(--border) rounded-xl shadow-xl z-[99999]">{exportMenu}</div>}
          </div>
          )}
          <button type="button" data-tour="header-avatar" onClick={() => setShowProfile(true)} className="flex items-center gap-2 rounded-lg hover:bg-(--surface-secondary) p-1 transition-colors" title={t('profile')}>
            <div className="w-8 h-8 bg-(--brand) text-(--on-brand) rounded-full text-xs flex items-center justify-center font-bold shrink-0">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
              ) : (
                user?.firstName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'
              )}
            </div>
            {project?.currentUserRole && <span className="hidden lg:inline text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider">{project.currentUserRole}</span>}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            title={t('shell.profile.signOut')}
            aria-label={t('shell.profile.signOut')}
            className={iconButton}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
          <ProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
        </div>

        <div className="relative sm:hidden">
          <button onClick={() => { setShowMoreMenu(!showMoreMenu); setShowNotifications(false); }} className={iconButton} title={t('moreActions')} aria-label={showMoreMenu ? t('closeMenu') : t('openMenu')} aria-expanded={showMoreMenu}>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4z" /></svg>
          </button>
          {showMoreMenu && (
            <div className="absolute right-0 top-full mt-2 w-[min(18rem,calc(100vw-1rem))] bg-(--surface) border border-(--border) rounded-xl shadow-xl z-[99999] overflow-hidden">
              {workspaceMode !== 'review' && <button onClick={() => runMobileAction(onShowHistory)} disabled={historyDisabled} className="w-full text-left px-4 py-3 text-xs font-semibold text-(--text-primary) hover:bg-(--surface-secondary) disabled:opacity-40">{t('versionHistory')}</button>}
              {workspaceMode !== 'review' && reviewAction && (() => {
                const mTotal = Number(reviewAction.progress?.total) || 0;
                const mCurrent = Number(reviewAction.progress?.current) || 0;
                const mPct = reviewAction.busy && mTotal > 0 ? Math.min(100, Math.round((mCurrent / mTotal) * 100)) : 0;
                return <button onClick={() => runMobileAction(reviewAction.onClick)} disabled={reviewAction.disabled || reviewAction.busy} className="w-full text-left px-4 py-3 text-xs font-semibold text-(--text-primary) hover:bg-(--surface-secondary) disabled:opacity-40">{reviewAction.busy ? (mPct > 0 ? `${mPct}%` : t('loading')) : reviewAction.label}</button>;
              })()}
              {isReview && reviewTools && !reviewTools.isReferenceSection && (() => {
                const mTotal = Number(reviewTools.citationProgress?.total) || 0;
                const mCurrent = Number(reviewTools.citationProgress?.current) || 0;
                const mPct = reviewTools.citationBusy && mTotal > 0 ? Math.min(100, Math.round((mCurrent / mTotal) * 100)) : 0;
                return <button onClick={() => runMobileAction(reviewTools.onRunCitationReview)} disabled={reviewTools.citationDisabled || reviewTools.citationBusy || reviewTools.citationReadOnly} className="w-full text-left px-4 py-3 text-xs font-semibold text-(--text-primary) hover:bg-(--surface-secondary) disabled:opacity-40">{reviewTools.citationBusy ? (mPct > 0 ? `${mPct}%` : t('loading')) : t('citationReview')}</button>;
              })()}
              {isReview && reviewTools && reviewTools.isReferenceSection && <button onClick={() => runMobileAction(reviewTools.onRunReferenceCheck)} disabled={reviewTools.referenceDisabled || reviewTools.referenceBusy} className="w-full text-left px-4 py-3 text-xs font-semibold text-(--text-primary) hover:bg-(--surface-secondary) disabled:opacity-40">{t('refCheckAction')}</button>}
              {isReview && review && <button onClick={() => setShowMobileStandards(!showMobileStandards)} aria-expanded={showMobileStandards} className="w-full text-left px-4 py-3 text-xs font-semibold text-(--text-primary) hover:bg-(--surface-secondary)">{t('instructor.review.standardsTab')}</button>}
              {isReview && review && showMobileStandards && (
                <div className="px-4 pb-3">
                  <SectionStandardsTab review={review} selectedSection={reviewSection} />
                </div>
              )}
              <button onClick={() => runMobileAction(toggleTheme)} className="w-full text-left px-4 py-3 text-xs font-semibold text-(--text-primary) hover:bg-(--surface-secondary)">{theme === 'light' ? t('darkMode') : t('lightMode')}</button>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-(--text-primary)">{t('language')}</span>
                <div className="flex bg-(--surface-secondary) p-0.5 rounded-lg border border-(--border) text-[10px] font-bold">
                  <button onClick={() => { if (language !== 'en') toggleLanguage(); setShowMoreMenu(false); }} className={`px-2.5 py-1 rounded-md transition ${language === 'en' ? 'bg-(--surface) text-(--text-primary) shadow-sm' : 'text-(--text-tertiary)'}`}>EN</button>
                  <button onClick={() => { if (language !== 'vi') toggleLanguage(); setShowMoreMenu(false); }} className={`px-2.5 py-1 rounded-md transition ${language === 'vi' ? 'bg-(--surface) text-(--text-primary) shadow-sm' : 'text-(--text-tertiary)'}`}>VN</button>
                </div>
              </div>
              {canExport && workspaceMode !== 'review' && <div className="border-t border-(--border)"><p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wider text-emerald-700">{t('export')}</p>{exportMenu}</div>}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
