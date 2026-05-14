import { useState } from 'react';
import { PageWrapper, Card, Badge, Btn, Modal, Tabs } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const EX_TYPES = ['medical_leave', 'attendance_override', 'marks_override', 'grade_correction', 'repeat_subject', 'withdrawal_without_penalty'];
const TYPE_LABELS = { medical_leave: 'Medical Leave', attendance_override: 'Attendance Override', marks_override: 'Marks Override', grade_correction: 'Grade Correction', repeat_subject: 'Repeat Subject', withdrawal_without_penalty: 'Withdrawal' };

export default function AcademicExceptions() {
  const [tab, setTab] = useState('pending');
  const [selected, setSelected] = useState(null);
  const [decision, setDecision] = useState({ notes: '', newValue: '' });
  const { data, refetch } = useApi(`/exceptions?status=${tab}`);
  const exceptions = data?.exceptions || [];

  const handleDecide = async (action) => {
    await api.put(`/exceptions/${selected.id}`, { status: String(action).toUpperCase(), ...decision });
    setSelected(null); refetch();
  };

  return (
    <PageWrapper title="Academic Exceptions" subtitle="Medical leaves, overrides and special cases">
      <Card>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }]} />
        <div style={{ marginTop: 16 }}>
          {exceptions.map(e => (
            <div key={e.id} style={{ padding: '14px 0', borderBottom: '1px solid #DDE1E7', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <Badge color="purple">{TYPE_LABELS[e.type] || e.type}</Badge>
                  <Badge color={tab === 'pending' ? 'amber' : tab === 'approved' ? 'green' : 'red'}>{tab}</Badge>
                </div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{e.studentName}</div>
                <div style={{ fontSize: 12, color: '#7B8494', marginTop: 2 }}>{e.subjectName && `${e.subjectName} · `}{e.reason}</div>
                {e.attachmentUrl && <a href={e.attachmentUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#0F2B4A' }}>View attachment ↗</a>}
              </div>
              {tab === 'pending' && (
                <Btn size="sm" onClick={() => setSelected(e)}>Review</Btn>
              )}
            </div>
          ))}
          {exceptions.length === 0 && <div style={{ color: '#7B8494', fontSize: 13, padding: '16px 0' }}>No {tab} exceptions.</div>}
        </div>
      </Card>

      {selected && (
        <Modal title={`Review: ${TYPE_LABELS[selected.type]}`} onClose={() => setSelected(null)}>
          <div style={{ background: '#F8F9FA', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>
            <div><strong>Student:</strong> {selected.studentName}</div>
            <div><strong>Subject:</strong> {selected.subjectName || '—'}</div>
            <div><strong>Reason:</strong> {selected.reason}</div>
            {selected.requestedValue && <div><strong>Requested Change:</strong> {selected.requestedValue}</div>}
          </div>
          {['marks_override', 'attendance_override', 'grade_correction'].includes(selected.type) && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>New Value (if approving)</label>
              <input value={decision.newValue} onChange={e => setDecision(d => ({ ...d, newValue: e.target.value }))}
                style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14 }} />
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Decision Notes</label>
            <textarea value={decision.notes} onChange={e => setDecision(d => ({ ...d, notes: e.target.value }))}
              style={{ width: '100%', minHeight: 80, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'DM Sans' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="outline" onClick={() => setSelected(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => handleDecide('rejected')}>Reject</Btn>
            <Btn onClick={() => handleDecide('approved')}>Approve</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
