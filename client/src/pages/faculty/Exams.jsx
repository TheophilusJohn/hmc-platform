import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageWrapper, Card, Btn, Badge, Table, Modal, Input, Select, Tabs } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const EXAM_TYPES = [{ value: 'mcq', label: 'MCQ (Auto-graded)' }, { value: 'written', label: 'Written Essay' }, { value: 'file_upload', label: 'File Upload' }, { value: 'hybrid', label: 'Hybrid (MCQ + Written)' }];

export default function Exams() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState('exams');
  const [selectedSubject, setSelectedSubject] = useState(params.get('subject') || '');
  const [examOpen, setExamOpen] = useState(false);
  const [gradingExam, setGradingExam] = useState(params.get('exam') || null);
  const [examForm, setExamForm] = useState({ title: '', type: 'mcq', subjectId: '', totalMarks: 100, duration: 60, startTime: '', endTime: '', instructions: '', allowedAttempts: 1, shuffleQuestions: true, showResultAfter: false });

  const { data: subjects } = useApi('/subjects?mine=true');
  const { data: exams, refetch } = useApi(selectedSubject ? `/subjects/${selectedSubject}/exams` : '/exams?mine=true');
  const { data: submissions, refetch: refetchSubs } = useApi(gradingExam ? `/exams/${gradingExam}/submissions` : null, [gradingExam]);
  const examList = exams?.exams || [];

  const handleCreateExam = async () => {
    await api.post('/exams', { ...examForm, subjectId: selectedSubject || examForm.subjectId });
    setExamOpen(false); refetch();
  };

  const handleGradeSubmission = async (subId, marks, feedback) => {
    await api.post(`/submissions/${subId}/grade`, { marks, feedback });
    refetchSubs();
  };

  const cols = [
    { key: 'title', label: 'Exam', render: (v, r) => <div><div style={{ fontWeight: 500 }}>{v}</div><div style={{ fontSize: 12, color: '#7B8494' }}>{r.subjectName}</div></div> },
    { key: 'type', label: 'Type', render: v => <Badge color="purple">{v}</Badge> },
    { key: 'totalMarks', label: 'Marks', render: v => v },
    { key: 'duration', label: 'Duration', render: v => `${v} min` },
    { key: 'startTime', label: 'Starts', render: v => v ? new Date(v).toLocaleDateString('en-IN') : 'Not set' },
    { key: 'status', label: 'Status', render: v => <Badge color={v === 'active' ? 'green' : v === 'draft' ? 'gray' : 'teal'}>{v}</Badge> },
    { key: 'submittedCount', label: 'Submitted', render: (v, r) => `${v || 0}/${r.enrolledCount || 0}` },
    { key: 'id', label: '', render: (id, r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Btn size="sm" variant="outline" onClick={() => setGradingExam(id)}>Grade</Btn>
        {r.status === 'draft' && <Btn size="sm" onClick={() => api.post(`/exams/${id}/publish`).then(refetch)}>Publish</Btn>}
      </div>
    )},
  ];

  return (
    <PageWrapper title="Exams & Grading" subtitle="Create exams, grade submissions">
      <Card>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'exams', label: 'Exams' }, { value: 'grading', label: 'Grade Submissions' }]} />

        {tab === 'exams' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                <option value="">All subjects</option>
                {(subjects?.subjects || []).map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </select>
              <Btn onClick={() => setExamOpen(true)}>+ New Exam</Btn>
            </div>
            <Table columns={cols} rows={examList} />
          </div>
        )}

        {tab === 'grading' && (
          <GradingPanel examId={gradingExam} setExamId={setGradingExam} exams={examList} subjects={subjects?.subjects || []} onGrade={handleGradeSubmission} />
        )}
      </Card>

      {examOpen && (
        <Modal title="Create Exam" onClose={() => setExamOpen(false)} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <Input label="Exam Title" value={examForm.title} onChange={e => setExamForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <Select label="Type" value={examForm.type} onChange={e => setExamForm(f => ({ ...f, type: e.target.value }))} options={EXAM_TYPES} />
            <Select label="Subject" value={examForm.subjectId || selectedSubject} onChange={e => setExamForm(f => ({ ...f, subjectId: e.target.value }))} options={(subjects?.subjects || []).map(s => ({ value: s.id, label: `${s.code} — ${s.name}` }))} />
            <Input label="Total Marks" type="number" value={examForm.totalMarks} onChange={e => setExamForm(f => ({ ...f, totalMarks: e.target.value }))} />
            <Input label="Duration (minutes)" type="number" value={examForm.duration} onChange={e => setExamForm(f => ({ ...f, duration: e.target.value }))} />
            <Input label="Start Time" type="datetime-local" value={examForm.startTime} onChange={e => setExamForm(f => ({ ...f, startTime: e.target.value }))} />
            <Input label="End Time" type="datetime-local" value={examForm.endTime} onChange={e => setExamForm(f => ({ ...f, endTime: e.target.value }))} />
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Instructions</label>
              <textarea value={examForm.instructions} onChange={e => setExamForm(f => ({ ...f, instructions: e.target.value }))}
                style={{ width: '100%', minHeight: 80, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'DM Sans' }} />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={examForm.shuffleQuestions} onChange={e => setExamForm(f => ({ ...f, shuffleQuestions: e.target.checked }))} /> Shuffle Questions</label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={examForm.showResultAfter} onChange={e => setExamForm(f => ({ ...f, showResultAfter: e.target.checked }))} /> Show Result Immediately</label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setExamOpen(false)}>Cancel</Btn>
            <Btn onClick={handleCreateExam}>Create Exam</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}

function GradingPanel({ examId, setExamId, exams, subjects, onGrade }) {
  const [selectedId, setSelectedId] = useState(examId || '');
  const [selectedSub, setSelectedSub] = useState(null);
  const [marks, setMarks] = useState('');
  const [feedback, setFeedback] = useState('');
  const { data: submissions } = useApi(selectedId ? `/exams/${selectedId}/submissions` : null, [selectedId]);

  const subs = submissions?.submissions || [];
  const pending = subs.filter(s => s.status === 'submitted');
  const graded = subs.filter(s => s.status === 'graded');

  const handleSubmitGrade = async () => {
    await onGrade(selectedSub.id, marks, feedback);
    setSelectedSub(null); setMarks(''); setFeedback('');
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setExamId(e.target.value); }}
          style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff', minWidth: 280 }}>
          <option value="">Select exam to grade…</option>
          {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>

      {selectedId && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <h4 style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0F2B4A', margin: '0 0 10px' }}>Pending ({pending.length})</h4>
            {pending.map(s => (
              <div key={s.id} onClick={() => { setSelectedSub(s); setMarks(''); setFeedback(''); }}
                style={{ padding: '10px 12px', border: `1px solid ${selectedSub?.id === s.id ? '#0F2B4A' : '#DDE1E7'}`, borderRadius: 8, marginBottom: 6, cursor: 'pointer', background: selectedSub?.id === s.id ? '#EEF4FA' : '#fff' }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{s.studentName}</div>
                <div style={{ fontSize: 12, color: '#7B8494' }}>Submitted {new Date(s.submittedAt).toLocaleTimeString('en-IN')}</div>
                {s.hasSimilarity && <Badge color="red" style={{ marginTop: 4, fontSize: 10 }}>Similarity Alert</Badge>}
              </div>
            ))}
            {pending.length === 0 && <div style={{ color: '#7B8494', fontSize: 13 }}>All graded!</div>}
          </div>

          <div>
            {selectedSub ? (
              <div>
                <h4 style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0F2B4A', margin: '0 0 10px' }}>Grading: {selectedSub.studentName}</h4>
                <div style={{ padding: '12px', background: '#F8F9FA', borderRadius: 8, fontSize: 13, marginBottom: 14, maxHeight: 200, overflowY: 'auto', color: '#3D4450', whiteSpace: 'pre-wrap' }}>
                  {selectedSub.answers ? JSON.stringify(selectedSub.answers, null, 2) : selectedSub.writtenAnswer || 'No answer provided'}
                </div>
                {selectedSub.hasSimilarity && (
                  <div style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: 6, fontSize: 12, color: '#991B1B', marginBottom: 12 }}>
                    ⚠️ Similarity score: {selectedSub.similarityScore}% — flagged for review
                  </div>
                )}
                <Input label={`Marks (out of ${submissions?.exam?.totalMarks || 100})`} type="number" value={marks} onChange={e => setMarks(e.target.value)} style={{ marginBottom: 12 }} />
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Feedback (optional)</label>
                  <textarea value={feedback} onChange={e => setFeedback(e.target.value)}
                    style={{ width: '100%', minHeight: 80, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'DM Sans' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="outline" onClick={() => setSelectedSub(null)}>Cancel</Btn>
                  <Btn onClick={handleSubmitGrade} disabled={!marks}>Submit Grade</Btn>
                </div>
              </div>
            ) : (
              <div style={{ color: '#7B8494', fontSize: 13, padding: '20px 0' }}>Select a submission from the left to grade it.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
