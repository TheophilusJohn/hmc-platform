// TranscriptVerify.jsx — handles both /verify/:uuid (official transcripts) and
// /certificates/verify/:uuid (degree certificates). The two backend endpoints
// return different shapes:
//   /transcripts/verify/:uuid  → { valid, student:{name,id}, issuedAt, purpose }
//   /certificates/verify/:uuid → { valid, student:{name,id}, programme, graduationDate, certNumber }
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../utils/api';

export default function TranscriptVerify({ type = 'transcript' }) {
  const { uuid: paramUuid } = useParams();
  const [code, setCode] = useState(paramUuid || '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isCertificate = type === 'certificate';
  const endpoint = isCertificate ? 'certificates/verify' : 'transcripts/verify';
  const label = isCertificate ? 'Degree Certificate' : 'Transcript';

  async function lookup(uuid) {
    if (!uuid?.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const { data } = await api.get(`/${endpoint}/${encodeURIComponent(uuid.trim())}`);
      if (!data?.valid) {
        setError(`${label} not found.`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err?.response?.data?.message || `Verification code not found. Please check and try again.`);
    } finally { setLoading(false); }
  }

  // Auto-lookup when the URL contains a uuid (QR-scan flow).
  useEffect(() => {
    if (paramUuid) lookup(paramUuid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramUuid]);

  const handleVerify = (e) => { e.preventDefault(); lookup(code); };

  // Pull display fields from whichever shape came back.
  const studentName = result?.student?.name;
  const studentIdDisplay = result?.student?.id;
  const programme = result?.programme || result?.programmeName;
  const issued = result?.issuedAt || result?.graduationDate;
  const certNumber = result?.certNumber || null;
  const purpose = result?.purpose || null;

  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{ width: 40, height: 40, background: '#0F2B4A', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9920A', fontSize: 18 }}>✝</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: '#0F2B4A' }}>Harvest Mission College</div>
            <div style={{ fontSize: 11, color: '#7B8494' }}>Official {label} Verification</div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: '32px', border: '1px solid #DDE1E7' }}>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: '#0F2B4A', margin: '0 0 8px' }}>Verify {label}</h2>
          <p style={{ color: '#7B8494', fontSize: 14, margin: '0 0 24px' }}>Enter the verification code printed on the {label.toLowerCase()} document, or scan its QR code.</p>
          <form onSubmit={handleVerify}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="Paste verification UUID"
                style={{ flex: 1, padding: '10px 14px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, letterSpacing: 0.5 }} />
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
                <strong style={{ color: '#166534', fontSize: 15 }}>{label} Verified</strong>
              </div>
              {[
                ['Student Name', studentName],
                ['Student ID', studentIdDisplay],
                programme ? ['Programme', programme] : null,
                certNumber ? ['Certificate No.', certNumber] : null,
                purpose ? ['Issued For', purpose] : null,
                issued ? [isCertificate ? 'Graduation Date' : 'Issued On', new Date(issued).toLocaleDateString('en-IN')] : null,
              ].filter(Boolean).map(([l, v]) => (
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
