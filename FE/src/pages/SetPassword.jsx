import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { AuroraBackground } from '../components/ui/aurora-background';

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const { language } = useLanguage();
  const token = searchParams.get('token');
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);

  function handleChange(event) {
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

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
      await api.post('/api/auth/set-password', {
        token,
        newPassword: form.newPassword
      });
      setComplete(true);
      setForm({ newPassword: '', confirmPassword: '' });
    } catch (requestError) {
      setError(requestError.response?.data?.message
        ?? (language === 'vi' ? 'Liên kết không hợp lệ hoặc đã hết hạn.' : 'Invalid or expired link.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuroraBackground className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6">
      <section className="w-full max-w-md bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 shadow-2xl relative z-10 transition-colors">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {language === 'vi' ? 'Đặt mật khẩu của bạn' : 'Set your password'}
        </h1>

        {!token ? (
          <div className="mt-4 space-y-5">
            <p className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-200">
              {language === 'vi' ? 'Liên kết mời không hợp lệ hoặc đã hết hạn.' : 'Invitation link is invalid or has expired.'}
            </p>
            <Link to="/login" className="inline-block rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
              {language === 'vi' ? 'Quay lại đăng nhập' : 'Back to login'}
            </Link>
          </div>
        ) : complete ? (
          <div className="mt-4 space-y-5">
            <p className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-700 dark:text-emerald-200">
              {language === 'vi' ? 'Mật khẩu đã được đặt. Bạn có thể đăng nhập ngay.' : 'Password set. You can now sign in.'}
            </p>
            <Link to="/login" className="inline-block rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
              {language === 'vi' ? 'Đăng nhập' : 'Sign in'}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                {language === 'vi' ? 'Mật khẩu mới' : 'New password'}
              </span>
              <input
                type="password"
                name="newPassword"
                value={form.newPassword}
                onChange={handleChange}
                autoComplete="new-password"
                required
                className="w-full rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-800/80 px-4 py-2.5 text-xs text-slate-900 dark:text-slate-100 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                {language === 'vi' ? 'Xác nhận mật khẩu' : 'Confirm password'}
              </span>
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
                required
                className="w-full rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-800/80 px-4 py-2.5 text-xs text-slate-900 dark:text-slate-100 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
              />
            </label>

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
                ? (language === 'vi' ? 'Đang cập nhật...' : 'Saving...')
                : (language === 'vi' ? 'Đặt mật khẩu' : 'Set password')}
            </button>

            <div className="pt-2 text-center">
              <Link to="/login" className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                {language === 'vi' ? 'Quay lại đăng nhập' : 'Back to login'}
              </Link>
            </div>
          </form>
        )}
      </section>
    </AuroraBackground>
  );
}
