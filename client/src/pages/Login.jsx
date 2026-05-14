import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const ROLES = [
  { key: 'ADMIN', label: 'Full Admin', hint: 'System & financial management', icon: '⚙️' },
  { key: 'TEACHER_ADMIN', label: 'Teacher-Admin', hint: 'Academic coordination + teaching', icon: '🎓' },
  { key: 'FACULTY', label: 'Faculty', hint: 'Subjects, exams & grading', icon: '📚' },
  { key: 'ADMISSIONS', label: 'Admissions Officer', hint: 'Applications & enrolment pipeline', icon: '📋' },
  { key: 'STUDENT', label: 'Student', hint: 'Courses, fees & records', icon: '🎒' },
];

const PORTAL_ROUTES = {
  FULL_ADMIN: '/admin',
  TEACHER_ADMIN: '/ta',
  FACULTY: '/faculty',
  ADMISSIONS_OFFICER: '/admissions',
  STUDENT: '/student',
};

export default function Login() {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Email and password are required.'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('hmc_token', data.token);
      localStorage.setItem('hmc_user', JSON.stringify(data.user));
      if (data.forcePasswordChange || data.force_change_password) { navigate('/change-password'); return; }
      navigate(PORTAL_ROUTES[data.user.role] || '/');
    } catch (err) {
      // Server convention: errors are returned as { error: '…' }. Fall back to
      // any displayMessage from the axios interceptor, then to a generic msg.
      setError(err.response?.data?.error || err.displayMessage || 'Invalid credentials.');
    } finally { setLoading(false); }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/forgot-password', { email: forgotEmail });
      setForgotSent(true);
    } catch { setForgotSent(true); }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Left panel */}
      <div style={{
        width: '45%', background: '#0F2B4A', color: '#fff', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '60px 48px', position: 'relative', overflow: 'hidden'
      }}>
        {/* Cross pattern background */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.05,
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, #fff 40px, #fff 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, #fff 40px, #fff 41px)'
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ width: 48, height: 48, background: '#C9920A', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>✝</div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 3, color: '#C9920A', textTransform: 'uppercase', fontWeight: 600 }}>Harvest Mission</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700 }}>College</div>
            </div>
          </div>
          <div style={{ width: 40, height: 3, background: '#C9920A', margin: '24px 0' }} />
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 700, lineHeight: 1.3, marginBottom: 16 }}>
            Equipping Leaders<br />for the Kingdom
          </div>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.7 }}>
            Greater Noida, U.P. · Accredited by Asia Theological Association
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, margin: '40px 0' }}>
            {[['5', 'Programmes'], ['3+', 'Batches Active'], ['Online &', 'Offline Modes'], ['ATA', 'Accredited']].map(([v, l]) => (
              <div key={l} style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: '#C9920A' }}>{v}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
          <blockquote style={{ borderLeft: '3px solid #C9920A', paddingLeft: 16, margin: 0 }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', lineHeight: 1.6 }}>
              "Proclaiming Christ, building His church, advancing His kingdom."
            </p>
          </blockquote>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, background: '#FDFBF7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
        <div style={{ width: '100%', maxWidth: 460 }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: '#0F2B4A', marginBottom: 6 }}>Sign In</h1>
          <p style={{ color: '#7B8494', fontSize: 14, marginBottom: 28 }}>Welcome back. Sign in to continue.</p>

          {/* Role cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
            {ROLES.map(r => (
              <div key={r.key} onClick={() => setSelectedRole(r.key)}
                style={{
                  border: `2px solid ${selectedRole === r.key ? '#C9920A' : '#DDE1E7'}`,
                  borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                  background: selectedRole === r.key ? '#FFFBF0' : '#fff',
                  transition: 'all 0.15s',
                  ...(r.key === 'STUDENT' ? { gridColumn: '1 / -1' } : {})
                }}>
                <div style={{ fontSize: 18, marginBottom: 2 }}>{r.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1D23' }}>{r.label}</div>
                <div style={{ fontSize: 11, color: '#7B8494' }}>{r.hint}</div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#3D4450', marginBottom: 6 }}>Email or User ID</label>
              <input value={email} onChange={e => setEmail(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff' }}
                placeholder="admin@hmc.edu or HMC-S-0001" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#3D4450', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  style={{ width: '100%', padding: '10px 40px 10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff' }}
                  placeholder="••••••••" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#7B8494', fontSize: 13 }}>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '12px', background: loading ? '#7B8494' : '#0F2B4A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={() => setForgotOpen(true)} style={{ background: 'none', border: 'none', color: '#0F2B4A', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Forgot password?</button>
          </div>


        </div>
      </div>

      {/* Forgot password modal */}
      {forgotOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,43,74,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: '#0F2B4A', margin: '0 0 8px' }}>Reset Password</h3>
            {forgotSent ? (
              <div>
                <p style={{ color: '#166534', fontSize: 14 }}>If that email exists, a reset link has been sent. Check your inbox.</p>
                <button onClick={() => { setForgotOpen(false); setForgotSent(false); setForgotEmail(''); }}
                  style={{ marginTop: 16, padding: '10px 20px', background: '#0F2B4A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Close</button>
              </div>
            ) : (
              <form onSubmit={handleForgot}>
                <p style={{ color: '#7B8494', fontSize: 13, marginBottom: 16 }}>Enter your email or User ID and we'll send a reset link.</p>
                <input value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
                  placeholder="Email or User ID" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setForgotOpen(false)}
                    style={{ flex: 1, padding: '10px', border: '1px solid #DDE1E7', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
                  <button type="submit"
                    style={{ flex: 1, padding: '10px', background: '#0F2B4A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>Send Link</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
