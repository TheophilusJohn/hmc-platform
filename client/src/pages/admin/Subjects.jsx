import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Table, SearchInput, Modal, Input, Select } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

export default function Subjects() {
  const [search, setSearch] = useState('');
  const [semFilter, setSemFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', creditHours: 3, semesterId: '', batchId: '', facultyId: '', eseMarks: 70, iaMarks: 30, passmark: 40, examMode: 'offline', type: 'core' });

  const { data, refetch } = useApi(`/subjects?search=${search}&semesterId=${semFilter}`);
  const { data: semesters } = useApi('/semesters');
  const { data: faculty } = useApi('/users?role=FACULTY,TEACHER_ADMIN');
  const { data: batches } = useApi('/programmes');

  const subjects = data?.subjects || [];
  const allBatches = (batches?.programmes || []).flatMap(p => (p.batches || []).map(b => ({ value: b.id, label: `${p.name} – ${b.name}` })));

  const handleCreate = async () => {
    await api.post('/subjects', form);
    setOpen(false); refetch();
  };

  const cols = [
    { key: 'code', label: 'Code', render: v => <code style={{ background: '#EEF4FA', padding: '2px 6px', borderRadius: 4, fontSize: 12, color: '#0F2B4A' }}>{v}</code> },
    { key: 'name', label: 'Subject', render: (v, r) => <div><div style={{ fontWeight: 500 }}>{v}</div><div style={{ fontSize: 12, color: '#7B8494' }}>{r.batchName}</div></div> },
    { key: 'faculty', label: 'Faculty', render: v => <span style={{ fontSize: 13 }}>{v || '—'}</span> },
    { key: 'creditHours', label: 'Credits', render: v => <Badge color="navy">{v}</Badge> },
    { key: 'examMode', label: 'Mode', render: v => <Badge color={v === 'online' ? 'teal' : 'navy'}>{v}</Badge> },
    { key: 'type', label: 'Type', render: v => <Badge color={v === 'elective' ? 'purple' : 'gray'}>{v}</Badge> },
    { key: 'status', label: 'Status', render: v => <Badge color={v === 'active' ? 'green' : 'gray'}>{v || 'draft'}</Badge> },
    { key: 'id', label: '', render: id => <Btn size="sm" variant="ghost" onClick={async () => { await api.post(`/subjects/${id}/archive`); refetch(); }}>Archive</Btn> }
  ];

  return (
    <PageWrapper title="Subjects" subtitle="Subject catalogue and assignments">
      <Card action={<Btn onClick={() => setOpen(true)}>+ Add Subject</Btn>}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search subjects..." />
          <select value={semFilter} onChange={e => setSemFilter(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, color: '#5A6272', background: '#fff' }}>
            <option value="">All Semesters</option>
            {(semesters?.semesters || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <Table columns={cols} rows={subjects} />
      </Card>

      {open && (
        <Modal title="Add Subject" onClose={() => setOpen(false)} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input label="Subject Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Input label="Code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. BTH301" />
            <Select label="Semester" value={form.semesterId} onChange={e => setForm(f => ({ ...f, semesterId: e.target.value }))} options={(semesters?.semesters || []).map(s => ({ value: s.id, label: s.name }))} />
            <Select label="Batch" value={form.batchId} onChange={e => setForm(f => ({ ...f, batchId: e.target.value }))} options={allBatches} />
            <Select label="Faculty" value={form.facultyId} onChange={e => setForm(f => ({ ...f, facultyId: e.target.value }))} options={(faculty?.users || []).map(u => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))} />
            <Input label="Credit Hours" type="number" value={form.creditHours} onChange={e => setForm(f => ({ ...f, creditHours: e.target.value }))} />
            <Input label="ESE Marks" type="number" value={form.eseMarks} onChange={e => setForm(f => ({ ...f, eseMarks: e.target.value }))} />
            <Input label="IA Marks" type="number" value={form.iaMarks} onChange={e => setForm(f => ({ ...f, iaMarks: e.target.value }))} />
            <Input label="Pass Mark" type="number" value={form.passmark} onChange={e => setForm(f => ({ ...f, passmark: e.target.value }))} />
            <Select label="Exam Mode" value={form.examMode} onChange={e => setForm(f => ({ ...f, examMode: e.target.value }))} options={[{ value: 'offline', label: 'Offline' }, { value: 'online', label: 'Online' }]} />
            <Select label="Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} options={[{ value: 'core', label: 'Core' }, { value: 'elective', label: 'Elective' }]} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn onClick={handleCreate}>Create Subject</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
