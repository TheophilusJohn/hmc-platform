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

const WAIVER_TYPES = [
  { value: 'FULL', label: 'Full (100%)' },
  { value: 'PARTIAL_AMOUNT', label: 'Partial – Fixed Amount' },
  { value: 'PARTIAL_PERCENT', label: 'Partial – Percentage' },
];
const WAIVER_REASONS = ['Scholarship', 'Financial hardship', 'Merit award', 'Staff/faculty dependent', 'Ministry/work scholarship', 'Custom'];

// The /api/users endpoint (userExtras) returns a flat user shape with
// firstName/lastName/studentProfileId; nested `studentProfile` is NOT
// included. Reading u.studentProfile leaves the picker permanently empty.
const profileFromUser = (u) => {
  if (!u?.studentProfileId) return null;
  return {
    id: u.studentProfileId,
    userIdDisplay: u.userIdDisplay,
    name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
    programme: '', // not in the flat shape; admin will see name + ID in the picker
  };
};

export default function Finance() {
  const [tab, setTab] = useState('overview');

  // Student-picker (shared modal)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null); // 'ledger' | 'pay' | 'waiver' | 'single'
  const [pickerSearch, setPickerSearch] = useState('');

  // Selected student per workflow
  const [selectedStudent, setSelectedStudent] = useState(null);          // ledger viewer
  const [payStudent, setPayStudent] = useState(null);
  const [waiverStudent, setWaiverStudent] = useState(null);
  const [chargeStudent, setChargeStudent] = useState(null);

  // Forms
  const [payForm, setPayForm] = useState({ studentId: '', ledgerId: '', amount: '', mode: 'cash', notes: '', currency: 'INR' });
  const [waiverForm, setWaiverForm] = useState({ studentId: '', ledgerId: '', waiverType: 'FULL', amountOrPercent: '', reason: 'Scholarship' });
  const [chargeMode, setChargeMode] = useState('bulk');                  // 'bulk' | 'single'
  const [bulkChargeForm, setBulkChargeForm] = useState({ scope: 'all', feeTypeId: '' });
  const [singleChargeForm, setSingleChargeForm] = useState({ studentId: '', feeTypeId: '', customAmount: '', customDescription: '' });
  const [bulkPreview, setBulkPreview] = useState(null);

  // Data
  const { data: overview } = useApi('/reports/financial/summary');
  const { data: outstanding, refetch: refetchOutstanding } = useApi('/reports/financial/outstanding');
  const { data: feeTypes } = useApi('/fee-types');
  const { data: ledger, refetch: refetchLedger } = useApi(selectedStudent ? `/students/${selectedStudent.id}/ledger` : null, [selectedStudent]);
  const { data: payLedger } = useApi(payStudent ? `/students/${payStudent.id}/ledger` : null, [payStudent]);
  const { data: waiverLedger, refetch: refetchWaiverLedger } = useApi(waiverStudent ? `/students/${waiverStudent.id}/ledger` : null, [waiverStudent]);
  const { data: pickerStudents } = useApi(pickerOpen ? `/users?role=STUDENT&search=${encodeURIComponent(pickerSearch)}` : null, [pickerOpen, pickerSearch]);

  const feeTypeOpts = (feeTypes?.fees || feeTypes?.feeTypes || []).map(f => ({
    value: f.id, label: `${f.name} (Domestic ₹${Number(f.domesticAmount || 0).toLocaleString()} / Intl $${Number(f.internationalAmount || 0).toLocaleString()})`
  }));

  // Flatten ledger entries with balance > 0 for dropdowns
  const flatLedger = (l) => (l?.semesters || []).flatMap(s =>
    (s.entries || []).filter(e => Number(e.balance) > 0).map(e => ({
      value: e.id,
      label: `${s.name} · ${e.feeName} — Balance ₹${Number(e.balance).toLocaleString()}`,
    }))
  );
  const payLedgerOpts = flatLedger(payLedger);
  const waiverLedgerOpts = flatLedger(waiverLedger);

  // ===== Picker =====
  const openPicker = (target) => { setPickerTarget(target); setPickerSearch(''); setPickerOpen(true); };
  const handlePickStudent = (u) => {
    const info = profileFromUser(u);
    if (!info) { alert('That user has no student profile.'); return; }
    if (pickerTarget === 'ledger') setSelectedStudent(info);
    if (pickerTarget === 'pay') { setPayStudent(info); setPayForm(f => ({ ...f, studentId: info.id, ledgerId: '' })); }
    if (pickerTarget === 'waiver') { setWaiverStudent(info); setWaiverForm(f => ({ ...f, studentId: info.id, ledgerId: '' })); }
    if (pickerTarget === 'single') { setChargeStudent(info); setSingleChargeForm(f => ({ ...f, studentId: info.id })); }
    setPickerOpen(false);
  };

  // ===== Handlers =====
  // Single in-flight token per handler so a fast double-click can't double-submit
  // payments/waivers/charges (the kind of mistake that costs an admin time).
  const [busy, setBusy] = useState({ pay: false, waiver: false, preview: false, bulk: false, single: false });
  const setBusyKey = (k, v) => setBusy(b => ({ ...b, [k]: v }));

  const handleRecordPayment = async () => {
    if (busy.pay) return;
    if (!payForm.studentId || !payForm.amount) { alert('Pick a student and enter amount.'); return; }
    setBusyKey('pay', true);
    try {
      const { data } = await api.post('/payments/offline', payForm);
      alert(`Payment recorded. Receipt: ${data?.receiptNo || '—'}`);
      setPayForm({ studentId: '', ledgerId: '', amount: '', mode: 'cash', notes: '', currency: 'INR' });
      setPayStudent(null);
      refetchOutstanding();
      if (selectedStudent?.id === payStudent?.id) refetchLedger();
    } catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)); }
    finally { setBusyKey('pay', false); }
  };

  const handleApplyWaiver = async () => {
    if (busy.waiver) return;
    if (!waiverForm.studentId || !waiverForm.ledgerId) { alert('Pick a student and ledger entry first.'); return; }
    if (waiverForm.waiverType !== 'FULL' && !waiverForm.amountOrPercent) { alert('Enter the amount or percentage.'); return; }
    setBusyKey('waiver', true);
    try {
      await api.post('/waivers', waiverForm);
      alert('Waiver applied.');
      setWaiverForm({ studentId: '', ledgerId: '', waiverType: 'FULL', amountOrPercent: '', reason: 'Scholarship' });
      setWaiverStudent(null);
      refetchOutstanding();
      refetchWaiverLedger();
    } catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)); }
    finally { setBusyKey('waiver', false); }
  };

  const handlePreviewBulkCharge = async () => {
    if (busy.preview) return;
    if (!bulkChargeForm.feeTypeId) { alert('Pick a fee type.'); return; }
    setBusyKey('preview', true);
    try {
      const { data } = await api.post(`/fee-types/${bulkChargeForm.feeTypeId}/bulk-charge/preview`, { scope: bulkChargeForm.scope });
      setBulkPreview(data);
    } catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)); }
    finally { setBusyKey('preview', false); }
  };

  const handleApplyBulkCharge = async () => {
    if (busy.bulk) return;
    setBusyKey('bulk', true);
    try {
      const { data } = await api.post(`/fee-types/${bulkChargeForm.feeTypeId}/bulk-charge`, { scope: bulkChargeForm.scope });
      alert(`Charged ${data?.created || 0} students.`);
      setBulkPreview(null);
      setBulkChargeForm({ scope: 'all', feeTypeId: '' });
      refetchOutstanding();
    } catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)); }
    finally { setBusyKey('bulk', false); }
  };

  const handleSingleCharge = async () => {
    if (busy.single) return;
    if (!singleChargeForm.studentId || !singleChargeForm.feeTypeId) { alert('Pick a student and fee type.'); return; }
    setBusyKey('single', true);
    try {
      await api.post(`/fee-types/${singleChargeForm.feeTypeId}/charge-student`, singleChargeForm);
      alert('Fee charged to student.');
      setSingleChargeForm({ studentId: '', feeTypeId: '', customAmount: '', customDescription: '' });
      setChargeStudent(null);
      refetchOutstanding();
      if (selectedStudent?.id === chargeStudent?.id) refetchLedger();
    } catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)); }
    finally { setBusyKey('single', false); }
  };

  // ===== Columns =====
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
    { key: 'status', label: 'Status', render: v => <Badge color={v === 'paid' ? 'green' : v === 'partial' || v === 'carried' ? 'amber' : v === 'waived' ? 'teal' : 'red'}>{v}</Badge> },
  ];

  const StudentChip = ({ s, onClear }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#EEF4FA', borderRadius: 8, marginBottom: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: '#0F2B4A' }}>{s.name}</div>
        <div style={{ fontSize: 12, color: '#7B8494' }}>{s.userIdDisplay}{s.programme && ` · ${s.programme}`}</div>
      </div>
      <Btn size="sm" variant="outline" onClick={onClear}>Change</Btn>
    </div>
  );

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
          { value: 'charge', label: 'Apply Charge' },
        ]} />

        {tab === 'overview' && (
          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: '#0F2B4A', marginBottom: 12 }}>Students with Outstanding Dues</h3>
            <Table columns={outstandingCols} rows={outstanding?.students || []} />
          </div>
        )}

        {tab === 'ledger' && (
          <div style={{ marginTop: 20 }}>
            {selectedStudent ? (
              <div>
                <StudentChip s={selectedStudent} onClear={() => setSelectedStudent(null)} />
                {(ledger?.semesters || []).map(sem => (
                  <div key={sem.id} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#5A6272', marginBottom: 8 }}>{sem.name} — Balance: <strong style={{ color: '#991B1B' }}>₹{Number(sem.balance).toLocaleString()}</strong></div>
                    <Table columns={ledgerCols} rows={sem.entries || []} />
                  </div>
                ))}
                {(ledger?.semesters || []).length === 0 && <div style={{ color: '#7B8494', padding: 12 }}>No fee entries yet for this student.</div>}
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center' }}>
                <div style={{ color: '#7B8494', marginBottom: 12 }}>Select a student to view their ledger.</div>
                <Btn onClick={() => openPicker('ledger')}>Select Student</Btn>
              </div>
            )}
          </div>
        )}

        {tab === 'payment' && (
          <div style={{ marginTop: 20, maxWidth: 560 }}>
            {payStudent
              ? <StudentChip s={payStudent} onClear={() => { setPayStudent(null); setPayForm(f => ({ ...f, studentId: '', ledgerId: '' })); }} />
              : <Btn variant="outline" onClick={() => openPicker('pay')} style={{ marginBottom: 12 }}>Select Student</Btn>}
            {payStudent && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Input label="Amount" type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
                <Select label="Currency" value={payForm.currency} onChange={e => setPayForm(f => ({ ...f, currency: e.target.value }))} options={[{ value: 'INR', label: 'INR ₹' }, { value: 'USD', label: 'USD $' }]} />
                <Select label="Payment Mode" value={payForm.mode} onChange={e => setPayForm(f => ({ ...f, mode: e.target.value }))} options={MODES} />
                <Select label="Allocate to (optional)" value={payForm.ledgerId} onChange={e => setPayForm(f => ({ ...f, ledgerId: e.target.value }))}
                  options={[{ value: '', label: '— General (no allocation) —' }, ...payLedgerOpts]} />
                <div style={{ gridColumn: '1/-1' }}>
                  <Input label="Notes (optional)" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            )}
            {payStudent && <Btn style={{ marginTop: 16 }} onClick={handleRecordPayment} disabled={busy.pay}>{busy.pay ? 'Recording…' : 'Record Payment & Generate Receipt'}</Btn>}
          </div>
        )}

        {tab === 'waiver' && (
          <div style={{ marginTop: 20, maxWidth: 560 }}>
            {waiverStudent
              ? <StudentChip s={waiverStudent} onClear={() => { setWaiverStudent(null); setWaiverForm(f => ({ ...f, studentId: '', ledgerId: '' })); }} />
              : <Btn variant="outline" onClick={() => openPicker('waiver')} style={{ marginBottom: 12 }}>Select Student</Btn>}
            {waiverStudent && (
              <>
                <Select label="Ledger Entry" value={waiverForm.ledgerId} onChange={e => setWaiverForm(f => ({ ...f, ledgerId: e.target.value }))}
                  options={[{ value: '', label: '— Pick a fee entry —' }, ...waiverLedgerOpts]} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
                  <Select label="Waiver Type" value={waiverForm.waiverType} onChange={e => setWaiverForm(f => ({ ...f, waiverType: e.target.value }))} options={WAIVER_TYPES} />
                  {waiverForm.waiverType !== 'FULL' && (
                    <Input label={waiverForm.waiverType === 'PARTIAL_AMOUNT' ? 'Amount (₹)' : 'Percentage (%)'} value={waiverForm.amountOrPercent} onChange={e => setWaiverForm(f => ({ ...f, amountOrPercent: e.target.value }))} />
                  )}
                  <div style={{ gridColumn: '1/-1' }}>
                    <Select label="Reason" value={waiverForm.reason} onChange={e => setWaiverForm(f => ({ ...f, reason: e.target.value }))} options={WAIVER_REASONS.map(r => ({ value: r, label: r }))} />
                  </div>
                </div>
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#FFFBF0', border: '1px solid #F5E6BE', borderRadius: 8, fontSize: 13, color: '#92400E' }}>
                  Student will be notified instantly when waiver is applied.
                </div>
                <Btn style={{ marginTop: 16 }} onClick={handleApplyWaiver} disabled={busy.waiver}>{busy.waiver ? 'Applying…' : 'Apply Waiver'}</Btn>
              </>
            )}
          </div>
        )}

        {tab === 'charge' && (
          <div style={{ marginTop: 20, maxWidth: 560 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <Btn variant={chargeMode === 'bulk' ? 'primary' : 'outline'} size="sm" onClick={() => { setChargeMode('bulk'); setBulkPreview(null); }}>Bulk by Scope</Btn>
              <Btn variant={chargeMode === 'single' ? 'primary' : 'outline'} size="sm" onClick={() => setChargeMode('single')}>Charge One Student</Btn>
            </div>

            {chargeMode === 'bulk' && (
              <div style={{ display: 'grid', gap: 14 }}>
                <Select label="Fee Type" value={bulkChargeForm.feeTypeId} onChange={e => { setBulkChargeForm(f => ({ ...f, feeTypeId: e.target.value })); setBulkPreview(null); }}
                  options={[{ value: '', label: '— Pick a fee type —' }, ...feeTypeOpts]} />
                <Select label="Apply to" value={bulkChargeForm.scope} onChange={e => { setBulkChargeForm(f => ({ ...f, scope: e.target.value })); setBulkPreview(null); }}
                  options={[{ value: 'all', label: 'All Students' }, { value: 'offline', label: 'Offline Only' }, { value: 'online', label: 'Online Only' }]} />
                {bulkPreview ? (
                  <div style={{ padding: '12px 16px', background: '#EEF4FA', borderRadius: 8 }}>
                    <div style={{ fontWeight: 600, color: '#0F2B4A' }}>Preview: {bulkPreview.count} student{bulkPreview.count === 1 ? '' : 's'} · Total ₹{Number(bulkPreview.total).toLocaleString()}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <Btn variant="outline" size="sm" onClick={() => setBulkPreview(null)}>Cancel</Btn>
                      <Btn size="sm" onClick={handleApplyBulkCharge} disabled={busy.bulk}>{busy.bulk ? 'Applying…' : 'Confirm & Apply'}</Btn>
                    </div>
                  </div>
                ) : (
                  <Btn variant="outline" onClick={handlePreviewBulkCharge} disabled={busy.preview}>{busy.preview ? '…' : 'Preview Recipients'}</Btn>
                )}
              </div>
            )}

            {chargeMode === 'single' && (
              <div style={{ display: 'grid', gap: 14 }}>
                {chargeStudent
                  ? <StudentChip s={chargeStudent} onClear={() => { setChargeStudent(null); setSingleChargeForm(f => ({ ...f, studentId: '' })); }} />
                  : <Btn variant="outline" onClick={() => openPicker('single')}>Select Student</Btn>}
                {chargeStudent && (
                  <>
                    <Select label="Fee Type" value={singleChargeForm.feeTypeId} onChange={e => setSingleChargeForm(f => ({ ...f, feeTypeId: e.target.value }))}
                      options={[{ value: '', label: '— Pick a fee type —' }, ...feeTypeOpts]} />
                    <Input label="Custom Amount (optional — leave blank to use fee type default)" type="number" value={singleChargeForm.customAmount} onChange={e => setSingleChargeForm(f => ({ ...f, customAmount: e.target.value }))} />
                    <Input label="Custom Description (optional)" value={singleChargeForm.customDescription} onChange={e => setSingleChargeForm(f => ({ ...f, customDescription: e.target.value }))} />
                    <Btn onClick={handleSingleCharge} disabled={busy.single}>{busy.single ? 'Applying…' : 'Apply Charge'}</Btn>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Student picker */}
      {pickerOpen && (
        <Modal title="Select Student" onClose={() => setPickerOpen(false)} wide>
          <SearchInput value={pickerSearch} onChange={setPickerSearch} placeholder="Search by name, ID or email..." style={{ marginBottom: 12 }} />
          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #DDE1E7', borderRadius: 8 }}>
            {(pickerStudents?.users || []).filter(u => u.studentProfileId).map(u => (
              <div key={u.id} onClick={() => handlePickStudent(u)} style={{ padding: '10px 12px', borderBottom: '1px solid #EEF4FA', cursor: 'pointer' }}>
                <div style={{ fontWeight: 500 }}>{u.firstName} {u.lastName}</div>
                <div style={{ fontSize: 12, color: '#7B8494' }}>{u.userIdDisplay} · {u.email}</div>
              </div>
            ))}
            {((pickerStudents?.users || []).filter(u => u.studentProfile).length === 0) && (
              <div style={{ padding: 16, textAlign: 'center', color: '#7B8494', fontSize: 13 }}>
                {pickerSearch ? 'No students match that search.' : 'Start typing to search students.'}
              </div>
            )}
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
