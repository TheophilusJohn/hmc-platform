// TranscriptVerify.jsx
import { useState } from 'react';
import api from '../../utils/api';

export default function TranscriptVerify() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const { data } = await api.get(`/transcripts/verify/${code.trim()}`);
      setResult(data);
    } catch { setError('Verification code not found. Please check and try again.'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{ width: 40, height: 40, background: '#0F2B4A', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9920A', fontSize: 18 }}>✝</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#0F2B4A' }}>Harvest Mission College</div>
            <div style={{ fontSize: 11, color: '#7B8494' }}>Official Transcript Verification</div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: '32px', border: '1px solid #DDE1E7' }}>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: '#0F2B4A', margin: '0 0 8px' }}>Verify Transcript</h2>
          <p style={{ color: '#7B8494', fontSize: 14, margin: '0 0 24px' }}>Enter the verification code printed on the transcript document.</p>
          <form onSubmit={handleVerify}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. HMC-2024-BTH-00123"
                style={{ flex: 1, padding: '10px 14px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, letterSpacing: 1 }} />
              <button type="submit" disabled={loading}
                style={{ padding: '10px 20px', background: '#0F2B4A', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {loading ? '…' : 'Verify'}
              </button>
            </div>
          </form>

          {error && <div style={{ marginTop: 16, padding: '10px 14px', background: '#FEF2F2', borderRadius: 8, color: '#991B1B', fontSize: 13 }}>{error}</div>}

          {result && (
            <div style={{ marginTop: 20, padding: '16px 20px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <strong style={{ color: '#166534', fontSize: 15 }}>Transcript Verified</strong>
              </div>
              {[['Student Name', result.studentName], ['Student ID', result.studentId], ['Programme', result.programmeName], ['Graduating Year', result.graduatingYear], ['CGPA', result.cgpa], ['Status', result.completionStatus], ['Issued On', new Date(result.issuedAt).toLocaleDateString('en-IN')]].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #BBF7D0', fontSize: 13 }}>
                  <span style={{ color: '#5A6272' }}>{l}</span>
                  <strong style={{ color: '#1A1D23' }}>{v || '—'}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
