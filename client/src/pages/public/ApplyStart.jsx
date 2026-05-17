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
import { useForm } from 'react-hook-form';
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
];

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
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const programmeCode = (params.get('programme') || '').toUpperCase() || null;
  const draftFromUrl = params.get('draft') || null;

  // Hydrate code/email from URL → localStorage in that order. The URL is the
  // shareable form (a teammate can send the link); localStorage is the
  // refresh-survival form.
  const [draftCode, setDraftCode] = useState(() => draftFromUrl || localStorage.getItem(LS_CODE) || null);
  const [email, setEmail] = useState(() => localStorage.getItem(LS_EMAIL) || null);

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
        setFormData(data.formData || {});
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

      {currentStep >= 3 && (
        // Steps 3-6 land in stage 2b-2. For now, communicate that explicitly
        // so a curious refresh doesn't show a blank page.
        <div style={{ padding: 32, background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🚧</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: NAVY, margin: '0 0 8px' }}>
            Step {currentStep} is launching shortly
          </h2>
          <p style={{ color: GRAY_600, fontSize: 14, margin: '0 0 16px' }}>
            Your application has been saved. Steps 3 through 6 (background, spiritual,
            finance, documents) are rolling out in the next few days. We'll email you
            at <strong>{email}</strong> when it's ready, or use your code{' '}
            <code style={{ background: NAVY_BG, padding: '2px 8px', borderRadius: 4 }}>{draftCode}</code>{' '}
            to return here.
          </p>
          <Btn variant="outline" onClick={handleBack}>← Back to Step {currentStep - 1}</Btn>
        </div>
      )}

      <SaveIndicator saving={saving} error={saveError} />
    </Shell>
  );
}
