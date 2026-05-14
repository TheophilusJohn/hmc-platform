import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper, Card, Btn, Input, Select } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const STEPS = [
  'Programme', 'Personal Info', 'Address', 'Ministry Background',
  'Academic Background', 'Spouse Info', 'References', 'Statement of Faith',
  'Health Declaration', 'Financial Info', 'Declaration',
];

// Handle either event-style or value-style onChange
const getVal = (v) => (v && typeof v === 'object' && 'target' in v) ? v.target.value : v;

export default function NewApplicant() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Load real programmes from API
  const { data: progData } = useApi('/programmes');
  const programmes = (progData?.programmes || []).map(p => ({
    value: p.id,
    label: `${p.name} — ${p.durationYears}yr${p.code ? ` (${p.code})` : ''}`,
  }));

  const [form, setForm] = useState({
    programmeId: '', studentType: 'DOMESTIC', studyMode: 'OFFLINE',
    firstName: '', lastName: '', email: '', phone: '', dob: '',
    gender: 'unspecified', nationality: 'Indian', maritalStatus: 'single',
    permanentAddress: '', presentAddress: '',
    churchName: '', churchRole: '', ministryYears: '', denomination: '',
    lastInstitution: '', lastDegree: '', lastYear: '',
    spouseName: '', spouseOccupation: '',
    ref1Name: '', ref1Email: '', ref1Phone: '', ref1Relation: 'pastoral',
    ref2Name: '', ref2Email: '', ref2Phone: '', ref2Relation: 'christian_leader',
    statementOfFaith: '',
    healthQ1: false, healthQ2: false, healthQ3: false, healthQ4: false, healthQ5: false,
    financialSponsor: '', declaration: false,
    referralCode: '',
  });

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const setF = (key) => (v) => set(key, getVal(v));

  const handleSubmit = async () => {
    if (!form.declaration) {
      alert('Please accept the declaration before submitting.');
      return;
    }
    setSubmitting(true);
    // Extract the few Applicant model columns; everything else goes into formData
    const { programmeId, studentType, referralCode, ...formData } = form;
    try {
      await api.post('/admissions', {
        programmeId,
        studentType: String(studentType).toUpperCase(),
        referralCode: referralCode || null,
        formData,
      });
      alert('Application submitted successfully.');
      navigate('/admissions/pipeline');
    } catch (err) {
      alert('Failed to submit: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const canNext = () => {
    if (step === 0) return !!form.programmeId;
    if (step === 1) return !!(form.firstName && form.lastName && form.email && form.phone && form.dob);
    if (step === 10) return form.declaration;
    return true;
  };

  return (
    <PageWrapper title="New Applicant" subtitle={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto' }}>
        {STEPS.map((s, i) => (
          <div key={i} onClick={() => i < step && setStep(i)}
            style={{ flex: '0 0 auto', padding: '6px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: i < step ? 'pointer' : 'default',
              background: i === step ? '#0F2B4A' : i < step ? '#C9920A' : '#DDE1E7',
              color: i <= step ? '#fff' : '#7B8494' }}>
            {i + 1}. {s}
          </div>
        ))}
      </div>

      <Card>
        {step === 0 && (
          <div style={{ maxWidth: 500 }}>
            <Select label="Programme" value={form.programmeId} onChange={setF('programmeId')} options={programmes} placeholder="Select programme..." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
              <Select label="Student Type" value={form.studentType} onChange={setF('studentType')}
                options={[{ value: 'DOMESTIC', label: 'Domestic (India)' }, { value: 'INTERNATIONAL', label: 'International' }]} />
              <Select label="Study Mode" value={form.studyMode} onChange={setF('studyMode')}
                options={[{ value: 'OFFLINE', label: 'Offline (Campus)' }, { value: 'ONLINE', label: 'Online' }]} />
            </div>
            <Input label="Referral Code (optional)" value={form.referralCode} onChange={setF('referralCode')} style={{ marginTop: 14 }} />
          </div>
        )}

        {step === 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 600 }}>
            <Input label="First Name" value={form.firstName} onChange={setF('firstName')} />
            <Input label="Last Name" value={form.lastName} onChange={setF('lastName')} />
            <Input label="Email" type="email" value={form.email} onChange={setF('email')} />
            <Input label="Phone" value={form.phone} onChange={setF('phone')} />
            <Input label="Date of Birth" type="date" value={form.dob} onChange={setF('dob')} />
            <Select label="Gender" value={form.gender} onChange={setF('gender')}
              options={[{value:'male',label:'Male'},{value:'female',label:'Female'},{value:'other',label:'Other'},{value:'unspecified',label:'Prefer not to say'}]} />
            <Input label="Nationality" value={form.nationality} onChange={setF('nationality')} />
            <Select label="Marital Status" value={form.maritalStatus} onChange={setF('maritalStatus')}
              options={[{ value:'single',label:'Single'},{value:'married',label:'Married'},{value:'widowed',label:'Widowed'},{value:'divorced',label:'Divorced'}]} />
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'grid', gap: 14, maxWidth: 500 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Permanent Address</label>
              <textarea value={form.permanentAddress} onChange={e => set('permanentAddress', e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', minHeight: 80 }} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Present Address (if different)</label>
              <textarea value={form.presentAddress} onChange={e => set('presentAddress', e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', minHeight: 80 }} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 600 }}>
            <Input label="Church Name" value={form.churchName} onChange={setF('churchName')} />
            <Input label="Your Role/Position" value={form.churchRole} onChange={setF('churchRole')} />
            <Input label="Years in Ministry" type="number" value={form.ministryYears} onChange={setF('ministryYears')} />
            <Input label="Denomination" value={form.denomination} onChange={setF('denomination')} />
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 600 }}>
            <Input label="Last Institution" value={form.lastInstitution} onChange={setF('lastInstitution')} />
            <Input label="Degree/Qualification" value={form.lastDegree} onChange={setF('lastDegree')} />
            <Input label="Year of Completion" type="number" value={form.lastYear} onChange={setF('lastYear')} />
          </div>
        )}

        {step === 5 && (
          <div style={{ maxWidth: 500 }}>
            {form.maritalStatus === 'married' ? (
              <div style={{ display: 'grid', gap: 14 }}>
                <Input label="Spouse Name" value={form.spouseName} onChange={setF('spouseName')} />
                <Input label="Spouse Occupation" value={form.spouseOccupation} onChange={setF('spouseOccupation')} />
              </div>
            ) : (
              <div style={{ color: '#7B8494', fontSize: 14, padding: '20px 0' }}>Not applicable (applicant is {form.maritalStatus}).</div>
            )}
          </div>
        )}

        {step === 6 && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ padding: '10px 14px', background: '#EEF4FA', borderRadius: 8, fontSize: 13, marginBottom: 20 }}>Two references are required. Both must be received before the application can advance past Docs Review.</div>
            {[
              { prefix: 'ref1', label: 'Reference 1 — Pastoral' },
              { prefix: 'ref2', label: 'Reference 2 — Christian Leader' },
            ].map(({ prefix, label }) => (
              <div key={prefix} style={{ marginBottom: 20 }}>
                <h4 style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, color: '#0F2B4A', margin: '0 0 12px' }}>{label}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Input label="Name" value={form[`${prefix}Name`]} onChange={setF(`${prefix}Name`)} />
                  <Input label="Email" type="email" value={form[`${prefix}Email`]} onChange={setF(`${prefix}Email`)} />
                  <Input label="Phone" value={form[`${prefix}Phone`]} onChange={setF(`${prefix}Phone`)} />
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 7 && (
          <div style={{ maxWidth: 600 }}>
            <p style={{ fontSize: 13, color: '#7B8494', marginBottom: 12 }}>In your own words, describe your personal faith in Jesus Christ and your call to ministry.</p>
            <textarea value={form.statementOfFaith} onChange={e => set('statementOfFaith', e.target.value)}
              style={{ width: '100%', minHeight: 200, padding: '12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans', boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
        )}

        {step === 8 && (
          <div style={{ maxWidth: 500 }}>
            <p style={{ fontSize: 13, color: '#7B8494', marginBottom: 16 }}>
              {form.studyMode === 'OFFLINE'
                ? 'Offline students must provide a medical certificate (upload in Documents section).'
                : 'Online/international students complete a simple self-declaration.'}
            </p>
            {[
              form.studyMode === 'OFFLINE' ? 'I am in good physical health and able to participate in campus life.' : 'I am physically able to undertake online theological studies.',
              form.studyMode === 'OFFLINE' ? 'I do not have any communicable disease.' : 'I have no condition preventing me from completing coursework.',
              form.studyMode === 'OFFLINE' ? 'I have no known psychiatric conditions.' : 'I will inform HMC of any change in my health status.',
              form.studyMode === 'OFFLINE' ? 'I have no physical disability that would prevent campus activities.' : "I have read HMC's student wellness policy.",
              form.studyMode === 'OFFLINE' ? 'I have read and accept the health and wellness policy of HMC.' : 'I accept full responsibility for my health during the programme.',
            ].map((q, i) => (
              <label key={i} style={{ display: 'flex', gap: 10, marginBottom: 12, fontSize: 13, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={form[`healthQ${i+1}`]} onChange={e => set(`healthQ${i+1}`, e.target.checked)} style={{ marginTop: 2 }} />
                {q}
              </label>
            ))}
          </div>
        )}

        {step === 9 && (
          <div style={{ maxWidth: 500 }}>
            <Input label="Financial Sponsor / Support Source" value={form.financialSponsor} onChange={setF('financialSponsor')} />
            <p style={{ fontSize: 12, color: '#7B8494', marginTop: 8 }}>HMC has a no-refund policy after enrollment. Fee details are on the programme page.</p>
          </div>
        )}

        {step === 10 && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ padding: '16px', background: '#F8F9FA', borderRadius: 8, fontSize: 13, color: '#3D4450', lineHeight: 1.7, marginBottom: 20 }}>
              I hereby declare that the information provided in this application is true and correct to the best of my knowledge. I understand that any misrepresentation may result in disqualification or dismissal. I accept the rules and regulations of Harvest Mission College and commit to uphold its standards of conduct, Christian living, and academic integrity.
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
              <input type="checkbox" checked={form.declaration} onChange={e => set('declaration', e.target.checked)} />
              I have read and accept the above declaration
            </label>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'space-between' }}>
          <div>{step > 0 && <Btn variant="outline" onClick={() => setStep(s => s - 1)}>← Previous</Btn>}</div>
          <div>
            {step < STEPS.length - 1 ? (
              <Btn onClick={() => setStep(s => s + 1)} disabled={!canNext()}>Next →</Btn>
            ) : (
              <Btn onClick={handleSubmit} disabled={!canNext() || submitting}>{submitting ? 'Submitting...' : 'Submit Application'}</Btn>
            )}
          </div>
        </div>
      </Card>
    </PageWrapper>
  );
}
