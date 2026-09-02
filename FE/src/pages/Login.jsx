import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { commonText } from '../locales';
import api from '../services/api.js';
import { getPostLoginDestination } from './loginOrigin.js';

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
    <div className="min-h-screen bg-gray-50 flex border-t-4 border-indigo-600 font-sans">
      {/* Left Column: Form */}
      <div className="flex-1 flex items-center justify-center p-8 sm:p-12 lg:p-24 bg-white">
        <div className="w-full max-w-md relative">
          
          {/* Back to Home Button */}
          <div className="mb-8">
            <Link to="/" className="inline-flex items-center text-xs font-semibold text-gray-500 hover:text-indigo-600 transition-colors gap-1.5 group">
              <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {t.backToHome || (language === 'vi' ? 'Quay lại Trang chủ' : 'Back to Home')}
            </Link>
          </div>

          <div className="mb-10 text-center sm:text-left">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.welcomeBack || 'Welcome back'}</h1>
            <p className="text-gray-500">{t.signInSubtitle || 'Sign in to Evidence Pilot to manage your projects.'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.email}
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="you@example.com"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.password || (language === 'vi' ? 'Mật khẩu' : 'Password')}
              </label>
              <input
                type="password"
                name="passwordHash"
                value={form.passwordHash}
                onChange={handleChange}
                required
                placeholder="••••••••"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-sm"
              />
            </div>

            {notice && !error && (
              <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-sm border border-amber-200">
                {notice}
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (t.signingIn || 'Signing in...') : (t.signIn || 'Sign In')}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-8">
            {t.needAccountHelp || 'Need an account? Contact your administrator.'}
          </p>
        </div>
      </div>

      {/* Right Column: Decorative */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden items-center justify-center">
        {/* Full screen background image */}
        <img 
          src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1600&auto=format&fit=crop" 
          alt="Evidence Network" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-blue-900/60 mix-blend-multiply"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-blue-900/80 via-blue-900/20 to-transparent"></div>
        
        <div className="relative z-10 text-center px-12 max-w-lg flex flex-col items-center">
          <h2 className="text-4xl font-bold text-white mb-6 leading-tight drop-shadow-md">
            {t.heroTagline || 'Manage Research Collaboratively'}
          </h2>
          <p className="text-blue-50 text-lg drop-shadow-md">
            {t.heroDescription || 'Evidence Pilot provides a collaborative workspace for paper authoring, source management, citation review, and instructor feedback.'}
          </p>
        </div>
      </div>
    </div>
  );
}

