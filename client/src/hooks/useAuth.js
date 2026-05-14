import { useState, useCallback, useEffect } from 'react';
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
    // Merge decoded JWT with cached user object from login (which has firstName, lastName)
    let cached = {};
    try {
      const raw = localStorage.getItem('hmc_user');
      if (raw) cached = JSON.parse(raw);
    } catch {}
    return { ...decoded, ...cached };
  } catch { return null; }
}

export function useAuth() {
  const [user, setUser] = useState(getStoredUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // After mount, fetch full profile to ensure firstName/lastName are populated
  useEffect(() => {
    if (!user?.id) return;
    if (user.firstName) return; // already have it
    api.get('/me/profile').then(({ data }) => {
      const merged = { ...user, ...data };
      localStorage.setItem('hmc_user', JSON.stringify(merged));
      setUser(merged);
    }).catch(() => {});
  }, [user?.id]);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, user: userData } = res.data;
      localStorage.setItem('hmc_token', token);
      localStorage.setItem('hmc_user', JSON.stringify(userData));
      const decoded = decodeJWT(token);
      const merged = { ...decoded, ...userData };
      setUser(merged);
      // Fetch profile for firstName/lastName if not in userData
      if (!userData?.firstName) {
        try {
          const { data } = await api.get('/me/profile');
          const full = { ...merged, ...data };
          localStorage.setItem('hmc_user', JSON.stringify(full));
          setUser(full);
        } catch {}
      }
      return {
        success: true,
        forcePasswordChange: userData.forcePasswordChange || userData.force_change_password,
        role: decoded.role,
      };
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
