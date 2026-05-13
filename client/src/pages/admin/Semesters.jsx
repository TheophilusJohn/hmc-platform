import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Modal, Input, Select, Table } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const STATUS_COLORS = { draft: 'gray', active: 'green', exam: 'purple', archived: 'navy' };

export default function Semesters() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'odd', academicYear: '2025-26', startDate: '', endDate: '', marksDeadline: '', batchId: '' });
  const { data, refetch } = useApi('/semesters');
  const { data: batches } = useApi('/programmes');
  const semesters = data?.semesters || [];
  const allBatches = (batches?.programmes || []).flatMap(p => (p.batches || []).map(b => ({ value: b.id, label: `${p.name} – ${b.name}` })));

  const handleCreate = async () => {
    await api.post('/semesters', form);
    setOpen(false); refetch();
  };

  const handleAction = async (id, action) => {
    await api.post(`/semesters/${id}/${action}`);
    refetch();
  };

  const cols = [
    { key: 'name', label: 'Semester', render: (v, r) => <div><div style={{ fontWeight: 600, color: '#0F2B4A' }}>{v}</div><div style={{ fontSize: 12, color: '#7B8494' }}>{r.batchName}</div></div> },
    { key: 'type', label: 'Type', render: v => <Badge color={v === 'odd' ? 'navy' : 'teal'}>{v === 'odd' ? 'Odd' : 'Even'}</Badge> },
    { key: 'academicYear', label: 'Year', render: v => <span style={{ fontSize: 13 }}>{v}</span> },
    { key: 'startDate', label: 'Dates', render: (v, r) => <span style={{ fontSize: 12, color: '#5A6272' }}>{new Date(v).toLocaleDateString('en-IN')} – {new Date(r.endDate).toLocaleDateString('en-IN')}</span> },
    { key: 'marksDeadline', label: 'Marks Deadline', render: v => v ? <span style={{ fontSize: 12 }}>{new Date(v).toLocaleDateString('en-IN')}</span> : '—' },
    { key: 'status', label: 'Status', render: v => <Badge color={STATUS_COLORS[v]}>{v}</Badge> },
    { key: 'id', label: '', render: (id, r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        {r.status === 'draft' && <Btn size="sm" onClick={() => handleAction(id, 'activate')}>Activate</Btn>}
        {r.status === 'active' && <Btn size="sm" variant="outline" onClick={() => handleAction(id, 'archive')}>Archive</Btn>}
        <Btn size="sm" variant="ghost" onClick={() => handleAction(id, 'copy-setup')}>Copy Setup</Btn>
      </div>
    )},
  ];

  return (
    <PageWrapper title="Semesters" subtitle="Academic semester management">
      <Card action={<Btn onClick={() => setOpen(true)}>+ New Semester</Btn>}>
        <Table columns={cols} rows={semesters} />
      </Card>

      {open && (
        <Modal title="Create Semester" onClose={() => setOpen(false)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Semester Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Odd Semester 2025" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Select label="Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} options={[{ value: 'odd', label: 'Odd (Jun–Nov)' }, { value: 'even', label: 'Even (Jan–May)' }]} />
              <Input label="Academic Year" value={form.academicYear} onChange={e => setForm(f => ({ ...f, academicYear: e.target.value }))} placeholder="2025-26" />
            </div>
            <Select label="Batch" value={form.batchId} onChange={e => setForm(f => ({ ...f, batchId: e.target.value }))} options={allBatches} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Start Date" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              <Input label="End Date" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
            <Input label="Marks Submission Deadline" type="date" value={form.marksDeadline} onChange={e => setForm(f => ({ ...f, marksDeadline: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn onClick={handleCreate}>Create</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
