import { useState } from 'react';
import { PageWrapper, Card, Btn, Input } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

export default function FeeRecording() {
  const [form, setForm] = useState({ studentId: '', amount: '', mode: 'cash', notes: '' });
  const { data: students } = useApi('/users?role=STUDENT&status=active');

  const handleRecord = async () => {
    await api.post('/payments/offline', form);
    setForm({ studentId: '', amount: '', mode: 'cash', notes: '' });
    alert('Payment recorded. Receipt generated.');
  };

  return (
    <PageWrapper title="Record Fee Payment" subtitle="Record offline payments at enrollment">
      <Card style={{ maxWidth: 480 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Student</label>
            <select value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))}
              style={{ padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, width: '100%', background: '#fff' }}>
              <option value="">Select student...</option>
              {(students?.users || []).map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.userIdDisplay})</option>)}
            </select>
          </div>
          <Input label="Amount (₹)" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Payment Mode</label>
            <select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}
              style={{ padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, width: '100%', background: '#fff' }}>
              {[{ value: 'cash', label: 'Cash' }, { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'upi', label: 'UPI' }].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <Input label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <Btn style={{ marginTop: 20 }} onClick={handleRecord}>Record Payment & Generate Receipt</Btn>
      </Card>
    </PageWrapper>
  );
}
