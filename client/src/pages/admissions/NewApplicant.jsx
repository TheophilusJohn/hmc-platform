import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper, Card, Btn, Input, Select } from '../../components/common';
import api from '../../utils/api';

const PROGRAMMES = [
  { value: 'cth', label: "C.Th. (Hindi) — 1 Year Certificate" },
  { value: 'dipth', label: "Dip.Th. — 2 Year Diploma" },
  { value: 'bth', label: "B.Th. — 3 Year Bachelor" },
  { value: 'mdiv_upg', label: "M.Div. Upgrader — 2 Year" },
  { value: 'mdiv', label: "M.Div. — 3 Year Master" },
];

const STEPS = [
  'Programme', 'Personal Info', 'Address', 'Ministry Background',
  'Academic Background', 'Spouse Info', 'References', 'Statement of Faith',
  'Health Declaration', 'Financial Info', 'Declaration'
];

export default function NewApplicant() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    programmeId: '', studentType: 'domestic', studyMode: 'offline',
    firstName: '', lastName: '', email: '', phone: '', dob: '', gender: '', nationality: 'Indian', maritalStatus: 'single',
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

  const handleSubmit = async () => {
    await api.post('/admissions', form);
    navigate('/admissions/pipeline');
  };

  const canNext = () => {
    if (step === 0) return !!form.programmeId;
    if (step === 1) return !!(form.firstName && form.lastName && form.email && form.phone && form.dob);
    if (step === 10) return form.declaration;
    return true;
  };

  return (
    <PageWrapper title="New Applicant" subtitle={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
      {/* Progress */}
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
        {/* Step 0: Programme */}
        {step === 0 && (
          <div style={{ maxWidth: 500 }}>
            <Select label="Programme" value={form.programmeId} onChange={e => set('programmeId', e.target.value)} options={PROGRAMMES} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
              <Select label="Student Type" value={form.studentType} onChange={e => set('studentType', e.target.value)} options={[{ value: 'domestic', label: 'Domestic (India)' }, { value: 'international', label: 'International' }]} />
              <Select label="Study Mode" value={form.studyMode} onChange={e => set('studyMode', e.target.value)} options={[{ value: 'offline', label: 'Offline (Campus)' }, { value: 'online', label: 'Online' }]} />
            </div>
            <Input label="Referral Code (optional)" value={form.referralCode} onChange={e => set('referralCode', e.target.value)} style={{ marginTop: 14 }} />
          </div>
        )}

        {/* Step 1: Personal Info */}
        {step === 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 600 }}>
            <Input label="First Name" value={form.firstName} onChange={e => set('firstName', e.target.value)} />
            <Input label="Last Name" value={form.lastName} onChange={e => set('lastName', e.target.value)} />
            <Input label="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            <Input label="Phone" value={form.phone} onChange={e => set('phone', e.target.value)} />
            <Input label="Date of Birth" type="date" value={form.dob} onChange={e => set('dob', e.target.value)} />
            <Select label="Gender" value={form.gender} onChange={e => set('gender', e.target.value)} options={['Male','Female','Other'].map(v => ({ value: v.toLowerCase(), label: v }))} />
            <Input label="Nationality" value={form.nationality} onChange={e => set('nationality', e.target.value)} />
            <Select label="Marital Status" value={form.maritalStatus} onChange={e => set('maritalStatus', e.target.value)} options={[{ value:'single',label:'Single'},{value:'married',label:'Married'},{value:'widowed',label:'Widowed'},{value:'divorced',label:'Divorced'}]} />
          </div>
        )}

        {/* Step 2: Address */}
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

        {/* Step 3: Ministry */}
        {step === 3 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 600 }}>
            <Input label="Church Name" value={form.churchName} onChange={e => set('churchName', e.target.value)} />
            <Input label="Your Role/Position" value={form.churchRole} onChange={e => set('churchRole', e.target.value)} />
            <Input label="Years in Ministry" type="number" value={form.ministryYears} onChange={e => set('ministryYears', e.target.value)} />
            <Input label="Denomination" value={form.denomination} onChange={e => set('denomination', e.target.value)} />
          </div>
        )}

        {/* Step 4: Academic */}
        {step === 4 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 600 }}>
            <Input label="Last Institution" value={form.lastInstitution} onChange={e => set('lastInstitution', e.target.value)} />
            <Input label="Degree/Qualification" value={form.lastDegree} onChange={e => set('lastDegree', e.target.value)} />
            <Input label="Year of Completion" type="number" value={form.lastYear} onChange={e => set('lastYear', e.target.value)} />
          </div>
        )}

        {/* Step 5: Spouse */}
        {step === 5 && (
          <div style={{ maxWidth: 500 }}>
            {form.maritalStatus === 'married' ? (
              <div style={{ display: 'grid', gap: 14 }}>
                <Input label="Spouse Name" value={form.spouseName} onChange={e => set('spouseName', e.target.value)} />
                <Input label="Spouse Occupation" value={form.spouseOccupation} onChange={e => set('spouseOccupation', e.target.value)} />
              </div>
            ) : (
              <div style={{ color: '#7B8494', fontSize: 14, padding: '20px 0' }}>Not applicable (applicant is {form.maritalStatus}).</div>
            )}
          </div>
        )}

        {/* Step 6: References */}
        {step === 6 && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ padding: '10px 14px', background: '#EEF4FA', borderRadius: 8, fontSize: 13, marginBottom: 20 }}>Two references are required. Both must be received before the application can advance past Docs Review.</div>
            {[
              { prefix: 'ref1', type: 'pastoral', label: 'Reference 1 — Pastoral' },
              { prefix: 'ref2', type: 'christian_leader', label: 'Reference 2 — Christian Leader' }
            ].map(({ prefix, label }) => (
              <div key={prefix} style={{ marginBottom: 20 }}>
                <h4 style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, color: '#0F2B4A', margin: '0 0 12px' }}>{label}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Input label="Name" value={form[`${prefix}Name`]} onChange={e => set(`${prefix}Name`, e.target.value)} />
                  <Input label="Email" type="email" value={form[`${prefix}Email`]} onChange={e => set(`${prefix}Email`, e.target.value)} />
                  <Input label="Phone" value={form[`${prefix}Phone`]} onChange={e => set(`${prefix}Phone`, e.target.value)} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 7: Statement of Faith */}
        {step === 7 && (
          <div style={{ maxWidth: 600 }}>
            <p style={{ fontSize: 13, color: '#7B8494', marginBottom: 12 }}>In your own words, describe your personal faith in Jesus Christ and your call to ministry.</p>
            <textarea value={form.statementOfFaith} onChange={e => set('statementOfFaith', e.target.value)}
              style={{ width: '100%', minHeight: 200, padding: '12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans', boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
        )}

        {/* Step 8: Health Declaration */}
        {step === 8 && (
          <div style={{ maxWidth: 500 }}>
            {form.studyMode === 'offline' ? (
              <div>
                <p style={{ fontSize: 13, color: '#7B8494', marginBottom: 16 }}>Offline students must provide a medical certificate. Please ensure documents are uploaded in the Documents section.</p>
                {[
                  'I am in good physical health and able to participate in campus life.',
                  'I do not have any communicable disease.',
                  'I have no known psychiatric conditions.',
                  'I have no physical disability that would prevent campus activities.',
                  'I have read and accept the health and wellness policy of HMC.',
                ].map((q, i) => (
                  <label key={i} style={{ display: 'flex', gap: 10, marginBottom: 12, fontSize: 13, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form[`healthQ${i+1}`]} onChange={e => set(`healthQ${i+1}`, e.target.checked)} style={{ marginTop: 2 }} />
                    {q}
                  </label>
                ))}
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 13, color: '#7B8494', marginBottom: 16 }}>Online/international students complete a simple self-declaration (no medical certificate required).</p>
                {[
                  'I am physically able to undertake online theological studies.',
                  'I have no condition preventing me from completing coursework.',
                  'I will inform HMC of any change in my health status if it affects my studies.',
                  'I have read HMC\'s student wellness policy.',
                  'I accept full responsibility for my health during the programme.',
                ].map((q, i) => (
                  <label key={i} style={{ display: 'flex', gap: 10, marginBottom: 12, fontSize: 13, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form[`healthQ${i+1}`]} onChange={e => set(`healthQ${i+1}`, e.target.checked)} style={{ marginTop: 2 }} />
                    {q}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 9: Financial */}
        {step === 9 && (
          <div style={{ maxWidth: 500 }}>
            <Input label="Financial Sponsor / Support Source" value={form.financialSponsor} onChange={e => set('financialSponsor', e.target.value)} />
            <p style={{ fontSize: 12, color: '#7B8494', marginTop: 8 }}>Annual tuition: {form.programmeId === 'cth' ? '₹8,000' : form.studentType === 'international' ? 'USD (see programme page)' : '₹29,500–₹37,000'}. HMC has a no-refund policy after enrollment.</p>
          </div>
        )}

        {/* Step 10: Declaration */}
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

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'space-between' }}>
          <div>{step > 0 && <Btn variant="outline" onClick={() => setStep(s => s - 1)}>← Previous</Btn>}</div>
          <div>
            {step < STEPS.length - 1 ? (
              <Btn onClick={() => setStep(s => s + 1)} disabled={!canNext()}>Next →</Btn>
            ) : (
              <Btn onClick={handleSubmit} disabled={!canNext()}>Submit Application</Btn>
            )}
          </div>
        </div>
      </Card>
    </PageWrapper>
  );
}
