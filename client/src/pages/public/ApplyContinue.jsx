// client/src/pages/public/ApplyContinue.jsx
// Placeholder for the "Already started? Continue your application" flow.
// The real screen (code + email lookup → resume draft) lands in stage 2c
// alongside the public /status page. For now this exists so the link from
// the Step 0 intro doesn't dead-end.
import { Link } from 'react-router-dom';

const NAVY = '#0F2B4A';
const GOLD = '#C9920A';
const GRAY_600 = '#5A6272';

export default function ApplyContinue() {
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
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔑</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: NAVY, margin: '0 0 10px' }}>
            Resume application — coming soon
          </h1>
          <p style={{ color: GRAY_600, fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
            We're finishing the resume flow over the next few days. If you've already started
            an application and your browser still has the draft loaded, return to{' '}
            <Link to="/apply/start" style={{ color: GOLD, fontWeight: 600 }}>/apply/start</Link>{' '}
            — it will pick up where you left off automatically.
          </p>
          <p style={{ color: GRAY_600, fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
            Lost your draft code? Email{' '}
            <a href="mailto:admissions@hmc.college" style={{ color: NAVY, fontWeight: 600 }}>admissions@hmc.college</a>{' '}
            and our team can look it up for you.
          </p>
          <Link to="/apply" style={{ color: GOLD, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            ← Back to programmes
          </Link>
        </div>
      </div>
    </div>
  );
}
