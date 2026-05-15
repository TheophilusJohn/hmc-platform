import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageWrapper, Card, Btn, Badge, Table, Modal, Input, Select, Tabs } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const EXAM_TYPES = [
  { value: 'IA',  label: 'IA (Internal Assessment)' },
  { value: 'ESE', label: 'ESE (End Semester Exam)' },
];
const EXAM_MODES = [
  { value: 'OFFLINE', label: 'Offline (In-person)' },
  { value: 'ONLINE',  label: 'Online' },
];
const ANSWER_FORMATS = [
  { value: 'MCQ',         label: 'MCQ (Auto-graded)' },
  { value: 'WRITTEN',     label: 'Written / Essay' },
  { value: 'FILE_UPLOAD', label: 'File Upload' },
  { value: 'MIXED',       label: 'Mixed (MCQ + Written)' },
];

export default function Exams() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState('exams');
  const [selectedSubject, setSelectedSubject] = useState(params.get('subject') || '');
  const [examOpen, setExamOpen] = useState(false);
  const [gradingExam, setGradingExam] = useState(params.get('exam') || null);
  const EMPTY_EXAM_FORM = {
    title: '', type: 'IA', mode: 'OFFLINE', answerFormat: 'MCQ',
    subjectId: '', totalMarks: 100, passMark: 40, durationMins: 60,
    startDatetime: '', endDatetime: '', maxAttempts: 1,
  };
  const [examForm, setExamForm] = useState(EMPTY_EXAM_FORM);
  // Reset the form when the modal closes so reopening doesn't show stale
  // data from a previous (perhaps abandoned) entry.
  const closeExamModal = () => { setExamForm(EMPTY_EXAM_FORM); setExamOpen(false); };

  const { data: subjects } = useApi('/subjects?mine=true');
  const { data: exams, refetch } = useApi(selectedSubject ? `/exams?subjectId=${selectedSubject}` : '/exams', [selectedSubject]);
  const examList = exams?.exams || [];

  const handleCreateExam = async () => {
    if (!examForm.title.trim()) { alert('Title required'); return; }
    const subjId = selectedSubject || examForm.subjectId;
    if (!subjId) { alert('Subject required'); return; }
    // Validate datetimes BEFORE calling toISOString() — pre-fix an invalid
    // datetime string threw RangeError outside the try/catch and crashed the handler.
    let startISO = null, endISO = null;
    if (examForm.startDatetime) {
      const s = new Date(examForm.startDatetime);
      if (isNaN(s.getTime())) { alert('Start date/time is invalid.'); return; }
      startISO = s.toISOString();
    }
    if (examForm.endDatetime) {
      const e = new Date(examForm.endDatetime);
      if (isNaN(e.getTime())) { alert('End date/time is invalid.'); return; }
      endISO = e.toISOString();
    }
    if (startISO && endISO && new Date(endISO) <= new Date(startISO)) {
      alert('End date/time must be after start date/time.');
      return;
    }
    const payload = {
      title: examForm.title,
      type: examForm.type,
      mode: examForm.mode,
      answerFormat: examForm.answerFormat,
      subjectId: subjId,
      totalMarks: parseInt(examForm.totalMarks) || 100,
      passMark: parseInt(examForm.passMark) || 40,
      durationMins: parseInt(examForm.durationMins) || 60,
      maxAttempts: parseInt(examForm.maxAttempts) || 1,
      startDatetime: startISO,
      endDatetime: endISO,
    };
    try {
      await api.post('/exams', payload);
      setExamOpen(false);
      setExamForm(EMPTY_EXAM_FORM);
      setExamForm({ title: '', type: 'IA', mode: 'OFFLINE', answerFormat: 'MCQ', subjectId: '', totalMarks: 100, passMark: 40, durationMins: 60, startDatetime: '', endDatetime: '', maxAttempts: 1 });
      refetch();
    } catch (e) {
      alert('Failed to create exam: ' + (e?.response?.data?.error || e.message));
    }
  };

  const handleGradeSubmission = async (subId, marks, feedback) => {
    await api.put(`/submissions/${subId}/grade`, { marksObtained: parseFloat(marks), feedback });
  };

  const cols = [
    { key: 'title', label: 'Exam', render: (v, r) => <div><div style={{ fontWeight: 500 }}>{v}</div><div style={{ fontSize: 12, color: '#7B8494' }}>{r.subject?.name || ''}</div></div> },
    { key: 'type', label: 'Type', render: v => <Badge color="purple">{v}</Badge> },
    { key: 'answerFormat', label: 'Format', render: v => <Badge color="navy">{String(v || '').replace(/_/g, ' ')}</Badge> },
    { key: 'totalMarks', label: 'Marks' },
    { key: 'durationMins', label: 'Duration', render: v => v ? `${v} min` : '—' },
    { key: 'startDatetime', label: 'Starts', render: v => v ? new Date(v).toLocaleDateString('en-IN') : 'Not set' },
    { key: 'status', label: 'Status', render: v => {
      const s = String(v || '').toLowerCase();
      const color = (s === 'active' || s === 'published') ? 'green' : s === 'draft' ? 'gray' : s === 'closed' ? 'navy' : 'teal';
      return <Badge color={color}>{s}</Badge>;
    }},
    { key: '_count', label: 'Submitted', render: (v, r) => `${r._count?.submissions ?? 0}` },
    { key: 'id', label: '', render: (id, r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Btn size="sm" variant="outline" onClick={() => { setTab('grading'); setGradingExam(id); }}>Grade</Btn>
        {String(r.status || '').toLowerCase() === 'draft' && <Btn size="sm" onClick={() => api.post(`/exams/${id}/publish`).then(refetch)}>Publish</Btn>}
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
                <option value="">All my subjects</option>
                {(subjects?.subjects || []).map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </select>
              <Btn onClick={() => setExamOpen(true)}>+ New Exam</Btn>
            </div>
            <Table columns={cols} rows={examList} />
            {examList.length === 0 && (
              <div style={{ textAlign: 'center', color: '#7B8494', padding: 30, fontSize: 13 }}>No exams created yet.</div>
            )}
          </div>
        )}

        {tab === 'grading' && (
          <GradingPanel examId={gradingExam} setExamId={setGradingExam} exams={examList} onGrade={handleGradeSubmission} />
        )}
      </Card>

      {examOpen && (
        <Modal title="Create Exam" onClose={closeExamModal} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <Input label="Exam Title" value={examForm.title} onChange={e => setExamForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <Select label="Subject" value={examForm.subjectId || selectedSubject} onChange={e => setExamForm(f => ({ ...f, subjectId: e.target.value }))} options={(subjects?.subjects || []).map(s => ({ value: s.id, label: `${s.code} — ${s.name}` }))} placeholder="Select subject…" />
            <Select label="Type" value={examForm.type} onChange={e => setExamForm(f => ({ ...f, type: e.target.value }))} options={EXAM_TYPES} />
            <Select label="Mode" value={examForm.mode} onChange={e => setExamForm(f => ({ ...f, mode: e.target.value }))} options={EXAM_MODES} />
            <Select label="Answer Format" value={examForm.answerFormat} onChange={e => setExamForm(f => ({ ...f, answerFormat: e.target.value }))} options={ANSWER_FORMATS} />
            <Input label="Total Marks" type="number" value={examForm.totalMarks} onChange={e => setExamForm(f => ({ ...f, totalMarks: e.target.value }))} />
            <Input label="Pass Mark" type="number" value={examForm.passMark} onChange={e => setExamForm(f => ({ ...f, passMark: e.target.value }))} />
            <Input label="Duration (minutes)" type="number" value={examForm.durationMins} onChange={e => setExamForm(f => ({ ...f, durationMins: e.target.value }))} />
            <Input label="Max Attempts" type="number" value={examForm.maxAttempts} onChange={e => setExamForm(f => ({ ...f, maxAttempts: e.target.value }))} />
            <Input label="Start Date/Time" type="datetime-local" value={examForm.startDatetime} onChange={e => setExamForm(f => ({ ...f, startDatetime: e.target.value }))} />
            <Input label="End Date/Time" type="datetime-local" value={examForm.endDatetime} onChange={e => setExamForm(f => ({ ...f, endDatetime: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={closeExamModal}>Cancel</Btn>
            <Btn onClick={handleCreateExam}>Create Exam</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}

function GradingPanel({ examId, setExamId, exams, onGrade }) {
  const [selectedId, setSelectedId] = useState(examId || '');
  const [selectedSub, setSelectedSub] = useState(null);
  const [marks, setMarks] = useState('');
  const [feedback, setFeedback] = useState('');
  const { data: submissions, refetch } = useApi(selectedId ? `/exams/${selectedId}/submissions` : null, [selectedId]);

  const subs = submissions?.submissions || [];
  const pending = subs.filter(s => String(s.status || '').toLowerCase() === 'submitted');

  const handleSubmitGrade = async () => {
    if (!marks) { alert('Enter marks'); return; }
    try {
      await onGrade(selectedSub.id, marks, feedback);
      setSelectedSub(null); setMarks(''); setFeedback('');
      refetch();
    } catch (e) {
      alert('Grade failed: ' + (e?.response?.data?.error || e.message));
    }
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
            {pending.map(s => {
              const name = `${s.student?.firstName || ''} ${s.student?.lastName || ''}`.trim() || s.studentName || s.student?.user?.userIdDisplay || 'Student';
              return (
                <div key={s.id} onClick={() => { setSelectedSub(s); setMarks(''); setFeedback(''); }}
                  style={{ padding: '10px 12px', border: `1px solid ${selectedSub?.id === s.id ? '#0F2B4A' : '#DDE1E7'}`, borderRadius: 8, marginBottom: 6, cursor: 'pointer', background: selectedSub?.id === s.id ? '#EEF4FA' : '#fff' }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{name}</div>
                  <div style={{ fontSize: 12, color: '#7B8494' }}>Submitted {s.submittedAt ? new Date(s.submittedAt).toLocaleString('en-IN') : ''}</div>
                  {s.flagStatus === 'FLAGGED' && <Badge color="red" style={{ marginTop: 4, fontSize: 10 }}>Plagiarism Flag</Badge>}
                </div>
              );
            })}
            {pending.length === 0 && <div style={{ color: '#7B8494', fontSize: 13 }}>All graded!</div>}
          </div>

          <div>
            {selectedSub ? (
              <div>
                <h4 style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0F2B4A', margin: '0 0 10px' }}>Grading</h4>
                <div style={{ padding: '12px', background: '#F8F9FA', borderRadius: 8, fontSize: 13, marginBottom: 14, maxHeight: 200, overflowY: 'auto', color: '#3D4450', whiteSpace: 'pre-wrap' }}>
                  {selectedSub.answers ? JSON.stringify(selectedSub.answers, null, 2) : 'No answers available'}
                </div>
                <Input label="Marks" type="number" value={marks} onChange={e => setMarks(e.target.value)} style={{ marginBottom: 12 }} />
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
