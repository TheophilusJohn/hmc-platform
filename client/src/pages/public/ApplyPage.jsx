// ApplyPage — public informational stub.
//
// TODO(stub): This is a STUB. The previous version's "Apply Now" button
// navigated into /admissions/new, which is an admin-only route, so prospective
// applicants got bounced to /login with no explanation. A real public
// application form (multi-step with document upload, captcha, public
// POST /applicants endpoint) is deferred to a separate project. Until then,
// this page tells visitors how to reach admissions by email.

const PROGRAMMES = [
  { code: 'CTH',     name: 'Certificate in Theology (Hindi)', duration: '1 Year',  modes: ['Offline'],            tuition: '₹8,000/year' },
  { code: 'DTH',     name: 'Diploma in Theology',             duration: '2 Years', modes: ['Offline', 'Online'],  tuition: '₹29,500/year' },
  { code: 'BTH',     name: 'Bachelor of Theology',            duration: '3 Years', modes: ['Offline', 'Online'],  tuition: '₹30,000/year' },
  { code: 'MDIV-UP', name: 'M.Div. Upgrader',                 duration: '2 Years', modes: ['Offline', 'Online'],  tuition: '₹37,000/year' },
  { code: 'MDIV',    name: 'Master of Divinity',              duration: '3 Years', modes: ['Offline', 'Online'],  tuition: '₹37,000/year' },
];

const ADMISSIONS_EMAIL = 'admissions@hmc.college';

function mailto(programmeName) {
  const subject = `Application — ${programmeName}`;
  const body = `Dear Admissions,\n\nI would like to apply for the ${programmeName} programme. Please send me the application form and a list of required documents.\n\nName:\nPhone:\nCity / Country:\nIntended start year:\n\nThank you.\n`;
  return `mailto:${ADMISSIONS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function ApplyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7', fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ background: '#0F2B4A', color: '#fff', padding: '24px 40px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, background: '#C9920A', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✝</div>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700 }}>Harvest Mission College</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Greater Noida, U.P. · Accredited by Asia Theological Association</div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 32, color: '#0F2B4A', margin: '0 0 8px' }}>Apply for Admission</h1>
        <p style={{ color: '#5A6272', fontSize: 15, lineHeight: 1.6, margin: '0 0 24px' }}>
          We accept applications by email. Pick the programme you would like to apply for and email our admissions office —
          they will reply with the application form, a list of required documents, and next steps.
        </p>

        <div style={{ background: '#FFFBF0', border: '1px solid #FCD9A0', color: '#92400E', borderRadius: 10, padding: '14px 18px', fontSize: 14, marginBottom: 32 }}>
          <strong>Email applications to:</strong>{' '}
          <a href={`mailto:${ADMISSIONS_EMAIL}`} style={{ color: '#92400E' }}>{ADMISSIONS_EMAIL}</a>
          <br />
          Please include your full name, phone number, the programme name and code (e.g. <em>BTH</em>) in the subject line, and your intended start year.
        </div>

        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: '#0F2B4A', margin: '0 0 16px' }}>Programmes we offer</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16, marginBottom: 32 }}>
          {PROGRAMMES.map(p => (
            <div key={p.code} style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, color: '#0F2B4A', margin: 0 }}>{p.name}</h3>
                <span style={{ fontSize: 12, background: '#0F2B4A', color: '#fff', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{p.code}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, background: '#EEF4FA', color: '#0F2B4A', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{p.duration}</span>
                {p.modes.map(m => <span key={m} style={{ fontSize: 12, background: '#FFFBF0', color: '#92400E', padding: '2px 8px', borderRadius: 10 }}>{m}</span>)}
              </div>
              <div style={{ fontSize: 14, color: '#5A6272', marginBottom: 14 }}>Tuition: <strong style={{ color: '#0F2B4A' }}>{p.tuition}</strong></div>
              <a href={mailto(p.name)}
                style={{ display: 'inline-block', padding: '8px 16px', background: '#0F2B4A', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                Email Admissions →
              </a>
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 18px', background: '#EEF4FA', borderRadius: 10, fontSize: 13, color: '#0F2B4A' }}>
          <strong>International applicants:</strong> tuition is billed in USD. Mention your country in your email so admissions can send you the correct fee schedule.
        </div>
      </div>
    </div>
  );
}
