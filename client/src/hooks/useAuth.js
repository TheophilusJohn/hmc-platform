import { useState, useCallback } from 'react';
import api from '../utils/api';

function decodeJWT(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch { return null; }
}

function getStoredUser() {
  try {
    const token = localStorage.getItem('hmc_token');
    if (!token) return null;
    const decoded = decodeJWT(token);
    if (!decoded || decoded.exp * 1000 < Date.now()) {
      localStorage.removeItem('hmc_token');
      localStorage.removeItem('hmc_user');
      return null;
    }
    return decoded;
  } catch { return null; }
}

export function useAuth() {
  const [user, setUser] = useState(getStoredUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, user: userData } = res.data;
      localStorage.setItem('hmc_token', token);
      localStorage.setItem('hmc_user', JSON.stringify(userData));
      const decoded = decodeJWT(token);
      setUser(decoded);
      return { success: true, forcePasswordChange: userData.force_change_password, role: decoded.role };
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('hmc_token');
    localStorage.removeItem('hmc_user');
    setUser(null);
    window.location.href = '/login';
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const res = await api.post('/auth/change-password', { currentPassword, newPassword });
    return res.data;
  }, []);

  return { user, loading, error, login, logout, changePassword, isAuthenticated: !!user };
}
