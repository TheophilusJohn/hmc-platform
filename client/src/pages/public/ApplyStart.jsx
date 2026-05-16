// client/src/pages/public/ApplyStart.jsx
// Placeholder page reached from ApplyPage's "Start Application" button.
// The real multi-step application form lands in a subsequent phase; this page
// exists today so the CTA on /apply doesn't dead-end.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';

const NAVY = '#0F2B4A';
const GOLD = '#C9920A';
const GRAY_600 = '#5A6272';

export default function ApplyStart() {
  const [params] = useSearchParams();
  const code = params.get('programme') || '';
  const rawType = params.get('type');
  const type = rawType === 'international' ? 'international' : 'domestic';
  const typeLabel = type === 'international' ? 'international' : 'domestic';

  // Look up the programme name so the page reads naturally even though the
  // query param only carries the code. Silent fallback to the code itself.
  const [programmeName, setProgrammeName] = useState(code);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    api.get(`/public/programmes?type=${type}`)
      .then(res => {
        if (cancelled) return;
        const match = (res.data?.programmes || []).find(p => p.code === code);
        if (match) setProgrammeName(match.name);
      })
      .catch(() => { /* leave code as-is */ });
    return () => { cancelled = true; };
  }, [code, type]);

  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ background: NAVY, color: '#fff', padding: '24px 40px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, background: GOLD, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✝</div>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Harvest Mission College</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Greater Noida, U.P. · Accredited by Asia Theological Association</div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '64px 24px' }}>
        <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '36px 32px' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: NAVY, margin: '0 0 12px' }}>
            Application Form Coming Soon
          </h1>
          <p style={{ color: GRAY_600, fontSize: 15, lineHeight: 1.6, margin: '0 0 16px' }}>
            You're starting an application for <strong style={{ color: NAVY }}>{programmeName || 'a programme'}</strong>{' '}
            as a <strong style={{ color: NAVY }}>{typeLabel}</strong> student.
          </p>
          <p style={{ color: GRAY_600, fontSize: 15, lineHeight: 1.6, margin: '0 0 24px' }}>
            Our online application form is launching in the next few days. Check back here,
            or email <a href="mailto:admissions@hmc.college" style={{ color: NAVY }}>admissions@hmc.college</a> in the meantime.
          </p>
          <Link to="/apply" style={{ color: GOLD, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            ← Back to programmes
          </Link>
        </div>
      </div>
    </div>
  );
}
