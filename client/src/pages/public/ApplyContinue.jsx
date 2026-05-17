// client/src/pages/public/ApplyContinue.jsx
//
// Resume-by-code public flow. Applicant supplies their HMC-DRAFT-XXXXXX code
// + the email tied to the draft; on success we set the shared LS_CODE +
// LS_EMAIL keys (so ApplyStart's draft-hydration useEffect picks the draft
// up) and navigate to /apply/start?draft=<CODE>.
//
// Anti-enumeration: the backend's loadDraftForAccess helper returns a
// generic 404 for both "code not found" and "email mismatch". We do not
// differentiate between those cases in the FE error message.

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import api from '../../utils/api';
import { LS_CODE, LS_EMAIL } from '../../utils/applyDraftStorage';
import { Btn } from '../../components/common';

const NAVY = '#0F2B4A';
const GOLD = '#C9920A';
const GRAY_500 = '#7B8494';
const GRAY_600 = '#5A6272';
const EMAIL_RE      = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DRAFT_CODE_RE = /^HMC-DRAFT-[A-Z0-9]{6}$/;

const inputStyle = (hasError) => ({
  width: '100%',
  padding: '10px 12px',
  border: `1px solid ${hasError ? '#FECACA' : '#DDE1E7'}`,
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
});

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#FDFBF7', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ background: NAVY, color: '#fff', padding: '24px 40px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, background: GOLD, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✝</div>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Harvest Mission College</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Greater Noida, U.P. · Accredited by Asia Theological Association</div>
        </div>
      </div>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>{children}</div>
    </div>
  );
}

export default function ApplyContinue() {
  const navigate = useNavigate();
  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    defaultValues: { code: '', email: '' },
  });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  const onSubmit = async ({ code, email }) => {
    setServerError(null);
    const trimmedCode = String(code || '').trim().toUpperCase();
    const trimmedEmail = String(email || '').trim();
    setSubmitting(true);
    try {
      // Server treats "no row" and "wrong email" identically → generic 404.
      await api.get(
        `/public/applications/draft/${encodeURIComponent(trimmedCode)}?email=${encodeURIComponent(trimmedEmail)}`,
      );
      try {
        localStorage.setItem(LS_CODE, trimmedCode);
        localStorage.setItem(LS_EMAIL, trimmedEmail);
      } catch (_e) { /* tolerate storage-disabled browsers */ }
      navigate(`/apply/start?draft=${encodeURIComponent(trimmedCode)}`);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404 || status === 403) {
        setServerError("We couldn't find an application matching that code and email. Please check and try again, or contact admissions@hmc.college if you need help.");
      } else {
        setServerError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '32px' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: NAVY, margin: '0 0 8px' }}>
          Continue Your Application
        </h1>
        <p style={{ color: GRAY_600, fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
          Enter your draft code and email to resume where you left off.
        </p>

        {serverError && (
          <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: NAVY, marginBottom: 6 }}>
              Draft code <span style={{ color: '#991B1B' }}>*</span>
            </label>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="HMC-DRAFT-XXXXXX"
              style={inputStyle(!!errors.code)}
              {...register('code', {
                required: 'Draft code is required',
                onChange: (e) => setValue('code', String(e.target.value || '').toUpperCase()),
                validate: v => DRAFT_CODE_RE.test(String(v || '').trim().toUpperCase())
                  || 'Code must look like HMC-DRAFT-XXXXXX (6 alphanumeric chars)',
              })}
            />
            {errors.code && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#991B1B' }}>{errors.code.message}</div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: NAVY, marginBottom: 6 }}>
              Email <span style={{ color: '#991B1B' }}>*</span>
            </label>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              style={inputStyle(!!errors.email)}
              {...register('email', {
                required: 'Email is required',
                validate: v => EMAIL_RE.test(String(v || '').trim()) || 'Enter a valid email address',
              })}
            />
            {errors.email && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#991B1B' }}>{errors.email.message}</div>
            )}
          </div>

          <Btn type="submit" full disabled={submitting}>
            {submitting ? 'Looking up…' : 'Continue Application'}
          </Btn>
        </form>

        <div style={{ marginTop: 20, fontSize: 13, color: GRAY_500 }}>
          <Link to="/apply" style={{ color: GOLD, fontWeight: 600, textDecoration: 'none' }}>
            ← Back to Apply
          </Link>
        </div>
      </div>
    </Shell>
  );
}
