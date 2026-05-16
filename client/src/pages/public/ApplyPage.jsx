// client/src/pages/public/ApplyPage.jsx
// Public application landing — programme list with domestic/international toggle.
// Fetches from GET /api/public/programmes?type=... (unauthenticated, rate-limited).
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { Btn } from '../../components/common';

const NAVY = '#0F2B4A';
const GOLD = '#C9920A';
const NAVY_BG = '#EEF4FA';
const GRAY_500 = '#7B8494';
const GRAY_600 = '#5A6272';

function formatMoney(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  if (currency === 'USD') {
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function ModeBadge({ mode }) {
  const label = mode === 'online' ? 'Online' : mode === 'offline' ? 'Offline' : mode;
  const color = mode === 'online' ? { bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4' } : { bg: NAVY_BG, text: NAVY, border: '#A8C5E0' };
  return (
    <span style={{ fontSize: 12, background: color.bg, color: color.text, border: `1px solid ${color.border}`, padding: '2px 10px', borderRadius: 10, fontWeight: 500 }}>
      {label}
    </span>
  );
}

function TogglePill({ value, current, onClick, label }) {
  const active = value === current;
  return (
    <button onClick={() => onClick(value)} style={{
      padding: '10px 22px',
      borderRadius: 999,
      border: active ? `1.5px solid ${NAVY}` : '1.5px solid #DDE1E7',
      background: active ? NAVY : '#fff',
      color: active ? '#fff' : GRAY_600,
      fontFamily: "'DM Sans', sans-serif",
      fontWeight: 600,
      fontSize: 14,
      cursor: 'pointer',
      transition: 'all 0.15s',
    }}>
      {label}
    </button>
  );
}

export default function ApplyPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  // Default to domestic. Anything other than 'international' normalizes back to
  // 'domestic' so a stale or garbled query param is self-healing.
  const initialType = params.get('type') === 'international' ? 'international' : 'domestic';
  const [type, setType] = useState(initialType);
  const [programmes, setProgrammes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Keep URL in sync so the page is shareable / bookmarkable per type.
  useEffect(() => {
    if (params.get('type') !== type) {
      setParams({ type }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(`/public/programmes?type=${type}`)
      .then(res => {
        if (cancelled) return;
        setProgrammes(res.data?.programmes || []);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err?.response?.data?.error || 'Could not load programmes. Please try again.');
        setProgrammes([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type]);

  const handleStart = (p) => {
    navigate(`/apply/start?programme=${encodeURIComponent(p.code)}&type=${type}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ background: NAVY, color: '#fff', padding: '24px 40px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, background: GOLD, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✝</div>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Harvest Mission College</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Greater Noida, U.P. · Accredited by Asia Theological Association</div>
        </div>
      </div>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, color: NAVY, margin: '0 0 8px' }}>Apply for Admission</h1>
        <p style={{ color: GRAY_600, fontSize: 15, lineHeight: 1.6, margin: '0 0 28px' }}>
          Submit your application online below. Choose your programme to begin.
        </p>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, color: GRAY_600, marginBottom: 10, fontWeight: 500 }}>I am applying as:</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <TogglePill value="domestic" current={type} onClick={setType} label="Domestic (India)" />
            <TogglePill value="international" current={type} onClick={setType} label="International" />
          </div>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: GRAY_500 }}>Loading programmes…</div>
        )}

        {error && !loading && (
          <div style={{ padding: '14px 18px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, marginBottom: 16, fontSize: 14 }}>
            {error}
          </div>
        )}

        {!loading && !error && programmes.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: GRAY_500, fontSize: 14 }}>
            No programmes available right now. Please contact admissions@hmc.college.
          </div>
        )}

        {!loading && programmes.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18, marginBottom: 32 }}>
            {programmes.map(p => {
              const totalCostText = formatMoney(p.totalCost, p.currency);
              const appFeeText = formatMoney(p.applicationFee, p.currency);
              const yearLabel = `${p.durationYears} Year${p.durationYears === 1 ? '' : 's'}`;
              return (
                <div key={p.id} style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: NAVY, margin: 0 }}>{p.name}</h3>
                    <span style={{ fontSize: 12, background: NAVY, color: '#fff', padding: '3px 10px', borderRadius: 10, fontWeight: 600, flexShrink: 0 }}>{p.code}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, background: NAVY_BG, color: NAVY, border: '1px solid #A8C5E0', padding: '2px 10px', borderRadius: 10, fontWeight: 500 }}>{yearLabel}</span>
                    {p.modes.map(m => <ModeBadge key={m} mode={m} />)}
                  </div>
                  <div style={{ fontSize: 14, color: GRAY_600, lineHeight: 1.5 }}>
                    Approximate total cost:{' '}
                    <strong style={{ color: NAVY }}>
                      {totalCostText
                        ? `${totalCostText} for the full ${p.durationYears}-year programme`
                        : 'TBD — contact admissions'}
                    </strong>
                  </div>
                  <div style={{ fontSize: 14, color: GRAY_600, lineHeight: 1.5 }}>
                    Application fee:{' '}
                    <strong style={{ color: NAVY }}>
                      {appFeeText ? `${appFeeText} (payable on submission)` : 'TBD — contact admissions'}
                    </strong>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Btn onClick={() => handleStart(p)} full>Start Application →</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ padding: '14px 18px', background: NAVY_BG, borderRadius: 10, fontSize: 13, color: NAVY, lineHeight: 1.6 }}>
          {type === 'international' ? (
            <>
              <strong>International applicants:</strong> only online programmes are shown — campus study (offline) is for domestic applicants only.
              Tuition and application fee are billed in USD. Questions? Email{' '}
              <a href="mailto:admissions@hmc.college" style={{ color: NAVY }}>admissions@hmc.college</a>.
            </>
          ) : (
            <>
              <strong>Note:</strong> Costs shown are the approximate total for the full programme.
              For detailed semester-wise fees or scholarship enquiries, email{' '}
              <a href="mailto:admissions@hmc.college" style={{ color: NAVY }}>admissions@hmc.college</a>.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
