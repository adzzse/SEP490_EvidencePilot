import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api.js';

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
    <main className="min-h-screen bg-gray-50 px-4 py-12 sm:flex sm:items-center sm:justify-center">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">Đặt lại mật khẩu</h1>

        {!token ? (
          <div className="mt-4 space-y-5">
            <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.
            </p>
            <Link to="/login" className="rounded text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">
              Quay lại đăng nhập
            </Link>
          </div>
        ) : complete ? (
          <div className="mt-4 space-y-5">
            <p className="rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-700">
              Mật khẩu đã được đặt lại. Bạn có thể đăng nhập bằng mật khẩu mới.
            </p>
            <Link to="/login" className="rounded text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">
              Đăng nhập
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Mật khẩu mới</span>
              <input
                type="password"
                name="newPassword"
                value={form.newPassword}
                onChange={handleChange}
                autoComplete="new-password"
                required
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">Xác nhận mật khẩu mới</span>
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
                required
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </label>

            {error && (
              <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full cursor-pointer rounded-xl bg-blue-600 py-3 font-semibold text-white shadow-lg transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
