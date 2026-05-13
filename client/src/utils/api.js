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

// Response interceptor: handle auth errors
api.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status;
    const code = error.response?.data?.code;

    if (status === 401) {
      localStorage.removeItem('hmc_token');
      localStorage.removeItem('hmc_user');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }

    // Normalize error message
    const message = error.response?.data?.error || error.response?.data?.message || error.message || 'An error occurred';
    error.displayMessage = message;

    return Promise.reject(error);
  }
);

export default api;
