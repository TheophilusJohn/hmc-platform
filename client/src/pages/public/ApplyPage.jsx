import { useNavigate } from 'react-router-dom';

const PROGRAMMES = [
  { code: 'cth', name: 'Certificate in Theology (Hindi)', duration: '1 Year', modes: ['Offline'], tuition: '₹8,000/year' },
  { code: 'dipth', name: 'Diploma in Theology', duration: '2 Years', modes: ['Offline', 'Online'], tuition: '₹29,500/year' },
  { code: 'bth', name: 'Bachelor of Theology', duration: '3 Years', modes: ['Offline', 'Online'], tuition: '₹29,500/year' },
  { code: 'mdiv_upg', name: 'M.Div. Upgrader', duration: '2 Years', modes: ['Offline', 'Online'], tuition: '₹37,000/year' },
  { code: 'mdiv', name: 'Master of Divinity', duration: '3 Years', modes: ['Offline', 'Online'], tuition: '₹37,000/year' },
];

export default function ApplyPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7', fontFamily: "'DM Sans',sans-serif" }}>
      {/* Header */}
      <div style={{ background: '#0F2B4A', color: '#fff', padding: '24px 40px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, background: '#C9920A', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✝</div>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700 }}>Harvest Mission College</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Greater Noida, U.P. · Accredited by Asia Theological Association</div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 32, color: '#0F2B4A', margin: '0 0 8px' }}>Apply for Admission</h1>
        <p style={{ color: '#7B8494', fontSize: 15, margin: '0 0 40px' }}>Choose your programme below to begin your application. Applications are reviewed on a rolling basis.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 20, marginBottom: 40 }}>
          {PROGRAMMES.map(p => (
            <div key={p.code} style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '24px', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#0F2B4A'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#DDE1E7'}>
              <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, color: '#0F2B4A', margin: '0 0 6px' }}>{p.name}</h3>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, background: '#EEF4FA', color: '#0F2B4A', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{p.duration}</span>
                {p.modes.map(m => <span key={m} style={{ fontSize: 12, background: '#FFFBF0', color: '#92400E', padding: '2px 8px', borderRadius: 10 }}>{m}</span>)}
              </div>
              <div style={{ fontSize: 14, color: '#5A6272', marginBottom: 16 }}>Tuition: <strong style={{ color: '#0F2B4A' }}>{p.tuition}</strong></div>
              <button onClick={() => navigate(`/admissions/new?programme=${p.code}`)}
                style={{ width: '100%', padding: '10px', background: '#0F2B4A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans' }}>
                Apply Now →
              </button>
            </div>
          ))}
        </div>

        <div style={{ padding: '20px 24px', background: '#EEF4FA', borderRadius: 10, fontSize: 13, color: '#0F2B4A' }}>
          <strong>Need help?</strong> Contact admissions@hmc.edu or call +91-XXXXX-XXXXX. Admissions is open from Monday–Saturday, 9 AM–5 PM IST.
        </div>
      </div>
    </div>
  );
}
