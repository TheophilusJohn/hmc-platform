import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../utils/api';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/auth/reset-password/${encodeURIComponent(token)}`, { newPassword });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      const msg = err?.response?.data?.error || 'Could not reset password. The link may have expired.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'DM Sans,sans-serif', background: '#F5F7FA', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: '#fff', padding: 32, borderRadius: 12,
        boxShadow: '0 2px 8px rgba(15,43,74,0.08)',
      }}>
        <h1 style={{ fontFamily: 'Playfair Display,serif', color: '#0F2B4A', marginTop: 0, marginBottom: 8 }}>
          Reset Password
        </h1>
        <p style={{ color: '#5A6272', marginTop: 0, marginBottom: 24, fontSize: 14 }}>
          Set a new password for your Harvest Mission College account.
        </p>

        {done ? (
          <div style={{ background: '#ECFDF5', color: '#166534', padding: 12, borderRadius: 8, fontSize: 14 }}>
            Password reset. Redirecting to login…
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', fontSize: 13, color: '#0F2B4A', marginBottom: 4 }}>New password</label>
            <input
              type="password" autoComplete="new-password" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} required minLength={8}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, marginBottom: 16, fontSize: 14, boxSizing: 'border-box' }}
            />
            <label style={{ display: 'block', fontSize: 13, color: '#0F2B4A', marginBottom: 4 }}>Confirm password</label>
            <input
              type="password" autoComplete="new-password" value={confirm}
              onChange={e => setConfirm(e.target.value)} required minLength={8}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, marginBottom: 16, fontSize: 14, boxSizing: 'border-box' }}
            />

            {error && (
              <div style={{ background: '#FEF2F2', color: '#991B1B', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={submitting}
              style={{
                width: '100%', padding: '12px', background: submitting ? '#94A3B8' : '#0F2B4A', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Resetting…' : 'Reset password'}
            </button>

            <p style={{ marginTop: 16, fontSize: 13, color: '#5A6272', textAlign: 'center' }}>
              <Link to="/login" style={{ color: '#0F2B4A' }}>Back to login</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
