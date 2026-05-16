// client/src/pages/public/ApplyPage.jsx
// Public application landing — geo-driven, no visible toggle.
//
// Leadership decision (Phase 2b): the FE shows ONE view, derived from the
// caller's geo. URL ?type= is NOT honored — applicants misclassified by geo
// (VPN users, travelling Indians, NRI parents) email admissions@hmc.college
// and admissions handles them manually. The server enforces the same boundary
// on POST /applications/start so the network tab can't bypass it.
//
// Fees / application-fee values are intentionally NOT rendered on the cards —
// they first surface on the Application Summary screen (stage 2c).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { Btn } from '../../components/common';

const NAVY = '#0F2B4A';
const GOLD = '#C9920A';
const NAVY_BG = '#EEF4FA';
const GRAY_500 = '#7B8494';
const GRAY_600 = '#5A6272';

function ModeBadge({ mode }) {
  const label = mode === 'online' ? 'Online' : mode === 'offline' ? 'Offline' : mode;
  const palette = mode === 'online'
    ? { bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4' }
    : { bg: NAVY_BG, text: NAVY, border: '#A8C5E0' };
  return (
    <span style={{ fontSize: 12, background: palette.bg, color: palette.text, border: `1px solid ${palette.border}`, padding: '2px 10px', borderRadius: 10, fontWeight: 500 }}>
      {label}
    </span>
  );
}

export default function ApplyPage() {
  const navigate = useNavigate();
  // applicantType is null until /geo resolves, then 'DOMESTIC' or 'INTERNATIONAL'.
  const [applicantType, setApplicantType] = useState(null);
  const [programmes, setProgrammes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Resolve geo first, then fetch the programmes shaped for that type. The
    // public /programmes endpoint already hides CTH for international and emits
    // online-only modes for international callers — we just feed it the type
    // the /geo endpoint reported.
    api.get('/public/geo')
      .then(geo => {
        const type = geo?.data?.applicantType === 'DOMESTIC' ? 'DOMESTIC' : 'INTERNATIONAL';
        if (cancelled) return type;
        setApplicantType(type);
        return type;
      })
      .then(type => {
        const param = type === 'INTERNATIONAL' ? 'international' : 'domestic';
        return api.get(`/public/programmes?type=${param}`);
      })
      .then(res => {
        if (cancelled) return;
        setProgrammes(res?.data?.programmes || []);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err?.response?.data?.error || 'Could not load programmes. Please try again.');
        setProgrammes([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const handleStart = (p) => {
    // Type intentionally NOT in the URL — geo is the single source of truth.
    navigate(`/apply/start?programme=${encodeURIComponent(p.code)}`);
  };

  const typeLabel = applicantType === 'DOMESTIC' ? 'domestic' : 'international';

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
        <p style={{ color: GRAY_600, fontSize: 15, lineHeight: 1.6, margin: '0 0 6px' }}>
          Submit your application online below. Choose your programme to begin.
        </p>
        <p style={{ color: GRAY_500, fontSize: 13, lineHeight: 1.6, margin: '0 0 28px' }}>
          {applicantType
            ? <>Application for <strong>{typeLabel}</strong> students. If this is incorrect, please contact{' '}
                <a href="mailto:admissions@hmc.college" style={{ color: GOLD }}>admissions@hmc.college</a>.</>
            : <>Detecting your location…</>
          }
        </p>

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
                  <div style={{ marginTop: 'auto' }}>
                    <Btn onClick={() => handleStart(p)} full>Start Application →</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ padding: '14px 18px', background: NAVY_BG, borderRadius: 10, fontSize: 13, color: NAVY, lineHeight: 1.6 }}>
          {applicantType === 'INTERNATIONAL' ? (
            <>
              <strong>International applicants:</strong> only online programmes are shown — campus study is for domestic applicants only.
              Questions? Email <a href="mailto:admissions@hmc.college" style={{ color: NAVY }}>admissions@hmc.college</a>.
            </>
          ) : (
            <>
              Questions? Email <a href="mailto:admissions@hmc.college" style={{ color: NAVY }}>admissions@hmc.college</a>.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
