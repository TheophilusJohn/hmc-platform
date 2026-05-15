import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Table, SearchInput, Modal, Input, Select } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const getVal = (v) => (v && typeof v === 'object' && 'target' in v) ? v.target.value : v;
const EMPTY = {
  name: '', code: '', creditHours: 3,
  semesterId: '', batchId: '', facultyId: '',
  eseMarks: 70, iaMarks: 30, passMark: 40,
  examMode: 'OFFLINE', type: 'CORE',
};

export default function Subjects() {
  const [search, setSearch] = useState('');
  const [semFilter, setSemFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editForm, setEditForm] = useState({ id: '', ...EMPTY });

  const { data, refetch } = useApi(`/subjects?search=${search}&semesterId=${semFilter}`);
  const { data: semesters } = useApi('/semesters');
  const { data: faculty } = useApi('/users?role=FACULTY,TEACHER_ADMIN');
  const { data: batches } = useApi('/programmes');

  const subjects = data?.subjects || [];
  const allBatches = (batches?.programmes || []).flatMap(p =>
    (p.batches || []).map(b => ({ value: b.id, label: `${p.name} – ${b.name}` }))
  );
  // Subject.facultyId references FacultyProfile.id, NOT User.id. The /users
  // endpoint returns a flat shape with `facultyProfileId`; only users that
  // actually have a faculty profile are eligible.
  const facultyOptions = [
    { value: '', label: '— Unassigned —' },
    ...(faculty?.users || [])
      .filter(u => u.facultyProfileId)
      .map(u => {
        const fn = u.firstName || '';
        const ln = u.lastName || '';
        return {
          value: u.facultyProfileId,
          label: [fn, ln].filter(Boolean).join(' ') || u.email || u.userIdDisplay,
        };
      }),
  ];

  const setField = (k, target = setForm) => (v) => target(f => ({ ...f, [k]: getVal(v) }));

  // Coerce number-typed inputs to integers — onChange stores the raw string from
  // the input element, and Prisma rejects strings on Int columns with a cryptic
  // validation error.
  const toNumeric = (f) => ({
    ...f,
    creditHours: parseInt(f.creditHours, 10) || 0,
    eseMarks: parseInt(f.eseMarks, 10) || 0,
    iaMarks: parseInt(f.iaMarks, 10) || 0,
    passMark: parseInt(f.passMark, 10) || 0,
    totalMarks: (parseInt(f.eseMarks, 10) || 0) + (parseInt(f.iaMarks, 10) || 0),
  });

  const validateMarks = (f) => {
    const ese = parseInt(f.eseMarks, 10) || 0;
    const ia = parseInt(f.iaMarks, 10) || 0;
    const pass = parseInt(f.passMark, 10) || 0;
    if (ese < 0 || ia < 0 || pass < 0) return 'Marks cannot be negative.';
    if (pass > (ese + ia)) return `Pass mark (${pass}) cannot exceed total marks (${ese + ia} = ESE + IA).`;
    return null;
  };

  const handleCreate = async () => {
    if (!form.name || !form.code || !form.semesterId || !form.batchId) {
      alert('Please fill: Subject Name, Code, Semester, and Batch.');
      return;
    }
    const marksErr = validateMarks(form);
    if (marksErr) { alert(marksErr); return; }
    try {
      await api.post('/subjects', toNumeric(form));
      setOpen(false); setForm(EMPTY); refetch();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleEdit = (row) => {
    setEditForm({
      id: row.id,
      name: row.name || '',
      code: row.code || '',
      creditHours: row.creditHours || 3,
      semesterId: row.semesterId || row.semester?.id || '',
      batchId: row.batchId || row.batch?.id || '',
      facultyId: row.facultyId || row.faculty?.id || '',
      eseMarks: row.eseMarks || 70,
      iaMarks: row.iaMarks || 30,
      passMark: row.passMark || 40,
      examMode: row.examMode || 'OFFLINE',
      type: row.type || 'CORE',
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const marksErr = validateMarks(editForm);
    if (marksErr) { alert(marksErr); return; }
    try {
      const { id, ...payload } = editForm;
      await api.put(`/subjects/${id}`, toNumeric(payload));
      setEditOpen(false); refetch();
    } catch (err) { alert('Save failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleArchive = async (id) => {
    if (!confirm('Archive this subject?')) return;
    try { await api.post(`/subjects/${id}/archive`); refetch(); }
    catch (err) { alert('Archive failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Permanently delete this subject? Cannot be undone. Use Archive instead if any data exists.')) return;
    try { await api.delete(`/subjects/${id}`); refetch(); }
    catch (err) { alert('Delete failed: ' + (err.response?.data?.error || err.message)); }
  };

  const cols = [
    { key: 'code', label: 'Code', render: v => <code style={{ background: '#EEF4FA', padding: '2px 6px', borderRadius: 4, fontSize: 12, color: '#0F2B4A' }}>{v}</code> },
    { key: 'name', label: 'Subject', render: (v, r) => (
      <div>
        <div style={{ fontWeight: 500 }}>{v}</div>
        <div style={{ fontSize: 12, color: '#7B8494' }}>{r.batch?.name || r.batchName || ''}</div>
      </div>
    )},
    { key: 'faculty', label: 'Faculty', render: (v, r) => {
      const f = r.faculty;
      const name = f ? [f.firstName, f.lastName].filter(Boolean).join(' ') : (typeof v === 'string' ? v : '');
      return <span style={{ fontSize: 13 }}>{name || '—'}</span>;
    }},
    { key: 'creditHours', label: 'Credits', render: v => <Badge color="navy">{v}</Badge> },
    { key: 'examMode', label: 'Mode', render: v => <Badge color={String(v).toUpperCase() === 'ONLINE' ? 'teal' : 'navy'}>{String(v || '').toUpperCase()}</Badge> },
    { key: 'status', label: 'Status', render: v => {
      const n = String(v || 'active').toLowerCase();
      return <Badge color={n === 'active' ? 'green' : 'gray'}>{n}</Badge>;
    }},
    { key: 'id', label: '', render: (id, r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Btn size="sm" variant="outline" onClick={() => handleEdit(r)}>Edit</Btn>
        <Btn size="sm" variant="ghost" onClick={() => handleArchive(id)}>Archive</Btn>
        <Btn size="sm" variant="danger" onClick={() => handleDelete(id)}>Delete</Btn>
      </div>
    )},
  ];

  const subjectFields = (f, setter) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <Input label="Subject Name" value={f.name} onChange={setField('name', setter)} />
      <Input label="Code" value={f.code} onChange={setField('code', setter)} placeholder="e.g. BTH301" />
      <Select label="Semester" value={f.semesterId} onChange={setField('semesterId', setter)}
        options={(semesters?.semesters || []).map(s => ({ value: s.id, label: s.name }))} />
      <Select label="Batch" value={f.batchId} onChange={setField('batchId', setter)} options={allBatches} />
      <Select label="Faculty" value={f.facultyId} onChange={setField('facultyId', setter)} options={facultyOptions} />
      <Input label="Credit Hours" type="number" value={f.creditHours} onChange={setField('creditHours', setter)} />
      <Input label="ESE Marks" type="number" value={f.eseMarks} onChange={setField('eseMarks', setter)} />
      <Input label="IA Marks" type="number" value={f.iaMarks} onChange={setField('iaMarks', setter)} />
      <Input label="Pass Mark" type="number" value={f.passMark} onChange={setField('passMark', setter)} />
      <Select label="Exam Mode" value={f.examMode} onChange={setField('examMode', setter)}
        options={[{ value: 'OFFLINE', label: 'Offline' }, { value: 'ONLINE', label: 'Online' }]} />
      <Select label="Type" value={f.type} onChange={setField('type', setter)}
        options={[{ value: 'CORE', label: 'Core' }, { value: 'ELECTIVE', label: 'Elective' }]} />
    </div>
  );

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
          {subjectFields(form, setForm)}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn onClick={handleCreate}>Create Subject</Btn>
          </div>
        </Modal>
      )}

      {editOpen && (
        <Modal title="Edit Subject" onClose={() => setEditOpen(false)} wide>
          {subjectFields(editForm, setEditForm)}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setEditOpen(false)}>Cancel</Btn>
            <Btn onClick={handleSaveEdit}>Save Changes</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
