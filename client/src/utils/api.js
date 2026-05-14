import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach JWT
api.interceptors.request.use(config => {
  const token = localStorage.getItem('hmc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, error => Promise.reject(error));

// Guard so a wave of concurrent 401s on token expiry only fires one logout event.
let authExpiredFired = false;
export function resetAuthExpiredGuard() { authExpiredFired = false; }

// Response interceptor: handle auth errors
api.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status;
    const url = error.config?.url || '';

    // 401 on the login endpoint itself is just "wrong credentials" — don't log the user out.
    const isLoginAttempt = url.includes('/auth/login');
    if (status === 401 && !isLoginAttempt) {
      localStorage.removeItem('hmc_token');
      localStorage.removeItem('hmc_user');
      if (!authExpiredFired) {
        authExpiredFired = true;
        // Soft signal — useAuth listens for this and clears React state. The
        // AuthGuard then routes the user to /login without a full page reload,
        // preserving in-flight component state where possible.
        window.dispatchEvent(new CustomEvent('hmc:auth-expired'));
      }
    }

    // Normalize error message
    const message = error.response?.data?.error || error.response?.data?.message || error.message || 'An error occurred';
    error.displayMessage = message;

    return Promise.reject(error);
  }
);

export default api;
