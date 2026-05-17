// client/src/pages/public/ApplyStatus.jsx
//
// Public status-lookup flow. Applicant supplies their HMC-APP-YYYY-NNNN
// application number + email; on success the result card shows applicant
// + programme + pipeline stage + payment state.
//
// Two render modes:
//   - INITIAL: form
//   - RESULT:  status card (with "Search again" to return to INITIAL)
//
// URL ?applicationNo=… pre-fills the form (the /apply/payment page links
// here with that query param). Anti-enumeration: backend's /status
// returns a generic 404 for both "no row" and "wrong email"; we surface
// a single user-facing error covering both.

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import api from '../../utils/api';
import { Btn } from '../../components/common';

const NAVY = '#0F2B4A';
const GOLD = '#C9920A';
const NAVY_BG = '#EEF4FA';
const GRAY_500 = '#7B8494';
const GRAY_600 = '#5A6272';
const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APPNO_RE   = /^HMC-APP-\d{4}-\d{4}$/;

const STAGE_LABELS = {
  RECEIVED:             'Received',
  DOCS_REVIEW:          'Under Review',
  INTERVIEW_SCHEDULED:  'Interview Scheduled',
  INTERVIEW_DONE:       'Interview Done',
  WAITLISTED:           'Waitlisted',
  ACCEPTED:             'Accepted',
  ENROLLED:             'Enrolled',
  REJECTED:             'Not Accepted',
};

// Stage colour tiers — gray (early), amber (intermediate), green (positive
// terminal), red (negative terminal). Mirrors the admin pipeline badges
// but with applicant-facing copy ("Not Accepted" instead of "Rejected").
const STAGE_COLORS = {
  RECEIVED:             { bg: '#F3F4F6', border: '#D1D5DB', text: '#374151' },
  DOCS_REVIEW:          { bg: '#F3F4F6', border: '#D1D5DB', text: '#374151' },
  INTERVIEW_SCHEDULED:  { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  INTERVIEW_DONE:       { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  WAITLISTED:           { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  ACCEPTED:             { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
  ENROLLED:             { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
  REJECTED:             { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
};

const PAYMENT_LABELS = { PENDING: 'Pending', PAID: 'Paid', WAIVED: 'Waived' };
const PAYMENT_COLORS = {
  PENDING: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  PAID:    { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
  WAIVED:  { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatDateLong(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function formatMoney(amount, currency) {
  if (amount == null || amount === '') return '—';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : '';
  const locale  = currency === 'INR' ? 'en-IN' : 'en-US';
  return `${symbol} ${n.toLocaleString(locale)}`;
}

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
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px' }}>{children}</div>
    </div>
  );
}

function StageBadge({ stage }) {
  const palette = STAGE_COLORS[stage] || STAGE_COLORS.RECEIVED;
  return (
    <span style={{
      display: 'inline-block', padding: '4px 12px',
      background: palette.bg, border: `1px solid ${palette.border}`, color: palette.text,
      borderRadius: 10, fontSize: 13, fontWeight: 600,
    }}>
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

function PaymentBadge({ status }) {
  const palette = PAYMENT_COLORS[status] || PAYMENT_COLORS.PENDING;
  return (
    <span style={{
      display: 'inline-block', padding: '4px 12px',
      background: palette.bg, border: `1px solid ${palette.border}`, color: palette.text,
      borderRadius: 10, fontSize: 13, fontWeight: 600,
    }}>
      {PAYMENT_LABELS[status] || status}
    </span>
  );
}

export default function ApplyStatus() {
  const [params] = useSearchParams();
  const prefilledAppNo = params.get('applicationNo') || '';

  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    defaultValues: { applicationNo: prefilledAppNo, email: '' },
  });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [result, setResult] = useState(null);

  // Keep the form's applicationNo in sync if the user lands on this page via
  // a /apply/payment link that includes ?applicationNo. RHF's defaultValues
  // is only used on first mount; this useEffect handles the (rare) case of
  // the search param changing while the page is mounted.
  useEffect(() => {
    if (prefilledAppNo) {
      setValue('applicationNo', prefilledAppNo.toUpperCase());
    }
  }, [prefilledAppNo, setValue]);

  const onSubmit = async ({ applicationNo, email }) => {
    setServerError(null);
    const appNo = String(applicationNo || '').trim().toUpperCase();
    const em = String(email || '').trim();
    setSubmitting(true);
    try {
      const { data } = await api.get(
        `/public/applications/status?applicationNo=${encodeURIComponent(appNo)}&email=${encodeURIComponent(em)}`,
      );
      setResult(data);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404 || status === 403) {
        setServerError("We couldn't find an application matching that number and email. Please check your details and try again.");
      } else {
        setServerError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <Shell>
        <ResultCard data={result} onSearchAgain={() => { setResult(null); setServerError(null); }} />
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '32px' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: NAVY, margin: '0 0 8px' }}>
          Application Status
        </h1>
        <p style={{ color: GRAY_600, fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
          Enter your application number and email to check your status.
        </p>

        {serverError && (
          <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: NAVY, marginBottom: 6 }}>
              Application number <span style={{ color: '#991B1B' }}>*</span>
            </label>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="HMC-APP-YYYY-NNNN"
              style={inputStyle(!!errors.applicationNo)}
              {...register('applicationNo', {
                required: 'Application number is required',
                onChange: (e) => setValue('applicationNo', String(e.target.value || '').toUpperCase()),
                validate: v => APPNO_RE.test(String(v || '').trim().toUpperCase())
                  || 'Number must look like HMC-APP-YYYY-NNNN',
              })}
            />
            {errors.applicationNo && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#991B1B' }}>{errors.applicationNo.message}</div>
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
            {submitting ? 'Checking…' : 'Check Status'}
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

function ResultCard({ data, onSearchAgain }) {
  const stage = data.status || 'RECEIVED';
  const paymentStatus = data.paymentStatus || 'PENDING';
  const isEarlyStage = stage === 'RECEIVED' || stage === 'DOCS_REVIEW';

  return (
    <div>
      {/* Top — applicationNo */}
      <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '24px 26px', marginBottom: 14 }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: NAVY, margin: '0 0 10px' }}>
          Application Status
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: NAVY_BG, borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: GRAY_500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Application Number</div>
          <code style={{ fontFamily: 'monospace', fontSize: 16, color: NAVY, fontWeight: 600, letterSpacing: 0.5 }}>
            {data.applicationNo}
          </code>
        </div>
      </div>

      {/* Applicant + programme */}
      <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '18px 22px', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: GRAY_500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Applicant</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, lineHeight: 1.6 }}>
          <div>
            <div style={{ color: GRAY_500 }}>Name</div>
            <div style={{ color: NAVY, fontWeight: 500 }}>{data.applicantName || '—'}</div>
          </div>
          <div>
            <div style={{ color: GRAY_500 }}>Programme</div>
            <div style={{ color: NAVY, fontWeight: 500 }}>{data.programmeName || '—'}</div>
          </div>
          <div>
            <div style={{ color: GRAY_500 }}>Submitted</div>
            <div style={{ color: NAVY, fontWeight: 500 }}>{formatDateLong(data.submittedAt)}</div>
          </div>
        </div>
      </div>

      {/* Pipeline stage */}
      <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '18px 22px', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: GRAY_500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Current Status</div>
        <StageBadge stage={stage} />
      </div>

      {/* Payment */}
      <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '18px 22px', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: GRAY_500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Payment</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <PaymentBadge status={paymentStatus} />
          {paymentStatus === 'PENDING' && data.paymentAmount && (
            <div style={{ fontSize: 14, color: NAVY, fontWeight: 600 }}>
              {formatMoney(data.paymentAmount, data.paymentCurrency)}
            </div>
          )}
        </div>
        {paymentStatus === 'PENDING' && (
          <div style={{ marginTop: 10, fontSize: 13, color: GRAY_600, lineHeight: 1.6 }}>
            We'll send payment instructions to your registered email. Your application
            will not proceed to admissions review until payment is received.
          </div>
        )}
      </div>

      {/* What happens next (only for early stages) */}
      {isEarlyStage && (
        <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '18px 22px', marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: GRAY_500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>What happens next</div>
          <p style={{ fontSize: 13, color: GRAY_600, lineHeight: 1.7, margin: 0 }}>
            Once payment is confirmed, our admissions team reviews your application within
            5 business days. We'll communicate the final decision within 2–3 weeks of
            review. Watch your email for updates.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 12, flexWrap: 'wrap' }}>
        <Link to="/apply" style={{ color: GOLD, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
          ← Back to Apply
        </Link>
        <Btn variant="outline" onClick={onSearchAgain}>Search again</Btn>
      </div>
    </div>
  );
}
