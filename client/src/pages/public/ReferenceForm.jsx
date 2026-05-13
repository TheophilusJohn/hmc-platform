import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../utils/api';

const QUESTIONS = [
  { id: 'relationship', label: 'How long have you known this applicant and in what capacity?', type: 'textarea' },
  { id: 'character', label: 'Describe the applicant\'s character, integrity and Christian commitment.', type: 'textarea' },
  { id: 'ministry', label: 'Describe the applicant\'s involvement in ministry.', type: 'textarea' },
  { id: 'maturity', label: 'Describe the applicant\'s spiritual maturity and readiness for theological training.', type: 'textarea' },
  { id: 'concerns', label: 'Do you have any concerns about this applicant\'s suitability for ministry training?', type: 'textarea' },
  { id: 'recommendation', label: 'Do you recommend this applicant for admission to Harvest Mission College?', type: 'select', options: ['Strongly Recommend', 'Recommend', 'Recommend with Reservations', 'Do Not Recommend'] },
];

export default function ReferenceForm() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('loading'); // loading | ready | submitting | done | error
  const [info, setInfo] = useState(null);
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    api.get(`/references/validate/${token}`)
      .then(({ data }) => { setInfo(data); setStatus('ready'); })
      .catch(() => setStatus('error'));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('submitting');
    try {
      await api.post(`/references/submit/${token}`, { answers });
      setStatus('done');
    } catch { setStatus('error'); }
  };

  if (status === 'loading') return <Shell><div style={{ color: '#7B8494', padding: 40, textAlign: 'center' }}>Validating your reference link…</div></Shell>;
  if (status === 'error') return <Shell><div style={{ padding: 40, textAlign: 'center' }}>
    <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
    <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#0F2B4A' }}>Link Expired or Invalid</h2>
    <p style={{ color: '#7B8494' }}>This reference link has expired or is no longer valid. Please contact the applicant or HMC directly.</p>
  </div></Shell>;
  if (status === 'done') return <Shell><div style={{ padding: 40, textAlign: 'center' }}>
    <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
    <h2 style={{ fontFamily: "'Playfair Display',serif", color: '#0F2B4A' }}>Reference Submitted</h2>
    <p style={{ color: '#7B8494' }}>Thank you. Your reference for <strong>{info?.applicantName}</strong> has been received and will be reviewed by the admissions committee.</p>
  </div></Shell>;

  return (
    <Shell>
      <div style={{ maxWidth: 600 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: '#0F2B4A', margin: '0 0 6px' }}>Pastoral Reference Form</h2>
        <p style={{ color: '#7B8494', fontSize: 14, margin: '0 0 24px' }}>
          You have been asked to provide a reference for <strong>{info?.applicantName}</strong> who has applied to the <strong>{info?.programmeName}</strong> programme.
        </p>
        <div style={{ padding: '12px 16px', background: '#EEF4FA', borderRadius: 8, fontSize: 13, color: '#0F2B4A', marginBottom: 24 }}>
          All information you provide is confidential and will only be reviewed by the admissions committee of Harvest Mission College.
        </div>
        <form onSubmit={handleSubmit}>
          {QUESTIONS.map(q => (
            <div key={q.id} style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#1A1D23', display: 'block', marginBottom: 8 }}>{q.label}</label>
              {q.type === 'textarea' ? (
                <textarea value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} required
                  style={{ width: '100%', minHeight: 100, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans', boxSizing: 'border-box', resize: 'vertical' }} />
              ) : (
                <select value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} required
                  style={{ padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, width: '100%', background: '#fff' }}>
                  <option value="">Select…</option>
                  {q.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
            </div>
          ))}
          <button type="submit" disabled={status === 'submitting'}
            style={{ width: '100%', padding: '14px', background: '#0F2B4A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans' }}>
            {status === 'submitting' ? 'Submitting…' : 'Submit Reference'}
          </button>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7', fontFamily: "'DM Sans', sans-serif", padding: '40px 24px' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{ width: 40, height: 40, background: '#0F2B4A', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9920A', fontSize: 18 }}>✝</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#0F2B4A' }}>Harvest Mission College</div>
            <div style={{ fontSize: 11, color: '#7B8494' }}>Greater Noida · Accredited by ATA</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
