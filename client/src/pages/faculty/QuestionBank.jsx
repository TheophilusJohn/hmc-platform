import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Table, Modal, Input, Select } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const DIFF = [{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }];
const DIFF_COLORS = { easy: 'green', medium: 'amber', hard: 'red' };

export default function QuestionBank() {
  const [selectedSubject, setSelectedSubject] = useState('');
  const [open, setOpen] = useState(false);
  const EMPTY_QB_FORM = { question: '', type: 'MCQ', options: ['', '', '', ''], answer: '0', difficulty: 'medium', marks: 1, explanation: '' };
  const [form, setForm] = useState(EMPTY_QB_FORM);
  // Reset on modal close so reopening doesn't show the last (possibly partial)
  // entry, including a stale File reference.
  const closeQBModal = () => { setForm(EMPTY_QB_FORM); setOpen(false); };

  const { data: subjects } = useApi('/subjects?mine=true');
  const { data: questions, refetch } = useApi(selectedSubject ? `/subjects/${selectedSubject}/questions` : null, [selectedSubject]);

  const handleCreate = async () => {
    if (!form.question.trim()) { alert('Question text required.'); return; }
    try {
      await api.post(`/subjects/${selectedSubject}/questions`, form);
      setOpen(false);
      setForm(EMPTY_QB_FORM);
      refetch();
    } catch (e) {
      alert('Failed to add question: ' + (e?.response?.data?.error || e.message));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this question?')) return;
    try {
      await api.delete(`/subjects/${selectedSubject}/questions/${id}`);
      refetch();
    } catch (e) {
      alert('Failed to delete: ' + (e?.response?.data?.error || e.message));
    }
  };

  const cols = [
    { key: 'questionText', label: 'Question', render: (v, r) => {
      const text = v || r.question || '';
      return <span style={{ fontSize: 13 }}>{text.length > 80 ? text.slice(0, 80) + '…' : text}</span>;
    }},
    { key: 'type', label: 'Type', render: v => <Badge color="purple">{String(v || '').toLowerCase()}</Badge> },
    { key: 'difficulty', label: 'Diff.', render: v => {
      const lc = String(v || '').toLowerCase();
      return <Badge color={DIFF_COLORS[lc] || 'gray'}>{lc}</Badge>;
    }},
    { key: 'marks', label: 'Marks', render: v => v ?? 1 },
    { key: 'usedCount', label: 'Used', render: v => v || 0 },
    { key: 'id', label: '', render: id => <Btn size="sm" variant="danger" onClick={() => handleDelete(id)}>Delete</Btn> },
  ];

  return (
    <PageWrapper title="Question Bank" subtitle="Create and manage exam questions">
      <Card>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff', minWidth: 240 }}>
            <option value="">Select subject…</option>
            {(subjects?.subjects || []).map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select>
          {selectedSubject && <Btn onClick={() => setOpen(true)}>+ Add Question</Btn>}
        </div>
        {selectedSubject && <Table columns={cols} rows={questions?.questions || []} />}
        {selectedSubject && (!questions?.questions || questions.questions.length === 0) && (
          <div style={{ textAlign: 'center', color: '#7B8494', padding: 40 }}>No questions added yet for this subject.</div>
        )}
      </Card>

      {open && (
        <Modal title="Add Question" onClose={closeQBModal} wide>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Question</label>
              <textarea value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                style={{ width: '100%', minHeight: 80, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'DM Sans' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {/* QuestionType enum (schema): MCQ | WRITTEN | FILE_UPLOAD | SCRIPTURE.
                  Pre-fix had 'true_false' and 'short' which the server rejected
                  with a Prisma enum error. WRITTEN replaces both. */}
              <Select label="Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} options={[
                { value: 'MCQ', label: 'MCQ' },
                { value: 'WRITTEN', label: 'Written / Short Answer' },
                { value: 'FILE_UPLOAD', label: 'File Upload' },
                { value: 'SCRIPTURE', label: 'Scripture Reflection' },
              ]} />
              <Select label="Difficulty" value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))} options={DIFF} />
              <Input label="Marks" type="number" value={form.marks} onChange={e => setForm(f => ({ ...f, marks: e.target.value }))} />
            </div>
            {form.type === 'MCQ' && (
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 8 }}>Options (select correct answer)</label>
                {form.options.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input type="radio" name="answer" value={String(i)} checked={form.answer === String(i)} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} />
                    <input value={opt} onChange={e => { const opts = [...form.options]; opts[i] = e.target.value; setForm(f => ({ ...f, options: opts })); }}
                      placeholder={`Option ${i + 1}`}
                      style={{ flex: 1, padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13 }} />
                  </div>
                ))}
              </div>
            )}
            <Input label="Explanation (optional)" value={form.explanation} onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={closeQBModal}>Cancel</Btn>
            <Btn onClick={handleCreate}>Add Question</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
