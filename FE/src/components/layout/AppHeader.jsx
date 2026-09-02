import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { commonText, instructorText, studentText } from '../../locales';
import NotificationBell from '../ui/NotificationBell';

function ThemeIcon({ theme }) {
  return theme === 'light' ? (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

export default function AppHeader({ variant = 'app', labels }) {
  const isPublic = variant === 'public';
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, role, logout } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef(null);

  const it = instructorText[language];
  const st = studentText[language];
  const ct = commonText[language];

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const links = isPublic
    ? [
        { label: labels?.nav?.home || 'Home', path: '/' },
        { label: labels?.nav?.about || 'About', path: '/about' },
        { label: labels?.nav?.terms || 'Terms', path: '/terms' },
        { label: labels?.nav?.privacy || 'Privacy', path: '/privacy' },
      ]
    : role === 'INSTRUCTOR'
      ? [
          { label: it.dashboard, path: '/instructor/dashboard' },
          { label: it.collections, path: '/instructor/collections' },
          { label: it.sourceLibrary, path: '/instructor/source-library' },
          { label: it.projects, path: '/instructor/projects' },
          { label: it.requests, path: '/instructor/requests' },
        ]
      : role === 'ADMIN'
        ? [{ label: 'Dashboard', path: '/admin/dashboard' }]
        : [{ label: st.projects, path: '/student/projects' }];

  const isActive = (path) => {
    return location.pathname === path || (path !== '/instructor/dashboard' && location.pathname.startsWith(`${path}/`));
  };

  const go = (path) => {
    setMenuOpen(false);
    setProfileDropdownOpen(false);
    navigate(path);
  };

  const signOut = () => {
    setMenuOpen(false);
    setProfileDropdownOpen(false);
    logout();
    navigate('/');
  };

  const themeLabel = theme === 'light' ? ct.darkMode : ct.lightMode;
  const fullName = user?.firstName || user?.lastName ? `${user?.firstName || ''} ${user?.lastName || ''}`.trim() : (user?.email || ct.profile);
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || 'U';

  const roleBadgeLabel = {
    ADMIN: ct.roleAdmin,
    INSTRUCTOR: ct.roleInstructor,
    STUDENT: ct.roleStudent,
  }[role] || role;

  return (
    <header className={`${isPublic ? 'fixed left-0 right-0' : 'sticky shrink-0'} top-0 z-50 h-16 border-b border-(--header-border) bg-(--header-bg) text-(--text-primary) shadow-sm backdrop-blur-md`}>
      <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 shrink-0 rounded-lg">
            <span className="w-8 h-8 bg-(--brand) text-(--on-brand) rounded-lg text-xs flex items-center justify-center font-bold shadow-xs">EP</span>
            <span className="hidden sm:inline font-bold text-sm text-(--text-primary) whitespace-nowrap">Evidence Pilot</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-2" aria-label={ct.primaryNavigation}>
            {links.map(link => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMenuOpen(false)}
                className={`text-xs font-semibold px-3 py-2 rounded-lg transition-colors ${isActive(link.path) ? 'bg-(--brand-soft) text-(--brand-foreground)' : 'text-(--text-secondary) hover:bg-(--surface-secondary) hover:text-(--brand-foreground)'}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <NotificationBell onOpen={() => { setMenuOpen(false); setProfileDropdownOpen(false); }} />
          <div className="hidden md:flex items-center gap-1.5">
            <button type="button" onClick={toggleTheme} className="p-2 text-(--text-secondary) hover:text-(--brand-foreground) hover:bg-(--surface-secondary) rounded-lg transition-colors" title={themeLabel} aria-label={themeLabel}>
              <ThemeIcon theme={theme} />
            </button>
            <button type="button" onClick={toggleLanguage} className="min-w-9 px-2 py-1.5 text-xs font-bold text-(--text-secondary) border border-(--border) rounded-lg hover:bg-(--surface-secondary) hover:text-(--brand-foreground) transition-colors">
              {language === 'vi' ? 'EN' : 'VI'}
            </button>

            {isAuthenticated ? (
              <div className="relative ml-1" ref={profileDropdownRef}>
                <button
                  type="button"
                  onClick={() => setProfileDropdownOpen(prev => !prev)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-(--border) bg-(--surface) hover:bg-(--surface-secondary) text-(--text-primary) text-xs font-semibold transition-all shadow-xs focus:outline-none focus:ring-2 focus:ring-(--focus)"
                  aria-expanded={profileDropdownOpen}
                  aria-haspopup="true"
                >
                  <span className="w-6 h-6 rounded-full bg-(--brand-soft) text-(--brand-foreground) font-bold text-[10px] flex items-center justify-center">
                    {initials}
                  </span>
                  <span className="max-w-[120px] truncate">{fullName}</span>
                  <svg className={`w-3.5 h-3.5 text-(--text-tertiary) transition-transform ${profileDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {profileDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-(--border) bg-(--surface) p-2 shadow-xl z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 border-b border-(--border-light) mb-1">
                      <p className="font-bold text-(--text-primary) truncate">{fullName}</p>
                      <p className="text-[10px] text-(--text-tertiary) truncate mt-0.5">{user?.email}</p>
                      <div className="mt-1.5">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-(--brand-soft) text-(--brand-foreground) border border-(--brand)/20">
                          {roleBadgeLabel}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => go('/profile?tab=account')}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-(--text-secondary) hover:bg-(--surface-secondary) hover:text-(--brand-foreground) font-medium transition-colors"
                    >
                      <svg className="w-4 h-4 text-(--text-tertiary)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      {language === 'vi' ? 'Cài đặt tài khoản' : 'Account Settings'}
                    </button>

                    <button
                      type="button"
                      onClick={() => go('/profile?tab=activity')}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-(--text-secondary) hover:bg-(--surface-secondary) hover:text-(--brand-foreground) font-medium transition-colors"
                    >
                      <svg className="w-4 h-4 text-(--text-tertiary)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                      {language === 'vi' ? 'Không gian & Hoạt động' : 'My Activity'}
                    </button>

                    <div className="border-t border-(--border-light) my-1" />

                    <button
                      type="button"
                      onClick={signOut}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-semibold transition-colors"
                    >
                      <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                      {ct.signOut}
                    </button>
                  </div>
                )}
              </div>
            ) : isPublic ? (
              <Link to="/login" className="px-4 py-2 text-xs font-bold text-(--brand-foreground) bg-(--brand-soft) hover:brightness-95 rounded-lg transition">{labels?.nav?.login || 'Login'}</Link>
            ) : null}
          </div>

          <button
            type="button"
            className="md:hidden p-2 text-(--text-secondary) hover:text-(--brand-foreground) hover:bg-(--surface-secondary) rounded-lg"
            onClick={() => setMenuOpen(value => !value)}
            aria-expanded={menuOpen}
            aria-controls="app-mobile-navigation"
            aria-label={menuOpen ? ct.closeMenu : ct.openMenu}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="app-mobile-navigation" className="md:hidden absolute inset-x-0 top-full border-b border-(--border) bg-(--surface) shadow-xl px-4 py-4">
          <nav className="space-y-1" aria-label={ct.mobileNavigation}>
            {links.map(link => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMenuOpen(false)}
                className={`block w-full text-left text-sm font-semibold px-3 py-2.5 rounded-xl ${isActive(link.path) ? 'bg-(--brand-soft) text-(--brand-foreground)' : 'text-(--text-secondary) hover:bg-(--surface-secondary)'}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 pt-3 border-t border-(--border-light) grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { toggleTheme(); setMenuOpen(false); }} className="flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-(--text-secondary) border border-(--border) rounded-xl hover:bg-(--surface-secondary)">
              <ThemeIcon theme={theme} /> {themeLabel}
            </button>
            <button type="button" onClick={() => { toggleLanguage(); setMenuOpen(false); }} className="px-3 py-2.5 text-xs font-bold text-(--text-secondary) border border-(--border) rounded-xl hover:bg-(--surface-secondary)">
              {language === 'vi' ? 'EN' : 'VI'}
            </button>
            {isAuthenticated ? (
              <>
                <button type="button" onClick={() => go('/profile?tab=account')} className="px-3 py-2.5 text-xs font-semibold text-(--text-secondary) border border-(--border) rounded-xl hover:bg-(--surface-secondary)">
                  {language === 'vi' ? 'Cài đặt tài khoản' : 'Account'}
                </button>
                <button type="button" onClick={() => go('/profile?tab=activity')} className="px-3 py-2.5 text-xs font-semibold text-(--text-secondary) border border-(--border) rounded-xl hover:bg-(--surface-secondary)">
                  {language === 'vi' ? 'Hoạt động' : 'Activity'}
                </button>
                <button type="button" onClick={signOut} className="col-span-2 px-3 py-2.5 text-xs font-semibold text-rose-600 border border-rose-200 dark:border-rose-900 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30 text-center">
                  {ct.signOut}
                </button>
              </>
            ) : isPublic ? (
              <Link to="/login" onClick={() => setMenuOpen(false)} className="col-span-2 text-center px-3 py-2.5 text-xs font-bold text-(--on-brand) bg-(--brand) rounded-xl">{labels?.nav?.login || 'Login'}</Link>
            ) : null}
          </div>
        </div>
      )}
    </header>
  );
}
