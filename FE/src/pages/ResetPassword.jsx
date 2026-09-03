import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api.js';
import { AuroraBackground } from '../components/ui/aurora-background';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
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

    if (form.newPassword !== form.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/password-reset/confirm', {
        token,
        newPassword: form.newPassword
      });
      setComplete(true);
      setForm({ newPassword: '', confirmPassword: '' });
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? 'Không thể đặt lại mật khẩu. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuroraBackground className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6">
      <section className="w-full max-w-md bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 shadow-2xl relative z-10 transition-colors">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Đặt lại mật khẩu</h1>

        {!token ? (
          <div className="mt-4 space-y-5">
            <p className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-200">
              Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.
            </p>
            <Link to="/login" className="inline-block rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
              Quay lại đăng nhập
            </Link>
          </div>
        ) : complete ? (
          <div className="mt-4 space-y-5">
            <p className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-700 dark:text-emerald-200">
              Mật khẩu đã được đặt lại. Bạn có thể đăng nhập bằng mật khẩu mới.
            </p>
            <Link to="/login" className="inline-block rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
              Đăng nhập
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">Mật khẩu mới</span>
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
              <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">Xác nhận mật khẩu mới</span>
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
              {loading ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
            </button>

            <div className="pt-2 text-center">
              <Link to="/login" className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                Quay lại đăng nhập
              </Link>
            </div>
          </form>
        )}
      </section>
    </AuroraBackground>
  );
}
