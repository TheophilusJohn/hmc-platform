import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Table, SearchInput, Modal, Input, Select, StatCard, Tabs } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'net_banking', label: 'Net Banking' },
  { value: 'wise', label: 'Wise' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'swift', label: 'SWIFT Wire' },
];

const WAIVER_TYPES = [{ value: 'full', label: 'Full (100%)' }, { value: 'partial_amount', label: 'Partial – Fixed Amount' }, { value: 'partial_percent', label: 'Partial – Percentage' }];
const WAIVER_REASONS = ['Scholarship', 'Financial hardship', 'Merit award', 'Staff/faculty dependent', 'Ministry/work scholarship', 'Custom'];

export default function Finance() {
  const [tab, setTab] = useState('overview');
  const [searchStudent, setSearchStudent] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [payForm, setPayForm] = useState({ studentId: '', amount: '', mode: 'cash', notes: '' });
  const [waiverForm, setWaiverForm] = useState({ studentId: '', ledgerId: '', type: 'full', value: '', reason: 'Scholarship' });
  const [chargeForm, setChargeForm] = useState({ scope: 'all', name: '', amount: '', feeTypeId: '' });
  const [preview, setPreview] = useState(null);

  const { data: overview } = useApi('/reports/financial/summary');
  const { data: outstanding } = useApi('/reports/financial/outstanding');
  const { data: feeTypes } = useApi('/fee-types');
  const { data: ledger, refetch: refetchLedger } = useApi(selectedStudent ? `/students/${selectedStudent.id}/ledger` : null, [selectedStudent]);

  const handleRecordPayment = async () => {
    await api.post('/payments/offline', payForm);
    setPayForm({ studentId: '', amount: '', mode: 'cash', notes: '' });
    if (selectedStudent?.id === payForm.studentId) refetchLedger();
  };

  const handleApplyWaiver = async () => {
    await api.post('/waivers', waiverForm);
    setWaiverForm({ studentId: '', ledgerId: '', type: 'full', value: '', reason: 'Scholarship' });
  };

  const handlePreviewCharge = async () => {
    const { data } = await api.post('/fee-types/' + chargeForm.feeTypeId + '/bulk-charge/preview', chargeForm);
    setPreview(data);
  };

  const handleApplyCharge = async () => {
    await api.post('/fee-types/' + chargeForm.feeTypeId + '/bulk-charge', chargeForm);
    setPreview(null);
  };

  const outstandingCols = [
    { key: 'name', label: 'Student', render: (_, r) => <div><div style={{ fontWeight: 500 }}>{r.name}</div><div style={{ fontSize: 12, color: '#7B8494' }}>{r.userIdDisplay}</div></div> },
    { key: 'programme', label: 'Programme', render: v => <span style={{ fontSize: 13 }}>{v}</span> },
    { key: 'outstanding', label: 'Outstanding', render: v => <span style={{ color: '#991B1B', fontWeight: 600 }}>₹{Number(v).toLocaleString()}</span> },
    { key: 'lastPaid', label: 'Last Payment', render: v => v ? new Date(v).toLocaleDateString('en-IN') : '—' },
    { key: 'actions', label: '', render: (_, r) => <Btn size="sm" onClick={() => setSelectedStudent(r)}>View Ledger</Btn> },
  ];

  const ledgerCols = [
    { key: 'feeName', label: 'Fee', render: (v, r) => <div><div style={{ fontWeight: 500 }}>{v}</div>{r.carryForwardFrom && <div style={{ fontSize: 11, color: '#C9920A' }}>↑ Carried from {r.originSemester}</div>}</div> },
    { key: 'amount', label: 'Charged', render: v => <span>₹{Number(v).toLocaleString()}</span> },
    { key: 'waivedAmount', label: 'Waived', render: v => v > 0 ? <span style={{ color: '#0F766E' }}>₹{Number(v).toLocaleString()}</span> : '—' },
    { key: 'balance', label: 'Balance', render: v => <strong style={{ color: v > 0 ? '#991B1B' : '#166534' }}>₹{Number(v).toLocaleString()}</strong> },
    { key: 'status', label: 'Status', render: v => <Badge color={v === 'paid' ? 'green' : v === 'partial' ? 'amber' : 'red'}>{v}</Badge> },
  ];

  return (
    <PageWrapper title="Finance" subtitle="Fee ledgers, payments, waivers and charges">
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard icon="💰" label="Collected (INR)" value={`₹${Number(overview?.collectedINR || 0).toLocaleString()}`} color="#166534" />
        <StatCard icon="💵" label="Collected (USD)" value={`$${Number(overview?.collectedUSD || 0).toLocaleString()}`} color="#0F766E" />
        <StatCard icon="⚠️" label="Outstanding" value={`₹${Number(overview?.outstanding || 0).toLocaleString()}`} color="#991B1B" />
        <StatCard icon="🎁" label="Waivers" value={`₹${Number(overview?.waivers || 0).toLocaleString()}`} color="#6D28D9" />
      </div>

      <Card>
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'ledger', label: 'Student Ledger' },
          { value: 'payment', label: 'Record Payment' },
          { value: 'waiver', label: 'Waivers' },
          { value: 'charge', label: 'Mid-Sem Charge' },
        ]} />

        {tab === 'overview' && (
          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: '#0F2B4A', marginBottom: 12 }}>Students with Outstanding Dues</h3>
            <Table columns={outstandingCols} rows={outstanding?.students || []} />
          </div>
        )}

        {tab === 'ledger' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <SearchInput value={searchStudent} onChange={setSearchStudent} placeholder="Search student..." />
            </div>
            {selectedStudent ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px 16px', background: '#EEF4FA', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#0F2B4A' }}>{selectedStudent.name}</div>
                    <div style={{ fontSize: 12, color: '#7B8494' }}>{selectedStudent.userIdDisplay} · {selectedStudent.programme}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <Btn variant="outline" size="sm" onClick={() => setSelectedStudent(null)}>Clear</Btn>
                </div>
                {ledger?.semesters?.map(sem => (
                  <div key={sem.id} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#5A6272', marginBottom: 8 }}>{sem.name} — Balance: <strong style={{ color: '#991B1B' }}>₹{Number(sem.balance).toLocaleString()}</strong></div>
                    <Table columns={ledgerCols} rows={sem.entries || []} />
                  </div>
                ))}
              </div>
            ) : <div style={{ color: '#7B8494', padding: 20, textAlign: 'center' }}>Search and select a student to view their ledger.</div>}
          </div>
        )}

        {tab === 'payment' && (
          <div style={{ marginTop: 20, maxWidth: 500 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <Input label="Student ID or Name" value={payForm.studentId} onChange={e => setPayForm(f => ({ ...f, studentId: e.target.value }))} placeholder="HMC-S-0001 or name" />
              </div>
              <Input label="Amount" type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
              <Select label="Payment Mode" value={payForm.mode} onChange={e => setPayForm(f => ({ ...f, mode: e.target.value }))} options={MODES} />
              <div style={{ gridColumn: '1/-1' }}>
                <Input label="Notes (optional)" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <Btn onClick={handleRecordPayment}>Record Payment & Generate Receipt</Btn>
            </div>
          </div>
        )}

        {tab === 'waiver' && (
          <div style={{ marginTop: 20, maxWidth: 500 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Input label="Student ID" value={waiverForm.studentId} onChange={e => setWaiverForm(f => ({ ...f, studentId: e.target.value }))} />
              <Input label="Ledger Entry ID" value={waiverForm.ledgerId} onChange={e => setWaiverForm(f => ({ ...f, ledgerId: e.target.value }))} />
              <Select label="Waiver Type" value={waiverForm.type} onChange={e => setWaiverForm(f => ({ ...f, type: e.target.value }))} options={WAIVER_TYPES} />
              {waiverForm.type !== 'full' && <Input label={waiverForm.type === 'partial_amount' ? 'Amount (₹)' : 'Percentage (%)'} value={waiverForm.value} onChange={e => setWaiverForm(f => ({ ...f, value: e.target.value }))} />}
              <div style={{ gridColumn: '1/-1' }}>
                <Select label="Reason" value={waiverForm.reason} onChange={e => setWaiverForm(f => ({ ...f, reason: e.target.value }))} options={WAIVER_REASONS.map(r => ({ value: r, label: r }))} />
              </div>
            </div>
            <div style={{ marginTop: 8, padding: '10px 12px', background: '#FFFBF0', border: '1px solid #F5E6BE', borderRadius: 8, fontSize: 13, color: '#92400E' }}>
              Student will be notified instantly when waiver is applied.
            </div>
            <Btn style={{ marginTop: 16 }} onClick={handleApplyWaiver}>Apply Waiver</Btn>
          </div>
        )}

        {tab === 'charge' && (
          <div style={{ marginTop: 20, maxWidth: 500 }}>
            <div style={{ display: 'grid', gap: 16 }}>
              <Select label="Charge Type" value={chargeForm.feeTypeId ? 'library' : 'custom'}
                onChange={e => setChargeForm(f => ({ ...f, feeTypeId: e.target.value === 'custom' ? '' : f.feeTypeId }))}
                options={[{ value: 'library', label: 'From Fee Library' }, { value: 'custom', label: 'One-off Custom' }]} />
              {chargeForm.feeTypeId !== '' ? (
                <Select label="Fee Type" value={chargeForm.feeTypeId} onChange={e => setChargeForm(f => ({ ...f, feeTypeId: e.target.value }))}
                  options={(feeTypes?.fees || []).map(f => ({ value: f.id, label: `${f.name} (₹${f.domesticAmount})` }))} />
              ) : (
                <>
                  <Input label="Charge Name" value={chargeForm.name} onChange={e => setChargeForm(f => ({ ...f, name: e.target.value }))} />
                  <Input label="Amount (₹)" type="number" value={chargeForm.amount} onChange={e => setChargeForm(f => ({ ...f, amount: e.target.value }))} />
                </>
              )}
              <Select label="Apply to" value={chargeForm.scope} onChange={e => setChargeForm(f => ({ ...f, scope: e.target.value }))}
                options={[{ value: 'all', label: 'All Students' }, { value: 'offline', label: 'Offline Only' }, { value: 'online', label: 'Online Only' }]} />
            </div>
            {preview && (
              <div style={{ margin: '16px 0', padding: '12px 16px', background: '#EEF4FA', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: '#0F2B4A' }}>Preview: {preview.count} students · Total ₹{Number(preview.total).toLocaleString()}</div>
                <Btn style={{ marginTop: 12 }} onClick={handleApplyCharge}>Confirm & Apply</Btn>
              </div>
            )}
            {!preview && <Btn variant="outline" style={{ marginTop: 16 }} onClick={handlePreviewCharge}>Preview Recipients</Btn>}
          </div>
        )}
      </Card>
    </PageWrapper>
  );
}
