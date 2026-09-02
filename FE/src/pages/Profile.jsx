import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api.js';
import { AppHeader, LoadingSkeleton, Breadcrumb } from '../components';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { commonText } from '../locales';

export default function Profile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: authUser, role, logout, verifySession } = useAuth();
  const { language } = useLanguage();
  const t = commonText[language];
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [user, setUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  // Tab State with deep-linking
  const currentTab = searchParams.get('tab') === 'activity' ? 'activity' : 'account';
  const setTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'activity') next.set('tab', 'activity');
    else next.delete('tab');
    setSearchParams(next);
  };

  useEffect(() => {
    if (!authUser) return;
    setUser(authUser);
    setFirstName(authUser.firstName || '');
    setLastName(authUser.lastName || '');
  }, [authUser]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setMessage({ type: 'error', text: t.nameRequired });
      return;
    }

    const currentPwd = (passwordForm.currentPassword || '').trim();
    const newPwd = (passwordForm.newPassword || '').trim();
    const confirmPwd = (passwordForm.confirmPassword || '').trim();
    const hasPasswordInput = Boolean(currentPwd || newPwd || confirmPwd);

    // Validate password fields if any password input was entered
    if (hasPasswordInput) {
      if (!currentPwd) {
        setMessage({
          type: 'error',
          text: language === 'vi' ? 'Vui lòng nhập mật khẩu hiện tại.' : 'Please enter your current password.',
        });
        return;
      }
      if (!newPwd) {
        setMessage({
          type: 'error',
          text: language === 'vi' ? 'Vui lòng nhập mật khẩu mới.' : 'Please enter a new password.',
        });
        return;
      }
      if (newPwd !== confirmPwd) {
        setMessage({ type: 'error', text: t.passwordMismatch });
        return;
      }
    }

    setSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      // Phase 3: Explicitly build PUT payload with ONLY profile fields (stripping password fields)
      const profilePayload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      };

      let profileUpdated = false;
      if (firstName.trim() !== (user.firstName || '') || lastName.trim() !== (user.lastName || '')) {
        const { data } = await api.put('/api/users/profile', profilePayload);
        setUser(data);
        profileUpdated = true;
        verifySession().catch(() => { });
      }

      // If valid password inputs were provided, call the dedicated password update endpoint
      if (hasPasswordInput) {
        await api.post('/api/auth/update-password', {
          currentPassword: currentPwd,
          newPassword: newPwd,
        });
        sessionStorage.setItem('auth_expired_notice', t.passwordChangedSignIn);
        logout();
        navigate('/login', { replace: true });
        return;
      }

      setMessage({
        type: 'success',
        text: profileUpdated ? t.profileUpdated : (language === 'vi' ? 'Đã lưu thay đổi thành công.' : 'Changes saved successfully.'),
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || t.profileUpdateFailed,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-(--page-bg)">
        <AppHeader />
        <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8"><LoadingSkeleton count={4} /></div>
      </div>
    );
  }

  const roleLabel = {
    ADMIN: t.roleAdmin,
    INSTRUCTOR: t.roleInstructor,
    STUDENT: t.roleStudent,
  }[user.role] || user.role;
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <div className="min-h-screen overflow-x-hidden bg-(--page-bg) text-(--text-primary) font-sans">
      <AppHeader />
      <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">

        <Breadcrumb
          items={[
            { label: role === 'INSTRUCTOR' ? 'Dashboard' : (role === 'ADMIN' ? 'Admin' : 'Projects'), path: role === 'INSTRUCTOR' ? '/instructor/dashboard' : (role === 'ADMIN' ? '/admin/dashboard' : '/student/projects') },
            { label: t.profile }
          ]}
        />

        {/* Profile Header Flexbox (Left: Avatar & Identity, Right: Tabs) */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start w-full gap-4 mb-6 border-b border-(--border) pb-6">
          {/* Avatar & Identity Info */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-(--brand-soft) text-(--brand-foreground) font-black text-lg flex items-center justify-center border border-(--brand)/20 shadow-xs shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-(--brand-foreground) truncate">
                {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user.email}
              </h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-(--brand-soft) text-(--brand-foreground) border border-(--brand)/20 shrink-0">
                  {roleLabel}
                </span>
                <span className="text-xs text-(--text-tertiary) truncate">{user.email}</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs (Right-aligned on md+) */}
          <div role="tablist" aria-label="Profile Tabs" className="inline-flex w-full md:w-auto rounded-xl border border-(--border) bg-(--surface-secondary) p-1 shrink-0">
            <button
              type="button"
              role="tab"
              aria-selected={currentTab === 'account'}
              onClick={() => setTab('account')}
              className={`flex-1 md:flex-none cursor-pointer rounded-lg px-4 sm:px-5 py-2 text-xs font-bold transition-all ${currentTab === 'account' ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
            >
              {language === 'vi' ? 'Cài đặt tài khoản' : 'Account Settings'}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={currentTab === 'activity'}
              onClick={() => setTab('activity')}
              className={`flex-1 md:flex-none cursor-pointer rounded-lg px-4 sm:px-5 py-2 text-xs font-bold transition-all ${currentTab === 'activity' ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
            >
              {language === 'vi' ? 'Không gian & Hoạt động' : 'My Activity'}
            </button>
          </div>
        </div>

        {/* Tab 1: Account Settings (Combined Single Form Card) */}
        {currentTab === 'account' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-(--border) bg-(--surface) p-6 sm:p-8 shadow-xs">
              <div className="mb-6 border-b border-(--border-light) pb-4">
                <h2 className="text-base font-bold text-(--text-primary)">
                  {language === 'vi' ? 'Thông tin cá nhân & Bảo mật' : 'Personal Information & Security'}
                </h2>
                <p className="text-xs text-(--text-secondary) mt-0.5">
                  {language === 'vi' ? 'Quản lý thông tin hồ sơ và mật khẩu tài khoản của bạn.' : 'Manage your personal profile details and account password credentials.'}
                </p>
              </div>

              {message.text && (
                <div className={`mb-6 p-4 rounded-xl text-xs font-bold border ${message.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                  {message.text}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* 1. Personal Information Inputs */}
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-bold text-(--text-secondary) mb-1.5">{t.firstName} <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                        className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2.5 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-(--focus)"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-(--text-secondary) mb-1.5">{t.lastName} <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                        className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2.5 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-(--focus)"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-(--text-secondary) mb-1.5">{t.email}</label>
                      <input
                        type="email"
                        value={user.email || ''}
                        disabled
                        className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2.5 text-xs font-medium text-(--text-tertiary) cursor-not-allowed opacity-75"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-(--text-secondary) mb-1.5">{t.assignedRole}</label>
                      <input
                        type="text"
                        value={roleLabel}
                        disabled
                        className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2.5 text-xs font-medium text-(--text-tertiary) cursor-not-allowed opacity-75"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 pt-1">
                    <div className="mb-4">
                      <label className="mb-1.5 block text-xs font-bold text-(--text-secondary)">
                        {t.currentPassword}{' '}
                        <span className="font-normal normal-case">
                          {language === 'vi'
                            ? '(Để trống nếu bạn không muốn thay đổi)'
                            : '(Leave blank if you do not want to change)'}
                        </span>
                      </label>

                      <div className="relative">
                        <input
                          type={showCurrentPassword ? "text" : "password"}
                          value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
                          placeholder="••••••••"
                          className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) py-2.5 pl-4 pr-10 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-(--focus)"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-(--text-secondary) hover:text-(--text-primary) focus:outline-none"
                          aria-label="Toggle password visibility"
                        >
                          {showCurrentPassword ? (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0l-3.29-3.29" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-(--text-secondary) mb-1.5">{t.newPassword}</label>
                      <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                        placeholder="••••••••"
                        className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2.5 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-(--focus)"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Unified Submit Action */}
                <div className="flex justify-end pt-4 border-t border-(--border-light)">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 rounded-xl bg-(--brand) text-(--on-brand) font-bold text-xs shadow-xs hover:bg-(--brand-hover) transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? t.updatingProfile : (language === 'vi' ? 'Lưu thay đổi' : 'Save Changes')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tab 2: My Activity (Telemetry UI) */}
        {/* TODO: Wire up to /api/users/me/metrics once backend endpoint is deployed */}
        {currentTab === 'activity' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-(--border) bg-(--surface) p-6 sm:p-8 shadow-xs">
              <div className="mb-6 border-b border-(--border-light) pb-4">
                <h2 className="text-base font-bold text-(--text-primary)">
                  {language === 'vi' ? 'Tổng quan thành tích & hoạt động' : 'Workspace Accomplishments & Telemetry'}
                </h2>
                <p className="text-xs text-(--text-secondary) mt-0.5">
                  {language === 'vi' ? 'Dữ liệu hoạt động được tổng hợp theo vai trò của bạn.' : 'Activity summary aggregated for your account role.'}
                </p>
              </div>

              {/* Aggregation Telemetry Static Mock Data */}
              {user.role === 'INSTRUCTOR' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="p-4 rounded-xl bg-(--surface-secondary) border border-(--border)">
                    <span className="text-[11px] font-bold text-(--text-tertiary) uppercase tracking-wider">{language === 'vi' ? 'Dự án hướng dẫn' : 'Guided Projects'}</span>
                    <p className="text-2xl font-black text-(--brand-foreground) mt-2">12</p>
                    <p className="text-[10px] text-(--text-tertiary) mt-1">4 active · 8 completed</p>
                  </div>
                  <div className="p-4 rounded-xl bg-(--surface-secondary) border border-(--border)">
                    <span className="text-[11px] font-bold text-(--text-tertiary) uppercase tracking-wider">{language === 'vi' ? 'Bộ sưu tập tài liệu' : 'Curated Collections'}</span>
                    <p className="text-2xl font-black text-(--brand-foreground) mt-2">6</p>
                    <p className="text-[10px] text-(--text-tertiary) mt-1">38 papers & resources</p>
                  </div>
                  <div className="p-4 rounded-xl bg-(--surface-secondary) border border-(--border)">
                    <span className="text-[11px] font-bold text-(--text-tertiary) uppercase tracking-wider">{language === 'vi' ? 'Lượt đánh giá' : 'Reviews Conducted'}</span>
                    <p className="text-2xl font-black text-(--brand-foreground) mt-2">45</p>
                    <p className="text-[10px] text-emerald-600 font-bold mt-1">98% on-time response</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="p-4 rounded-xl bg-(--surface-secondary) border border-(--border)">
                    <span className="text-[11px] font-bold text-(--text-tertiary) uppercase tracking-wider">{language === 'vi' ? 'Dự án tham gia' : 'Active Projects'}</span>
                    <p className="text-2xl font-black text-(--brand-foreground) mt-2">2</p>
                    <p className="text-[10px] text-(--text-tertiary) mt-1">1 in progress · 1 draft</p>
                  </div>
                  <div className="p-4 rounded-xl bg-(--surface-secondary) border border-(--border)">
                    <span className="text-[11px] font-bold text-(--text-tertiary) uppercase tracking-wider">{language === 'vi' ? 'Lần xuất bản / Export' : 'Exports Generated'}</span>
                    <p className="text-2xl font-black text-(--brand-foreground) mt-2">8</p>
                    <p className="text-[10px] text-(--text-tertiary) mt-1">LaTeX & PDF</p>
                  </div>
                  <div className="p-4 rounded-xl bg-(--surface-secondary) border border-(--border)">
                    <span className="text-[11px] font-bold text-(--text-tertiary) uppercase tracking-wider">{language === 'vi' ? 'Trích dẫn xác thực' : 'Verified Citations'}</span>
                    <p className="text-2xl font-black text-(--brand-foreground) mt-2">24</p>
                    <p className="text-[10px] text-emerald-600 font-bold mt-1">100% evidence-backed</p>
                  </div>
                </div>
              )}

              {/* Recent Milestone Log */}
              <div className="border-t border-(--border-light) pt-6">
                <h3 className="text-xs font-black uppercase tracking-wider text-(--text-tertiary) mb-4">
                  {language === 'vi' ? 'Mốc hoạt động gần đây' : 'Recent Milestones'}
                </h3>
                <div className="space-y-3">
                  <div className="p-3 rounded-xl border border-(--border-light) bg-(--surface-secondary)/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-(--text-primary)">
                          {language === 'vi' ? 'Xác thực tài khoản thành công' : 'Account Identity Verified'}
                        </p>
                        <p className="text-[10px] text-(--text-tertiary)">{user.email}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-(--text-tertiary)">Active</span>
                  </div>
                  <div className="p-3 rounded-xl border border-(--border-light) bg-(--surface-secondary)/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-(--text-primary)">
                          {language === 'vi' ? 'Phiên làm việc bảo mật' : 'Secure JWT Session Active'}
                        </p>
                        <p className="text-[10px] text-(--text-tertiary)">Role: {roleLabel}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-600 font-bold">Online</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
