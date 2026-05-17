// client/src/pages/public/ApplyStatus.jsx
// Placeholder. The real lookup-by-applicationNo + email screen lands in
// stage 2b-3 alongside the proper /apply/continue resume flow. Today this
// page exists so links from the existing-applications choice screen don't
// hit App.jsx's catch-all → /login redirect.
import { Link, useSearchParams } from 'react-router-dom';

const NAVY = '#0F2B4A';
const GOLD = '#C9920A';
const GRAY_600 = '#5A6272';

export default function ApplyStatus() {
  const [params] = useSearchParams();
  const applicationNo = params.get('applicationNo') || '';

  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ background: NAVY, color: '#fff', padding: '24px 40px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, background: GOLD, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✝</div>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Harvest Mission College</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Greater Noida, U.P. · Accredited by Asia Theological Association</div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '64px 24px' }}>
        <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '32px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📨</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: NAVY, margin: '0 0 10px' }}>
            Application status — coming soon
          </h1>
          <p style={{ color: GRAY_600, fontSize: 14, lineHeight: 1.6, margin: '0 0 12px' }}>
            We're finishing the public status-lookup screen over the next few days.
            {applicationNo && (
              <> Your application number is <code style={{ background: '#EEF4FA', padding: '2px 8px', borderRadius: 4 }}>{applicationNo}</code>.</>
            )}
          </p>
          <p style={{ color: GRAY_600, fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
            For now, email{' '}
            <a href="mailto:admissions@hmc.college" style={{ color: NAVY, fontWeight: 600 }}>admissions@hmc.college</a>
            {applicationNo ? <> with this application number for a status check.</> : <> for a status check.</>}
          </p>
          <Link to="/apply" style={{ color: GOLD, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            ← Back to programmes
          </Link>
        </div>
      </div>
    </div>
  );
}
