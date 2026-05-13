import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';

const TAB_SWITCH_LIMIT = 3;
const AUTOSAVE_INTERVAL = 30000; // 30s

// ─── Countdown timer ────────────────────────────────────────────────────────
function Timer({ seconds, onExpire }) {
  const [left, setLeft] = useState(seconds);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); onExpire(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const isWarning = left <= 15 * 60;
  const isCritical = left <= 5 * 60;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: isCritical ? '#991B1B' : isWarning ? '#C9920A' : '#0F2B4A',
      color: '#fff', padding: '8px 16px', borderRadius: 8, fontFamily: 'monospace', fontSize: 18, fontWeight: 700,
      transition: 'background 0.5s'
    }}>
      <span>⏱</span>
      <span>{h > 0 ? `${h}:` : ''}{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>
    </div>
  );
}

// ─── Question palette ────────────────────────────────────────────────────────
function Palette({ questions, answers, current, onJump, flagged }) {
  return (
    <div style={{ width: 240, background: '#fff', borderLeft: '1px solid #DDE1E7', padding: 16, overflowY: 'auto' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#5A6272', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Question Map</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 16 }}>
        {questions.map((q, i) => {
          const answered = answers[q.id] !== undefined && answers[q.id] !== '';
          const isFlagged = flagged.has(q.id);
          const isCurrent = i === current;
          return (
            <button key={q.id} onClick={() => onJump(i)}
              style={{ width: '100%', aspectRatio: 1, borderRadius: 6, border: `2px solid ${isCurrent ? '#0F2B4A' : 'transparent'}`, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: isCurrent ? '#0F2B4A' : isFlagged ? '#FDE68A' : answered ? '#DCFCE7' : '#F3F4F6',
                color: isCurrent ? '#fff' : '#1A1D23' }}>
              {i + 1}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[['#DCFCE7', 'Answered'], ['#F3F4F6', 'Not Answered'], ['#FDE68A', 'Flagged'], ['#0F2B4A', 'Current']].map(([bg, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#5A6272' }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: bg, border: bg === '#F3F4F6' ? '1px solid #DDE1E7' : 'none' }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pre-exam screen ─────────────────────────────────────────────────────────
function PreExam({ exam, onStart }) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: '#0F2B4A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans',sans-serif", padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '40px 48px', maxWidth: 560, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, background: '#C9920A', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✝</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: '#0F2B4A' }}>Harvest Mission College</div>
        </div>
        <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, color: '#0F2B4A', margin: '0 0 6px' }}>{exam.title}</h1>
        <p style={{ color: '#7B8494', fontSize: 14, margin: '0 0 24px' }}>{exam.subjectName}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          {[['⏱ Duration', `${exam.duration} minutes`], ['📊 Total Marks', exam.totalMarks], ['✅ Questions', exam.questionCount], ['📝 Type', exam.type?.toUpperCase()]].map(([l, v]) => (
            <div key={l} style={{ padding: '10px 14px', background: '#EEF4FA', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#7B8494', marginBottom: 2 }}>{l}</div>
              <div style={{ fontWeight: 700, color: '#0F2B4A', fontSize: 14 }}>{v}</div>
            </div>
          ))}
        </div>
        {exam.instructions && (
          <div style={{ padding: '12px 16px', background: '#FFFBF0', border: '1px solid #F5E6BE', borderRadius: 8, fontSize: 13, color: '#3D4450', marginBottom: 20, whiteSpace: 'pre-wrap' }}>
            {exam.instructions}
          </div>
        )}
        <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B', marginBottom: 20 }}>
          <strong>Academic Integrity:</strong> Switching browser tabs more than {TAB_SWITCH_LIMIT} times will auto-submit your exam. Copy-paste is disabled. Your work will be checked for plagiarism.
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13, color: '#3D4450', marginBottom: 20 }}>
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
          I have read the instructions, and I agree to uphold academic integrity during this examination.
        </label>
        <button onClick={() => agreed && onStart()} disabled={!agreed}
          style={{ width: '100%', padding: '14px', background: agreed ? '#0F2B4A' : '#A0A8B4', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: agreed ? 'pointer' : 'not-allowed' }}>
          Begin Exam →
        </button>
      </div>
    </div>
  );
}

// ─── Post-exam screen ─────────────────────────────────────────────────────────
function PostExam({ exam, submissionId, auto }) {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: '#0F2B4A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '48px', maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{auto ? '⏰' : '✅'}</div>
        <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, color: '#0F2B4A', margin: '0 0 12px' }}>
          {auto ? 'Time Up!' : 'Exam Submitted!'}
        </h1>
        <p style={{ color: '#7B8494', fontSize: 14, marginBottom: 24 }}>
          {auto ? 'Your time has elapsed and the exam was auto-submitted.' : 'Your responses have been submitted for grading.'} Reference: <strong>{submissionId}</strong>
        </p>
        {exam?.showResultAfter && (
          <div style={{ padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, marginBottom: 20, fontSize: 13, color: '#166534' }}>
            Results will be available after grading.
          </div>
        )}
        <button onClick={() => navigate('/student/exams')}
          style={{ padding: '12px 32px', background: '#0F2B4A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
          Back to Exams
        </button>
      </div>
    </div>
  );
}

// ─── Main ExamTaking component ───────────────────────────────────────────────
export default function ExamTaking() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('pre'); // pre | taking | post
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState(new Set());
  const [tabSwitches, setTabSwitches] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [submissionId, setSubmissionId] = useState(null);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const autosaveRef = useRef(null);
  const tabRef = useRef(0);

  // Load exam
  useEffect(() => {
    api.get(`/exams/${examId}`).then(({ data }) => setExam(data));
  }, [examId]);

  // Start exam session
  const startExam = useCallback(async () => {
    const { data } = await api.post(`/exam-session/${examId}/start`);
    setSessionId(data.sessionId);
    setQuestions(data.questions || []);
    setPhase('taking');
    // Set session flag on localStorage to suspend timeout
    localStorage.setItem('hmc_exam_session', data.sessionId);
  }, [examId]);

  // Anti-cheat: tab switch detection
  useEffect(() => {
    if (phase !== 'taking') return;
    const handleVisibility = () => {
      if (document.hidden) {
        const count = tabRef.current + 1;
        tabRef.current = count;
        setTabSwitches(count);
        api.post(`/exam-session/${sessionId}/flag`, { type: 'tab_switch', count }).catch(() => {});
        if (count >= TAB_SWITCH_LIMIT) {
          submitExam(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [phase, sessionId]);

  // Anti-cheat: disable copy-paste
  useEffect(() => {
    if (phase !== 'taking') return;
    const block = (e) => e.preventDefault();
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('paste', block);
    return () => {
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('paste', block);
    };
  }, [phase]);

  // Auto-save every 30s
  useEffect(() => {
    if (phase !== 'taking' || !sessionId) return;
    autosaveRef.current = setInterval(async () => {
      try {
        await api.post(`/exam-session/${sessionId}/autosave`, { answers });
      } catch (_) {}
    }, AUTOSAVE_INTERVAL);
    return () => clearInterval(autosaveRef.current);
  }, [phase, sessionId, answers]);

  // Submit exam
  const submitExam = useCallback(async (auto = false) => {
    if (submitting) return;
    setSubmitting(true);
    clearInterval(autosaveRef.current);
    try {
      const { data } = await api.post(`/exam-session/${sessionId}/submit`, { answers });
      setSubmissionId(data.submissionId);
      setAutoSubmitted(auto);
      setPhase('post');
      localStorage.removeItem('hmc_exam_session');
    } catch (e) {
      alert('Failed to submit. Please try again. Your answers are saved locally.');
      setSubmitting(false);
    }
  }, [sessionId, answers, submitting]);

  const handleConfirmSubmit = () => {
    if (confirm(`Submit exam now? You have answered ${Object.keys(answers).length} of ${questions.length} questions.`)) {
      submitExam(false);
    }
  };

  const setAnswer = (qId, val) => setAnswers(a => ({ ...a, [qId]: val }));
  const toggleFlag = (qId) => setFlagged(f => { const n = new Set(f); n.has(qId) ? n.delete(qId) : n.add(qId); return n; });

  const q = questions[current];

  if (!exam) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans', color: '#7B8494' }}>Loading exam…</div>;

  if (phase === 'pre') return <PreExam exam={exam} onStart={startExam} />;
  if (phase === 'post') return <PostExam exam={exam} submissionId={submissionId} auto={autoSubmitted} />;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans',sans-serif", background: '#F8F9FA', overflow: 'hidden', userSelect: 'none' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px', background: '#0F2B4A', color: '#fff', flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, background: '#C9920A', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✝</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{exam.title}</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>{exam.subjectName}</div>
        </div>
        {tabSwitches > 0 && (
          <div style={{ padding: '4px 10px', background: '#991B1B', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
            ⚠️ Tab switch: {tabSwitches}/{TAB_SWITCH_LIMIT}
          </div>
        )}
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          {Object.keys(answers).length}/{questions.length} answered
        </div>
        <Timer seconds={exam.duration * 60} onExpire={() => submitExam(true)} />
        <button onClick={handleConfirmSubmit} disabled={submitting}
          style={{ padding: '8px 18px', background: '#C9920A', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'DM Sans', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Question pane */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {q && (
            <div>
              {/* Question header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0F2B4A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                  {current + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 500, color: '#1A1D23', lineHeight: 1.5 }}>{q.question}</div>
                  <div style={{ fontSize: 12, color: '#7B8494', marginTop: 4 }}>[{q.marks} mark{q.marks > 1 ? 's' : ''}]</div>
                </div>
                <button onClick={() => toggleFlag(q.id)}
                  style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${flagged.has(q.id) ? '#C9920A' : '#DDE1E7'}`, background: flagged.has(q.id) ? '#FFFBF0' : '#fff', cursor: 'pointer', fontSize: 12, color: flagged.has(q.id) ? '#C9920A' : '#7B8494', fontFamily: 'DM Sans' }}>
                  {flagged.has(q.id) ? '🚩 Flagged' : '🚩 Flag'}
                </button>
              </div>

              {/* MCQ options */}
              {(q.type === 'mcq' || q.type === 'true_false') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 540 }}>
                  {(q.options || (q.type === 'true_false' ? ['True', 'False'] : [])).map((opt, i) => {
                    const val = String(i);
                    const selected = answers[q.id] === val;
                    return (
                      <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: `2px solid ${selected ? '#0F2B4A' : '#DDE1E7'}`, borderRadius: 8, cursor: 'pointer', background: selected ? '#EEF4FA' : '#fff', transition: 'all 0.1s' }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selected ? '#0F2B4A' : '#DDE1E7'}`, background: selected ? '#0F2B4A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                        </div>
                        <input type="radio" name={`q-${q.id}`} value={val} checked={selected} onChange={() => setAnswer(q.id, val)} style={{ display: 'none' }} />
                        <span style={{ fontSize: 14, color: '#1A1D23' }}>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Written answer */}
              {(q.type === 'written' || q.type === 'short') && (
                <div>
                  <textarea
                    value={answers[q.id] || ''}
                    onChange={e => setAnswer(q.id, e.target.value)}
                    onCopy={e => e.preventDefault()}
                    onPaste={e => e.preventDefault()}
                    placeholder="Type your answer here…"
                    style={{ width: '100%', minHeight: q.type === 'written' ? 240 : 100, padding: '12px 16px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, fontFamily: "'DM Sans',sans-serif", resize: 'vertical', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6 }}
                  />
                  <div style={{ fontSize: 11, color: '#A0A8B4', marginTop: 4 }}>{(answers[q.id] || '').length} characters</div>
                </div>
              )}

              {/* File upload */}
              {q.type === 'file_upload' && (
                <div style={{ padding: '24px', border: '2px dashed #DDE1E7', borderRadius: 8, textAlign: 'center' }}>
                  <input type="file" onChange={async (e) => {
                    const fd = new FormData();
                    fd.append('file', e.target.files[0]);
                    const { data } = await api.post(`/exam-session/${sessionId}/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                    setAnswer(q.id, data.url);
                  }} />
                  {answers[q.id] && <div style={{ marginTop: 8, fontSize: 13, color: '#166534' }}>✅ File uploaded</div>}
                </div>
              )}

              {/* Navigation */}
              <div style={{ display: 'flex', gap: 8, marginTop: 32, justifyContent: 'space-between' }}>
                <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
                  style={{ padding: '10px 20px', border: '1px solid #DDE1E7', borderRadius: 8, background: '#fff', cursor: current === 0 ? 'not-allowed' : 'pointer', fontSize: 14, color: '#5A6272', fontFamily: 'DM Sans', opacity: current === 0 ? 0.4 : 1 }}>
                  ← Previous
                </button>
                <button onClick={() => setCurrent(c => Math.min(questions.length - 1, c + 1))} disabled={current === questions.length - 1}
                  style={{ padding: '10px 20px', border: '1px solid #DDE1E7', borderRadius: 8, background: '#fff', cursor: current === questions.length - 1 ? 'not-allowed' : 'pointer', fontSize: 14, color: '#5A6272', fontFamily: 'DM Sans', opacity: current === questions.length - 1 ? 0.4 : 1 }}>
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Palette */}
        <Palette questions={questions} answers={answers} current={current} onJump={setCurrent} flagged={flagged} />
      </div>
    </div>
  );
}
