import axios from 'axios';

export const baseURL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');

const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: { 'ngrok-skip-browser-warning': 'true' },
});

api.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  config._authToken = token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (!config.headers) config.headers = {};
  config.headers['ngrok-skip-browser-warning'] = 'true';
  return config;
});

let refreshPromise = null;
async function refreshToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('no-token');
    const r = await axios.post(`${baseURL}/api/auth/refresh`, null, {
      headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' },
      timeout: 15000,
    });
    localStorage.setItem('token', r.data.token);
    if (r.data.user?.role) localStorage.setItem('role', r.data.user.role);
    window.dispatchEvent(new CustomEvent('auth:refreshed', { detail: r.data }));
    return r.data.token;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function notifyAuthExpired() {
  window.dispatchEvent(new CustomEvent('auth:expired'));
}

// ponytail: proactive LEAD/NEAR timers + focus/visibility listeners removed — lazy 401 retry covers expiry.
// Keep export for compat; callers (AuthContext) still import it.
export function armProactiveRefresh() {}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthCall = config?.url?.startsWith('/api/auth/');
    const onLoginPage = window.location.pathname.startsWith('/login');
    if (response?.status === 403 && !isAuthCall) return Promise.reject(error);
    if (response?.status === 401 && !config._retried && !isAuthCall && !onLoginPage) {
      config._retried = true;
      const currentToken = localStorage.getItem('token');
      if (config._authToken && currentToken && config._authToken !== currentToken) {
        config.headers.Authorization = `Bearer ${currentToken}`;
        return api(config);
      }
      try {
        const token = await refreshToken();
        config.headers.Authorization = `Bearer ${token}`;
        return api(config);
      } catch (refreshError) {
        const nowToken = localStorage.getItem('token');
        if (nowToken && refreshError?.response?.status !== 401 && refreshError?.response?.status !== 403) {
          // transient refresh failure — let caller retry on next action; don't log out yet
          return Promise.reject(refreshError);
        }
        notifyAuthExpired();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
