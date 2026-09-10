import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useAdminTour } from '../../hooks/useAdminTour.js';
import api from '../../services/api.js';
import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { SectionBoundary } from './components/shared.jsx';
import { DashboardSection } from './components/DashboardMetricsTab.jsx';
import { UsersSection } from './components/UsersTab.jsx';
import { ProjectsSection } from './components/ProjectsTab.jsx';
import { PapersSection } from './components/DocumentsTab.jsx';
import { AuditLogsSection } from './components/AuditLogsTab.jsx';
import { InfraSection } from './components/InfrastructureTab.jsx';
import { QueueSection } from './components/ExtractionQueueTab.jsx';
import { NotificationsSection } from './components/NotificationsTab.jsx';
import { SettingsSection } from './components/SettingsTab.jsx';
import { PromptConfigSection } from './components/PromptConfigTab.jsx';
import { DataManagementSection } from './components/DataManagementTab.jsx';
import NotificationBell from '../../components/ui/NotificationBell.jsx';
import ProfileModal from '../../components/ui/ProfileModal.jsx';
const NAV_ITEMS = [
  { key: 'dashboard', labelKey: 'dashboard' },
  { key: 'users', labelKey: 'users' },
  { key: 'projects', labelKey: 'projects' },
  { key: 'papers', labelKey: 'papers' },
  { key: 'audit', labelKey: 'audit' },
  { key: 'infra', labelKey: 'infra' },
  { key: 'extraction', labelKey: 'extractionQueue' },
  { key: 'notifications', labelKey: 'notifications' },
  { key: 'settings', labelKey: 'settings' },
  { key: 'prompts', labelKey: 'promptConfig' },
  { key: 'data', labelKey: 'dataManagement' },
];

const SECTIONS = {
  dashboard: DashboardSection, users: UsersSection, projects: ProjectsSection, papers: PapersSection,
  audit: AuditLogsSection, infra: InfraSection, extraction: QueueSection, notifications: NotificationsSection,
  settings: SettingsSection, prompts: PromptConfigSection, data: DataManagementSection,
};

const getIcon = (key, isActive) => {
  const cls = `w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`;
  switch (key) {
    case 'dashboard':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 14a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
        </svg>
      );
    case 'users':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    case 'projects':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      );
    case 'papers':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'audit':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      );
    case 'infra':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case 'extraction':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
    case 'notifications':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      );
    case 'settings':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'prompts':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'data':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7M4 7l8-4 8 4M4 7h16" />
        </svg>
      );
    default:
      return null;
  }
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { logout, user: authUser } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const label = (item) => t(`admin.${item.labelKey}`);
  const [navQuery, setNavQuery] = useState('');
  const filteredNav = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return NAV_ITEMS;
    const enT = i18n.getFixedT('en');
    const viT = i18n.getFixedT('vi');
    return NAV_ITEMS.filter((item) =>
      enT(`admin.${item.labelKey}`).toLowerCase().includes(q)
      || viT(`admin.${item.labelKey}`).toLowerCase().includes(q));
  }, [navQuery]);

  // ponytail: entering the admin page always lands on the dashboard —
  // the last-visited tab is intentionally not restored.
  const [active, setActive] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const Section = SECTIONS[active];

  const handleLogout = () => { logout(); navigate('/'); };

  const tourSteps = useCallback(() => {
    const navItems = NAV_ITEMS.map(item => ({
      element: `[data-guide="nav-${item.key}"]`,
      popover: {
        title: label(item),
        description: t('admin.tourNavItemDesc', { label: label(item).toLowerCase() }),
        side: 'right',
        align: 'start',
      }
    }));
    return [
      {
        popover: {
          title: t('admin.tourWelcomeTitle'),
          description: t('admin.tourWelcomeDesc'),
          side: 'center',
        }
      },
      {
        element: '[data-guide="sidebar"]',
        popover: {
          title: t('admin.tourSidebarTitle'),
          description: t('admin.tourSidebarDesc'),
          side: 'right',
        }
      },
      ...navItems,
      {
        element: '[data-guide="header"]',
        popover: {
          title: t('admin.tourHeaderTitle'),
          description: t('admin.tourHeaderDesc'),
          side: 'bottom',
        }
      },
      {
        element: '[data-guide="content"]',
        popover: {
          title: t('admin.tourContentTitle'),
          description: t('admin.tourContentDesc'),
          side: 'left',
        }
      },
      {
        element: '[data-guide="footer"]',
        popover: {
          title: t('admin.tourFooterTitle'),
          description: t('admin.tourFooterDesc'),
          side: 'top',
        }
      },
      {
        popover: {
          title: t('admin.tourReadyTitle'),
          description: t('admin.tourReadyDesc'),
        }
      },
    ];
  }, [t, label]);
  const { start: startTour } = useAdminTour('admin_dashboard', tourSteps);

  return (
    <div className="min-h-screen bg-(--page-bg) font-sans flex text-(--text-primary)">
      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <aside data-guide="sidebar" className={`fixed lg:static lg:h-screen lg:sticky lg:top-0 inset-y-0 left-0 z-40 bg-[#111e3b] flex flex-col transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} border-none`}>
        {/* Brand — with inline collapse icon */}
        <div className={`h-16 flex items-center gap-2 px-3 border-b border-white/5 shrink-0 bg-[#0c162e] ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#1e3a8a] flex items-center justify-center text-white shadow-sm shrink-0">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L1 8h3v12h2V8h4v12h2V8h4v12h2V8h3L12 2zm-5 8h2v8H7v-8zm6 0h2v8h-2v-8z" />
                </svg>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-white tracking-tight leading-none truncate">EvidencePilot</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">
                  {i18n.language === 'vi' ? 'BẢNG QUẢN TRỊ' : 'ADMIN CONSOLE'}
                </span>
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(p => !p)}
            title={collapsed ? (i18n.language === 'vi' ? 'Mở rộng' : 'Expand') : (i18n.language === 'vi' ? 'Thu gọn' : 'Collapse')}
            aria-label={collapsed ? (i18n.language === 'vi' ? 'Mở rộng thanh bên' : 'Expand sidebar') : (i18n.language === 'vi' ? 'Thu gọn thanh bên' : 'Collapse sidebar')}
            className="hidden lg:flex w-7 h-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition shrink-0 cursor-pointer"
          >
            <span className="text-xs">{collapsed ? '\u25B6' : '\u25C0'}</span>
          </button>
        </div>

        {/* Search Functions — hidden when collapsed */}
        {!collapsed && (
          <div className="px-3 pt-3">
            <div className="flex items-center relative">
              <svg className="w-3.5 h-3.5 text-slate-500 absolute left-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                placeholder={t('admin.navSearch')}
                aria-label={t('admin.navSearch')}
                className="w-full pl-8 pr-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {filteredNav.map(item => (
            <button key={item.key} data-guide={`nav-${item.key}`} onClick={() => { setActive(item.key); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition text-left group ${active === item.key ? 'bg-white/10 text-white shadow-sm font-semibold' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
              title={collapsed ? label(item) : undefined}>
              {getIcon(item.key, active === item.key)}
              {!collapsed && <span className="truncate">{label(item)}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom — Avatar + Name + Role with inline Sign Out icon + Collapse */}
        <div className="border-t border-white/5 p-3 space-y-2 shrink-0 bg-[#0c162e]">
          <div className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              title={t('admin.myProfile')}
              className={`flex items-center gap-3 rounded-lg hover:bg-white/5 transition-colors p-1 -m-1 text-left flex-1 min-w-0 ${collapsed ? 'justify-center' : ''}`}
            >
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#1e3a8a] flex items-center justify-center text-xs text-white font-bold shadow-sm shrink-0">
                {authUser?.avatarUrl ? (
                  <img src={authUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  'AD'
                )}
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-bold text-white leading-none truncate">{t('admin.adminUser')}</p>
                  <p className="text-[10px] text-slate-400 font-bold mt-1 truncate">{t('admin.systemManager')}</p>
                </div>
              )}
            </button>
            {!collapsed && (
              <button
                onClick={handleLogout}
                title={t('admin.signOut')}
                aria-label={t('admin.signOut')}
                className="p-2 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            )}
          </div>
          {collapsed && (
            <button
              onClick={handleLogout}
              title={t('admin.signOut')}
              aria-label={t('admin.signOut')}
              className="w-full flex items-center justify-center p-2 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header data-guide="header" className="h-16 bg-(--surface) border-b border-(--border) flex items-center justify-between px-6 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden text-(--text-tertiary) hover:text-(--text-primary)">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            
            {/* Breadcrumb breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-(--text-tertiary)">
              <span>{t('admin.admin')}</span>
              <span>{'\u203A'}</span>
              <span className="text-(--text-primary) font-bold">{label(NAV_ITEMS.find(n => n.key === active))}</span>
            </div>
          </div>

          {/* Right side items */}
          <div className="flex items-center gap-4">
            <NotificationBell />
            <button onClick={startTour} className="flex items-center gap-1.5 text-xs font-bold text-(--text-secondary) bg-(--surface) border border-(--border) px-3 py-1.5 rounded-lg hover:bg-(--surface-secondary) transition shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span>{t('admin.tourGuide')}</span>
            </button>

            {/* Language buttons EN | VN */}
            <div className="flex bg-(--surface-secondary) p-0.5 rounded-lg border border-(--border) text-[10px] font-bold">
              <button onClick={() => language !== 'en' && toggleLanguage()} 
                className={`px-2.5 py-1 rounded-md transition ${language === 'en' ? 'bg-(--surface) text-(--text-primary) shadow-sm' : 'text-(--text-tertiary)'}`}>EN</button>
              <button onClick={() => language !== 'vi' && toggleLanguage()} 
                className={`px-2.5 py-1 rounded-md transition ${language === 'vi' ? 'bg-(--surface) text-(--text-primary) shadow-sm' : 'text-(--text-tertiary)'}`}>VN</button>
            </div>

            {/* Dark/Light mode toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--surface-secondary) rounded-lg transition-colors"
            >
              {theme === 'dark' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="4" />
                  <path strokeLinecap="round" d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                </svg>
              )}
            </button>


          </div>
        </header>

        {/* Content */}
        <main data-guide="content" style={{ backgroundColor: collapsed ? 'var(--content-canvas)' : 'var(--page-bg)' }} className={`flex-1 overflow-y-auto w-full max-w-[1600px] mx-auto transition-colors duration-200`}>
          <SectionBoundary>
            <Section api={api} />
          </SectionBoundary>
        </main>


      </div>

      <ProfileModal open={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
    </div>
  );
}

