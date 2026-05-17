// client/src/pages/public/ApplyStart.jsx
//
// Multi-step public application form. Phase 2b-1 builds the framework + Steps
// 0 (intro), 1 (programme), and 2 (personal). Steps 3-6 land in 2b-2.
//
// State machine:
//   step 0 = intro / get-started   (no draft yet; POST /start creates it)
//   step 1..6 = real form steps    (persisted to /draft/:code on every Next)
//
// Refresh-survival:
//   - draft code + email mirrored into localStorage so a hard refresh recovers
//   - URL carries ?draft={code} after the draft is created; ?programme={code}
//     from the landing page survives until step 1 commits it to the draft
//   - URL deliberately does NOT carry an applicant type — geo is the single
//     source of truth and the server re-checks at /start

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import api from '../../utils/api';
import { Btn } from '../../components/common';

const NAVY = '#0F2B4A';
const GOLD = '#C9920A';
const NAVY_BG = '#EEF4FA';
const GRAY_500 = '#7B8494';
const GRAY_600 = '#5A6272';

const LS_CODE = 'hmc_apply_draft_code';
const LS_EMAIL = 'hmc_apply_draft_email';

// Steps the user sees in the indicator (skipping the intro screen, which is
// rendered before the first real step). Labels chosen to match the field
// groupings in the spec.
const STEPS = [
  { id: 1, label: 'Programme' },
  { id: 2, label: 'Personal' },
  { id: 3, label: 'Background' },
  { id: 4, label: 'Spiritual' },
  { id: 5, label: 'Finance' },
  { id: 6, label: 'Documents' },
  { id: 7, label: 'Review' },
];

// Document checklist shown on Step 6. Keys are the camelCase docTypes that
// the backend's DOC_TYPES + DOC_RULES allowlist accepts (server/routes/public.js).
// `requiresProgrammes` hides a row unless the applicant chose one of the listed
// programme codes — used for bachelor's mark-sheet / transcript which only
// master's applicants (MDIV, MDIV-UP) need to supply.
const DOCUMENT_SPECS = (() => {
  const RULES = {
    pdfOrImage10MB: {
      accept: '.pdf,.jpg,.jpeg,.png',
      mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      maxBytes: 10 * 1024 * 1024,
      helper: 'PDF/JPEG/PNG · max 10MB',
    },
    pdfOnly10MB: {
      accept: '.pdf',
      mimeTypes: ['application/pdf'],
      maxBytes: 10 * 1024 * 1024,
      helper: 'PDF only · max 10MB',
    },
    photo5MB: {
      accept: '.jpg,.jpeg,.png',
      mimeTypes: ['image/jpeg', 'image/png'],
      maxBytes: 5 * 1024 * 1024,
      helper: 'JPEG/PNG · max 5MB',
    },
  };
  const SHARED = [
    { docType: 'photo',               label: 'Passport-size photo',     required: true, ...RULES.photo5MB },
    { docType: 'birthCertificate',    label: 'Birth certificate',       required: true, ...RULES.pdfOrImage10MB },
    { docType: 'baptismCertificate',  label: 'Baptism certificate',     required: true, ...RULES.pdfOrImage10MB },
    { docType: 'pastorReference',     label: 'Pastor reference letter', required: true, ...RULES.pdfOnly10MB, helperExtra: 'Signed letter from your pastor' },
    { docType: 'characterReference1', label: 'Character reference #1',  required: true, ...RULES.pdfOnly10MB, helperExtra: 'Signed letter from a Christian leader (not family)' },
    { docType: 'characterReference2', label: 'Character reference #2',  required: true, ...RULES.pdfOnly10MB, helperExtra: 'Signed letter from a second Christian leader' },
  ];
  return {
    DOMESTIC: [
      ...SHARED,
      { docType: 'tenthMarkSheet',     label: '10th mark sheet',                     required: true, ...RULES.pdfOrImage10MB },
      { docType: 'twelfthMarkSheet',   label: '12th mark sheet',                     required: true, ...RULES.pdfOrImage10MB },
      { docType: 'bachelorsMarkSheet', label: "Bachelor's mark sheet",               required: true, ...RULES.pdfOrImage10MB, requiresProgrammes: ['MDIV', 'MDIV-UP'] },
      { docType: 'idProof',            label: 'Aadhaar card or passport (ID proof)', required: true, ...RULES.pdfOrImage10MB },
    ],
    INTERNATIONAL: [
      ...SHARED,
      { docType: 'highestQualificationTranscripts', label: 'Highest-qualification transcripts',                required: true,  ...RULES.pdfOrImage10MB },
      { docType: 'bachelorsTranscript',             label: "Bachelor's transcript",                            required: true,  ...RULES.pdfOrImage10MB, requiresProgrammes: ['MDIV', 'MDIV-UP'] },
      { docType: 'passportCopy',                    label: 'Passport copy',                                    required: true,  ...RULES.pdfOrImage10MB },
      { docType: 'englishProficiency',              label: 'English proficiency proof (TOEFL/IELTS/Duolingo)', required: false, ...RULES.pdfOrImage10MB, helperExtra: 'Optional — recommended for non-native English speakers' },
    ],
  };
})();

// ──────────────────────────────────────────────────────────────────────────────
// Layout shell (logo header + container) shared across every screen of the form
// ──────────────────────────────────────────────────────────────────────────────
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
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Step indicator (pill row across the top of the form steps)
// ──────────────────────────────────────────────────────────────────────────────
function StepIndicator({ current }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, color: GRAY_500, marginBottom: 8 }}>
        Step {current} of {STEPS.length} — {STEPS.find(s => s.id === current)?.label}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STEPS.map(s => {
          const done = s.id < current;
          const active = s.id === current;
          return (
            <div key={s.id} style={{
              flex: 1,
              minWidth: 70,
              padding: '8px 10px',
              borderRadius: 8,
              border: `1px solid ${active ? NAVY : done ? '#A8C5E0' : '#DDE1E7'}`,
              background: active ? NAVY : done ? NAVY_BG : '#fff',
              color: active ? '#fff' : done ? NAVY : GRAY_500,
              fontSize: 11, fontWeight: 600, textAlign: 'center',
            }}>
              {s.id}. {s.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tiny "Saving…" pill in the bottom-right; unobtrusive, non-blocking.
function SaveIndicator({ saving, error }) {
  if (!saving && !error) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 50,
      padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
      background: error ? '#FEF2F2' : '#fff',
      color: error ? '#991B1B' : GRAY_600,
      border: `1px solid ${error ? '#FECACA' : '#DDE1E7'}`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      {error ? `Save failed — ${error}` : 'Saving…'}
    </div>
  );
}

// Small wrapper that mirrors design-system <Input>/<Select> but binds via RHF.
function Field({ label, error, children, required }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', fontFamily: 'DM Sans,sans-serif' }}>
        {label}{required && <span style={{ color: '#991B1B' }}> *</span>}
      </label>
      {children}
      {error && <span style={{ fontSize: 12, color: '#991B1B' }}>{error}</span>}
    </div>
  );
}

const inputStyle = (hasError) => ({
  width: '100%', padding: '8px 12px', fontSize: 14, fontFamily: 'DM Sans,sans-serif',
  border: `1px solid ${hasError ? '#FECACA' : '#DDE1E7'}`, borderRadius: 8,
  background: '#fff', color: '#1A1D23', outline: 'none', boxSizing: 'border-box',
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Conservative phone validation. Domestic = 10 digits exactly (after stripping
// +91 and separators). International = E.164-ish, 8–15 digits with optional +.
function isValidPhone(v, applicantType) {
  if (!v) return false;
  const cleaned = String(v).replace(/[\s\-()]/g, '');
  if (applicantType === 'DOMESTIC') {
    const local = cleaned.replace(/^\+?91/, '');
    return /^\d{10}$/.test(local);
  }
  return /^\+?\d{8,15}$/.test(cleaned);
}
// Age ≥ 16 from a YYYY-MM-DD-ish DOB
function isAgeAtLeast(dob, minYears) {
  if (!dob) return false;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return false;
  if (d.getTime() > Date.now()) return false;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age >= minYears;
}

// ──────────────────────────────────────────────────────────────────────────────
// CHOICE SCREEN — shown when POST /applications/start returns 409
// EXISTING_APPLICATIONS. Lists the applicant's active drafts and submitted
// applications and lets them pick "Continue", "Check status", or
// "Start NEW" (which re-POSTs with force: true).
// ──────────────────────────────────────────────────────────────────────────────
function ExistingApplicationsChoice({ choice, newProgrammeName, submitting, onResume, onForceNew, onCancel }) {
  const drafts = Array.isArray(choice.activeDrafts) ? choice.activeDrafts : [];
  const submitted = Array.isArray(choice.submittedApplications) ? choice.submittedApplications : [];
  const fmtDate = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  return (
    <div>
      <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: NAVY, margin: '0 0 8px' }}>
        You already have applications under this email
      </h1>
      <p style={{ color: GRAY_600, fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
        {choice.message || 'This email has existing applications. Please choose how to proceed.'}
      </p>

      {drafts.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            In-progress drafts
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {drafts.map(d => (
              <div key={d.code} style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>
                    {d.programmeName || 'Programme not yet selected'}
                  </div>
                  <div style={{ fontSize: 12, color: GRAY_600, marginTop: 2 }}>
                    Code <code style={{ background: NAVY_BG, padding: '1px 6px', borderRadius: 4 }}>{d.code}</code> ·{' '}
                    Step {d.currentStep || 1} · Last saved {fmtDate(d.updatedAt)}
                  </div>
                </div>
                <Btn size="sm" disabled={submitting} onClick={() => onResume(d.code)}>Continue →</Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {submitted.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Already submitted
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {submitted.map(a => (
              <div key={a.applicationNo} style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>
                    {a.programmeName || a.programmeCode || 'Programme unknown'}
                  </div>
                  <div style={{ fontSize: 12, color: GRAY_600, marginTop: 2 }}>
                    Application <code style={{ background: NAVY_BG, padding: '1px 6px', borderRadius: 4 }}>{a.applicationNo}</code> ·{' '}
                    Stage <strong>{String(a.pipelineStage || '').toLowerCase().replace(/_/g, ' ')}</strong> ·{' '}
                    Submitted {fmtDate(a.submittedAt)}
                  </div>
                </div>
                {/* /apply/status is a placeholder for now; the real lookup screen
                    lands in stage 2b-3. The link still works because the route
                    is registered in App.jsx. */}
                <Link to={`/apply/status?applicationNo=${encodeURIComponent(a.applicationNo)}`}
                  style={{ fontSize: 13, color: GOLD, fontWeight: 600, textDecoration: 'none', padding: '6px 12px', border: `1.5px solid ${GOLD}`, borderRadius: 8 }}>
                  Check status
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '16px 18px', background: NAVY_BG, borderRadius: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: NAVY, marginBottom: 10 }}>
          Apply for a different programme — this creates a separate application alongside the ones above.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Btn disabled={submitting} onClick={onForceNew}>
            {submitting
              ? 'Starting…'
              : newProgrammeName
                ? `Start a NEW application for ${newProgrammeName} →`
                : 'Start a NEW application →'}
          </Btn>
          <Btn variant="outline" disabled={submitting} onClick={onCancel}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 0 — intro / get started
// Collects email + mobile, then POSTs /applications/start. Server runs geo
// enforcement; a "type does not match location" error surfaces inline.
//
// If the server returns 409 EXISTING_APPLICATIONS, the form is replaced by an
// in-place choice screen (Bug 2 fix). RHF hook state survives the swap because
// useForm lives on this component — only the JSX changes. Clicking Cancel
// brings the user back to the form with email/mobile preserved.
// ──────────────────────────────────────────────────────────────────────────────
function StepIntro({ applicantType, programmes, programmeCode, onStarted, onResumeDraft }) {
  const { register, handleSubmit, getValues, formState: { errors } } = useForm({
    defaultValues: { email: '', mobile: '' },
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  // 409 payload (or null). When set, the choice screen renders in place of the form.
  const [choice, setChoice] = useState(null);

  // Programme name resolution for the "Start a NEW application for {name}"
  // button. programmes is loaded by the parent's geo useEffect; if the user
  // submits before that resolves we fall back to the code.
  const newProgrammeName = useMemo(() => {
    if (!programmeCode) return null;
    const p = programmes.find(x => x.code === programmeCode);
    return p?.name || programmeCode;
  }, [programmes, programmeCode]);

  // Shared "do the start + seed PUT + bubble up" flow used by both the
  // initial Start click and the "Start a NEW application" button on the
  // choice screen. The only difference is `force: true` for the latter.
  const performStart = async (values, { force = false } = {}) => {
    const studentType = applicantType === 'DOMESTIC' ? 'domestic' : 'international';
    const body = {
      email: values.email.trim().toLowerCase(),
      phone: values.mobile.trim(),
      studentType,
      ...(programmeCode ? { programmeCode } : {}),
      ...(force ? { force: true } : {}),
    };
    const { data } = await api.post('/public/applications/start', body);

    // Seed the server's formData with email + mobile BEFORE the parent's
    // hydration useEffect fires. Otherwise that effect's GET /draft sees an
    // empty server-side formData and wipes the local seed the parent just
    // set in handleStarted — Step 2 would then load with an empty mobile.
    // Best-effort: if this PUT fails the start still succeeded and the
    // applicant just re-enters mobile on Step 2. We avoid surfacing the
    // error so the user isn't tempted to re-click Start and create a
    // duplicate draft.
    try {
      await api.put(`/public/applications/draft/${encodeURIComponent(data.code)}`, {
        email: body.email,
        formData: { email: body.email, mobile: body.phone },
        currentStep: 1,
      });
    } catch (_e) { /* best-effort — see comment above */ }

    onStarted({ code: data.code, email: body.email, mobile: body.phone });
  };

  const onSubmit = async (values) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await performStart(values);
    } catch (err) {
      // 409 EXISTING_APPLICATIONS → swap the form for the choice screen.
      // Anything else → inline error pill.
      const status = err?.response?.status;
      const body = err?.response?.data;
      if (status === 409 && body?.error === 'EXISTING_APPLICATIONS') {
        setChoice(body);
      } else {
        setSubmitError(body?.error || body?.message || 'Could not start your application. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Choice screen handlers — all read live form values via getValues() so the
  // applicant doesn't have to re-type email/mobile after picking an option.
  const handleResumeDraftClick = (code) => {
    const values = getValues();
    onResumeDraft({ code, email: values.email.trim().toLowerCase() });
  };
  const handleForceNew = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await performStart(getValues(), { force: true });
    } catch (err) {
      // Even with force, geo enforcement and validation can still fail.
      const body = err?.response?.data;
      setSubmitError(body?.error || body?.message || 'Could not start your application. Please try again.');
      setChoice(null); // back to the form so the user sees the inline error
    } finally {
      setSubmitting(false);
    }
  };
  const handleCancelChoice = () => {
    setChoice(null);
    setSubmitError(null);
  };

  const typeLabel = applicantType === 'DOMESTIC' ? 'domestic' : 'international';

  // ── In-place choice screen (Bug 2) ────────────────────────────────────────
  if (choice) {
    return (
      <ExistingApplicationsChoice
        choice={choice}
        newProgrammeName={newProgrammeName}
        submitting={submitting}
        onResume={handleResumeDraftClick}
        onForceNew={handleForceNew}
        onCancel={handleCancelChoice}
      />
    );
  }

  return (
    <div>
      <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: NAVY, margin: '0 0 8px' }}>
        Welcome to the HMC application
      </h1>
      <p style={{ color: GRAY_600, fontSize: 14, lineHeight: 1.6, margin: '0 0 8px' }}>
        The form has six steps and takes about 25–30 minutes. You can save and return any
        time within 30 days using the code we'll generate after this screen.
      </p>
      <p style={{ color: GRAY_500, fontSize: 12, lineHeight: 1.6, margin: '0 0 24px' }}>
        Application for <strong>{typeLabel}</strong> students.{' '}
        If this is incorrect, please contact{' '}
        <a href="mailto:admissions@hmc.college" style={{ color: GOLD }}>admissions@hmc.college</a>.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gap: 14, maxWidth: 480 }}>
        <Field label="Email" required error={errors.email?.message}>
          <input
            type="email" autoComplete="email"
            placeholder="you@example.com"
            style={inputStyle(!!errors.email)}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: EMAIL_RE, message: 'Enter a valid email' },
              maxLength: { value: 254, message: 'Email is too long' },
            })}
          />
        </Field>
        <Field label="Mobile number" required error={errors.mobile?.message}>
          <input
            type="tel" autoComplete="tel"
            placeholder={applicantType === 'DOMESTIC' ? '+91 9XXXXXXXXX' : '+CC XXXXXXXXXX'}
            style={inputStyle(!!errors.mobile)}
            {...register('mobile', {
              required: 'Mobile number is required',
              validate: v => isValidPhone(v, applicantType) || (applicantType === 'DOMESTIC'
                ? 'Enter a 10-digit Indian mobile number'
                : 'Enter a valid international mobile number'),
            })}
          />
        </Field>

        {submitError && (
          <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>
            {submitError}
            {/does not match your detected location/i.test(submitError) && (
              <>
                <br />
                <a href="mailto:admissions@hmc.college" style={{ color: '#991B1B', fontWeight: 600 }}>Email admissions →</a>
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <Link to="/apply/continue" style={{ fontSize: 13, color: GOLD, textDecoration: 'none' }}>
            Already started? Continue your application →
          </Link>
          <Btn type="submit" disabled={submitting}>
            {submitting ? 'Starting…' : 'Start Application →'}
          </Btn>
        </div>
      </form>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 1 — programme selection
// ──────────────────────────────────────────────────────────────────────────────
function Step1Programme({ applicantType, programmes, initialValues, onNext, saving }) {
  const isDomestic = applicantType === 'DOMESTIC';
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      programmeCode: initialValues.programmeCode || '',
      studyMode: initialValues.studyMode || '',
    },
  });

  const selectedCode = watch('programmeCode');
  const selectedProg = useMemo(
    () => programmes.find(p => p.code === selectedCode) || null,
    [programmes, selectedCode]
  );

  // When the programme changes, force studyMode if the new programme only
  // offers one mode (so we don't carry an invalid mode forward from a
  // previously-selected programme).
  useEffect(() => {
    if (!selectedProg) return;
    if (!isDomestic) return; // international is implicit ONLINE; no field
    const modes = selectedProg.modes || [];
    if (modes.length === 1) {
      setValue('studyMode', modes[0].toUpperCase(), { shouldValidate: true });
    }
  }, [selectedProg, isDomestic, setValue]);

  const onSubmit = (values) => {
    const out = { programmeCode: values.programmeCode };
    if (isDomestic) out.studyMode = values.studyMode;
    onNext(out);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: NAVY, margin: '0 0 16px' }}>
        Choose your programme
      </h2>

      <div style={{ display: 'grid', gap: 12 }}>
        {programmes.map(p => {
          const checked = selectedCode === p.code;
          return (
            <label key={p.id} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '14px 16px',
              border: `1.5px solid ${checked ? NAVY : '#DDE1E7'}`,
              background: checked ? NAVY_BG : '#fff',
              borderRadius: 10, cursor: 'pointer',
            }}>
              <input
                type="radio" value={p.code}
                style={{ marginTop: 4 }}
                {...register('programmeCode', { required: 'Choose a programme to continue' })}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: NAVY }}>
                  {p.name} <span style={{ fontSize: 12, background: NAVY, color: '#fff', padding: '1px 8px', borderRadius: 8, marginLeft: 6, fontWeight: 600 }}>{p.code}</span>
                </div>
                <div style={{ fontSize: 13, color: GRAY_600, marginTop: 4 }}>
                  {p.durationYears} {p.durationYears === 1 ? 'year' : 'years'} ·{' '}
                  {(p.modes || []).map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(' / ')}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      {errors.programmeCode && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#991B1B' }}>{errors.programmeCode.message}</div>
      )}

      {isDomestic && selectedProg && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, marginBottom: 8 }}>Study mode</div>
          {(() => {
            const modes = selectedProg.modes || [];
            const onlyOne = modes.length === 1;
            return (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {['offline', 'online'].map(m => {
                  const available = modes.includes(m);
                  const val = m.toUpperCase();
                  return (
                    <label key={m} style={{
                      display: 'flex', gap: 8, alignItems: 'center',
                      padding: '8px 14px', borderRadius: 10,
                      border: '1.5px solid #DDE1E7',
                      background: available ? '#fff' : '#F8F9FA',
                      opacity: available ? 1 : 0.5,
                      cursor: available ? 'pointer' : 'not-allowed',
                      fontSize: 14, color: NAVY, fontWeight: 500,
                    }}>
                      <input
                        type="radio" value={val}
                        disabled={!available || onlyOne}
                        {...register('studyMode', {
                          validate: v => (!isDomestic || (v === 'OFFLINE' || v === 'ONLINE')) || 'Choose a study mode',
                        })}
                      />
                      {m === 'offline' ? 'On-campus (Offline)' : 'Online'}
                    </label>
                  );
                })}
              </div>
            );
          })()}
          {errors.studyMode && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#991B1B' }}>{errors.studyMode.message}</div>
          )}
        </div>
      )}

      {!isDomestic && (
        <div style={{ marginTop: 16, padding: '10px 14px', background: NAVY_BG, color: NAVY, borderRadius: 8, fontSize: 13 }}>
          International programmes are delivered <strong>online</strong>. You'll attend remotely from your country of residence.
        </div>
      )}

      <FormFooter onNext={true} saving={saving} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 2 — personal information
// ──────────────────────────────────────────────────────────────────────────────
function Step2Personal({ applicantType, lockedEmail, initialValues, onNext, onBack, saving }) {
  const isDomestic = applicantType === 'DOMESTIC';
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      firstName: initialValues.firstName || '',
      lastName: initialValues.lastName || '',
      email: lockedEmail || initialValues.email || '',
      gender: initialValues.gender || '',
      dateOfBirth: initialValues.dateOfBirth || '',
      placeOfBirth: initialValues.placeOfBirth || '',
      nationality: initialValues.nationality || (isDomestic ? 'Indian' : ''),
      maritalStatus: initialValues.maritalStatus || '',
      spouseName: initialValues.spouseName || '',
      childrenInfo: initialValues.childrenInfo || '',
      motherTongue: initialValues.motherTongue || '',
      mobile: initialValues.mobile || '',
      whatsapp: initialValues.whatsapp || '',
      emergencyContact: initialValues.emergencyContact || '',
      // Domestic address
      presentAddressLine: initialValues.presentAddressLine || '',
      presentAddressState: initialValues.presentAddressState || '',
      presentAddressCountry: initialValues.presentAddressCountry || (isDomestic ? 'India' : ''),
      presentAddressPin: initialValues.presentAddressPin || '',
      permanentAddressLine: initialValues.permanentAddressLine || '',
      permanentAddressState: initialValues.permanentAddressState || '',
      permanentAddressCountry: initialValues.permanentAddressCountry || '',
      permanentAddressPin: initialValues.permanentAddressPin || '',
      sameAsPresent: initialValues.sameAsPresent || false,
      // International
      countryOfResidence: initialValues.countryOfResidence || '',
      cityOfResidence: initialValues.cityOfResidence || '',
      passportNumber: initialValues.passportNumber || '',
      passportCountryOfIssue: initialValues.passportCountryOfIssue || '',
    },
  });

  const maritalStatus = watch('maritalStatus');
  const showSpouse = ['Married', 'Divorced', 'Widowed'].includes(maritalStatus);

  // "Same as present" toggle mirrors the four present-address fields into
  // permanent. Implemented by listening to the checkbox and writing through
  // setValue rather than a controlled prop.
  const sameAsPresent = watch('sameAsPresent');
  const present = watch(['presentAddressLine', 'presentAddressState', 'presentAddressCountry', 'presentAddressPin']);
  useEffect(() => {
    if (!isDomestic) return;
    if (!sameAsPresent) return;
    setValue('permanentAddressLine',    present[0] || '', { shouldDirty: true });
    setValue('permanentAddressState',   present[1] || '', { shouldDirty: true });
    setValue('permanentAddressCountry', present[2] || '', { shouldDirty: true });
    setValue('permanentAddressPin',     present[3] || '', { shouldDirty: true });
  }, [sameAsPresent, present[0], present[1], present[2], present[3], setValue, isDomestic]);

  const onSubmit = (values) => {
    // Strip the FE-only `sameAsPresent` flag; the rest is committed to formData.
    const { sameAsPresent: _sap, ...out } = values;
    // Clear opposite-type fields so partially-filled state doesn't bleed over
    // if the user (or a stale draft) once held the other type's values.
    if (isDomestic) {
      out.countryOfResidence = '';
      out.cityOfResidence = '';
      out.passportNumber = '';
      out.passportCountryOfIssue = '';
    } else {
      out.presentAddressLine = '';
      out.presentAddressState = '';
      out.presentAddressCountry = '';
      out.presentAddressPin = '';
      out.permanentAddressLine = '';
      out.permanentAddressState = '';
      out.permanentAddressCountry = '';
      out.permanentAddressPin = '';
    }
    onNext(out);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: NAVY, margin: '0 0 16px' }}>
        Personal information
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="First name" required error={errors.firstName?.message}>
          <input style={inputStyle(!!errors.firstName)}
            {...register('firstName', { required: 'Required', maxLength: { value: 80, message: 'Too long' } })} />
        </Field>
        <Field label="Last name" required error={errors.lastName?.message}>
          <input style={inputStyle(!!errors.lastName)}
            {...register('lastName', { required: 'Required', maxLength: { value: 80, message: 'Too long' } })} />
        </Field>

        <Field label="Email (locked — used to resume your draft)" error={errors.email?.message}>
          <input type="email" readOnly
            style={{ ...inputStyle(false), background: '#F4F5F7', color: GRAY_600 }}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: EMAIL_RE, message: 'Enter a valid email' },
              validate: v => !lockedEmail || v.trim().toLowerCase() === lockedEmail.toLowerCase() || 'Email is locked',
            })}
          />
        </Field>
        <Field label="Mobile number" required error={errors.mobile?.message}>
          <input type="tel" style={inputStyle(!!errors.mobile)}
            {...register('mobile', {
              required: 'Required',
              validate: v => isValidPhone(v, applicantType) || (isDomestic ? 'Enter a 10-digit Indian mobile number' : 'Enter a valid international mobile number'),
            })} />
        </Field>

        <Field label="Gender" required error={errors.gender?.message}>
          <select style={inputStyle(!!errors.gender)}
            {...register('gender', { required: 'Required' })}>
            <option value="">Select…</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </Field>
        <Field label="Date of birth" required error={errors.dateOfBirth?.message}>
          <input type="date" style={inputStyle(!!errors.dateOfBirth)}
            max={new Date().toISOString().slice(0, 10)}
            {...register('dateOfBirth', {
              required: 'Required',
              validate: v => isAgeAtLeast(v, 16) || 'You must be at least 16 years old',
            })} />
        </Field>

        <Field label="Place of birth" error={errors.placeOfBirth?.message}>
          <input style={inputStyle(!!errors.placeOfBirth)}
            {...register('placeOfBirth', { maxLength: { value: 120, message: 'Too long' } })} />
        </Field>
        <Field label="Nationality" required error={errors.nationality?.message}>
          <input style={inputStyle(!!errors.nationality)}
            {...register('nationality', { required: 'Required', maxLength: { value: 80, message: 'Too long' } })} />
        </Field>

        <Field label="Marital status" required error={errors.maritalStatus?.message}>
          <select style={inputStyle(!!errors.maritalStatus)}
            {...register('maritalStatus', { required: 'Required' })}>
            <option value="">Select…</option>
            <option>Single</option>
            <option>Married</option>
            <option>Divorced</option>
            <option>Widowed</option>
          </select>
        </Field>
        <Field label="Mother tongue" required error={errors.motherTongue?.message}>
          <input style={inputStyle(!!errors.motherTongue)}
            {...register('motherTongue', { required: 'Required', maxLength: { value: 60, message: 'Too long' } })} />
        </Field>

        {showSpouse && (
          <Field label="Spouse's name" error={errors.spouseName?.message}>
            <input style={inputStyle(!!errors.spouseName)}
              {...register('spouseName', { maxLength: { value: 160, message: 'Too long' } })} />
          </Field>
        )}
        {showSpouse && (
          <Field label="Children (optional)" error={errors.childrenInfo?.message}>
            <input placeholder="e.g. 2 children, ages 5 and 7" style={inputStyle(!!errors.childrenInfo)}
              {...register('childrenInfo', { maxLength: { value: 200, message: 'Too long' } })} />
          </Field>
        )}

        <Field label="WhatsApp (optional)" error={errors.whatsapp?.message}>
          <input type="tel" style={inputStyle(!!errors.whatsapp)}
            {...register('whatsapp', { maxLength: { value: 30, message: 'Too long' } })} />
        </Field>
        <Field label="Emergency contact" required error={errors.emergencyContact?.message}>
          <input placeholder="Name + phone" style={inputStyle(!!errors.emergencyContact)}
            {...register('emergencyContact', { required: 'Required', maxLength: { value: 200, message: 'Too long' } })} />
        </Field>
      </div>

      {isDomestic && (
        <>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: NAVY, margin: '28px 0 12px' }}>Present address</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Address line" required error={errors.presentAddressLine?.message}>
              <input style={inputStyle(!!errors.presentAddressLine)}
                {...register('presentAddressLine', { required: 'Required', maxLength: { value: 300, message: 'Too long' } })} />
            </Field>
            <Field label="State" required error={errors.presentAddressState?.message}>
              <input style={inputStyle(!!errors.presentAddressState)}
                {...register('presentAddressState', { required: 'Required', maxLength: { value: 80, message: 'Too long' } })} />
            </Field>
            <Field label="Country" required error={errors.presentAddressCountry?.message}>
              <input style={inputStyle(!!errors.presentAddressCountry)}
                {...register('presentAddressCountry', { required: 'Required', maxLength: { value: 80, message: 'Too long' } })} />
            </Field>
            <Field label="PIN code" required error={errors.presentAddressPin?.message}>
              <input style={inputStyle(!!errors.presentAddressPin)}
                {...register('presentAddressPin', { required: 'Required', maxLength: { value: 12, message: 'Too long' } })} />
            </Field>
          </div>

          <div style={{ margin: '20px 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: NAVY, margin: 0, flex: 1 }}>Permanent address</h3>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: GRAY_600, cursor: 'pointer' }}>
              <input type="checkbox" {...register('sameAsPresent')} />
              Same as present address
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Address line" error={errors.permanentAddressLine?.message}>
              <input disabled={sameAsPresent} style={{ ...inputStyle(false), background: sameAsPresent ? '#F4F5F7' : '#fff' }}
                {...register('permanentAddressLine', { maxLength: { value: 300, message: 'Too long' } })} />
            </Field>
            <Field label="State" error={errors.permanentAddressState?.message}>
              <input disabled={sameAsPresent} style={{ ...inputStyle(false), background: sameAsPresent ? '#F4F5F7' : '#fff' }}
                {...register('permanentAddressState', { maxLength: { value: 80, message: 'Too long' } })} />
            </Field>
            <Field label="Country" error={errors.permanentAddressCountry?.message}>
              <input disabled={sameAsPresent} style={{ ...inputStyle(false), background: sameAsPresent ? '#F4F5F7' : '#fff' }}
                {...register('permanentAddressCountry', { maxLength: { value: 80, message: 'Too long' } })} />
            </Field>
            <Field label="PIN code" error={errors.permanentAddressPin?.message}>
              <input disabled={sameAsPresent} style={{ ...inputStyle(false), background: sameAsPresent ? '#F4F5F7' : '#fff' }}
                {...register('permanentAddressPin', { maxLength: { value: 12, message: 'Too long' } })} />
            </Field>
          </div>
        </>
      )}

      {!isDomestic && (
        <>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: NAVY, margin: '28px 0 12px' }}>Location & identity</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Country of residence" required error={errors.countryOfResidence?.message}>
              <input style={inputStyle(!!errors.countryOfResidence)}
                {...register('countryOfResidence', { required: 'Required', maxLength: { value: 80, message: 'Too long' } })} />
            </Field>
            <Field label="City of residence" required error={errors.cityOfResidence?.message}>
              <input style={inputStyle(!!errors.cityOfResidence)}
                {...register('cityOfResidence', { required: 'Required', maxLength: { value: 120, message: 'Too long' } })} />
            </Field>
            <Field label="Passport number" required error={errors.passportNumber?.message}>
              <input style={inputStyle(!!errors.passportNumber)}
                {...register('passportNumber', { required: 'Required', maxLength: { value: 30, message: 'Too long' } })} />
            </Field>
            <Field label="Passport country of issue" required error={errors.passportCountryOfIssue?.message}>
              <input style={inputStyle(!!errors.passportCountryOfIssue)}
                {...register('passportCountryOfIssue', { required: 'Required', maxLength: { value: 80, message: 'Too long' } })} />
            </Field>
          </div>
          <div style={{ marginTop: 12, padding: '10px 14px', background: NAVY_BG, color: NAVY, borderRadius: 8, fontSize: 13 }}>
            Detailed mailing address isn't required at this stage — our admissions team will follow up by email if any further documents are needed.
          </div>
        </>
      )}

      <FormFooter onNext={true} onBack={onBack} saving={saving} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared char-counter pill rendered under each capped textarea.
// ──────────────────────────────────────────────────────────────────────────────
function CharCount({ value, max }) {
  const len = String(value || '').length;
  const over = len > max;
  return (
    <div style={{ fontSize: 11, color: over ? '#991B1B' : GRAY_500, textAlign: 'right', marginTop: 2 }}>
      {len.toLocaleString()}/{max.toLocaleString()}
    </div>
  );
}

const textareaStyle = (hasError) => ({
  ...inputStyle(hasError),
  minHeight: 84,
  padding: '10px 12px',
  fontFamily: "'DM Sans',sans-serif",
  resize: 'vertical',
});

// ──────────────────────────────────────────────────────────────────────────────
// STEP 3 — background, education, languages
//
// Background (parents, family) lives in formData JSON only — no dedicated
// Applicant columns this phase. Education + languages get their own tables
// at submit time (ApplicantEducation, ApplicantLanguage). M.Div. / M.Div.
// Upgrader applicants need at least three education rows (10th, 12th,
// Bachelor's); everyone else needs at least two (10th, 12th).
// ──────────────────────────────────────────────────────────────────────────────
function Step3BackgroundEducation({ initialValues, programmeCode, onNext, onBack, saving }) {
  const isMDiv = programmeCode === 'MDIV' || programmeCode === 'MDIV-UP';
  const minEdu = isMDiv ? 3 : 2;
  const motherTongueSeed = initialValues.motherTongue || '';
  const currentYear = new Date().getFullYear();

  const {
    register, handleSubmit, control, watch,
    setError, clearErrors,
    formState: { errors },
  } = useForm({
    defaultValues: {
      fatherName: initialValues.fatherName || '',
      fatherOccupation: initialValues.fatherOccupation || '',
      motherName: initialValues.motherName || '',
      motherOccupation: initialValues.motherOccupation || '',
      numberOfSiblings: initialValues.numberOfSiblings ?? '',
      familyChurchAffiliation: initialValues.familyChurchAffiliation || '',
      familyChristianBackground: initialValues.familyChristianBackground || '',
      educationEntries: (initialValues.educationEntries && initialValues.educationEntries.length)
        ? initialValues.educationEntries
        : [
            { qualification: '10th', institutionName: '', boardOrUniversity: '', yearOfPassing: '', percentageOrGrade: '', languageOfInstruction: '' },
            { qualification: '12th', institutionName: '', boardOrUniversity: '', yearOfPassing: '', percentageOrGrade: '', languageOfInstruction: '' },
          ],
      languages: (initialValues.languages && initialValues.languages.length)
        ? initialValues.languages
        : [{ language: motherTongueSeed, readWrite: true, speak: true, understand: true }],
    },
  });

  const eduArr = useFieldArray({ control, name: 'educationEntries' });
  const langArr = useFieldArray({ control, name: 'languages' });
  const familyBg = watch('familyChristianBackground');

  const onSubmit = (values) => {
    clearErrors(['educationEntries', 'languages']);
    if (!Array.isArray(values.educationEntries) || values.educationEntries.length < minEdu) {
      setError('educationEntries', {
        type: 'min',
        message: isMDiv
          ? "M.Div. and M.Div. Upgrader applicants need at least 3 education entries (typically 10th, 12th, and Bachelor's)."
          : 'You need at least 2 education entries (typically 10th and 12th).',
      });
      return;
    }
    if (!Array.isArray(values.languages) || values.languages.length < 1) {
      setError('languages', { type: 'min', message: 'Add at least one language.' });
      return;
    }
    // Coerce numberOfSiblings: keep '' as null, parse digits otherwise.
    const out = { ...values };
    if (out.numberOfSiblings === '' || out.numberOfSiblings == null) {
      out.numberOfSiblings = null;
    } else {
      const n = parseInt(out.numberOfSiblings, 10);
      out.numberOfSiblings = Number.isFinite(n) ? n : null;
    }
    // Normalize year-of-passing to integers (RHF gives back strings from <input type="number">)
    out.educationEntries = out.educationEntries.map(e => ({
      ...e,
      yearOfPassing: e.yearOfPassing === '' || e.yearOfPassing == null
        ? null
        : (parseInt(e.yearOfPassing, 10) || null),
    }));
    onNext(out);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: NAVY, margin: '0 0 16px' }}>
        Background, education & languages
      </h2>

      {/* ── Background ───────────────────────────────────────────────────── */}
      <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: NAVY, margin: '0 0 12px' }}>Family</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Father's name" required error={errors.fatherName?.message}>
          <input style={inputStyle(!!errors.fatherName)}
            {...register('fatherName', { required: 'Required', maxLength: { value: 120, message: 'Too long' } })} />
        </Field>
        <Field label="Father's occupation" error={errors.fatherOccupation?.message}>
          <input style={inputStyle(!!errors.fatherOccupation)}
            {...register('fatherOccupation', { maxLength: { value: 120, message: 'Too long' } })} />
        </Field>
        <Field label="Mother's name" required error={errors.motherName?.message}>
          <input style={inputStyle(!!errors.motherName)}
            {...register('motherName', { required: 'Required', maxLength: { value: 120, message: 'Too long' } })} />
        </Field>
        <Field label="Mother's occupation" error={errors.motherOccupation?.message}>
          <input style={inputStyle(!!errors.motherOccupation)}
            {...register('motherOccupation', { maxLength: { value: 120, message: 'Too long' } })} />
        </Field>
        <Field label="Number of siblings (optional)" error={errors.numberOfSiblings?.message}>
          <input type="number" min="0" max="20" style={inputStyle(!!errors.numberOfSiblings)}
            {...register('numberOfSiblings', { min: { value: 0, message: 'Cannot be negative' }, max: { value: 20, message: 'Too many' } })} />
        </Field>
        <Field label="Family church affiliation (optional)" error={errors.familyChurchAffiliation?.message}>
          <input placeholder="e.g. Assembly of God, Delhi" style={inputStyle(!!errors.familyChurchAffiliation)}
            {...register('familyChurchAffiliation', { maxLength: { value: 200, message: 'Too long' } })} />
        </Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <Field label="Briefly describe the Christian background of your family (optional)" error={errors.familyChristianBackground?.message}>
          <textarea rows={4} style={textareaStyle(!!errors.familyChristianBackground)}
            {...register('familyChristianBackground', { maxLength: { value: 1500, message: 'Max 1500 characters' } })} />
          <CharCount value={familyBg} max={1500} />
        </Field>
      </div>

      {/* ── Education ────────────────────────────────────────────────────── */}
      <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: NAVY, margin: '24px 0 6px' }}>Education</h3>
      <p style={{ fontSize: 12, color: GRAY_600, margin: '0 0 12px' }}>
        {isMDiv
          ? "Add at least 3 rows — typically 10th, 12th, and Bachelor's."
          : 'Add at least 2 rows — typically 10th and 12th.'}
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {eduArr.fields.map((field, index) => (
          <div key={field.id} style={{ border: '1px solid #DDE1E7', borderRadius: 10, padding: '14px 14px 8px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 13, color: NAVY }}>Entry {index + 1}</strong>
              {eduArr.fields.length > 1 && (
                <button type="button" onClick={() => eduArr.remove(index)}
                  style={{ background: 'none', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
                  Remove
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Qualification" required error={errors.educationEntries?.[index]?.qualification?.message}>
                <select style={inputStyle(!!errors.educationEntries?.[index]?.qualification)}
                  {...register(`educationEntries.${index}.qualification`, { required: 'Required' })}>
                  <option value="">Select…</option>
                  <option>10th</option>
                  <option>12th</option>
                  <option>Bachelor's</option>
                  <option>Master's</option>
                  <option>Diploma</option>
                  <option>Other</option>
                </select>
              </Field>
              <Field label="Institution name" required error={errors.educationEntries?.[index]?.institutionName?.message}>
                <input style={inputStyle(!!errors.educationEntries?.[index]?.institutionName)}
                  {...register(`educationEntries.${index}.institutionName`, { required: 'Required', maxLength: { value: 200, message: 'Too long' } })} />
              </Field>
              <Field label="Board / university" required error={errors.educationEntries?.[index]?.boardOrUniversity?.message}>
                <input placeholder="e.g. CBSE, Punjab University" style={inputStyle(!!errors.educationEntries?.[index]?.boardOrUniversity)}
                  {...register(`educationEntries.${index}.boardOrUniversity`, { required: 'Required', maxLength: { value: 200, message: 'Too long' } })} />
              </Field>
              <Field label="Year of passing" required error={errors.educationEntries?.[index]?.yearOfPassing?.message}>
                <input type="number" min="1980" max={currentYear}
                  style={inputStyle(!!errors.educationEntries?.[index]?.yearOfPassing)}
                  {...register(`educationEntries.${index}.yearOfPassing`, {
                    required: 'Required',
                    min: { value: 1980, message: 'Year is too far in the past' },
                    max: { value: currentYear, message: 'Year cannot be in the future' },
                  })} />
              </Field>
              <Field label="Percentage / grade" required error={errors.educationEntries?.[index]?.percentageOrGrade?.message}>
                <input placeholder='e.g. "78%" or "First Class" or "B+"'
                  style={inputStyle(!!errors.educationEntries?.[index]?.percentageOrGrade)}
                  {...register(`educationEntries.${index}.percentageOrGrade`, { required: 'Required', maxLength: { value: 40, message: 'Too long' } })} />
              </Field>
              <Field label="Language of instruction (optional)">
                <input style={inputStyle(false)}
                  {...register(`educationEntries.${index}.languageOfInstruction`, { maxLength: { value: 60, message: 'Too long' } })} />
              </Field>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <Btn type="button" variant="outline" size="sm"
          onClick={() => eduArr.append({ qualification: '', institutionName: '', boardOrUniversity: '', yearOfPassing: '', percentageOrGrade: '', languageOfInstruction: '' })}>
          + Add education entry
        </Btn>
      </div>
      {errors.educationEntries?.message && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>
          {errors.educationEntries.message}
        </div>
      )}

      {/* ── Languages ───────────────────────────────────────────────────── */}
      <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: NAVY, margin: '24px 0 6px' }}>Languages</h3>
      <p style={{ fontSize: 12, color: GRAY_600, margin: '0 0 12px' }}>
        Mother tongue is pre-filled from the previous step (checkboxes editable). Add other languages as needed.
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {langArr.fields.map((field, index) => {
          const isFirst = index === 0;
          return (
            <div key={field.id} style={{ border: '1px solid #DDE1E7', borderRadius: 10, padding: '12px 14px', background: '#fff', display: 'grid', gridTemplateColumns: '2fr 3fr auto', gap: 10, alignItems: 'center' }}>
              <Field label={isFirst ? 'Mother tongue' : 'Language'} required={!isFirst} error={errors.languages?.[index]?.language?.message}>
                <input
                  readOnly={isFirst}
                  style={{ ...inputStyle(!!errors.languages?.[index]?.language), background: isFirst ? '#F4F5F7' : '#fff', color: isFirst ? GRAY_600 : '#1A1D23' }}
                  {...register(`languages.${index}.language`, isFirst
                    ? {}
                    : { required: 'Required', maxLength: { value: 60, message: 'Too long' } })}
                />
              </Field>
              <div style={{ display: 'flex', gap: 14, fontSize: 13, color: '#3D4450', alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" {...register(`languages.${index}.readWrite`)} /> Read/Write
                </label>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" {...register(`languages.${index}.speak`)} /> Speak
                </label>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" {...register(`languages.${index}.understand`)} /> Understand
                </label>
              </div>
              {!isFirst ? (
                <button type="button" onClick={() => langArr.remove(index)}
                  style={{ background: 'none', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
                  Remove
                </button>
              ) : <span />}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10 }}>
        <Btn type="button" variant="outline" size="sm"
          onClick={() => langArr.append({ language: '', readWrite: false, speak: false, understand: false })}>
          + Add language
        </Btn>
      </div>
      {errors.languages?.message && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>
          {errors.languages.message}
        </div>
      )}

      <FormFooter onNext={true} onBack={onBack} saving={saving} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 4 — spiritual
//
// Field names map to existing Phase 2a columns where possible (salvationTestimony,
// churchName, pastorName). baptismStatus is a two-option radio; on save we
// derive the existing boolean waterBaptism + waterBaptismWhen columns from it
// so the submit handler sees data shapes it already understands.
//   - Baptized          → waterBaptism=true,  waterBaptismWhen=baptismDate
//   - Not yet baptized  → waterBaptism=false, waterBaptismWhen=null
// (A "Prefer not to say" option was considered earlier but dropped — HMC is a
// theological college and baptism is a fundamental field, so the strict-bool
// check on waterBaptism stays correct; the UX matches it.)
// ──────────────────────────────────────────────────────────────────────────────
function Step4Spiritual({ initialValues, onNext, onBack, saving }) {
  // Derive baptismStatus default from previous saves; fall back to whatever
  // boolean waterBaptism was stored if baptismStatus isn't set yet (resume
  // case where a prior version of the form stored only the boolean).
  const initialBaptismStatus = initialValues.baptismStatus
    || (initialValues.waterBaptism === true ? 'Baptized'
        : initialValues.waterBaptism === false ? 'Not yet baptized'
        : '');

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      salvationTestimony: initialValues.salvationTestimony || '',
      baptismStatus: initialBaptismStatus,
      baptismDate: initialValues.baptismDate || initialValues.waterBaptismWhen || '',
      baptismLocation: initialValues.baptismLocation || '',
      churchName: initialValues.churchName || '',
      pastorName: initialValues.pastorName || '',
      yearsAtCurrentChurch: initialValues.yearsAtCurrentChurch ?? '',
      previousChurches: initialValues.previousChurches || '',
      spiritualGifts: initialValues.spiritualGifts || '',
      ministryInvolvement: initialValues.ministryInvolvement || '',
      whyHmc: initialValues.whyHmc || '',
      futureMinistryPlans: initialValues.futureMinistryPlans || '',
    },
  });

  const baptismStatus = watch('baptismStatus');
  const showBaptismDetails = baptismStatus === 'Baptized';

  const w = (k) => watch(k);

  const onSubmit = (values) => {
    const out = { ...values };
    if (out.yearsAtCurrentChurch === '' || out.yearsAtCurrentChurch == null) {
      out.yearsAtCurrentChurch = null;
    } else {
      const n = parseInt(out.yearsAtCurrentChurch, 10);
      out.yearsAtCurrentChurch = Number.isFinite(n) ? n : null;
    }
    // Clear the conditional fields when not Baptized so stale values don't
    // bleed through if the user toggled the radio after entering them.
    if (!showBaptismDetails) {
      out.baptismDate = '';
      out.baptismLocation = '';
    }
    // Derive the existing boolean column from the two-option radio.
    // RHF's `required: 'Required'` rule on baptismStatus prevents this from
    // running with an empty value, so the two cases below are exhaustive.
    if (out.baptismStatus === 'Baptized') {
      out.waterBaptism = true;
      out.waterBaptismWhen = out.baptismDate || null;
    } else if (out.baptismStatus === 'Not yet baptized') {
      out.waterBaptism = false;
      out.waterBaptismWhen = null;
    }
    onNext(out);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: NAVY, margin: '0 0 16px' }}>
        Spiritual journey
      </h2>

      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Briefly describe your conversion experience and walk with Christ" required error={errors.salvationTestimony?.message}>
          <textarea rows={5} style={textareaStyle(!!errors.salvationTestimony)}
            {...register('salvationTestimony', { required: 'Required', maxLength: { value: 2000, message: 'Max 2000 characters' } })} />
          <CharCount value={w('salvationTestimony')} max={2000} />
        </Field>

        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', marginBottom: 6 }}>
            Baptism <span style={{ color: '#991B1B' }}>*</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['Baptized', 'Not yet baptized'].map(opt => (
              <label key={opt} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#1A1D23' }}>
                <input type="radio" value={opt}
                  {...register('baptismStatus', { required: 'Required' })} />
                {opt}
              </label>
            ))}
          </div>
          {errors.baptismStatus && (
            <div style={{ fontSize: 12, color: '#991B1B', marginTop: 4 }}>{errors.baptismStatus.message}</div>
          )}
        </div>

        {showBaptismDetails && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Baptism date" error={errors.baptismDate?.message}>
              <input type="date" max={new Date().toISOString().slice(0, 10)}
                style={inputStyle(!!errors.baptismDate)}
                {...register('baptismDate')} />
            </Field>
            <Field label="Baptism location" error={errors.baptismLocation?.message}>
              <input style={inputStyle(!!errors.baptismLocation)}
                {...register('baptismLocation', { maxLength: { value: 200, message: 'Too long' } })} />
            </Field>
          </div>
        )}

        <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: NAVY, margin: '8px 0 0' }}>Current church</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Church name" required error={errors.churchName?.message}>
            <input style={inputStyle(!!errors.churchName)}
              {...register('churchName', { required: 'Required', maxLength: { value: 200, message: 'Too long' } })} />
          </Field>
          <Field label="Pastor's name" required error={errors.pastorName?.message}>
            <input style={inputStyle(!!errors.pastorName)}
              {...register('pastorName', { required: 'Required', maxLength: { value: 160, message: 'Too long' } })} />
          </Field>
          <Field label="Years at current church" required error={errors.yearsAtCurrentChurch?.message}>
            <input type="number" min="0" max="100"
              style={inputStyle(!!errors.yearsAtCurrentChurch)}
              {...register('yearsAtCurrentChurch', {
                required: 'Required',
                min: { value: 0, message: 'Cannot be negative' },
                max: { value: 100, message: 'Too many' },
              })} />
          </Field>
        </div>

        <Field label="Previous church affiliations (optional)" error={errors.previousChurches?.message}>
          <textarea rows={3} style={textareaStyle(!!errors.previousChurches)}
            {...register('previousChurches', { maxLength: { value: 500, message: 'Max 500 characters' } })} />
          <CharCount value={w('previousChurches')} max={500} />
        </Field>

        <Field label="Spiritual gifts you believe God has given you (optional)" error={errors.spiritualGifts?.message}>
          <textarea rows={3} style={textareaStyle(!!errors.spiritualGifts)}
            {...register('spiritualGifts', { maxLength: { value: 500, message: 'Max 500 characters' } })} />
          <CharCount value={w('spiritualGifts')} max={500} />
        </Field>

        <Field label="Current involvement in church and ministry activities" required error={errors.ministryInvolvement?.message}>
          <textarea rows={4} style={textareaStyle(!!errors.ministryInvolvement)}
            {...register('ministryInvolvement', { required: 'Required', maxLength: { value: 1500, message: 'Max 1500 characters' } })} />
          <CharCount value={w('ministryInvolvement')} max={1500} />
        </Field>

        <Field label="Why do you want to study at HMC?" required error={errors.whyHmc?.message}>
          <textarea rows={4} style={textareaStyle(!!errors.whyHmc)}
            {...register('whyHmc', { required: 'Required', maxLength: { value: 1500, message: 'Max 1500 characters' } })} />
          <CharCount value={w('whyHmc')} max={1500} />
        </Field>

        <Field label="Briefly describe your future ministry plans after graduation" required error={errors.futureMinistryPlans?.message}>
          <textarea rows={4} style={textareaStyle(!!errors.futureMinistryPlans)}
            {...register('futureMinistryPlans', { required: 'Required', maxLength: { value: 1500, message: 'Max 1500 characters' } })} />
          <CharCount value={w('futureMinistryPlans')} max={1500} />
        </Field>
      </div>

      <FormFooter onNext={true} onBack={onBack} saving={saving} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 5 — financial (three-way conditional)
//
// Layout determined by applicantType + initialValues.studyMode:
//   A: DOMESTIC + OFFLINE  — paymentMethod (fees | workScholarship);
//                            commitTwoHoursDaily required if scholarship;
//                            feeResponsibility required.
//   B: DOMESTIC + ONLINE   — paymentMethod implicitly 'fees';
//                            needsFinancialAid Yes/No required; note required
//                            if Yes; feeResponsibility required.
//   C: INTERNATIONAL       — paymentMethod implicitly 'fees';
//                            needsFinancialAid Yes/No required; note required
//                            if Yes; no feeResponsibility field.
//
// needsFinancialAid is captured as a 'yes'/'no' radio for UX clarity and
// converted to a boolean on save. The server's validateSubmission accepts
// the boolean form.
// ──────────────────────────────────────────────────────────────────────────────
function Step5Financial({ applicantType, initialValues, onNext, onBack, saving }) {
  const isDomestic = applicantType === 'DOMESTIC';
  const studyMode = String(initialValues.studyMode || '').toUpperCase();
  const layoutA = isDomestic && studyMode === 'OFFLINE';
  const layoutB = isDomestic && studyMode === 'ONLINE';
  const layoutC = !isDomestic;

  const initialNeedsAid = initialValues.needsFinancialAid === true ? 'yes'
    : initialValues.needsFinancialAid === false ? 'no'
    : '';

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      // Default to 'fees' regardless of layout — only Layout A's radio is
      // user-editable; B and C keep it implicit.
      paymentMethod: initialValues.paymentMethod || 'fees',
      commitTwoHoursDaily: initialValues.commitTwoHoursDaily === true,
      feeResponsibility: initialValues.feeResponsibility || '',
      needsFinancialAid: initialNeedsAid,
      financialAidNote: initialValues.financialAidNote || '',
    },
  });

  const paymentMethod = watch('paymentMethod');
  const needsAidRadio = watch('needsFinancialAid');
  const aidNoteVal = watch('financialAidNote');

  const onSubmit = (values) => {
    const out = { ...values };
    // Yes/No radio → boolean column. Empty string → null.
    if (out.needsFinancialAid === 'yes') out.needsFinancialAid = true;
    else if (out.needsFinancialAid === 'no') out.needsFinancialAid = false;
    else out.needsFinancialAid = null;
    // Clear stale aid note if they flipped back to No.
    if (out.needsFinancialAid !== true) out.financialAidNote = '';
    // Layout-specific cleanup so a stale value from a different mode doesn't
    // ride through to the submit endpoint:
    if (layoutA) {
      // Offline applicants don't see needsFinancialAid; force null.
      out.needsFinancialAid = null;
      out.financialAidNote = '';
      if (out.paymentMethod !== 'workScholarship') out.commitTwoHoursDaily = false;
    }
    if (layoutB || layoutC) {
      // Online + international are always 'fees' — no scholarship path.
      out.paymentMethod = 'fees';
      out.commitTwoHoursDaily = false;
    }
    if (layoutC) {
      // International doesn't capture feeResponsibility.
      out.feeResponsibility = '';
    }
    onNext(out);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: NAVY, margin: '0 0 16px' }}>
        Financial information
      </h2>

      {layoutA && (
        <>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: NAVY, margin: '0 0 10px' }}>Payment method</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px',
              border: `1.5px solid ${paymentMethod === 'fees' ? NAVY : '#DDE1E7'}`,
              background: paymentMethod === 'fees' ? NAVY_BG : '#fff',
              borderRadius: 10, cursor: 'pointer' }}>
              <input type="radio" value="fees" style={{ marginTop: 4 }}
                {...register('paymentMethod', { required: 'Choose a payment method' })} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: NAVY }}>I will pay tuition fees at the university</div>
                <div style={{ fontSize: 12, color: GRAY_600, marginTop: 2 }}>Standard fee-paying admission.</div>
              </div>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px',
              border: `1.5px solid ${paymentMethod === 'workScholarship' ? NAVY : '#DDE1E7'}`,
              background: paymentMethod === 'workScholarship' ? NAVY_BG : '#fff',
              borderRadius: 10, cursor: 'pointer' }}>
              <input type="radio" value="workScholarship" style={{ marginTop: 4 }}
                {...register('paymentMethod', { required: 'Choose a payment method' })} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: NAVY }}>I want to apply for the work scholarship</div>
                <div style={{ fontSize: 12, color: GRAY_600, marginTop: 2 }}>
                  Commit to 2 hours/day of campus work to offset tuition. Subject to approval.
                </div>
              </div>
            </label>
          </div>
          {errors.paymentMethod && (
            <div style={{ fontSize: 12, color: '#991B1B', marginTop: -8, marginBottom: 8 }}>{errors.paymentMethod.message}</div>
          )}

          {paymentMethod === 'workScholarship' && (
            <div style={{ padding: '12px 14px', background: '#FFFBF0', border: '1px solid #F5E6BE', borderRadius: 8, marginBottom: 14 }}>
              <label style={{ display: 'inline-flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#3D4450', cursor: 'pointer' }}>
                <input type="checkbox" style={{ marginTop: 3 }}
                  {...register('commitTwoHoursDaily', { required: 'Required if applying for work scholarship' })} />
                <span>
                  <strong style={{ color: '#92400E' }}>I commit</strong> to working 2 hours/day on campus in exchange for tuition offset.
                </span>
              </label>
              {errors.commitTwoHoursDaily && (
                <div style={{ fontSize: 12, color: '#991B1B', marginTop: 6 }}>{errors.commitTwoHoursDaily.message}</div>
              )}
            </div>
          )}

          <div style={{ padding: '12px 14px', background: NAVY_BG, color: NAVY, borderRadius: 8, fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
            The <strong>application fee</strong> is paid online when you submit this form.
            <strong> Tuition fees</strong> are paid at the university campus upon arrival, or offset
            via the work scholarship if approved.
          </div>

          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: NAVY, margin: '0 0 10px' }}>Fee responsibility</h3>
          <Field label="Who is primarily paying for your education?" required error={errors.feeResponsibility?.message}>
            <select style={inputStyle(!!errors.feeResponsibility)}
              {...register('feeResponsibility', { required: 'Required' })}>
              <option value="">Select…</option>
              <option>Self</option>
              <option>Parents / Family</option>
              <option>Church / Sponsor</option>
              <option>Scholarship / Grant</option>
            </select>
          </Field>
        </>
      )}

      {layoutB && (
        <>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: NAVY, margin: '0 0 10px' }}>Payment</h3>
          <div style={{ padding: '12px 14px', background: NAVY_BG, color: NAVY, borderRadius: 8, fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
            Fees will be paid online.
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', marginBottom: 6 }}>
              Do you need financial aid? <span style={{ color: '#991B1B' }}>*</span>
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                <input type="radio" value="yes" {...register('needsFinancialAid', { required: 'Required' })} /> Yes
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                <input type="radio" value="no" {...register('needsFinancialAid', { required: 'Required' })} /> No
              </label>
            </div>
            {errors.needsFinancialAid && (
              <div style={{ fontSize: 12, color: '#991B1B', marginTop: 4 }}>{errors.needsFinancialAid.message}</div>
            )}
          </div>

          {needsAidRadio === 'yes' && (
            <div style={{ marginBottom: 18 }}>
              <Field label="Briefly explain your financial situation" required error={errors.financialAidNote?.message}>
                <textarea rows={4} style={textareaStyle(!!errors.financialAidNote)}
                  {...register('financialAidNote', { required: 'Required when financial aid is requested', maxLength: { value: 1000, message: 'Max 1000 characters' } })} />
                <CharCount value={aidNoteVal} max={1000} />
              </Field>
            </div>
          )}

          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: NAVY, margin: '0 0 10px' }}>Fee responsibility</h3>
          <Field label="Who is primarily paying for your education?" required error={errors.feeResponsibility?.message}>
            <select style={inputStyle(!!errors.feeResponsibility)}
              {...register('feeResponsibility', { required: 'Required' })}>
              <option value="">Select…</option>
              <option>Self</option>
              <option>Parents / Family</option>
              <option>Church / Sponsor</option>
              <option>Scholarship / Grant</option>
            </select>
          </Field>
        </>
      )}

      {layoutC && (
        <>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: NAVY, margin: '0 0 10px' }}>Payment</h3>
          <div style={{ padding: '12px 14px', background: NAVY_BG, color: NAVY, borderRadius: 8, fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
            Fees will be paid online in USD.
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', marginBottom: 6 }}>
              Do you need financial aid? <span style={{ color: '#991B1B' }}>*</span>
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                <input type="radio" value="yes" {...register('needsFinancialAid', { required: 'Required' })} /> Yes
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                <input type="radio" value="no" {...register('needsFinancialAid', { required: 'Required' })} /> No
              </label>
            </div>
            {errors.needsFinancialAid && (
              <div style={{ fontSize: 12, color: '#991B1B', marginTop: 4 }}>{errors.needsFinancialAid.message}</div>
            )}
          </div>

          {needsAidRadio === 'yes' && (
            <div style={{ marginBottom: 18 }}>
              <Field label="Briefly explain your financial situation" required error={errors.financialAidNote?.message}>
                <textarea rows={4} style={textareaStyle(!!errors.financialAidNote)}
                  {...register('financialAidNote', { required: 'Required when financial aid is requested', maxLength: { value: 1000, message: 'Max 1000 characters' } })} />
                <CharCount value={aidNoteVal} max={1000} />
              </Field>
            </div>
          )}
        </>
      )}

      <FormFooter onNext={true} onBack={onBack} saving={saving} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 6 — Documents. Per-row file pickers with client-side MIME+size guards.
// Each successful upload talks to the per-docType endpoint and bumps the parent's
// formData.documents map via onDocumentChange so Back → Forward survives without
// losing files (and a hard refresh re-hydrates from the same server-side state).
// ──────────────────────────────────────────────────────────────────────────────
function Step6Documents({ applicantType, programmeCode, draftCode, email, initialValues, onDocumentChange, onNext, onBack, saving }) {
  const visibleSpecs = useMemo(() => {
    const all = DOCUMENT_SPECS[applicantType] || DOCUMENT_SPECS.DOMESTIC;
    return all.filter(s => !s.requiresProgrammes || s.requiresProgrammes.includes(programmeCode));
  }, [applicantType, programmeCode]);

  // Per-row status: 'empty' | 'uploading' | 'uploaded' | 'error'.
  // Hydrate from initialValues.documents so refresh/back-forward preserves UI.
  const [rowState, setRowState] = useState(() => {
    const map = {};
    const existing = (initialValues && initialValues.documents) || {};
    for (const spec of visibleSpecs) {
      const e = existing[spec.docType];
      map[spec.docType] = e
        ? { status: 'uploaded', fileName: e.fileName, fileSize: e.fileSize, mimeType: e.mimeType, objectKey: e.objectKey, uploadedAt: e.uploadedAt }
        : { status: 'empty' };
    }
    return map;
  });
  const [formError, setFormError] = useState(null);
  const [busyAny, setBusyAny] = useState(false);

  const setRow = (docType, patch) =>
    setRowState(prev => ({ ...prev, [docType]: { ...(prev[docType] || {}), ...patch } }));

  const handleFileSelect = async (spec, file) => {
    if (!file) return;
    setFormError(null);
    // Client-side pre-validation — saves a wasted upload round-trip on
    // obvious mismatches. The server re-validates either way.
    if (file.size > spec.maxBytes) {
      setRow(spec.docType, { status: 'error', errorMessage: `File exceeds ${Math.round(spec.maxBytes / (1024 * 1024))}MB cap` });
      return;
    }
    const mime = String(file.type || '').toLowerCase().split(';')[0].trim();
    if (!spec.mimeTypes.includes(mime)) {
      setRow(spec.docType, { status: 'error', errorMessage: `Wrong file type. ${spec.helper}.` });
      return;
    }
    setRow(spec.docType, { status: 'uploading', errorMessage: null });
    setBusyAny(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('email', email);
      const { data } = await api.post(
        `/public/applications/draft/${encodeURIComponent(draftCode)}/documents/${encodeURIComponent(spec.docType)}`,
        fd,
        {
          // Setting Content-Type to undefined makes axios omit its default
          // 'application/json' header for this request, letting the browser
          // set the multipart/form-data header with the correct boundary
          // parameter (required for multer on the server to parse the body).
          headers: { 'Content-Type': undefined },
        },
      );
      const slot = data.document || {};
      setRow(spec.docType, {
        status: 'uploaded',
        fileName: slot.fileName, fileSize: slot.fileSize, mimeType: slot.mimeType,
        objectKey: slot.objectKey, uploadedAt: slot.uploadedAt, errorMessage: null,
      });
      onDocumentChange(spec.docType, slot);
    } catch (err) {
      setRow(spec.docType, { status: 'error', errorMessage: err?.response?.data?.error || 'Upload failed. Please try again.' });
    } finally {
      setBusyAny(false);
    }
  };

  const handleRemove = async (spec) => {
    setFormError(null);
    setRow(spec.docType, { status: 'uploading', errorMessage: null });
    setBusyAny(true);
    try {
      await api.delete(
        `/public/applications/draft/${encodeURIComponent(draftCode)}/documents/${encodeURIComponent(spec.docType)}`,
        { data: { email } },
      );
      setRow(spec.docType, {
        status: 'empty',
        fileName: null, fileSize: null, mimeType: null, objectKey: null, uploadedAt: null, errorMessage: null,
      });
      onDocumentChange(spec.docType, null);
    } catch (err) {
      setRow(spec.docType, { status: 'error', errorMessage: err?.response?.data?.error || 'Remove failed. Please try again.' });
    } finally {
      setBusyAny(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    const missing = visibleSpecs.filter(s => s.required && rowState[s.docType]?.status !== 'uploaded');
    if (missing.length > 0) {
      setFormError(`Please upload all required documents: ${missing.map(m => m.label).join(', ')}.`);
      return;
    }
    // Mirror the latest documents map back through the parent's formData on
    // Save & Continue. The server is already authoritative (each upload/delete
    // writes draft.formData.documents), but threading it through onNext keeps
    // parent state in sync without an extra GET.
    const out = {};
    for (const spec of visibleSpecs) {
      const r = rowState[spec.docType];
      if (r && r.status === 'uploaded' && r.objectKey) {
        out[spec.docType] = {
          docType: spec.docType,
          objectKey: r.objectKey,
          fileName: r.fileName,
          fileSize: r.fileSize,
          mimeType: r.mimeType,
          uploadedAt: r.uploadedAt,
        };
      }
    }
    // targetStep: 7 explicitly bypasses handleNext's STEPS.length cap so we
    // advance past Step 6 to the post-step placeholder (Application Summary
    // lands in Stage 2b-3).
    onNext({ documents: out }, { targetStep: 7 });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: NAVY, margin: '0 0 8px' }}>
        Documents
      </h2>
      <p style={{ color: GRAY_600, fontSize: 13, margin: '0 0 20px', lineHeight: 1.6 }}>
        Upload the documents below. PDFs are preferred where possible. Each row accepts a single
        file; uploading again replaces the previous one. Required documents are marked
        <span style={{ color: '#991B1B', margin: '0 4px' }}>*</span>.
      </p>

      {formError && (
        <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          {formError}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleSpecs.map(spec => (
          <DocumentRow
            key={spec.docType}
            spec={spec}
            state={rowState[spec.docType] || { status: 'empty' }}
            disabled={busyAny || saving}
            onSelect={(file) => handleFileSelect(spec, file)}
            onRemove={() => handleRemove(spec)}
          />
        ))}
      </div>

      <FormFooter onNext={true} onBack={onBack} saving={saving || busyAny} />
    </form>
  );
}

function DocumentRow({ spec, state, disabled, onSelect, onRemove }) {
  const inputId = `doc-${spec.docType}`;
  const isUploaded = state.status === 'uploaded';
  const isUploading = state.status === 'uploading';
  const isError = state.status === 'error';

  const onPick = (e) => {
    const f = e.target.files?.[0];
    // Clear the input so picking the same filename twice still fires onChange.
    e.target.value = '';
    if (f) onSelect(f);
  };

  return (
    <div style={{ border: '1px solid #DDE1E7', background: '#fff', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600, color: NAVY, fontSize: 14 }}>
            {spec.label}
            {spec.required
              ? <span style={{ color: '#991B1B', marginLeft: 4 }}>*</span>
              : <span style={{ color: GRAY_500, fontSize: 12, marginLeft: 6 }}>(optional)</span>
            }
          </div>
          <div style={{ color: GRAY_500, fontSize: 12, marginTop: 2 }}>
            {spec.helper}{spec.helperExtra ? ` · ${spec.helperExtra}` : ''}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        {isUploaded ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534', padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
              ✓ Uploaded
            </span>
            <span style={{ color: GRAY_600, fontSize: 13, wordBreak: 'break-all' }}>
              {state.fileName || 'file'}
              {typeof state.fileSize === 'number' && state.fileSize > 0 ? ` · ${formatBytes(state.fileSize)}` : ''}
            </span>
            <label htmlFor={inputId} style={{ marginLeft: 'auto' }}>
              <input id={inputId} type="file" accept={spec.accept} style={{ display: 'none' }}
                disabled={disabled} onChange={onPick} />
              <span style={{
                display: 'inline-block', padding: '6px 12px', border: '1px solid #DDE1E7',
                borderRadius: 8, fontSize: 12, color: NAVY, background: '#fff',
                cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
              }}>
                Replace
              </span>
            </label>
            <button type="button" disabled={disabled} onClick={onRemove}
              style={{
                padding: '6px 12px', border: '1px solid #FECACA', background: '#fff',
                color: '#991B1B', borderRadius: 8, fontSize: 12,
                cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
              }}>
              Remove
            </button>
          </div>
        ) : isUploading ? (
          <div style={{ color: GRAY_500, fontSize: 13 }}>Working…</div>
        ) : (
          <label htmlFor={inputId} style={{ display: 'inline-block' }}>
            <input id={inputId} type="file" accept={spec.accept} style={{ display: 'none' }}
              disabled={disabled} onChange={onPick} />
            <span style={{
              display: 'inline-block', padding: '8px 14px', background: NAVY, color: '#fff',
              borderRadius: 8, fontSize: 13,
              cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
            }}>
              Choose file
            </span>
          </label>
        )}

        {isError && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 6, fontSize: 12 }}>
            {state.errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 7 — Application Summary + declarations. Reads everything from the
// parent's formData (no own form state apart from the four declaration
// checkboxes). Each section card has an "Edit" link that jumps the user
// back to that section's step via onEdit; the declaration state is local
// and intentionally not auto-persisted (declarations only matter at submit
// time, and getting fresh consent on every revisit is the right move).
//
// The Submit button is stubbed in sub-stage 1 — sub-stage 2 will wire the
// actual /submit call + payment-pending transition.
// ──────────────────────────────────────────────────────────────────────────────
function Step7Summary({ applicantType, programmes, formData, onEdit, onBack, saving }) {
  const isDomestic = applicantType === 'DOMESTIC';
  const studyMode = String(formData.studyMode || '').toUpperCase();
  const isOfflineDomestic = isDomestic && studyMode === 'OFFLINE';

  const programme = useMemo(
    () => (programmes || []).find(p => p.code === formData.programmeCode) || null,
    [programmes, formData.programmeCode]
  );

  // Parent declaration is required only for applicants under 18 — mirrors the
  // backend ageInYearsFrom() gate in validateSubmission (server/routes/public.js).
  const parentDeclRequired = formData.dateOfBirth ? !isAgeAtLeast(formData.dateOfBirth, 18) : false;

  const [studentDecl, setStudentDecl] = useState(false);
  const [parentDecl, setParentDecl] = useState(false);
  const [commitmentDecl, setCommitmentDecl] = useState(false);
  const [feeDecl, setFeeDecl] = useState(false);
  const [declError, setDeclError] = useState(null);

  const allChecked =
    studentDecl &&
    commitmentDecl &&
    feeDecl &&
    (!parentDeclRequired || parentDecl);

  const handleSubmitClick = () => {
    setDeclError(null);
    if (!allChecked) {
      setDeclError('Please review and check all declarations to continue.');
      return;
    }
    // Stubbed for sub-stage 1 — sub-stage 2 wires the real /submit call and
    // payment-gated success transition. Logging here keeps a paper trail in
    // the console when the form is exercised pre-payment-integration.
    // eslint-disable-next-line no-console
    console.log('[Step 7] Submit stubbed; sub-stage 2 wires /submit + payment', {
      draftCode: formData.__draftCode,
      decls: {
        studentDeclarationAgreed: true,
        parentDeclarationAgreed: parentDeclRequired ? true : null,
        commitmentStatementAgreed: true,
        feeDeclarationAgreed: true,
      },
    });
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: NAVY, margin: '0 0 8px' }}>
        Application Summary — Please Review
      </h2>
      <p style={{ color: GRAY_600, fontSize: 13, margin: '0 0 20px', lineHeight: 1.6 }}>
        Review your information below before submitting. Use the <strong>Edit</strong> links to make changes.
      </p>

      <SummaryProgrammeSection formData={formData} programme={programme} applicantType={applicantType} onEdit={() => onEdit(1)} />
      <SummaryPersonalSection formData={formData} isDomestic={isDomestic} onEdit={() => onEdit(2)} />
      <SummaryBackgroundSection formData={formData} onEdit={() => onEdit(3)} />
      <SummarySpiritualSection formData={formData} onEdit={() => onEdit(4)} />
      <SummaryFinancialSection formData={formData} isDomestic={isDomestic} studyMode={studyMode} onEdit={() => onEdit(5)} />
      <SummaryDocumentsSection
        formData={formData}
        applicantType={applicantType}
        programmeCode={formData.programmeCode}
        onEdit={() => onEdit(6)}
      />

      <FeesBlock programme={programme} isOfflineDomestic={isOfflineDomestic} />

      <DeclarationsBlock
        parentDeclRequired={parentDeclRequired}
        studentDecl={studentDecl}     setStudentDecl={setStudentDecl}
        parentDecl={parentDecl}       setParentDecl={setParentDecl}
        commitmentDecl={commitmentDecl} setCommitmentDecl={setCommitmentDecl}
        feeDecl={feeDecl}             setFeeDecl={setFeeDecl}
      />

      {declError && (
        <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 8, fontSize: 13, marginTop: 14 }}>
          {declError}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, gap: 8, flexWrap: 'wrap' }}>
        <Btn type="button" variant="outline" onClick={onBack} disabled={saving}>← Back</Btn>
        <Btn type="button" onClick={handleSubmitClick} disabled={!allChecked || saving}>
          Submit Application & Continue to Payment
        </Btn>
      </div>
    </div>
  );
}

// ── Display helpers for Step 7 ─────────────────────────────────────────────────

// Turn a YYYY-MM-DD-ish string into "15 June 2000". Returns the dash fallback
// if the input can't be parsed — never throws on garbage.
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatDateLong(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function formatBoolLabel(v) {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return '—';
}

function formatText(v) {
  if (v == null) return '—';
  const s = String(v).trim();
  return s === '' ? '—' : s;
}

function formatMoney(amount, currency) {
  if (amount == null || amount === '') return '—';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : '';
  const locale  = currency === 'INR' ? 'en-IN' : 'en-US';
  return `${symbol} ${n.toLocaleString(locale)}`;
}

function SectionCard({ title, onEdit, children }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12,
      padding: '18px 20px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 12 }}>
        <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: NAVY, margin: 0 }}>{title}</h3>
        <button type="button" onClick={onEdit}
          style={{ background: 'none', border: 'none', color: GOLD, fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}>
          Edit
        </button>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 10, fontSize: 13, lineHeight: 1.6, padding: '3px 0' }}>
      <div style={{ color: GRAY_500 }}>{label}</div>
      <div style={{ color: NAVY, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function SummaryProgrammeSection({ formData, programme, applicantType, onEdit }) {
  const programmeLabel = programme
    ? `${programme.name} (${programme.code})`
    : (formData.programmeCode || '—');
  // International applicants never picked a studyMode (it's implicit ONLINE
  // and the server hardcodes it at submit time). Display "Online" rather
  // than a confusing dash on the Summary screen for those applicants.
  const studyModeLabel = formData.studyMode
    ? String(formData.studyMode).charAt(0) + String(formData.studyMode).slice(1).toLowerCase()
    : (applicantType === 'INTERNATIONAL' ? 'Online' : '—');
  return (
    <SectionCard title="Programme" onEdit={onEdit}>
      <Row label="Programme" value={programmeLabel} />
      <Row label="Study mode" value={studyModeLabel} />
      {programme?.durationYears != null && (
        <Row label="Duration" value={`${programme.durationYears} year${programme.durationYears === 1 ? '' : 's'}`} />
      )}
    </SectionCard>
  );
}

function SummaryPersonalSection({ formData, isDomestic, onEdit }) {
  const fullName = [formData.firstName, formData.lastName].filter(Boolean).join(' ') || '—';
  return (
    <SectionCard title="Personal Information" onEdit={onEdit}>
      <Row label="Full name" value={fullName} />
      <Row label="Email" value={formatText(formData.email)} />
      <Row label="Mobile" value={formatText(formData.mobile)} />
      {formData.whatsapp && <Row label="WhatsApp" value={formatText(formData.whatsapp)} />}
      <Row label="Gender" value={formatText(formData.gender)} />
      <Row label="Date of birth" value={formatDateLong(formData.dateOfBirth)} />
      <Row label="Place of birth" value={formatText(formData.placeOfBirth)} />
      <Row label="Nationality" value={formatText(formData.nationality)} />
      <Row label="Mother tongue" value={formatText(formData.motherTongue)} />
      <Row label="Marital status" value={formatText(formData.maritalStatus)} />
      {formData.spouseName && <Row label="Spouse name" value={formatText(formData.spouseName)} />}
      {formData.childrenInfo && <Row label="Children" value={formatText(formData.childrenInfo)} />}
      <Row label="Emergency contact" value={formatText(formData.emergencyContact)} />

      {isDomestic ? (
        <>
          <div style={{ marginTop: 12, borderTop: '1px dashed #E5E7EB', paddingTop: 10 }}>
            <div style={{ fontWeight: 600, color: NAVY, fontSize: 13, marginBottom: 6 }}>Present address</div>
            <Row label="Address" value={formatText(formData.presentAddressLine)} />
            <Row label="State" value={formatText(formData.presentAddressState)} />
            <Row label="Country" value={formatText(formData.presentAddressCountry)} />
            <Row label="PIN code" value={formatText(formData.presentAddressPin)} />
          </div>
          <div style={{ marginTop: 12, borderTop: '1px dashed #E5E7EB', paddingTop: 10 }}>
            <div style={{ fontWeight: 600, color: NAVY, fontSize: 13, marginBottom: 6 }}>Permanent address</div>
            <Row label="Address" value={formatText(formData.permanentAddressLine)} />
            <Row label="State" value={formatText(formData.permanentAddressState)} />
            <Row label="Country" value={formatText(formData.permanentAddressCountry)} />
            <Row label="PIN code" value={formatText(formData.permanentAddressPin)} />
          </div>
        </>
      ) : (
        <>
          <div style={{ marginTop: 12, borderTop: '1px dashed #E5E7EB', paddingTop: 10 }}>
            <div style={{ fontWeight: 600, color: NAVY, fontSize: 13, marginBottom: 6 }}>Residence</div>
            <Row label="Country" value={formatText(formData.countryOfResidence)} />
            <Row label="City" value={formatText(formData.cityOfResidence)} />
          </div>
          <div style={{ marginTop: 12, borderTop: '1px dashed #E5E7EB', paddingTop: 10 }}>
            <div style={{ fontWeight: 600, color: NAVY, fontSize: 13, marginBottom: 6 }}>Passport</div>
            <Row label="Number" value={formatText(formData.passportNumber)} />
            <Row label="Country of issue" value={formatText(formData.passportCountryOfIssue)} />
          </div>
        </>
      )}
    </SectionCard>
  );
}

function SummaryBackgroundSection({ formData, onEdit }) {
  const eduEntries = Array.isArray(formData.educationEntries) ? formData.educationEntries : [];
  const langEntries = Array.isArray(formData.languages) ? formData.languages : [];
  return (
    <SectionCard title="Background & Education" onEdit={onEdit}>
      <Row label="Father's name" value={formatText(formData.fatherName)} />
      {formData.fatherOccupation && <Row label="Father's occupation" value={formatText(formData.fatherOccupation)} />}
      <Row label="Mother's name" value={formatText(formData.motherName)} />
      {formData.motherOccupation && <Row label="Mother's occupation" value={formatText(formData.motherOccupation)} />}
      {formData.numberOfSiblings !== '' && formData.numberOfSiblings != null && (
        <Row label="Siblings" value={String(formData.numberOfSiblings)} />
      )}
      <Row label="Family church affiliation" value={formatText(formData.familyChurchAffiliation)} />
      <Row label="Christian background" value={formatText(formData.familyChristianBackground)} />

      <div style={{ marginTop: 12, borderTop: '1px dashed #E5E7EB', paddingTop: 10 }}>
        <div style={{ fontWeight: 600, color: NAVY, fontSize: 13, marginBottom: 6 }}>
          Education ({eduEntries.length})
        </div>
        {eduEntries.length === 0
          ? <div style={{ color: GRAY_500, fontSize: 13 }}>—</div>
          : eduEntries.map((e, i) => (
            <div key={i} style={{ background: '#F9FAFB', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{formatText(e.qualification)}</div>
              <div style={{ fontSize: 12, color: GRAY_600 }}>
                {formatText(e.institutionName)} · {formatText(e.boardOrUniversity)}
              </div>
              <div style={{ fontSize: 12, color: GRAY_600 }}>
                Passed {formatText(e.yearOfPassing)} · {formatText(e.percentageOrGrade)}
                {e.languageOfInstruction ? ` · Medium ${e.languageOfInstruction}` : ''}
              </div>
            </div>
          ))}
      </div>

      <div style={{ marginTop: 12, borderTop: '1px dashed #E5E7EB', paddingTop: 10 }}>
        <div style={{ fontWeight: 600, color: NAVY, fontSize: 13, marginBottom: 6 }}>
          Languages ({langEntries.length})
        </div>
        {langEntries.length === 0
          ? <div style={{ color: GRAY_500, fontSize: 13 }}>—</div>
          : langEntries.map((l, i) => {
            const skills = [l.understand && 'understand', l.speak && 'speak', l.readWrite && 'read/write'].filter(Boolean);
            return (
              <div key={i} style={{ background: '#F9FAFB', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{formatText(l.language)}</div>
                <div style={{ fontSize: 12, color: GRAY_600 }}>
                  {skills.length ? skills.join(', ') : '—'}
                </div>
              </div>
            );
          })}
      </div>
    </SectionCard>
  );
}

function SummarySpiritualSection({ formData, onEdit }) {
  const baptized = formData.baptismStatus === 'Baptized' || formData.waterBaptism === true;
  return (
    <SectionCard title="Spiritual Journey" onEdit={onEdit}>
      <Row label="Salvation testimony" value={formatText(formData.salvationTestimony)} />
      <Row label="Water baptism" value={baptized ? 'Baptized' : (formData.baptismStatus || formData.waterBaptism === false ? 'Not yet baptized' : '—')} />
      {baptized && (
        <>
          <Row label="Baptism date" value={formatDateLong(formData.baptismDate || formData.waterBaptismWhen)} />
          {formData.baptismLocation && <Row label="Baptism location" value={formatText(formData.baptismLocation)} />}
        </>
      )}
      <Row label="Church" value={formatText(formData.churchName)} />
      <Row label="Pastor" value={formatText(formData.pastorName)} />
      {formData.yearsAtCurrentChurch !== '' && formData.yearsAtCurrentChurch != null && (
        <Row label="Years at current church" value={String(formData.yearsAtCurrentChurch)} />
      )}
      {formData.previousChurches && <Row label="Previous churches" value={formatText(formData.previousChurches)} />}
      {formData.spiritualGifts && <Row label="Spiritual gifts" value={formatText(formData.spiritualGifts)} />}
      {formData.ministryInvolvement && <Row label="Ministry involvement" value={formatText(formData.ministryInvolvement)} />}
      <Row label="Why HMC" value={formatText(formData.whyHmc)} />
      <Row label="Future ministry plans" value={formatText(formData.futureMinistryPlans)} />
    </SectionCard>
  );
}

function SummaryFinancialSection({ formData, isDomestic, studyMode, onEdit }) {
  const layoutA = isDomestic && studyMode === 'OFFLINE';
  const layoutB = isDomestic && studyMode === 'ONLINE';
  const layoutC = !isDomestic;

  const methodLabel =
    formData.paymentMethod === 'workScholarship' ? 'Work scholarship' :
    formData.paymentMethod === 'fees' ? 'Pay tuition fees' : '—';

  return (
    <SectionCard title="Financial" onEdit={onEdit}>
      {layoutA && (
        <>
          <Row label="Payment method" value={methodLabel} />
          {formData.paymentMethod === 'workScholarship' && (
            <Row label="Commit 2 hrs/day work" value={formatBoolLabel(formData.commitTwoHoursDaily)} />
          )}
          <Row label="Fee responsibility" value={formatText(formData.feeResponsibility)} />
        </>
      )}
      {layoutB && (
        <>
          <Row label="Payment method" value="Pay tuition fees (online)" />
          <Row label="Fee responsibility" value={formatText(formData.feeResponsibility)} />
          <Row label="Needs financial aid" value={formatBoolLabel(formData.needsFinancialAid)} />
          {formData.needsFinancialAid === true && (
            <Row label="Financial aid note" value={formatText(formData.financialAidNote)} />
          )}
        </>
      )}
      {layoutC && (
        <>
          <Row label="Payment method" value="Pay tuition fees (online)" />
          <Row label="Needs financial aid" value={formatBoolLabel(formData.needsFinancialAid)} />
          {formData.needsFinancialAid === true && (
            <Row label="Financial aid note" value={formatText(formData.financialAidNote)} />
          )}
        </>
      )}
    </SectionCard>
  );
}

function SummaryDocumentsSection({ formData, applicantType, programmeCode, onEdit }) {
  const visibleSpecs = useMemo(() => {
    const all = DOCUMENT_SPECS[applicantType] || DOCUMENT_SPECS.DOMESTIC;
    return all.filter(s => !s.requiresProgrammes || s.requiresProgrammes.includes(programmeCode));
  }, [applicantType, programmeCode]);
  const docs = (formData && formData.documents) || {};
  return (
    <SectionCard title="Documents" onEdit={onEdit}>
      {visibleSpecs.map(spec => {
        const d = docs[spec.docType];
        return (
          <div key={spec.docType} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 10, fontSize: 13, lineHeight: 1.6, padding: '3px 0' }}>
            <div style={{ color: GRAY_500 }}>{spec.label}{!spec.required && <span style={{ fontSize: 11, marginLeft: 6 }}>(optional)</span>}</div>
            <div style={{ color: NAVY, wordBreak: 'break-word' }}>
              {d
                ? <>
                    <span style={{ color: '#166534', fontWeight: 600 }}>✓</span>{' '}
                    {formatText(d.fileName)}
                    {typeof d.fileSize === 'number' && d.fileSize > 0 ? ` · ${formatBytes(d.fileSize)}` : ''}
                  </>
                : <span style={{ color: GRAY_500 }}>{spec.required ? 'Not uploaded' : '—'}</span>
              }
            </div>
          </div>
        );
      })}
    </SectionCard>
  );
}

function FeesBlock({ programme, isOfflineDomestic }) {
  const totalCost     = programme ? programme.totalCost : null;
  const applicationFee = programme ? programme.applicationFee : null;
  const currency      = programme ? programme.currency : 'INR';
  return (
    <div style={{
      background: NAVY, color: '#fff', borderRadius: 12,
      padding: '20px 22px', marginBottom: 18, borderLeft: `4px solid ${GOLD}`,
    }}>
      <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: '#fff', margin: '0 0 12px' }}>
        Fees Payable
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Tuition fee (total)</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: GOLD }}>
            {formatMoney(totalCost, currency)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Application fee</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: GOLD }}>
            {formatMoney(applicationFee, currency)}
          </div>
        </div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px', fontSize: 13, lineHeight: 1.6 }}>
        {isOfflineDomestic ? (
          <>
            Tuition fees are payable at the university campus upon arrival, or offset
            via work scholarship if approved. <strong>Only the application fee is payable
            online during this submission.</strong>
          </>
        ) : (
          <>
            Both tuition and application fees are payable online. <strong>The application
            fee is due now to complete your application;</strong> tuition will follow a
            payment schedule.
          </>
        )}
      </div>
    </div>
  );
}

function DeclarationsBlock({
  parentDeclRequired,
  studentDecl, setStudentDecl,
  parentDecl, setParentDecl,
  commitmentDecl, setCommitmentDecl,
  feeDecl, setFeeDecl,
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '18px 20px', marginBottom: 14 }}>
      <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: NAVY, margin: '0 0 14px' }}>
        Declarations
      </h3>
      <DeclarationItem
        checked={studentDecl} onChange={setStudentDecl}
        text="I declare that the information provided in this application is true, accurate, and complete to the best of my knowledge. I understand that any false or misleading information may result in the cancellation of my admission."
      />
      {parentDeclRequired && (
        <DeclarationItem
          checked={parentDecl} onChange={setParentDecl}
          text="As the parent or legal guardian of the applicant, I consent to this application and accept responsibility for the applicant's enrollment and conduct at Harvest Mission College."
        />
      )}
      <DeclarationItem
        checked={commitmentDecl} onChange={setCommitmentDecl}
        text="I commit to upholding the values and code of conduct of Harvest Mission College, including regular chapel attendance, classroom participation, and Christian character throughout my time as a student."
      />
      <DeclarationItem
        checked={feeDecl} onChange={setFeeDecl}
        text="I understand the fee structure as shown above and commit to paying fees as required by the institution."
      />
    </div>
  );
}

function DeclarationItem({ checked, onChange, text }) {
  return (
    <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }} />
      <span style={{ color: NAVY, fontSize: 13, lineHeight: 1.6 }}>{text}</span>
    </label>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Footer with Back/Next + Save indicator. Used by every step.
// ──────────────────────────────────────────────────────────────────────────────
function FormFooter({ onBack, saving }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, gap: 8 }}>
      {onBack ? (
        <Btn type="button" variant="outline" onClick={onBack} disabled={saving}>← Back</Btn>
      ) : <span />}
      <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save & Continue →'}</Btn>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// PARENT — orchestrates the state machine, draft persistence, geo + programmes
// ──────────────────────────────────────────────────────────────────────────────
export default function ApplyStart() {
  const [params, setParams] = useSearchParams();
  const programmeCode = (params.get('programme') || '').toUpperCase() || null;
  const draftFromUrl = params.get('draft') || null;

  // Only auto-hydrate from localStorage if the URL signals resume intent
  // (i.e. ?draft= is present). Without that signal, clicking "Start
  // Application" from /apply must land on Step 0 — letting the server's
  // 409 EXISTING_APPLICATIONS choice screen (Bug 2 fix) handle existing
  // applications via an explicit user choice rather than silent resume.
  //
  // handleStarted / handleResumeDraft both write ?draft= to the URL via
  // setParams, so in-form refresh still resumes correctly (URL carries
  // the signal, localStorage carries the paired email).
  const [draftCode, setDraftCode] = useState(() => {
    if (draftFromUrl) return draftFromUrl;
    if (typeof window === 'undefined') return null;
    // localStorage only counts when the URL is signalling resume
    return null;
  });
  const [email, setEmail] = useState(() => {
    if (draftFromUrl && typeof window !== 'undefined') return localStorage.getItem(LS_EMAIL) || null;
    return null;
  });

  const [applicantType, setApplicantType] = useState(null); // 'DOMESTIC' | 'INTERNATIONAL'
  const [programmes, setProgrammes] = useState([]);
  const [formData, setFormData] = useState({});
  const [currentStep, setCurrentStep] = useState(0); // 0 = intro, 1..6 = steps
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // 1) Geo resolution + programme list — required for step 0 (start) and step 1.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const geo = await api.get('/public/geo');
        if (cancelled) return;
        const type = geo?.data?.applicantType === 'DOMESTIC' ? 'DOMESTIC' : 'INTERNATIONAL';
        setApplicantType(type);
        const param = type === 'INTERNATIONAL' ? 'international' : 'domestic';
        const progRes = await api.get(`/public/programmes?type=${param}`);
        if (cancelled) return;
        setProgrammes(progRes?.data?.programmes || []);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err?.response?.data?.error || 'Could not load. Please refresh.');
        setApplicantType('INTERNATIONAL'); // safe fallback
      } finally {
        // Don't flip loading=false here — depends on draft hydration below too.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 2) Draft hydration — if we already have a code + email, fetch the draft
  //    and jump to its currentStep. Otherwise stay on step 0.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!draftCode || !email) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get(`/public/applications/draft/${encodeURIComponent(draftCode)}?email=${encodeURIComponent(email)}`);
        if (cancelled) return;
        // Path A: surface draft.programmeCode (stored as a first-class column,
        // stripped from draft.formData by the server's FORM_KEYS allowlist) into
        // the FE's unified formData read view. Without this merge, Step 7's
        // Programme card and Step 1's re-entry via Edit both render blank
        // because pickForm on the server discards programmeCode from the JSON
        // blob on save. studyMode is already round-tripped through FORM_KEYS
        // for domestic; international studyMode is intentionally implicit and
        // handled at render time in SummaryProgrammeSection.
        setFormData({
          ...(data.formData || {}),
          programmeCode: data.programmeCode || null,
        });
        const startAt = Math.max(1, Math.min(STEPS.length, parseInt(data.currentStep, 10) || 1));
        setCurrentStep(startAt);
      } catch (err) {
        if (cancelled) return;
        // 403/404 → clear the stale credentials and reset to intro screen.
        // We STAY on /apply/start (no navigate) — only the local state and
        // the URL's ?draft= param need cleaning. Don't add a navigate() here;
        // the catch-all rendering below correctly falls through to Step 0.
        localStorage.removeItem(LS_CODE);
        localStorage.removeItem(LS_EMAIL);
        setDraftCode(null);
        setEmail(null);
        setCurrentStep(0);
        // Strip ?draft= from the URL so a refresh doesn't re-read the same
        // stale value on initial useState() and re-trigger this whole dance.
        if (params.get('draft')) {
          const next = new URLSearchParams(params);
          next.delete('draft');
          setParams(next, { replace: true });
        }
        setLoadError('We couldn\'t find a saved application matching that link — you can start fresh below.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [draftCode, email]);

  const handleStarted = ({ code, email: startedEmail, mobile }) => {
    localStorage.setItem(LS_CODE, code);
    localStorage.setItem(LS_EMAIL, startedEmail);
    setDraftCode(code);
    setEmail(startedEmail);
    // Seed formData with the values we already collected on the intro screen.
    setFormData(prev => ({ ...prev, email: startedEmail, mobile }));
    setCurrentStep(1);
    // Mirror to URL so refresh + share both work.
    const next = new URLSearchParams(params);
    next.set('draft', code);
    if (programmeCode) next.set('programme', programmeCode);
    setParams(next, { replace: true });
  };

  // Resume an existing draft picked from the choice screen. We deliberately
  // do NOT seed formData here — the hydration useEffect will fetch and
  // overwrite it with the saved values (which IS the right move for resume,
  // unlike the fresh-start case where we have to seed to avoid clobbering).
  const handleResumeDraft = ({ code, email: resumeEmail }) => {
    localStorage.setItem(LS_CODE, code);
    localStorage.setItem(LS_EMAIL, resumeEmail);
    setLoading(true);
    setLoadError(null);
    setFormData({}); // clear stale local state so hydration is the source of truth
    setDraftCode(code);
    setEmail(resumeEmail);
    // Mirror to URL so refresh + share both work.
    const next = new URLSearchParams(params);
    next.set('draft', code);
    setParams(next, { replace: true });
  };

  // Save the merged formData + step into the draft, then move to nextStep.
  // Steps call this from their onNext callback.
  const handleNext = async (stepValues, options = {}) => {
    if (!draftCode || !email) return;
    const merged = { ...formData, ...stepValues };
    const nextStep = options.targetStep ?? Math.min(STEPS.length, currentStep + 1);
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        email,
        formData: merged,
        currentStep: nextStep,
      };
      // programmeCode + studyMode are first-class fields on the draft (server
      // also pulls them at submit), so write them through when the FE just
      // captured them on step 1.
      if (stepValues.programmeCode) body.programmeCode = stepValues.programmeCode;
      await api.put(`/public/applications/draft/${encodeURIComponent(draftCode)}`, body);
      setFormData(merged);
      setCurrentStep(nextStep);
    } catch (err) {
      setSaveError(err?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  // Keep parent.formData.documents in sync after each upload/delete on Step 6.
  // The server endpoint already writes draft.formData.documents on every
  // upload/delete, so this is purely a local mirror — no PUT needed. Without
  // it, navigating Step 6 → Back → forward would re-mount Step 6 with stale
  // initialValues.documents and lose the just-uploaded files visually until
  // the next full hydration.
  const handleDocumentChange = (docType, slot) => {
    setFormData(prev => {
      const docs = { ...((prev && prev.documents) || {}) };
      if (slot) docs[docType] = slot;
      else delete docs[docType];
      return { ...prev, documents: docs };
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading || (currentStep > 0 && !applicantType)) {
    return (
      <Shell>
        <div style={{ padding: 40, textAlign: 'center', color: GRAY_500 }}>Loading…</div>
      </Shell>
    );
  }

  // Step 0 — intro / get started. Rendered whenever we don't yet have a draft.
  if (currentStep === 0) {
    return (
      <Shell>
        {loadError && (
          <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {loadError}
          </div>
        )}
        <StepIntro
          applicantType={applicantType}
          programmes={programmes}
          programmeCode={programmeCode}
          onStarted={handleStarted}
          onResumeDraft={handleResumeDraft}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <StepIndicator current={currentStep} />

      {currentStep === 1 && (
        <Step1Programme
          applicantType={applicantType}
          programmes={programmes}
          initialValues={formData}
          onNext={handleNext}
          saving={saving}
        />
      )}

      {currentStep === 2 && (
        <Step2Personal
          applicantType={applicantType}
          lockedEmail={email}
          initialValues={formData}
          onNext={handleNext}
          onBack={handleBack}
          saving={saving}
        />
      )}

      {currentStep === 3 && (
        <Step3BackgroundEducation
          initialValues={formData}
          programmeCode={formData.programmeCode || programmeCode}
          onNext={handleNext}
          onBack={handleBack}
          saving={saving}
        />
      )}

      {currentStep === 4 && (
        <Step4Spiritual
          initialValues={formData}
          onNext={handleNext}
          onBack={handleBack}
          saving={saving}
        />
      )}

      {currentStep === 5 && (
        <Step5Financial
          applicantType={applicantType}
          initialValues={formData}
          onNext={handleNext}
          onBack={handleBack}
          saving={saving}
        />
      )}

      {currentStep === 6 && (
        <Step6Documents
          applicantType={applicantType}
          programmeCode={formData.programmeCode || programmeCode}
          draftCode={draftCode}
          email={email}
          initialValues={formData}
          onDocumentChange={handleDocumentChange}
          onNext={handleNext}
          onBack={handleBack}
          saving={saving}
        />
      )}

      {currentStep === 7 && (
        <Step7Summary
          applicantType={applicantType}
          programmes={programmes}
          formData={formData}
          onEdit={(stepId) => setCurrentStep(stepId)}
          onBack={() => setCurrentStep(6)}
          saving={saving}
        />
      )}

      {currentStep >= 8 && (
        // Reachable only after the (stubbed) Submit on Step 7 advances past the
        // review screen. Sub-stage 2 replaces this with the real /apply/payment
        // page once the submit handler + payment-pending transition are wired.
        <div style={{ padding: 32, background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: NAVY, margin: '0 0 8px' }}>
            Review complete
          </h2>
          <p style={{ color: GRAY_600, fontSize: 14, margin: '0 0 16px' }}>
            Submit + payment integration lands in the next sub-stage. Your draft is preserved at{' '}
            <code style={{ background: NAVY_BG, padding: '2px 8px', borderRadius: 4 }}>{draftCode}</code>.
          </p>
          <Btn variant="outline" onClick={() => setCurrentStep(7)}>← Back to Review</Btn>
        </div>
      )}

      <SaveIndicator saving={saving} error={saveError} />
    </Shell>
  );
}
