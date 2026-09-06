import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../services/api.js';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { AuroraBackground } from '../components/ui/aurora-background';
import { PasswordInput } from '../components/ui/PasswordInput.jsx';

// ponytail: local copy of loginOrigin.js defaultWorkspace — kept private there to gate
// redirects through getPostLoginDestination. Onboarding skips that gate (no prior origin).
const defaultWorkspace = {
  ADMIN: '/admin/dashboard',
  INSTRUCTOR: '/instructor/dashboard',
  STUDENT: '/student/projects',
};

const EASE = [0.23, 1, 0.32, 1];

function SunIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function UserIcon({ className = 'w-10 h-10' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path strokeLinecap="round" d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  );
}

function LockIcon({ className = 'w-3 h-3' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path strokeLinecap="round" d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

function CameraIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h4l2-3h6l2 3h4v11H3z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <LockIcon className="w-3 h-3" />
        <span>{label}</span>
        <span className="ml-auto text-[9px] font-medium tracking-widest text-slate-400 dark:text-slate-500">Immutable</span>
      </span>
      <input
        type="text"
        value={value || ''}
        readOnly
        tabIndex={-1}
        aria-readonly="true"
        className="w-full rounded-xl border border-slate-200/70 dark:border-zinc-700/70 bg-slate-100/80 dark:bg-zinc-800/50 text-slate-500 dark:text-zinc-400 px-4 py-2.5 text-xs cursor-not-allowed shadow-2xs select-none"
      />
    </label>
  );
}

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, verifySession } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const token = searchParams.get('token');

  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(true);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const fileInputRef = useRef(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!token) { setPreviewLoading(false); return; }
    let cancelled = false;
    api.get('/api/auth/set-password/preview', { params: { token } })
      .then((res) => {
        if (cancelled) return;
        setPreview(res.data);
        setForm((current) => ({
          ...current,
          firstName: res.data.firstName ?? current.firstName ?? '',
          lastName: res.data.lastName ?? current.lastName ?? '',
        }));
      })
      .catch((err) => { if (!cancelled) setPreviewError(err.response?.data?.message || 'Invalid or expired link.'); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function update(field) {
    return (e) => setForm((current) => ({ ...current, [field]: e.target.value }));
  }

  function handleAvatarPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(language === 'vi' ? 'Vui lòng chọn tệp hình ảnh.' : 'Please select an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(language === 'vi' ? 'Hình ảnh phải nhỏ hơn 5MB.' : 'Image must be smaller than 5MB.');
      return;
    }
    setError('');
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError(language === 'vi' ? 'Vui lòng nhập họ và tên.' : 'Please enter your first and last name.');
      return;
    }
    if (form.newPassword.length < 8) {
      setError(language === 'vi' ? 'Mật khẩu phải có ít nhất 8 ký tự.' : 'Password must be at least 8 characters.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError(language === 'vi' ? 'Mật khẩu xác nhận không khớp.' : 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/api/auth/set-password', {
        token,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        newPassword: form.newPassword,
      });
      const { token: jwt, user } = res.data;
      const role = user?.role || preview?.role;
      if (!jwt) throw new Error('Token not found in response');

      login(jwt, role);

      if (avatarFile) {
        try {
          const fd = new FormData();
          fd.append('file', avatarFile);
          await api.post('/api/users/avatar', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          // ponytail: silent re-fetch of /me so the global user.avatarUrl is fresh
          // before the dashboard mounts. No window.location.reload().
          await verifySession().catch(() => {});
        } catch {
          setToast(language === 'vi'
            ? 'Đã lưu hồ sơ, tải ảnh đại diện thất bại.'
            : 'Profile saved, avatar upload failed.');
        }
      }

      navigate(defaultWorkspace[role] || defaultWorkspace.STUDENT, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message
        ?? (language === 'vi' ? 'Liên kết không hợp lệ hoặc đã hết hạn.' : 'Invalid or expired link.'));
    } finally {
      setLoading(false);
    }
  }

  const isStudent = preview?.role === 'STUDENT';

  return (
    <AuroraBackground className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6">
      <div className="relative z-10 w-full max-w-6xl mx-auto px-2 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center">
        {/* Column A — Branding */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="lg:col-span-2 text-center lg:text-left"
        >
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-light text-(--text-primary) leading-tight tracking-tight mb-5">
            {language === 'vi' ? 'Chào mừng đến' : 'Welcome to'}{' '}
            <span className="font-extrabold bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-400 dark:from-indigo-400 dark:via-blue-300 dark:to-indigo-200 bg-clip-text text-transparent">
              {language === 'vi' ? 'Evidence Pilot.' : 'Evidence Pilot.'}
            </span>
          </h1>
          <p className="text-base sm:text-lg text-(--text-secondary) leading-relaxed max-w-xl mx-auto lg:mx-0">
            {language === 'vi'
              ? 'Nền tảng AI hỗ trợ ánh xạ bằng chứng nghiên cứu và truy vết trích dẫn. Hoàn tất hồ sơ của bạn để bắt đầu.'
              : 'Your AI-Assisted Research Evidence Mapping & Citation Traceability Platform. Complete your profile to begin.'}
          </p>

          <div className="mt-8 flex items-center gap-2 justify-center lg:justify-start">
            <button
              type="button"
              onClick={toggleLanguage}
              className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/60 backdrop-blur px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-zinc-800 transition"
            >
              {language === 'vi' ? 'EN' : 'VN'}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/60 backdrop-blur p-1.5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-zinc-800 transition"
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </motion.div>

        {/* Column B — Onboarding Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
          className="lg:col-span-3"
        >
          <section className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <header className="mb-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {language === 'vi' ? 'Hoàn tất hồ sơ của bạn' : 'Complete your profile'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {language === 'vi'
                  ? 'Một vài bước nữa để kích hoạt tài khoản của bạn.'
                  : 'A few more steps to activate your account.'}
              </p>
            </header>

            {!token ? (
              <InvalidLinkState language={language} />
            ) : previewLoading ? (
              <PreviewSkeleton />
            ) : previewError ? (
              <InvalidLinkState language={language} message={previewError} />
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* TOP: Identity — avatar (left, fixed) + names (right, flex-grow) */}
                <div className="flex flex-row items-start sm:items-center gap-4 sm:gap-5">
                  <div className="shrink-0 flex flex-col items-center gap-2 w-[100px]">
                    <div className="relative w-[100px] h-[100px] rounded-full bg-slate-100 dark:bg-zinc-800 border-2 border-dashed border-slate-300 dark:border-zinc-600 overflow-hidden grid place-items-center">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="w-9 h-9 text-slate-400 dark:text-zinc-500" />
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarPick}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 transition"
                    >
                      <CameraIcon className="w-3 h-3" />
                      {language === 'vi' ? 'Tải ảnh' : 'Upload'}
                    </button>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {language === 'vi' ? 'hoặc bỏ qua' : 'or skip'}
                    </span>
                  </div>

                  <div className="flex-1 grid grid-cols-1 gap-3 min-w-0">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                        {language === 'vi' ? 'Tên' : 'First Name'}
                      </span>
                      <input
                        type="text"
                        name="firstName"
                        value={form.firstName}
                        onChange={update('firstName')}
                        autoComplete="given-name"
                        required
                        className="w-full rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-800/80 px-4 py-2.5 text-xs text-slate-900 dark:text-slate-100 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                        {language === 'vi' ? 'Họ' : 'Last Name'}
                      </span>
                      <input
                        type="text"
                        name="lastName"
                        value={form.lastName}
                        onChange={update('lastName')}
                        autoComplete="family-name"
                        required
                        className="w-full rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-800/80 px-4 py-2.5 text-xs text-slate-900 dark:text-slate-100 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                      />
                    </label>
                  </div>
                </div>

                {/* MIDDLE: System Context (2-col grid) — names now live in the TOP row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ReadOnlyField
                    label={language === 'vi' ? 'Vai trò' : 'Role'}
                    value={preview?.role}
                  />
                  {isStudent ? (
                    <ReadOnlyField
                      label={language === 'vi' ? 'Mã sinh viên' : 'Student Code'}
                      value={preview?.studentCode}
                    />
                  ) : (
                    <div className="hidden sm:block" aria-hidden="true" />
                  )}
                </div>

                {/* BOTTOM: Security (stacked) */}
                <div className="space-y-4">
                  <ReadOnlyField
                    label={language === 'vi' ? 'Email' : 'Email'}
                    value={preview?.email}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <PasswordInput
                      label={language === 'vi' ? 'Mật khẩu mới' : 'New Password'}
                      name="newPassword"
                      value={form.newPassword}
                      onChange={update('newPassword')}
                      autoComplete="new-password"
                      required
                    />
                    <PasswordInput
                      label={language === 'vi' ? 'Xác nhận mật khẩu' : 'Confirm Password'}
                      name="confirmPassword"
                      value={form.confirmPassword}
                      onChange={update('confirmPassword')}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <p className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-200">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 py-3 text-xs font-bold text-white shadow-lg transition-all hover:shadow-indigo-500/25 disabled:opacity-50 cursor-pointer"
                >
                  {loading
                    ? (language === 'vi' ? 'Đang lưu...' : 'Saving...')
                    : (language === 'vi' ? 'Hoàn tất & vào hệ thống' : 'Complete & enter')}
                </button>
              </form>
            )}
          </section>
        </motion.div>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200 shadow-lg backdrop-blur"
        >
          {toast}
        </div>
      )}
    </AuroraBackground>
  );
}

function InvalidLinkState({ language, message }) {
  return (
    <div className="space-y-5">
      <p className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-200">
        {message || (language === 'vi' ? 'Liên kết mời không hợp lệ hoặc đã hết hạn.' : 'Invitation link is invalid or has expired.')}
      </p>
      <Link to="/login" className="inline-block rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
        {language === 'vi' ? 'Quay lại đăng nhập' : 'Back to login'}
      </Link>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-row items-center gap-5">
        <div className="w-[100px] h-[100px] rounded-full bg-slate-200 dark:bg-zinc-800" />
        <div className="flex-1 grid grid-cols-1 gap-3">
          <div className="h-12 rounded-xl bg-slate-200 dark:bg-zinc-800" />
          <div className="h-12 rounded-xl bg-slate-200 dark:bg-zinc-800" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-16 rounded-xl bg-slate-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}
