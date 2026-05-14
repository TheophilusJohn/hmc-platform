import { useState } from 'react';
import { PageWrapper, Card, Btn, Input } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const INITIAL = { studentId: '', amount: '', mode: 'CASH', notes: '' };

export default function FeeRecording() {
  const [form, setForm] = useState(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const { data: students } = useApi('/users?role=STUDENT&status=ACTIVE');

  const handleRecord = async () => {
    setError(null); setOk(null);
    if (!form.studentId) return setError('Pick a student.');
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter a positive amount.');
    setSubmitting(true);
    try {
      const { data } = await api.post('/payments/offline', {
        studentId: form.studentId,
        amount,
        mode: form.mode, // UPPERCASE — PaymentMode enum
        notes: form.notes || null,
      });
      setOk(`Payment recorded. Receipt: ${data?.receiptNo || '(generated)'}`);
      setForm(INITIAL);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
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
              {(students?.users || []).filter(u => u.studentProfileId).map(u => <option key={u.id} value={u.studentProfileId}>{u.firstName} {u.lastName} ({u.userIdDisplay})</option>)}
            </select>
          </div>
          <Input label="Amount (₹)" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Payment Mode</label>
            <select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}
              style={{ padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, width: '100%', background: '#fff' }}>
              {/* PaymentMode enum values are UPPERCASE on the wire. */}
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="UPI">UPI</option>
            </select>
          </div>
          <Input label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>

        {error && <div style={{ marginTop: 14, padding: '10px 12px', background: '#FEF2F2', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>{error}</div>}
        {ok && <div style={{ marginTop: 14, padding: '10px 12px', background: '#ECFDF5', color: '#166534', borderRadius: 8, fontSize: 13 }}>{ok}</div>}

        <Btn style={{ marginTop: 20 }} onClick={handleRecord} disabled={submitting}>
          {submitting ? 'Recording…' : 'Record Payment & Generate Receipt'}
        </Btn>
      </Card>
    </PageWrapper>
  );
}
