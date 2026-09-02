import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import api from '../../services/api.js';
import { t, SectionBoundary } from './components/shared.jsx';
import { DashboardSection } from './components/DashboardMetricsTab.jsx';
import { UsersSection } from './components/UsersTab.jsx';
import { ProjectsSection } from './components/ProjectsTab.jsx';
import { PapersSection } from './components/DocumentsTab.jsx';
import { AuditLogsSection } from './components/AuditLogsTab.jsx';
import { InfraSection } from './components/InfrastructureTab.jsx';
import { QueueSection } from './components/ExtractionQueueTab.jsx';
import { CollectionsSection } from './components/CollectionsTab.jsx';
import { NotificationsSection } from './components/NotificationsTab.jsx';
import { SettingsSection } from './components/SettingsTab.jsx';
import NotificationBell from '../../components/ui/NotificationBell.jsx';
const NAV_ITEMS = [
  { key: 'dashboard', labelEn: 'Dashboard', labelVi: 'Bảng điều khiển' },
  { key: 'users', labelEn: 'Users', labelVi: 'Người dùng' },
  { key: 'projects', labelEn: 'Projects', labelVi: 'Dự án' },
  { key: 'papers', labelEn: 'Documents', labelVi: 'Tài liệu' },
  { key: 'audit', labelEn: 'Audit Logs', labelVi: 'Nhật ký' },
  { key: 'infra', labelEn: 'Infrastructure', labelVi: 'Hạ tầng' },
  { key: 'extraction', labelEn: 'Extraction Queue', labelVi: 'Hàng đợi' },
  { key: 'collections', labelEn: 'Collections', labelVi: 'Bộ sưu tập' },
  { key: 'notifications', labelEn: 'Notifications', labelVi: 'Thông báo' },
  { key: 'settings', labelEn: 'Settings', labelVi: 'Cài đặt' },
];

const SECTIONS = {
  dashboard: DashboardSection, users: UsersSection, projects: ProjectsSection, papers: PapersSection,
  audit: AuditLogsSection, infra: InfraSection, extraction: QueueSection, collections: CollectionsSection, notifications: NotificationsSection,
  settings: SettingsSection,
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
    case 'collections':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
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
    default:
      return null;
  }
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const L = t[language] || t.en;
  const label = (item) => language === 'vi' ? item.labelVi : item.labelEn;

  const [active, setActive] = useState(() => {
    const saved = localStorage.getItem('admin_active_tab');
    return SECTIONS[saved] ? saved : 'dashboard';
  });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('admin_active_tab', active);
  }, [active]);

  const Section = SECTIONS[active];

  const handleLogout = () => { logout(); navigate('/'); };

  const startTour = useCallback(() => {
    const navItems = NAV_ITEMS.map(item => ({
      element: `[data-tour="nav-${item.key}"]`,
      popover: {
        title: label(item),
        description: language === 'vi'
          ? `Nhấp để xem ${item.labelVi.toLowerCase()}. Tại đây bạn có thể quản lý và theo dõi các hoạt động liên quan.`
          : `Click to view ${item.labelEn.toLowerCase()}. Here you can manage and monitor related activities.`,
        side: 'right',
        align: 'start',
      }
    }));

    const driverObj = driver({
      animate: true,
      showProgress: true,
      showButtons: ['next', 'previous', 'close'],
      steps: [
        {
          popover: {
            title: language === 'vi' ? 'Chào mừng đến với Trang Quản trị' : 'Welcome to Admin Panel',
            description: language === 'vi'
              ? 'Hướng dẫn này sẽ giới thiệu các chức năng chính. Nhấp "Tiếp theo" để bắt đầu.'
              : 'This guide will introduce the main features. Click "Next" to start.',
            side: 'center',
          }
        },
        {
          element: '[data-tour="sidebar"]',
          popover: {
            title: language === 'vi' ? 'Thanh điều hướng' : 'Sidebar Navigation',
            description: language === 'vi'
              ? 'Sử dụng thanh bên để chuyển đổi giữa các chức năng quản trị.'
              : 'Use the sidebar to switch between admin functions.',
            side: 'right',
          }
        },
        ...navItems,
        {
          element: '[data-tour="header"]',
          popover: {
            title: language === 'vi' ? 'Thanh tiêu đề' : 'Header Bar',
            description: language === 'vi'
              ? 'Chứa nút chuyển ngôn ngữ, hướng dẫn và thông tin quản trị viên.'
              : 'Contains language toggle, guide, and admin profile info.',
            side: 'bottom',
          }
        },
        {
          element: '[data-tour="content"]',
          popover: {
            title: language === 'vi' ? 'Khu vực nội dung' : 'Content Area',
            description: language === 'vi'
              ? 'Nội dung của chức năng đang chọn sẽ hiển thị tại đây.'
              : 'Content for the selected function is displayed here.',
            side: 'left',
          }
        },
        {
          element: '[data-tour="footer"]',
          popover: {
            title: language === 'vi' ? 'Chân trang' : 'Footer',
            description: language === 'vi'
              ? 'Chuyển đổi ngôn ngữ giữa Tiếng Việt và English tại đây.'
              : 'Switch language between Vietnamese and English here.',
            side: 'top',
          }
        },
        {
          popover: {
            title: language === 'vi' ? 'Bắt đầu sử dụng' : 'Ready to Go',
            description: language === 'vi'
              ? 'Bạn đã sẵn sàng! Nhấp "Kết thúc" để bắt đầu quản trị hệ thống.'
              : "You're all set! Click 'Finish' to start managing the system.",
          }
        },
      ],
      onDestroy: () => localStorage.setItem('admin_tour_done', 'true'),
    });

    driverObj.drive();
  }, [language]);

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans flex text-[#0f172a]">
      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <aside data-tour="sidebar" className={`fixed lg:static lg:h-screen lg:sticky lg:top-0 inset-y-0 left-0 z-40 bg-[#111e3b] flex flex-col transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} border-none`}>
        {/* Brand */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-white/5 shrink-0 bg-[#0c162e]">
          {/* Circular University Pillars Icon */}
          <div className="w-8 h-8 rounded-lg bg-[#1e3a8a] flex items-center justify-center text-white shadow-sm shrink-0">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L1 8h3v12h2V8h4v12h2V8h4v12h2V8h3L12 2zm-5 8h2v8H7v-8zm6 0h2v8h-2v-8z" />
            </svg>
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white tracking-tight leading-none">EvidencePilot</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">ADMIN CONSOLE</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV_ITEMS.map(item => (
            <button key={item.key} data-tour={`nav-${item.key}`} onClick={() => { setActive(item.key); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition text-left group ${active === item.key ? 'bg-white/10 text-white shadow-sm font-semibold' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
              title={collapsed ? label(item) : undefined}>
              {getIcon(item.key, active === item.key)}
              {!collapsed && <span className="truncate">{label(item)}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-white/5 p-3 space-y-1 shrink-0 bg-[#0c162e]">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold text-slate-400 hover:bg-white/5 hover:text-white transition group">
            <svg className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!collapsed && <span>{L.signOut}</span>}
          </button>
          <button onClick={() => setCollapsed(p => !p)} className="hidden lg:flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white/5 hover:text-white transition">
            <span className="text-sm shrink-0">{collapsed ? '\u25B6' : '\u25C0'}</span>
            {!collapsed && <span>{L.collapse}</span>}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header data-tour="header" className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden text-gray-500 hover:text-gray-900">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            
            {/* Breadcrumb breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
              <span>{L.admin}</span>
              <span>{'\u203A'}</span>
              <span className="text-slate-800 font-bold">{label(NAV_ITEMS.find(n => n.key === active))}</span>
            </div>
          </div>

          {/* Search bar in the middle */}
          <div className="hidden md:flex items-center w-80 relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder={L.searchPlaceholder} 
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          {/* Right side items */}
          <div className="flex items-center gap-4">
            <NotificationBell />
            <button onClick={startTour} className="flex items-center gap-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition shadow-sm">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span>{L.tourGuide}</span>
            </button>

            {/* Language buttons EN | VN */}
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-gray-200 text-[10px] font-bold">
              <button onClick={() => language !== 'en' && toggleLanguage()} 
                className={`px-2.5 py-1 rounded-md transition ${language === 'en' ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-400'}`}>EN</button>
              <button onClick={() => language !== 'vi' && toggleLanguage()} 
                className={`px-2.5 py-1 rounded-md transition ${language === 'vi' ? 'bg-white text-slate-800 shadow-sm' : 'text-gray-400'}`}>VN</button>
            </div>

            {/* Profile User Info */}
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex flex-col text-right">
                <span className="text-xs font-bold text-slate-800 leading-none">{L.adminUser}</span>
                <span className="text-[10px] text-gray-400 font-bold mt-1">{L.systemManager}</span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[#1e3a8a] flex items-center justify-center text-xs text-white font-bold shadow-sm shrink-0">
                AD
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main data-tour="content" className="flex-1 overflow-y-auto">
          <SectionBoundary>
            <Section lang={L} api={api} />
          </SectionBoundary>
        </main>

        {/* Footer */}
        <footer data-tour="footer" className="bg-white border-t border-gray-200 px-6 py-3.5 flex items-center justify-center text-[10px] font-semibold text-gray-400 shrink-0">
          <span>{L.footerTagline}</span>
        </footer>
      </div>
    </div>
  );
}

