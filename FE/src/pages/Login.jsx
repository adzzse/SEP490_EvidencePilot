import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { commonText } from '../locales';
import api from '../services/api.js';
import { getPostLoginDestination } from './loginOrigin.js';
import { AuroraBackground } from '../components/ui/aurora-background';
import WordRotate from '../components/ui/WordRotate.jsx';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { language } = useLanguage();
  const t = commonText[language];

  const [form, setForm] = useState({ email: '', passwordHash: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => {
    const n = sessionStorage.getItem('auth_expired_notice');
    if (n) sessionStorage.removeItem('auth_expired_notice');
    return n;
  });
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function redirectAfterLogin(role) {
    const origin = sessionStorage.getItem('login_origin');
    sessionStorage.removeItem('login_origin');
    navigate(getPostLoginDestination(origin, role, window.location.origin));
  }

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/api/auth/login', {
        email: form.email,
        password: form.passwordHash
      });
      const token = res.data.token ?? res.data.accessToken ?? res.data.jwt;
      const role = res.data.user?.role ?? res.data.role;

      if (!token) throw new Error('Token not found in response');

      login(token, role);
      if (res.data.passwordChangeNotice) {
        navigate('/profile', { replace: true, state: { passwordChangeNotice: true } });
      } else {
        redirectAfterLogin(role);
      }
    } catch (err) {
      const msg = err.response?.data?.message
        ?? err.response?.data?.error
        ?? err.message
        ?? (language === 'vi' ? 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.' : 'Login failed. Please check your credentials.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuroraBackground className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="flex w-full max-w-6xl mx-auto gap-8 lg:gap-12 items-center justify-between">
        {/* Left 50% — Login Card */}
        <div className="w-full max-w-md lg:w-1/2 lg:max-w-md bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-zinc-800 rounded-3xl p-8 sm:p-10 shadow-2xl relative z-10 transition-colors">
          {/* Back to Home Link */}
          <div className="mb-6">
            <Link
              to="/"
              className="inline-flex items-center text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors gap-1.5 group"
            >
              <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {t.backToHome || (language === 'vi' ? 'Quay lại Trang chủ' : 'Back to Home')}
            </Link>
          </div>

          {/* Brand Header */}
          <div className="mb-8 text-left">
            <div className="inline-flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white font-black text-sm shadow-md">
                EP
              </div>
              <span className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-slate-100">
                Evidence Pilot
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {t.welcomeBack || 'Welcome back'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t.signInSubtitle || 'Sign in to Evidence Pilot to manage your projects.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {t.email}
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="you@example.com"
                className="w-full bg-slate-50/70 dark:bg-zinc-800/80 border border-slate-300 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all shadow-2xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t.password || (language === 'vi' ? 'Mật khẩu' : 'Password')}
                </label>
              </div>
              <input
                type="password"
                name="passwordHash"
                value={form.passwordHash}
                onChange={handleChange}
                required
                placeholder="••••••••"
                className="w-full bg-slate-50/70 dark:bg-zinc-800/80 border border-slate-300 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all shadow-2xs"
              />
            </div>

            {notice && !error && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-200 rounded-xl text-xs font-medium border border-amber-200 dark:border-amber-800">
                {notice}
              </div>
            )}

            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-200 rounded-xl text-xs font-medium border border-rose-200 dark:border-rose-800">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg hover:shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (t.signingIn || 'Signing in...') : (t.signIn || 'Sign In')}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-6">
            {t.needAccountHelp || 'Need an account? Contact your administrator.'}
          </p>
        </div>

        {/* Right 50% — WordRotate (hidden on small) */}
        <div className="hidden lg:flex flex-1 lg:w-1/2 items-center justify-center">
          <WordRotate />
        </div>
      </div>
    </AuroraBackground>
  );
}
