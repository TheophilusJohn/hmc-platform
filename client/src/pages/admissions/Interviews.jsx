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

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.post(`/admissions/${selected.id}/interview`, { interviewScore: form.score, interviewNotes: form.notes, recommendation: form.recommendation });
      setSelected(null);
      refetch();
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to save interview.');
    } finally {
      setSaving(false);
    }
  };

  const cols = [
    { key: 'name', label: 'Applicant', render: (_,r) => <div><div style={{fontWeight:500}}>{r.firstName} {r.lastName}</div><div style={{fontSize:12,color:'#7B8494'}}>{r.programmeName}</div></div> },
    // Schema field is `interviewedAt` (not `interviewDate`).
    { key: 'interviewedAt', label: 'Date', render: v => v ? new Date(v).toLocaleDateString('en-IN') : 'TBD' },
    { key: 'pipelineStage', label: 'Stage', render: v => { const lc = String(v||'').toLowerCase(); return <Badge color={lc==='interview_done'?'green':'amber'}>{lc.replace(/_/g,' ')}</Badge>; } },
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
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Interview'}</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}

// References and FeeRecording live in dedicated files
// (admissions/References.jsx and admissions/FeeRecording.jsx). The duplicates
// that previously lived here were never mounted and have been removed.

export default Interviews;
