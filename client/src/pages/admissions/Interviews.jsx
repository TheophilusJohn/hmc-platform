// Interviews.jsx
import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Table, Modal, Input } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

export function Interviews() {
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ score: '', recommendation: 'accept', notes: '' });
  const { data, refetch } = useApi('/admissions?stage=interview_scheduled&stage=interview_done');
  const applicants = data?.applicants || [];

  const handleSave = async () => {
    await api.post(`/admissions/${selected.id}/interview`, form);
    setSelected(null); refetch();
  };

  const cols = [
    { key: 'name', label: 'Applicant', render: (_,r) => <div><div style={{fontWeight:500}}>{r.firstName} {r.lastName}</div><div style={{fontSize:12,color:'#7B8494'}}>{r.programmeName}</div></div> },
    { key: 'interviewDate', label: 'Date', render: v => v ? new Date(v).toLocaleDateString('en-IN') : 'TBD' },
    { key: 'pipelineStage', label: 'Stage', render: v => <Badge color={v==='interview_done'?'green':'amber'}>{v.replace(/_/g,' ')}</Badge> },
    { key: 'interviewScore', label: 'Score', render: v => v ? `${v}/10` : '—' },
    { key: 'id', label: '', render: (_,r) => <Btn size="sm" onClick={() => { setSelected(r); setForm({ score: r.interviewScore||'', recommendation: r.recommendation||'accept', notes: r.interviewNotes||'' }); }}>Record</Btn> },
  ];

  return (
    <PageWrapper title="Interviews" subtitle="Scheduled and completed interviews">
      <Card><Table columns={cols} rows={applicants} /></Card>
      {selected && (
        <Modal title={`Interview — ${selected.firstName} ${selected.lastName}`} onClose={() => setSelected(null)}>
          <div style={{display:'grid',gap:14}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <Input label="Score (1–10)" type="number" min={1} max={10} value={form.score} onChange={e => setForm(f=>({...f,score:e.target.value}))} />
              <div>
                <label style={{fontSize:13,fontWeight:500,color:'#3D4450',display:'block',marginBottom:6}}>Recommendation</label>
                <select value={form.recommendation} onChange={e => setForm(f=>({...f,recommendation:e.target.value}))}
                  style={{padding:'8px 12px',border:'1px solid #DDE1E7',borderRadius:8,fontSize:14,width:'100%',background:'#fff'}}>
                  <option value="accept">Accept</option>
                  <option value="reject">Reject</option>
                  <option value="waitlist">Waitlist</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{fontSize:13,fontWeight:500,color:'#3D4450',display:'block',marginBottom:6}}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))}
                style={{width:'100%',minHeight:100,padding:'10px 12px',border:'1px solid #DDE1E7',borderRadius:8,fontSize:14,boxSizing:'border-box',fontFamily:'DM Sans'}} />
            </div>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
            <Btn variant="outline" onClick={() => setSelected(null)}>Cancel</Btn>
            <Btn onClick={handleSave}>Save Interview</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}

// References.jsx
export function References() {
  const { data, refetch } = useApi('/references/pending');
  const refs = data?.references || [];

  const handleResend = async (id) => {
    await api.post(`/references/${id}/resend`);
    refetch();
    alert('Reference link resent.');
  };

  const cols = [
    { key: 'applicantName', label: 'Applicant', render: v => <strong style={{fontSize:13}}>{v}</strong> },
    { key: 'refereeName', label: 'Referee', render: (v,r) => <div><div style={{fontWeight:500}}>{v}</div><div style={{fontSize:12,color:'#7B8494'}}>{r.refereeEmail}</div></div> },
    { key: 'refType', label: 'Type', render: v => <Badge color={v==='pastoral'?'green':'teal'}>{v.replace(/_/g,' ')}</Badge> },
    { key: 'status', label: 'Status', render: v => <Badge color={v==='received'?'green':v==='expired'?'red':'amber'}>{v}</Badge> },
    { key: 'tokenExpiresAt', label: 'Expires', render: v => v ? new Date(v).toLocaleDateString('en-IN') : '—' },
    { key: 'id', label: '', render: (id,r) => r.status !== 'received' && <Btn size="sm" variant="outline" onClick={() => handleResend(id)}>Resend</Btn> },
  ];

  return (
    <PageWrapper title="References" subtitle="Track and manage referee submissions">
      <div style={{padding:'10px 14px',background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:8,marginBottom:16,fontSize:13,color:'#92400E'}}>
        Both references must be received before an applicant can advance past Docs Review.
      </div>
      <Card><Table columns={cols} rows={refs} /></Card>
    </PageWrapper>
  );
}

// FeeRecording.jsx
export function FeeRecording() {
  const [form, setForm] = useState({ studentId: '', amount: '', mode: 'cash', notes: '' });
  const { data: students } = useApi('/users?role=STUDENT&status=active');

  const handleRecord = async () => {
    await api.post('/payments/offline', form);
    setForm({ studentId: '', amount: '', mode: 'cash', notes: '' });
    alert('Payment recorded. Receipt generated.');
  };

  return (
    <PageWrapper title="Record Fee Payment" subtitle="Record offline payments at enrollment">
      <Card style={{maxWidth:480}}>
        <div style={{display:'grid',gap:14}}>
          <div>
            <label style={{fontSize:13,fontWeight:500,color:'#3D4450',display:'block',marginBottom:6}}>Student</label>
            <select value={form.studentId} onChange={e => setForm(f=>({...f,studentId:e.target.value}))}
              style={{padding:'10px 12px',border:'1px solid #DDE1E7',borderRadius:8,fontSize:14,width:'100%',background:'#fff'}}>
              <option value="">Select student...</option>
              {(students?.users||[]).map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.userIdDisplay})</option>)}
            </select>
          </div>
          <Input label="Amount (₹)" type="number" value={form.amount} onChange={e => setForm(f=>({...f,amount:e.target.value}))} />
          <div>
            <label style={{fontSize:13,fontWeight:500,color:'#3D4450',display:'block',marginBottom:6}}>Payment Mode</label>
            <select value={form.mode} onChange={e => setForm(f=>({...f,mode:e.target.value}))}
              style={{padding:'10px 12px',border:'1px solid #DDE1E7',borderRadius:8,fontSize:14,width:'100%',background:'#fff'}}>
              {[{value:'cash',label:'Cash'},{value:'bank_transfer',label:'Bank Transfer'},{value:'upi',label:'UPI'}].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <Input label="Notes" value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} />
        </div>
        <Btn style={{marginTop:20}} onClick={handleRecord}>Record Payment & Generate Receipt</Btn>
      </Card>
    </PageWrapper>
  );
}

// Default exports for routing
export { Interviews as default };
