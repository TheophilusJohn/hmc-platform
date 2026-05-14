import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageWrapper, Card, Btn, Badge, Modal, Input, Select } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const CONTENT_TYPES = [
  { value: 'lecture', label: '📄 Lecture Notes', accept: '.pdf,.doc,.docx' },
  { value: 'assignment', label: '✏️ Assignment', accept: '.pdf,.doc,.docx' },
  { value: 'video', label: '🎬 Video', accept: '.mp4,.mkv,.mov' },
  { value: 'link', label: '🔗 External Link', accept: null },
  { value: 'material', label: '📦 Study Material', accept: '.pdf,.zip' },
];

export default function CourseContent() {
  const [params] = useSearchParams();
  const [selectedSubject, setSelectedSubject] = useState(params.get('subject') || '');
  const [open, setOpen] = useState(false);
  const EMPTY_CC_FORM = { title: '', type: 'lecture', description: '', week: 1, url: '', file: null, visibleFrom: '', deadline: '' };
  const [form, setForm] = useState(EMPTY_CC_FORM);
  // Reset on close — File references are heap objects; leaving them around in
  // state pins the upload buffer until garbage collection.
  const closeCCModal = () => { setForm(EMPTY_CC_FORM); setOpen(false); };

  const { data: subjects } = useApi('/subjects?mine=true');
  const { data: content, refetch } = useApi(selectedSubject ? `/subjects/${selectedSubject}/content` : null, [selectedSubject]);

  const contentList = content?.content || [];

  const handleUpload = async () => {
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v && k !== 'file') fd.append(k, v); });
    if (form.file) fd.append('file', form.file);
    await api.post(`/subjects/${selectedSubject}/content`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    setOpen(false);
    setForm(EMPTY_CC_FORM);
    refetch();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this content item?')) return;
    await api.delete(`/subjects/${selectedSubject}/content/${id}`);
    refetch();
  };

  const grouped = contentList.reduce((acc, c) => {
    const w = c.week || 0;
    if (!acc[w]) acc[w] = [];
    acc[w].push(c);
    return acc;
  }, {});

  const TYPE_ICONS = { lecture: '📄', assignment: '✏️', video: '🎬', link: '🔗', material: '📦' };
  const TYPE_COLORS = { lecture: 'navy', assignment: 'purple', video: 'teal', link: 'amber', material: 'green' };

  return (
    <PageWrapper title="Course Content" subtitle="Manage lectures, assignments and materials">
      <Card>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, background: '#fff', minWidth: 240 }}>
            <option value="">Select subject…</option>
            {(subjects?.subjects || []).map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select>
          {selectedSubject && <Btn onClick={() => setOpen(true)}>+ Add Content</Btn>}
        </div>

        {selectedSubject && (
          <div>
            {Object.keys(grouped).sort((a, b) => Number(a) - Number(b)).map(week => (
              <div key={week} style={{ marginBottom: 24 }}>
                <h4 style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0F2B4A', margin: '0 0 10px', borderBottom: '2px solid #EEF4FA', paddingBottom: 6 }}>
                  {week === '0' ? 'General' : `Week ${week}`}
                </h4>
                {grouped[week].map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, marginBottom: 6, background: '#fff' }}>
                    <span style={{ fontSize: 20 }}>{TYPE_ICONS[c.type] || '📄'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{c.title}</div>
                      {c.description && <div style={{ fontSize: 12, color: '#7B8494', marginTop: 2 }}>{c.description}</div>}
                      {c.deadline && <div style={{ fontSize: 11, color: '#C9920A', marginTop: 2 }}>Due: {new Date(c.deadline).toLocaleDateString('en-IN')}</div>}
                    </div>
                    <Badge color={TYPE_COLORS[c.type] || 'gray'}>{c.type}</Badge>
                    <Badge color={c.visible ? 'green' : 'gray'}>{c.visible ? 'Visible' : 'Hidden'}</Badge>
                    {(c.fileUrl || c.url) ? (
                      <a href={c.fileUrl || c.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#0F2B4A', textDecoration: 'underline' }}>View</a>
                    ) : (
                      <span style={{ fontSize: 12, color: '#7B8494' }}>—</span>
                    )}
                    <button onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', fontSize: 12 }}>Delete</button>
                  </div>
                ))}
              </div>
            ))}
            {contentList.length === 0 && (
              <div style={{ textAlign: 'center', color: '#7B8494', padding: 40 }}>No content uploaded yet.</div>
            )}
          </div>
        )}
      </Card>

      {open && (
        <Modal title="Add Content" onClose={closeCCModal}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <Select label="Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, file: null, url: '' }))} options={CONTENT_TYPES} />
            <Input label="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <Input label="Week" type="number" value={form.week} onChange={e => setForm(f => ({ ...f, week: e.target.value }))} />
            {form.type === 'link' ? (
              <Input label="URL" type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
            ) : (
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>File</label>
                <input type="file" accept={CONTENT_TYPES.find(t => t.value === form.type)?.accept} onChange={e => setForm(f => ({ ...f, file: e.target.files[0] }))} />
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Visible From" type="datetime-local" value={form.visibleFrom} onChange={e => setForm(f => ({ ...f, visibleFrom: e.target.value }))} />
              {form.type === 'assignment' && <Input label="Deadline" type="datetime-local" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={closeCCModal}>Cancel</Btn>
            <Btn onClick={handleUpload}>Upload</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
