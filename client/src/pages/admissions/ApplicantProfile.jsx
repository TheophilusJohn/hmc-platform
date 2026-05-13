import { useState } from 'react';
import { Badge, Btn, Tabs, Modal } from '../../components/common';
import api from '../../utils/api';

const STAGES = ['received','docs_review','interview_scheduled','interview_done','waitlisted','accepted','enrolled'];
const STAGE_LABELS = { received:'Received', docs_review:'Docs Review', interview_scheduled:'Interview Scheduled', interview_done:'Interview Done', waitlisted:'Waitlisted', accepted:'Accepted', enrolled:'Enrolled', rejected:'Rejected' };
const DOCS = ['Photo ID', 'Academic Transcripts', 'Church Letter', 'Birth Certificate', 'Medical Certificate', 'Statement of Faith', 'Application Form'];

export default function ApplicantProfile({ applicant: initial, onClose, onUpdate }) {
  const [applicant, setApplicant] = useState(initial);
  const [tab, setTab] = useState('personal');
  const [interviewNotes, setInterviewNotes] = useState(applicant.interviewNotes || '');
  const [interviewScore, setInterviewScore] = useState(applicant.interviewScore || '');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    const { data } = await api.get(`/admissions/${applicant.id}`);
    setApplicant(data);
  };

  const advance = async () => {
    setLoading(true);
    try {
      const nextStage = STAGES[STAGES.indexOf(applicant.pipelineStage) + 1];
      if (!nextStage) return;
      await api.put(`/admissions/${applicant.id}/stage`, { stage: nextStage });
      onUpdate();
    } catch (e) { alert(e.response?.data?.message || 'Cannot advance: prerequisites not met.'); }
    finally { setLoading(false); }
  };

  const accept = async () => {
    setLoading(true);
    try { await api.post(`/admissions/${applicant.id}/accept`); onUpdate(); }
    catch (e) { alert(e.response?.data?.message); }
    finally { setLoading(false); }
  };

  const reject = async () => {
    await api.post(`/admissions/${applicant.id}/reject`, { reason: rejectReason });
    setShowReject(false); onUpdate();
  };

  const saveInterview = async () => {
    await api.post(`/admissions/${applicant.id}/interview`, { notes: interviewNotes, score: interviewScore });
    await refresh();
  };

  const canAdvance = applicant.pipelineStage !== 'enrolled' && applicant.pipelineStage !== 'rejected';
  const stageIdx = STAGES.indexOf(applicant.pipelineStage);
  const nextStage = STAGES[stageIdx + 1];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,43,74,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
      <div style={{ width: 600, height: '100%', background: '#fff', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #DDE1E7', background: '#0F2B4A', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#C9920A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>
              {applicant.firstName?.[0]}{applicant.lastName?.[0]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700 }}>{applicant.firstName} {applicant.lastName}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{applicant.applicationNo} · {applicant.programmeName}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <Badge color={applicant.studentType === 'domestic' ? 'navy' : 'teal'} style={{ fontSize: 11 }}>{applicant.studentType}</Badge>
                <Badge color="gold" style={{ fontSize: 11, background: 'rgba(201,146,10,0.2)', color: '#F5E6BE', borderColor: 'rgba(201,146,10,0.4)' }}>{STAGE_LABELS[applicant.pipelineStage]}</Badge>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {/* Stage actions */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #DDE1E7', background: '#FDFBF7', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canAdvance && nextStage && (
            <Btn size="sm" onClick={advance} disabled={loading}>Advance → {STAGE_LABELS[nextStage]}</Btn>
          )}
          {['received','docs_review','interview_scheduled','interview_done','waitlisted'].includes(applicant.pipelineStage) && (
            <Btn size="sm" variant="success" onClick={accept} disabled={loading}>Accept</Btn>
          )}
          {applicant.pipelineStage !== 'enrolled' && applicant.pipelineStage !== 'rejected' && (
            <Btn size="sm" variant="danger" onClick={() => setShowReject(true)}>Reject</Btn>
          )}
          {applicant.pipelineStage === 'accepted' && (
            <Btn size="sm" variant="gold" onClick={async () => { await api.post(`/admissions/${applicant.id}/enroll`); onUpdate(); }}>Confirm Enrollment</Btn>
          )}
        </div>

        {/* Tabs */}
        <div style={{ padding: '0 24px' }}>
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'personal', label: 'Personal' },
            { value: 'academic', label: 'Academic' },
            { value: 'docs', label: 'Documents' },
            { value: 'interview', label: 'Interview' },
            { value: 'spiritual', label: 'Spiritual' },
          ]} />
        </div>

        <div style={{ flex: 1, padding: '16px 24px' }}>
          {tab === 'personal' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[['Full Name', `${applicant.firstName} ${applicant.lastName}`], ['Email', applicant.email], ['Phone', applicant.phone], ['DOB', applicant.dob], ['Gender', applicant.gender], ['Nationality', applicant.nationality], ['Marital Status', applicant.maritalStatus], ['Applied', new Date(applicant.createdAt).toLocaleDateString('en-IN')]].map(([l,v]) => (
                <div key={l} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#7B8494', marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 13, color: '#1A1D23', fontWeight: 500 }}>{v || '—'}</div>
                </div>
              ))}
              {applicant.referralCode && (
                <div style={{ padding: '8px 12px', background: '#FFFBF0', borderRadius: 6, border: '1px solid #F5E6BE', gridColumn: '1/-1' }}>
                  <div style={{ fontSize: 11, color: '#92400E', marginBottom: 2 }}>Referral Code</div>
                  <div style={{ fontSize: 13, color: '#92400E', fontWeight: 600 }}>{applicant.referralCode}</div>
                </div>
              )}
            </div>
          )}

          {tab === 'docs' && (
            <div>
              {DOCS.map(d => {
                const doc = applicant.documents?.find(x => x.docType === d.toLowerCase().replace(/ /g,'_'));
                return (
                  <div key={d} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #DDE1E7' }}>
                    <div style={{ flex: 1, fontSize: 13, color: '#3D4450' }}>{d}</div>
                    {doc ? <Badge color={doc.verified ? 'green' : 'amber'}>{doc.verified ? 'Verified' : 'Received'}</Badge> : <Badge color="red">Missing</Badge>}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'interview' && (
            <div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Interview Score (1–10)</label>
                <input type="number" min={1} max={10} value={interviewScore} onChange={e => setInterviewScore(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, width: 80 }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Notes</label>
                <textarea value={interviewNotes} onChange={e => setInterviewNotes(e.target.value)}
                  style={{ width: '100%', minHeight: 120, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans', boxSizing: 'border-box' }} />
              </div>
              <Btn onClick={saveInterview}>Save Interview Notes</Btn>
            </div>
          )}

          {tab === 'academic' && (
            <div style={{ fontSize: 13, color: '#5A6272' }}>
              {applicant.academicBackground ? (
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'DM Sans' }}>{JSON.stringify(applicant.academicBackground, null, 2)}</pre>
              ) : <p>No academic information recorded.</p>}
            </div>
          )}

          {tab === 'spiritual' && (
            <div>
              <div style={{ padding: '12px 16px', background: '#F8F9FA', borderRadius: 8, fontSize: 13, color: '#3D4450', whiteSpace: 'pre-wrap' }}>
                {applicant.statementOfFaith || 'No statement of faith recorded.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {showReject && (
        <Modal title="Reject Applicant" onClose={() => setShowReject(false)}>
          <p style={{ fontSize: 13, color: '#7B8494', marginBottom: 12 }}>Please provide a reason (for internal records only).</p>
          <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
            style={{ width: '100%', minHeight: 80, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="outline" onClick={() => setShowReject(false)}>Cancel</Btn>
            <Btn variant="danger" onClick={reject}>Reject Applicant</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
