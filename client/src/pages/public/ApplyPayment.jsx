// client/src/pages/public/ApplyPayment.jsx
//
// Payment-pending success page. Mounted at /apply/payment/:applicationNo and
// fetches GET /api/public/applications/:applicationNo/payment-status?email=…
// on mount (email arrives in the query string from Step 7's navigate()).
//
// This is the visual placeholder for the real Razorpay checkout — the "Pay
// Application Fee" button is intentionally stubbed in Phase 2c sub-stage 2;
// Phase 3 wires the actual checkout + webhook flow. Until then the page
// reassures the applicant their submission landed and tells them the
// payment instructions arrive by email.

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import api from '../../utils/api';
import { Btn } from '../../components/common';

const NAVY = '#0F2B4A';
const GOLD = '#C9920A';
const NAVY_BG = '#EEF4FA';
const GRAY_500 = '#7B8494';
const GRAY_600 = '#5A6272';

function formatMoney(amount, currency) {
  if (amount == null || amount === '') return '—';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : '';
  const locale  = currency === 'INR' ? 'en-IN' : 'en-US';
  return `${symbol} ${n.toLocaleString(locale)}`;
}

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
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>{children}</div>
    </div>
  );
}

export default function ApplyPayment() {
  const { applicationNo } = useParams();
  const [params] = useSearchParams();
  const email = params.get('email') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [payNotice, setPayNotice] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!applicationNo || !email) {
        setError('Missing application number or email in the URL. Please return to /apply and contact admissions if you need help.');
        setLoading(false);
        return;
      }
      try {
        const { data: payload } = await api.get(
          `/public/applications/${encodeURIComponent(applicationNo)}/payment-status?email=${encodeURIComponent(email)}`,
        );
        if (cancelled) return;
        setData(payload);
      } catch (err) {
        if (cancelled) return;
        const status = err?.response?.status;
        // Anti-enumeration 404 OR any other error — both surface as the same
        // generic "Application not found" so we don't leak existence to a
        // wrong-email lookup.
        if (status === 404) {
          setError('Application not found. Please double-check the URL or contact admissions@hmc.college.');
        } else {
          setError(err?.response?.data?.error || 'Could not load payment status. Please try again in a moment.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applicationNo, email]);

  if (loading) {
    return (
      <Shell>
        <div style={{ padding: 40, textAlign: 'center', color: GRAY_500 }}>Loading…</div>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell>
        <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '32px' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: NAVY, margin: '0 0 10px' }}>
            We couldn't load this application
          </h1>
          <p style={{ color: GRAY_600, fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
            {error || 'Application not found.'}
          </p>
          <Link to="/apply" style={{ color: GOLD, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
            ← Back to programmes
          </Link>
        </div>
      </Shell>
    );
  }

  const paidOrWaived = data.paymentStatus === 'PAID' || data.paymentStatus === 'WAIVED';

  return (
    <Shell>
      <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '32px', marginBottom: 18 }}>
        <div style={{ fontSize: 44, marginBottom: 8, color: '#166534' }}>✓</div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: NAVY, margin: '0 0 8px' }}>
          Application Submitted Successfully
        </h1>
        <p style={{ color: GRAY_600, fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
          {paidOrWaived
            ? 'Your application has been received. Payment is already confirmed — we\'ll begin admissions review shortly.'
            : 'Your application has been received and is pending payment.'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: NAVY_BG, borderRadius: 10, marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: GRAY_500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Application Number</div>
          <code style={{ fontFamily: 'monospace', fontSize: 16, color: NAVY, fontWeight: 600, letterSpacing: 0.5 }}>
            {data.applicationNo}
          </code>
        </div>
        {data.applicantName && (
          <div style={{ marginTop: 12, fontSize: 13, color: GRAY_600 }}>
            <strong style={{ color: NAVY }}>{data.applicantName}</strong>
            {data.programmeName ? <> · {data.programmeName}</> : null}
          </div>
        )}
      </div>

      {/* Payment block — primary call to action. Stubbed until Phase 3. */}
      <div style={{
        background: NAVY, color: '#fff', borderRadius: 12,
        padding: '24px 26px', marginBottom: 18, borderLeft: `4px solid ${GOLD}`,
      }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Application Fee
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, color: GOLD, marginBottom: 16 }}>
          {formatMoney(data.paymentAmount, data.paymentCurrency)}
        </div>

        {paidOrWaived ? (
          <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
            <strong>{data.paymentStatus === 'WAIVED' ? 'Waived' : 'Paid'}.</strong>{' '}
            No further payment is required for your application fee. Admissions will be in touch shortly.
          </div>
        ) : (
          <>
            <Btn type="button" onClick={() => setPayNotice(true)}>
              Pay Application Fee
            </Btn>
            {payNotice ? (
              <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
                Payment processing is being set up. Please watch your email for instructions.
                If you have questions, contact{' '}
                <a href="mailto:admissions@hmc.college" style={{ color: GOLD, fontWeight: 600 }}>admissions@hmc.college</a>{' '}
                and reference your application number{' '}
                <code style={{ fontFamily: 'monospace' }}>{data.applicationNo}</code>.
              </div>
            ) : (
              <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75, lineHeight: 1.6 }}>
                Payment integration is being finalized. Please retain your application number — we will contact
                you at your registered email with payment instructions shortly. Your application will not proceed
                to admissions review until payment is received.
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '22px 24px', marginBottom: 18 }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: NAVY, margin: '0 0 14px' }}>
          What happens next
        </h2>
        <ol style={{ margin: 0, paddingLeft: 20, color: GRAY_600, fontSize: 13, lineHeight: 1.8 }}>
          <li>We'll email you payment instructions at your registered email.</li>
          <li>Once payment is confirmed, your application moves to admissions review.</li>
          <li>Admissions team reviews within 5 business days of payment.</li>
          <li>Final admission decision communicated within 2–3 weeks.</li>
        </ol>
      </div>

      <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '20px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: GRAY_600, lineHeight: 1.5 }}>
            Bookmark this URL or save your application number for future reference.
          </div>
          <Link
            to={`/apply/status?applicationNo=${encodeURIComponent(data.applicationNo)}`}
            style={{ color: GOLD, fontWeight: 600, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Check Application Status →
          </Link>
        </div>
      </div>
    </Shell>
  );
}
