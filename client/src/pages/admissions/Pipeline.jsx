import { useState } from 'react';
import { PageWrapper, Badge, Btn, Modal } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';
import ApplicantProfile from './ApplicantProfile';

const STAGES = [
  { id: 'received', label: 'Received', color: '#7B8494' },
  { id: 'docs_review', label: 'Docs Review', color: '#92400E' },
  { id: 'interview_scheduled', label: 'Interview Sched.', color: '#0F766E' },
  { id: 'interview_done', label: 'Interview Done', color: '#6D28D9' },
  { id: 'waitlisted', label: 'Waitlisted', color: '#C9920A' },
  { id: 'accepted', label: 'Accepted', color: '#166534' },
  { id: 'enrolled', label: 'Enrolled', color: '#0F2B4A' },
];

const TYPE_COLORS = { domestic: 'navy', international: 'teal' };

export default function Pipeline() {
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const { data, refetch } = useApi('/admissions');
  const applicants = data?.applicants || [];

  const byStage = STAGES.reduce((acc, s) => {
    acc[s.id] = applicants.filter(a => a.pipelineStage === s.id);
    return acc;
  }, {});

  return (
    <div style={{ padding: 24, fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, color: '#0F2B4A', margin: 0 }}>Admissions Pipeline</h1>
        <p style={{ color: '#7B8494', fontSize: 14, margin: '4px 0 0' }}>7-stage applicant tracking board</p>
      </div>

      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8, minHeight: 'calc(100vh - 140px)' }}>
        {STAGES.map(stage => (
          <div key={stage.id} style={{ minWidth: 240, flex: '0 0 240px', display: 'flex', flexDirection: 'column' }}>
            {/* Column header */}
            <div style={{ padding: '10px 12px', background: '#fff', borderRadius: '10px 10px 0 0', border: `2px solid ${stage.color}`, borderBottom: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1D23' }}>{stage.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#7B8494', fontWeight: 700 }}>{byStage[stage.id]?.length || 0}</span>
            </div>

            {/* Cards */}
            <div style={{ flex: 1, background: '#F8F9FA', border: `2px solid ${stage.color}`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: 8, overflowY: 'auto', minHeight: 400 }}>
              {byStage[stage.id]?.length === 0 && (
                <div style={{ textAlign: 'center', color: '#C8CDD5', fontSize: 12, padding: '20px 8px' }}>No applicants</div>
              )}
              {byStage[stage.id]?.map(a => (
                <div key={a.id} onClick={() => setSelectedApplicant(a)}
                  style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', marginBottom: 8, cursor: 'pointer', border: '1px solid #DDE1E7', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1A1D23', marginBottom: 2 }}>{a.firstName} {a.lastName}</div>
                  <div style={{ fontSize: 11, color: '#7B8494', marginBottom: 6 }}>{a.programmeName}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <Badge color={TYPE_COLORS[a.studentType] || 'gray'} style={{ fontSize: 10, padding: '1px 6px' }}>{a.studentType}</Badge>
                    {a.interviewDate && stage.id === 'interview_scheduled' && (
                      <Badge color="teal" style={{ fontSize: 10, padding: '1px 6px' }}>{new Date(a.interviewDate).toLocaleDateString('en-IN', { day:'numeric',month:'short' })}</Badge>
                    )}
                    {a.referralCode && <Badge color="gold" style={{ fontSize: 10, padding: '1px 6px' }}>Referral</Badge>}
                  </div>
                  <div style={{ fontSize: 10, color: '#A0A8B4', marginTop: 6 }}>{new Date(a.createdAt).toLocaleDateString('en-IN')}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedApplicant && (
        <ApplicantProfile applicant={selectedApplicant} onClose={() => setSelectedApplicant(null)} onUpdate={() => { setSelectedApplicant(null); refetch(); }} />
      )}
    </div>
  );
}
