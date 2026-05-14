import { useState } from 'react';
import { PageWrapper, Card, Btn, Input, Badge, Table } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

// PaymentMode enum is UPPERCASE on the wire.
const MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
];

const INITIAL = { studentId: '', amount: '', mode: 'CASH', notes: '' };

export default function RecordFees() {
  const [form, setForm] = useState(INITIAL);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const { data: students } = useApi('/users?role=STUDENT&status=ACTIVE');
  const { data: ledger } = useApi(selected ? `/students/${selected}/ledger` : null, [selected]);

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
        mode: form.mode,
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

  const ledgerCols = [
    { key: 'feeName', label: 'Fee' },
    { key: 'amount', label: 'Charged', render: v => `₹${Number(v).toLocaleString()}` },
    { key: 'balance', label: 'Balance', render: v => <strong style={{ color: v > 0 ? '#991B1B' : '#166534' }}>₹{Number(v).toLocaleString()}</strong> },
    { key: 'status', label: '', render: v => <Badge color={v === 'paid' ? 'green' : v === 'partial' || v === 'carried' ? 'amber' : v === 'waived' ? 'teal' : 'red'}>{v}</Badge> },
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

          {error && <div style={{ marginTop: 12, padding: '10px 12px', background: '#FEF2F2', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>{error}</div>}
          {ok && <div style={{ marginTop: 12, padding: '10px 12px', background: '#ECFDF5', color: '#166534', borderRadius: 8, fontSize: 13 }}>{ok}</div>}

          <Btn style={{ marginTop: 20 }} onClick={handleRecord} disabled={submitting || !form.studentId || !form.amount}>
            {submitting ? 'Recording…' : 'Record Payment'}
          </Btn>
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
