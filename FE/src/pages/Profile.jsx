import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api.js';
import { AppHeader, LoadingSkeleton, Breadcrumb, Modal } from '../components';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { commonText } from '../locales';

export default function Profile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: authUser, role, logout, verifySession } = useAuth();
  const { language } = useLanguage();
  const t = commonText[language];
  const ct = commonText[language];
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [user, setUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState(null);
  const [emailActionLoading, setEmailActionLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [showPasswordConfirmModal, setShowPasswordConfirmModal] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // Telemetry state
  const [telemetry, setTelemetry] = useState(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [telemetryError, setTelemetryError] = useState('');

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
    setEmail(authUser.email || '');
    setPendingEmail(authUser.pendingEmail || null);
  }, [authUser]);

  // Handle email verification token from URL
  useEffect(() => {
    const verifyToken = searchParams.get('verifyEmailToken');
    if (verifyToken) {
      api.post('/api/users/email-change/confirm', { token: verifyToken })
        .then((res) => {
          setMessage({
            type: 'success',
            text: res.data?.message || (language === 'vi' ? 'Xác thực email thành công!' : 'Email successfully verified!')
          });
          setPendingEmail(null);
          verifySession().catch(() => { });
          const next = new URLSearchParams(searchParams);
          next.delete('verifyEmailToken');
          setSearchParams(next);
        })
        .catch((err) => {
          setMessage({
            type: 'error',
            text: err.response?.data?.message || (language === 'vi' ? 'Mã xác thực email không hợp lệ hoặc đã hết hạn.' : 'Invalid or expired email verification token.')
          });
        });
    }
  }, [searchParams, setSearchParams, language, verifySession]);

  // Fetch telemetry when tab is active
  useEffect(() => {
    if (currentTab === 'activity') {
      setTelemetryLoading(true);
      setTelemetryError('');
      api.get('/api/users/me/telemetry')
        .then(res => setTelemetry(res.data))
        .catch(err => setTelemetryError(err.response?.data?.message || 'Failed to load telemetry'))
        .finally(() => setTelemetryLoading(false));
    }
  }, [currentTab]);

  const handleRequestEmailChange = async (targetEmail) => {
    const toVerify = (targetEmail || email).trim();
    if (!toVerify || toVerify === user.email) return;
    setEmailActionLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await api.post('/api/users/email-change/request', { newEmail: toVerify });
      setPendingEmail(res.data.pendingEmail || toVerify);
      setMessage({
        type: 'success',
        text: res.data.message || (language === 'vi' ? 'Đã gửi liên kết xác thực tới email mới.' : 'Verification link sent to the new email address.')
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || (language === 'vi' ? 'Không thể yêu cầu đổi email.' : 'Failed to request email change.')
      });
    } finally {
      setEmailActionLoading(false);
    }
  };

  const handleCancelEmailChange = async () => {
    setEmailActionLoading(true);
    setMessage({ type: '', text: '' });
    try {
      await api.delete('/api/users/email-change/cancel');
      setPendingEmail(null);
      setEmail(user.email || '');
      setMessage({
        type: 'success',
        text: language === 'vi' ? 'Đã hủy yêu cầu đổi email.' : 'Email change request cancelled.'
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || (language === 'vi' ? 'Không thể hủy yêu cầu đổi email.' : 'Failed to cancel email change.')
      });
    } finally {
      setEmailActionLoading(false);
    }
  };

  const handleResetForm = () => {
    if (!user) return;
    setFirstName(user.firstName || '');
    setLastName(user.lastName || '');
    setEmail(user.email || '');
    setPasswordForm({ currentPassword: '', newPassword: '' });
    setMessage({ type: '', text: '' });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setMessage({ type: 'error', text: t.nameRequired });
      return;
    }

    const currentPwd = (passwordForm.currentPassword || '').trim();
    const newPwd = (passwordForm.newPassword || '').trim();
    const hasPasswordInput = Boolean(currentPwd || newPwd);

    // If password change is requested, validate current and new password, then hold state in modal
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
      // Open modal confirmation hold state
      setShowPasswordConfirmModal(true);
      return;
    }

    // Process profile updates (names and email change request)
    setSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      let profileUpdated = false;
      if (firstName.trim() !== (user.firstName || '') || lastName.trim() !== (user.lastName || '')) {
        const { data } = await api.put('/api/users/profile', {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
        setUser(data);
        profileUpdated = true;
        verifySession().catch(() => { });
      }

      // If email was modified, trigger email change request
      if (email.trim() && email.trim() !== (user.email || '') && email.trim() !== (pendingEmail || '')) {
        await handleRequestEmailChange(email.trim());
      } else if (profileUpdated) {
        setMessage({
          type: 'success',
          text: t.profileUpdated || (language === 'vi' ? 'Cập nhật thông tin thành công.' : 'Profile updated successfully.'),
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || t.profileUpdateFailed,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPasswordUpdate = async () => {
    setPasswordSubmitting(true);
    setMessage({ type: '', text: '' });

    try {
      // First save profile names if modified
      if (firstName.trim() !== (user.firstName || '') || lastName.trim() !== (user.lastName || '')) {
        await api.put('/api/users/profile', {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
      }

      await api.post('/api/auth/update-password', {
        currentPassword: passwordForm.currentPassword.trim(),
        newPassword: passwordForm.newPassword.trim(),
      });

      setShowPasswordConfirmModal(false);
      sessionStorage.setItem('auth_expired_notice', t.passwordChangedSignIn || (language === 'vi' ? 'Mật khẩu đã đổi thành công. Vui lòng đăng nhập lại.' : 'Password updated successfully. Please sign in again.'));
      logout();
      navigate('/login', { replace: true });
    } catch (error) {
      setShowPasswordConfirmModal(false);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || (language === 'vi' ? 'Đổi mật khẩu thất bại. Vui lòng kiểm tra lại mật khẩu hiện tại.' : 'Failed to update password. Please check your current password.'),
      });
    } finally {
      setPasswordSubmitting(false);
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

          {/* Navigation Tabs */}
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

        {/* Tab 1: Account Settings */}
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

              {/* Pending Email Verification Banner */}
              {pendingEmail && (
                <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <div>
                      <p className="text-xs font-bold">{language === 'vi' ? 'Đang chờ xác thực email mới' : 'Pending Email Verification'}</p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                        {language === 'vi'
                          ? `Liên kết xác nhận đã được gửi tới ${pendingEmail}. Email hiện tại (${user.email}) vẫn được giữ nguyên cho tới khi bạn xác nhận qua email.`
                          : `Verification link sent to ${pendingEmail}. Your current email (${user.email}) remains active until confirmed.`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRequestEmailChange(pendingEmail)}
                      disabled={emailActionLoading}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {language === 'vi' ? 'Gửi lại' : 'Resend'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEmailChange}
                      disabled={emailActionLoading}
                      className="px-3 py-1.5 bg-white dark:bg-amber-900 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 text-amber-900 dark:text-amber-100 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {language === 'vi' ? 'Hủy' : 'Cancel'}
                    </button>
                  </div>
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
                      <label className="block text-xs font-bold text-(--text-secondary) mb-1.5">{t.email} <span className="text-rose-500">*</span></label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-4 py-2.5 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-(--focus)"
                      />
                      <p className="text-[10px] text-(--text-tertiary) mt-1">
                        {language === 'vi' ? 'Thay đổi email yêu cầu nhấp vào liên kết xác nhận được gửi tới địa chỉ mới.' : 'Modifying email requires confirmation via link sent to the new address.'}
                      </p>
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

                  {/* Password Modification Fields */}
                  <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-(--border-light)">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-(--text-secondary)">
                        {t.currentPassword}{' '}
                        <span className="font-normal normal-case text-(--text-tertiary)">
                          {language === 'vi' ? '(Để trống nếu không đổi)' : '(Leave blank if unchanged)'}
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
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-(--text-secondary) hover:text-(--text-primary) focus:outline-none cursor-pointer"
                          aria-label="Toggle password visibility"
                        >
                          {showCurrentPassword ? (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0l-3.29-3.29" /></svg>
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-(--text-secondary) mb-1.5">{t.newPassword}</label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                          placeholder="••••••••"
                          className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) py-2.5 pl-4 pr-10 text-xs font-medium text-(--text-primary) outline-none focus:ring-2 focus:ring-(--focus)"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-(--text-secondary) hover:text-(--text-primary) focus:outline-none cursor-pointer"
                          aria-label="Toggle new password visibility"
                        >
                          {showNewPassword ? (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0l-3.29-3.29" /></svg>
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Form Action Buttons: [Cancel] & [Save Changes] */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-(--border-light)">
                  <button
                    type="button"
                    onClick={handleResetForm}
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl border border-(--border) text-(--text-secondary) font-bold text-xs hover:bg-(--surface-secondary) transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {ct.cancel || 'Cancel'}
                  </button>
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

        {/* Tab 2: My Activity (Self-View Purged Bottleneck Telemetry UI) */}
        {currentTab === 'activity' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-(--border) bg-(--surface) p-6 sm:p-8 shadow-xs">
              <div className="mb-6 border-b border-(--border-light) pb-4">
                <h2 className="text-base font-bold text-(--text-primary)">
                  {language === 'vi' ? 'Tổng quan thành tích & hoạt động' : 'Workspace Accomplishments & Telemetry'}
                </h2>
                <p className="text-xs text-(--text-secondary) mt-0.5">
                  {language === 'vi' ? 'Dữ liệu hoạt động cá nhân được tổng hợp tự động.' : 'Personal activity metrics aggregated automatically.'}
                </p>
              </div>

              {telemetryLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div className="h-28 bg-(--surface-secondary) rounded-xl animate-pulse" />
                  <div className="h-28 bg-(--surface-secondary) rounded-xl animate-pulse" />
                </div>
              ) : telemetryError ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold mb-6">
                  {telemetryError}
                </div>
              ) : user.role === 'INSTRUCTOR' ? (
                /* Purged 2-Card Layout for INSTRUCTOR */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {/* Card 1: Guided Projects */}
                  <div className="p-5 rounded-2xl bg-(--surface-secondary) border border-(--border) flex flex-col justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-(--text-tertiary) uppercase tracking-wider">
                        {language === 'vi' ? 'Đồ án hướng dẫn' : 'Guided Projects'}
                      </span>
                      <p className="text-3xl font-black text-(--brand-foreground) mt-2">
                        {telemetry?.metrics?.guidedProjectsCount ?? 0}
                      </p>
                    </div>
                    <p className="text-[11px] text-(--text-tertiary) mt-3">
                      {language === 'vi' ? 'Tổng số đồ án bạn đang tham gia cố vấn' : 'Active student workspaces under your supervision'}
                    </p>
                  </div>

                  {/* Card 2: Pending Feedback Requests (Bottleneck Metric) */}
                  <div className={`p-5 rounded-2xl border flex flex-col justify-between ${
                    (telemetry?.metrics?.pendingFeedbackRequests ?? 0) > 0
                      ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
                      : 'bg-(--surface-secondary) border-(--border)'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-(--text-tertiary) uppercase tracking-wider">
                          {language === 'vi' ? 'Yêu cầu phản hồi chờ duyệt' : 'Pending Feedback Requests'}
                        </span>
                        {(telemetry?.metrics?.pendingFeedbackRequests ?? 0) > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500 text-white animate-pulse">
                            Action Needed
                          </span>
                        )}
                      </div>
                      <p className={`text-3xl font-black mt-2 ${
                        (telemetry?.metrics?.pendingFeedbackRequests ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-(--brand-foreground)'
                      }`}>
                        {telemetry?.metrics?.pendingFeedbackRequests ?? 0}
                      </p>
                    </div>
                    <p className="text-[11px] text-(--text-tertiary) mt-3">
                      {(telemetry?.metrics?.pendingFeedbackRequests ?? 0) > 0
                        ? (language === 'vi' ? 'Sinh viên đang chờ bạn đánh giá và phê duyệt' : 'Student requests awaiting your review feedback')
                        : (language === 'vi' ? 'Tất cả yêu cầu phản hồi đã được giải quyết' : 'All review feedback requests resolved')}
                    </p>
                  </div>
                </div>
              ) : (
                /* Purged 2-Card Layout for STUDENT */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {/* Card 1: Active Projects */}
                  <div className="p-5 rounded-2xl bg-(--surface-secondary) border border-(--border) flex flex-col justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-(--text-tertiary) uppercase tracking-wider">
                        {language === 'vi' ? 'Đồ án tham gia' : 'Active Projects'}
                      </span>
                      <p className="text-3xl font-black text-(--brand-foreground) mt-2">
                        {telemetry?.metrics?.activeProjectsCount ?? 0}
                      </p>
                    </div>
                    <p className="text-[11px] text-(--text-tertiary) mt-3">
                      {language === 'vi' ? 'Số đồ án bạn đang là thành viên thực hiện' : 'Workspaces you are currently contributing to'}
                    </p>
                  </div>

                  {/* Card 2: Pending Revision Traces (Bottleneck Metric) */}
                  <div className={`p-5 rounded-2xl border flex flex-col justify-between ${
                    (telemetry?.metrics?.pendingRevisionTraces ?? 0) > 0
                      ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
                      : 'bg-(--surface-secondary) border-(--border)'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-(--text-tertiary) uppercase tracking-wider">
                          {language === 'vi' ? 'Vết sửa đổi chờ xử lý' : 'Pending Revision Traces'}
                        </span>
                        {(telemetry?.metrics?.pendingRevisionTraces ?? 0) > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500 text-white animate-pulse">
                            Pending Trace
                          </span>
                        )}
                      </div>
                      <p className={`text-3xl font-black mt-2 ${
                        (telemetry?.metrics?.pendingRevisionTraces ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-(--brand-foreground)'
                      }`}>
                        {telemetry?.metrics?.pendingRevisionTraces ?? 0}
                      </p>
                    </div>
                    <p className="text-[11px] text-(--text-tertiary) mt-3">
                      {(telemetry?.metrics?.pendingRevisionTraces ?? 0) > 0
                        ? (language === 'vi' ? 'Có chỉnh sửa dẫn chứng đang chờ bạn rà soát lại' : 'Evidence revisions awaiting resolution')
                        : (language === 'vi' ? 'Không có vết sửa đổi nào đang chờ' : 'All revision traces up to date')}
                    </p>
                  </div>
                </div>
              )}

              {/* Recent Milestone Log */}
              <div className="border-t border-(--border-light) pt-6">
                <h3 className="text-xs font-black uppercase tracking-wider text-(--text-tertiary) mb-4">
                  {language === 'vi' ? 'Mốc hoạt động gần đây' : 'Recent Milestones'}
                </h3>
                <div className="space-y-3">
                  {telemetry?.milestones && telemetry.milestones.length > 0 ? (
                    telemetry.milestones.map((m, idx) => (
                      <div key={idx} className="p-3 rounded-xl border border-(--border-light) bg-(--surface-secondary)/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-(--text-primary)">{m.title || m.name}</p>
                            <p className="text-[10px] text-(--text-tertiary)">{m.description || m.timestamp}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-(--text-tertiary)">{m.status || 'Done'}</span>
                      </div>
                    ))
                  ) : (
                    <>
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
                        <span className="text-[10px] font-mono text-emerald-600 font-bold">Active</span>
                      </div>
                      <div className="p-3 rounded-xl border border-(--border-light) bg-(--surface-secondary)/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-(--text-primary)">
                              {language === 'vi' ? 'Phiên làm việc bảo mật' : 'Secure Session Active'}
                            </p>
                            <p className="text-[10px] text-(--text-tertiary)">Role: {roleLabel}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-600 font-bold">Online</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Password Update Confirmation Popup Modal */}
      <Modal
        open={showPasswordConfirmModal}
        onClose={() => setShowPasswordConfirmModal(false)}
        title={language === 'vi' ? 'Xác nhận đổi mật khẩu' : 'Confirm Password Change'}
        closeLabel={ct.close || 'Close'}
      >
        <div className="space-y-4 text-xs">
          <p className="text-(--text-secondary) leading-relaxed">
            {language === 'vi'
              ? 'Bạn có chắc chắn muốn thay đổi mật khẩu? Sau khi đổi thành công, phiên đăng nhập hiện tại sẽ kết thúc và bạn sẽ cần đăng nhập lại với mật khẩu mới.'
              : 'Are you sure you want to update your password? Once updated, your current session will end and you will need to sign in with your new password.'}
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-(--border-light)">
            <button
              type="button"
              onClick={() => setShowPasswordConfirmModal(false)}
              disabled={passwordSubmitting}
              className="px-4 py-2 rounded-xl border border-(--border) text-(--text-secondary) font-bold text-xs hover:bg-(--surface-secondary) transition-colors cursor-pointer disabled:opacity-50"
            >
              {ct.cancel || 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleConfirmPasswordUpdate}
              disabled={passwordSubmitting}
              className="px-4 py-2 rounded-xl bg-(--brand) text-(--on-brand) font-bold text-xs hover:bg-(--brand-hover) transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {passwordSubmitting ? (ct.saving || 'Saving...') : (language === 'vi' ? 'Xác nhận đổi mật khẩu' : 'Confirm Password Update')}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
