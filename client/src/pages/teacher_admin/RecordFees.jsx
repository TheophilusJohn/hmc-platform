import { useState } from 'react';
import { PageWrapper, Card, Btn, Input, Badge, Table } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const MODES = [{ value: 'cash', label: 'Cash' }, { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }];

export default function RecordFees() {
  const [form, setForm] = useState({ studentId: '', amount: '', mode: 'cash', notes: '', installment: '' });
  const [selected, setSelected] = useState(null);
  const { data: students } = useApi('/users?role=STUDENT&status=active');
  const { data: ledger } = useApi(selected ? `/students/${selected}/ledger` : null, [selected]);

  const handleRecord = async () => {
    await api.post('/payments/offline', form);
    setForm({ studentId: '', amount: '', mode: 'cash', notes: '', installment: '' });
    alert('Payment recorded. Receipt generated and sent to student.');
  };

  const ledgerCols = [
    { key: 'feeName', label: 'Fee' },
    { key: 'amount', label: 'Charged', render: v => `₹${Number(v).toLocaleString()}` },
    { key: 'balance', label: 'Balance', render: v => <strong style={{ color: v > 0 ? '#991B1B' : '#166534' }}>₹{Number(v).toLocaleString()}</strong> },
    { key: 'status', label: '', render: v => <Badge color={v === 'paid' ? 'green' : v === 'partial' ? 'amber' : 'red'}>{v}</Badge> },
  ];

  return (
    <PageWrapper title="Record Fee Payment" subtitle="Record offline fees for enrolled students">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card title="Payment Form">
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Student</label>
              <select value={form.studentId} onChange={e => { setForm(f => ({ ...f, studentId: e.target.value })); setSelected(e.target.value); }}
                style={{ padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, width: '100%', background: '#fff' }}>
                <option value="">Select student…</option>
                {(students?.users || []).filter(u => u.studentProfileId).map(u => <option key={u.id} value={u.studentProfileId}>{u.firstName} {u.lastName} ({u.userIdDisplay})</option>)}
              </select>
            </div>
            <Input label="Amount (₹)" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Mode</label>
              <select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}
                style={{ padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, width: '100%', background: '#fff' }}>
                {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <Input label="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <Btn style={{ marginTop: 20 }} onClick={handleRecord} disabled={!form.studentId || !form.amount}>Record Payment</Btn>
        </Card>

        <Card title="Student Fee Ledger">
          {selected && ledger ? (
            <div>
              {(ledger.semesters || []).slice(0, 3).map(sem => (
                <div key={sem.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#5A6272', marginBottom: 6 }}>{sem.name}</div>
                  <Table columns={ledgerCols} rows={sem.entries || []} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#7B8494', fontSize: 13, padding: 20, textAlign: 'center' }}>Select a student to view their ledger.</div>
          )}
        </Card>
      </div>
    </PageWrapper>
  );
}
