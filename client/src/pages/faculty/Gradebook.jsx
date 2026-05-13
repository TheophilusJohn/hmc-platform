import { useState } from 'react';
import { PageWrapper, Card, Badge, Btn, Select } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const GRADE_COLORS = { 'A+': 'green', A: 'green', 'A-': 'green', B: 'teal', 'B-': 'teal', 'B+': 'teal', C: 'amber', D: 'amber', F: 'red', I: 'gray' };

export default function Gradebook() {
  const [selectedSubject, setSelectedSubject] = useState('');
  const { data: subjects } = useApi('/subjects?mine=true');
  const { data: grades } = useApi(selectedSubject ? `/subjects/${selectedSubject}/gradebook` : null, [selectedSubject]);
  const { data: revaluation } = useApi(selectedSubject ? `/subjects/${selectedSubject}/revaluation-requests` : null, [selectedSubject]);

  const students = grades?.students || [];
  const exams = grades?.exams || [];

  const handleOverride = async (studentId, examId, marks) => {
    await api.post(`/exams/${examId}/override`, { studentId, marks });
  };

  const handleRevalDecision = async (id, action, notes) => {
    await api.put(`/revaluation/${id}`, { status: action, notes });
  };

  return (
    <PageWrapper title="Gradebook" subtitle="Marks, grades and revaluation">
      <Card>
        <div style={{ marginBottom: 16 }}>
          <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff', minWidth: 240 }}>
            <option value="">Select subject…</option>
            {(subjects?.subjects || []).map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select>
        </div>

        {selectedSubject && students.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#EEF4FA' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#0F2B4A', whiteSpace: 'nowrap' }}>Student</th>
                  {exams.map(e => (
                    <th key={e.id} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, color: '#0F2B4A', whiteSpace: 'nowrap' }}>
                      {e.title}<div style={{ fontSize: 10, color: '#7B8494', fontWeight: 400 }}>/{e.totalMarks}</div>
                    </th>
                  ))}
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#0F2B4A' }}>Total</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#0F2B4A' }}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #DDE1E7', background: idx % 2 ? '#FAFBFC' : '#fff' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500 }}>{s.firstName} {s.lastName}</div>
                      <div style={{ fontSize: 11, color: '#7B8494' }}>{s.userIdDisplay}</div>
                    </td>
                    {exams.map(e => {
                      const mark = s.marks?.[e.id];
                      return (
                        <td key={e.id} style={{ padding: '8px', textAlign: 'center' }}>
                          {mark !== undefined ? (
                            <span style={{ fontWeight: 600, color: mark < (e.passmark || 40) ? '#991B1B' : '#166534' }}>{mark}</span>
                          ) : <span style={{ color: '#A0A8B4' }}>—</span>}
                        </td>
                      );
                    })}
                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700 }}>{s.totalMarks || '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {s.grade && <Badge color={GRADE_COLORS[s.grade] || 'gray'}>{s.grade}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {revaluation?.requests?.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h4 style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0F2B4A', margin: '0 0 10px' }}>Revaluation Requests ({revaluation.requests.length})</h4>
                {revaluation.requests.map(r => (
                  <div key={r.id} style={{ padding: '12px 14px', border: '1px solid #F5E6BE', background: '#FFFBF0', borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{r.studentName} — {r.examTitle}</div>
                        <div style={{ fontSize: 12, color: '#7B8494' }}>Current: {r.currentMarks}/{r.totalMarks} · Reason: {r.reason}</div>
                      </div>
                      <Btn size="sm" onClick={() => handleRevalDecision(r.id, 'accepted', '')}>Accept</Btn>
                      <Btn size="sm" variant="outline" onClick={() => handleRevalDecision(r.id, 'rejected', '')}>Reject</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedSubject && students.length === 0 && (
          <div style={{ textAlign: 'center', color: '#7B8494', padding: 40 }}>No graded data yet for this subject.</div>
        )}
      </Card>
    </PageWrapper>
  );
}
