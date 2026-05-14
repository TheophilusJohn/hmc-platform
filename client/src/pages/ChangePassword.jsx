import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const PORTAL_ROUTES = {
  FULL_ADMIN: '/admin',
  TEACHER_ADMIN: '/ta',
  FACULTY: '/faculty',
  ADMISSIONS_OFFICER: '/admissions',
  STUDENT: '/student',
};

function readMustChange() {
  try {
    const t = localStorage.getItem('hmc_token');
    if (!t) return false;
    const p = JSON.parse(atob(t.split('.')[1]));
    return !!p.mustChangePassword;
  } catch { return false; }
}

export default function ChangePassword() {
  const mustChange = readMustChange();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!current || !newPw || !confirm) { setError('All fields are required.'); return; }
    if (newPw.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (newPw !== confirm) { setError('Passwords do not match.'); return; }
    if (current === newPw) { setError('New password must differ from current.'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: current, newPassword: newPw });
      if (data?.token) localStorage.setItem('hmc_token', data.token);
      const user = JSON.parse(localStorage.getItem('hmc_user') || '{}');
      navigate(PORTAL_ROUTES[user.role] || '/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Could not change password.');
    } finally { setLoading(false); }
  };

  const handleSkip = () => {
    const user = JSON.parse(localStorage.getItem('hmc_user') || '{}');
    navigate(PORTAL_ROUTES[user.role] || '/', { replace: true });
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif", background: '#FDFBF7', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#fff', padding: 40, borderRadius: 12, boxShadow: '0 10px 40px rgba(15,43,74,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, background: '#C9920A', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff' }}>🔒</div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: '#C9920A', textTransform: 'uppercase', fontWeight: 600 }}>Harvest Mission College</div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#0F2B4A', margin: '2px 0 0' }}>Change Your Password</h1>
          </div>
        </div>

        <p style={{ color: '#7B8494', fontSize: 13, marginBottom: 24 }}>
          For your security, please change your password. Choose something you can remember but others can't easily guess.
        </p>

        <form onSubmit={handleSubmit}>
          {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#3D4450', marginBottom: 6 }}>Current Password (or Temporary)</label>
            <input type={showPw ? 'text' : 'password'} value={current} onChange={e => setCurrent(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff' }}
              placeholder="Enter your current password" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#3D4450', marginBottom: 6 }}>New Password</label>
            <input type={showPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff' }}
              placeholder="At least 8 characters" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#3D4450', marginBottom: 6 }}>Confirm New Password</label>
            <input type={showPw ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff' }}
              placeholder="Type the new password again" />
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#5A6272', marginBottom: 20 }}>
            <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} />
            Show passwords
          </label>

          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: loading ? '#7B8494' : '#0F2B4A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Updating...' : 'Change Password'}
          </button>

          {!mustChange && (
            <button type="button" onClick={handleSkip}
              style={{ width: '100%', marginTop: 10, padding: '10px', background: 'transparent', color: '#7B8494', border: 'none', fontSize: 13, cursor: 'pointer' }}>
              Skip for now
            </button>
          )}
          {mustChange && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#FFFBF0', border: '1px solid #F5E6BE', borderRadius: 8, fontSize: 12, color: '#92400E', textAlign: 'center' }}>
              You're using a temporary password and must set a new one before continuing.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
