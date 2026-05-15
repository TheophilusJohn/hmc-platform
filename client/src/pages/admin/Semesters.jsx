import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Modal, Input, Select, Table } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const STATUS_COLORS = { DRAFT: 'gray', ACTIVE: 'green', EXAM: 'purple', ARCHIVED: 'navy' };
const getVal = (v) => (v && typeof v === 'object' && 'target' in v) ? v.target.value : v;
const EMPTY = { name: '', type: 'ODD', academicYear: '2025-26', startDate: '', endDate: '', marksDeadline: '', batchId: '' };

export default function Semesters() {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editForm, setEditForm] = useState({ id: '', ...EMPTY });
  const { data, refetch } = useApi('/semesters');
  const { data: batches } = useApi('/programmes');
  const semesters = data?.semesters || [];
  // Lead with a placeholder so the first programme/batch isn't silently
  // auto-selected (the Select component picks options[0] when value is empty).
  const allBatches = [
    { value: '', label: 'Select a batch…' },
    ...(batches?.programmes || []).flatMap(p =>
      (p.batches || []).map(b => ({ value: b.id, label: `${p.name} – ${b.name}` }))
    ),
  ];

  const setField = (k, target = setForm) => (v) => target(f => ({ ...f, [k]: getVal(v) }));

  const handleCreate = async () => {
    if (!form.name || !form.batchId || !form.startDate || !form.endDate) {
      alert('Please fill name, batch, start date, and end date.');
      return;
    }
    if (new Date(form.endDate) <= new Date(form.startDate)) {
      alert('End date must be after start date.');
      return;
    }
    // academicYear must match YYYY-YY (e.g. 2025-26) — pre-fix any string passed.
    if (form.academicYear && !/^\d{4}-\d{2}$/.test(String(form.academicYear).trim())) {
      alert('Academic year must be in YYYY-YY format (e.g. 2025-26).');
      return;
    }
    try {
      await api.post('/semesters', form);
      setOpen(false); setForm(EMPTY); refetch();
    } catch (err) { alert('Failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleAction = async (id, action) => {
    try { await api.post(`/semesters/${id}/${action}`); refetch(); }
    catch (err) { alert('Failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleEdit = (row) => {
    setEditForm({
      id: row.id,
      name: row.name || '',
      type: row.type || 'ODD',
      academicYear: row.academicYear || '',
      startDate: row.startDate ? new Date(row.startDate).toISOString().slice(0, 10) : '',
      endDate: row.endDate ? new Date(row.endDate).toISOString().slice(0, 10) : '',
      marksDeadline: row.marksDeadline ? new Date(row.marksDeadline).toISOString().slice(0, 10) : '',
      batchId: row.batchId || row.batch?.id || '',
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      const { id, ...payload } = editForm;
      await api.put(`/semesters/${id}`, payload);
      setEditOpen(false); refetch();
    } catch (err) { alert('Save failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this semester? This cannot be undone. Use Archive if you just want to retire it.')) return;
    try { await api.delete(`/semesters/${id}`); refetch(); }
    catch (err) { alert('Delete failed: ' + (err.response?.data?.error || err.message)); }
  };

  const cols = [
    { key: 'name', label: 'Semester', render: (v, r) => (
      <div>
        <div style={{ fontWeight: 600, color: '#0F2B4A' }}>{v}</div>
        <div style={{ fontSize: 12, color: '#7B8494' }}>{r.batch?.name || r.batchName || ''}</div>
      </div>
    )},
    { key: 'type', label: 'Type', render: v => {
      const norm = String(v || '').toUpperCase();
      return <Badge color={norm === 'ODD' ? 'navy' : 'teal'}>{norm === 'ODD' ? 'Odd' : 'Even'}</Badge>;
    }},
    { key: 'academicYear', label: 'Year', render: v => <span style={{ fontSize: 13 }}>{v}</span> },
    { key: 'startDate', label: 'Dates', render: (v, r) => (
      <span style={{ fontSize: 12, color: '#5A6272' }}>
        {v ? new Date(v).toLocaleDateString('en-IN') : '—'} – {r.endDate ? new Date(r.endDate).toLocaleDateString('en-IN') : '—'}
      </span>
    )},
    { key: 'status', label: 'Status', render: v => {
      const norm = String(v || '').toUpperCase();
      return <Badge color={STATUS_COLORS[norm] || 'gray'}>{norm}</Badge>;
    }},
    { key: 'id', label: '', render: (id, r) => {
      const norm = String(r.status || '').toUpperCase();
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn size="sm" variant="outline" onClick={() => handleEdit(r)}>Edit</Btn>
          {norm === 'DRAFT' && <Btn size="sm" onClick={() => handleAction(id, 'activate')}>Activate</Btn>}
          {norm === 'ACTIVE' && <Btn size="sm" variant="outline" onClick={() => handleAction(id, 'archive')}>Archive</Btn>}
          {(norm === 'DRAFT' || norm === 'ARCHIVED') && <Btn size="sm" variant="danger" onClick={() => handleDelete(id)}>Delete</Btn>}
        </div>
      );
    }},
  ];

  return (
    <PageWrapper title="Semesters" subtitle="Academic semester management">
      <Card action={<Btn onClick={() => setOpen(true)}>+ New Semester</Btn>}>
        <Table columns={cols} rows={semesters} />
      </Card>

      {open && (
        <Modal title="Create Semester" onClose={() => setOpen(false)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Semester Name" value={form.name} onChange={setField('name')} placeholder="Odd Semester 2025" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Select label="Type" value={form.type} onChange={setField('type')} options={[{ value: 'ODD', label: 'Odd (Jun–Nov)' }, { value: 'EVEN', label: 'Even (Jan–May)' }]} />
              <Input label="Academic Year" value={form.academicYear} onChange={setField('academicYear')} placeholder="2025-26" />
            </div>
            <Select label="Batch" value={form.batchId} onChange={setField('batchId')} options={allBatches} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Start Date" type="date" value={form.startDate} onChange={setField('startDate')} />
              <Input label="End Date" type="date" value={form.endDate} onChange={setField('endDate')} />
            </div>
            <Input label="Marks Submission Deadline" type="date" value={form.marksDeadline} onChange={setField('marksDeadline')} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn onClick={handleCreate}>Create</Btn>
          </div>
        </Modal>
      )}

      {editOpen && (
        <Modal title="Edit Semester" onClose={() => setEditOpen(false)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Semester Name" value={editForm.name} onChange={setField('name', setEditForm)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Select label="Type" value={editForm.type} onChange={setField('type', setEditForm)} options={[{ value: 'ODD', label: 'Odd' }, { value: 'EVEN', label: 'Even' }]} />
              <Input label="Academic Year" value={editForm.academicYear} onChange={setField('academicYear', setEditForm)} />
            </div>
            <Select label="Batch" value={editForm.batchId} onChange={setField('batchId', setEditForm)} options={allBatches} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Start Date" type="date" value={editForm.startDate} onChange={setField('startDate', setEditForm)} />
              <Input label="End Date" type="date" value={editForm.endDate} onChange={setField('endDate', setEditForm)} />
            </div>
            <Input label="Marks Submission Deadline" type="date" value={editForm.marksDeadline} onChange={setField('marksDeadline', setEditForm)} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setEditOpen(false)}>Cancel</Btn>
            <Btn onClick={handleSaveEdit}>Save Changes</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
