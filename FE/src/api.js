import axios from 'axios';

export const baseURL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');

const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'ngrok-skip-browser-warning': 'true',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  config._authToken = token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const LEAD_MS = 5 * 60 * 1000;
const NEAR_MS = 10 * 60 * 1000;
const REFRESH_RETRY_MS = 15 * 1000;

let refreshPromise = null;
let refreshTimeout = null;

function decodeExp(token) {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isAuthFailure(error) {
  const status = error?.response?.status;
  return status === 401 || status === 403;
}

function notifyAuthExpired() {
  window.dispatchEvent(new CustomEvent('auth:expired'));
}

async function refreshToken() {
  refreshPromise = refreshPromise || (async () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('no-token');
    const r = await axios.post(`${baseURL}/api/auth/refresh`, null, {
      headers: {
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      timeout: 15000,
    });
    localStorage.setItem('token', r.data.token);
    if (r.data.user?.role) localStorage.setItem('role', r.data.user.role);
    window.dispatchEvent(new CustomEvent('auth:refreshed', { detail: r.data }));
    armProactiveRefresh();
    return r.data.token;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function retryProactiveRefresh(token) {
  window.clearTimeout(refreshTimeout);
  const currentToken = localStorage.getItem('token');
  if (!currentToken) return;
  if (currentToken !== token) {
    armProactiveRefresh();
    return;
  }
  const expMs = decodeExp(currentToken);
  const remainingMs = expMs ? expMs - Date.now() : 0;
  if (remainingMs <= 0) {
    notifyAuthExpired();
    return;
  }
  const delay = Math.min(REFRESH_RETRY_MS, Math.max(250, Math.floor(remainingMs / 2)));
  refreshTimeout = window.setTimeout(() => refreshProactively(currentToken), delay);
}

function handleRefreshFailure(error, attemptedToken) {
  const currentToken = localStorage.getItem('token');
  if (currentToken && attemptedToken && currentToken !== attemptedToken) {
    armProactiveRefresh(); return;
  }
  if (!currentToken || isAuthFailure(error) || (currentToken && decodeExp(currentToken) && decodeExp(currentToken) <= Date.now())) {
    notifyAuthExpired();
    if (refreshPromise) refreshPromise = null;
    return;
  }
  retryProactiveRefresh(currentToken);
}

async function refreshProactively(expectedToken = localStorage.getItem('token')) {
  const attemptedToken = localStorage.getItem('token');
  if (!attemptedToken) {
    armProactiveRefresh();
    return;
  }
  if (expectedToken && expectedToken !== attemptedToken) {
    armProactiveRefresh();
    return;
  }
  try {
    await refreshToken();
  } catch (error) {
    handleRefreshFailure(error, attemptedToken);
  }
}

function armProactiveRefresh() {
  window.clearTimeout(refreshTimeout);
  const token = localStorage.getItem('token');
  if (!token) return;
  const expMs = decodeExp(token);
  if (!expMs) return;
  const remainingMs = expMs - Date.now();
  const leadMs = Math.min(LEAD_MS, Math.max(0, Math.floor(remainingMs / 2)));
  refreshTimeout = window.setTimeout(
    () => refreshProactively(token),
    Math.max(0, remainingMs - leadMs),
  );
}

function refreshIfNearExpiry() {
  const token = localStorage.getItem('token');
  if (!token) return;
  const expMs = decodeExp(token);
  if (!expMs) return;
  armProactiveRefresh();
  if (expMs - Date.now() < NEAR_MS) {
    refreshProactively(token);
  }
}

window.addEventListener('focus', refreshIfNearExpiry);
window.addEventListener('storage', (event) => {
  if (event.storageArea === localStorage && event.key === 'token') armProactiveRefresh();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshIfNearExpiry();
});
armProactiveRefresh();

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthCall = config.url?.startsWith('/api/auth/');
    const onLoginPage = window.location.pathname.startsWith('/login');
    if (response?.status === 403 && !isAuthCall) {
      return Promise.reject(error);
    }
    if (response?.status === 401 && !config._retried && !isAuthCall && !onLoginPage) {
      config._retried = true;
      const currentToken = localStorage.getItem('token');
      if (config._authToken && currentToken && config._authToken !== currentToken) {
        config.headers.Authorization = `Bearer ${currentToken}`;
        return api(config);
      }
      const refreshAttemptToken = localStorage.getItem('token');
      try {
        const token = await refreshToken();
        config.headers.Authorization = `Bearer ${token}`;
        return api(config);
      } catch (refreshError) {
        const nowToken = localStorage.getItem('token');
        if (nowToken && nowToken !== refreshAttemptToken) {
          config.headers.Authorization = `Bearer ${nowToken}`;
          return api(config);
        }
        handleRefreshFailure(refreshError, refreshAttemptToken);
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export { armProactiveRefresh };
export default api;
