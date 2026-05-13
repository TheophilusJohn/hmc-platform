// Attendance.jsx
import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

export default function Attendance() {
  const [mode, setMode] = useState('class');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState({});
  const [saving, setSaving] = useState(false);

  const { data: subjects } = useApi('/subjects?mine=true');
  const { data: students } = useApi(selectedSubject ? `/subjects/${selectedSubject}/enrolled-students` : null, [selectedSubject]);
  const { data: chapelStudents } = useApi(mode === 'chapel' ? '/enrollments/active-students' : null, [mode]);

  const studentList = mode === 'class' ? (students?.students || []) : (chapelStudents?.students || []);

  const toggle = (id) => setRecords(r => ({ ...r, [id]: r[id] === 'present' ? 'absent' : r[id] === 'absent' ? 'late' : 'present' }));
  const markAll = (status) => {
    const all = {};
    studentList.forEach(s => { all[s.id] = status; });
    setRecords(all);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const endpoint = mode === 'chapel' ? '/attendance/chapel' : '/attendance/class';
      await api.post(endpoint, {
        subjectId: selectedSubject || undefined,
        date,
        records: Object.entries(records).map(([studentId, status]) => ({ studentId, status })),
      });
      alert('Attendance saved.');
    } finally { setSaving(false); }
  };

  return (
    <PageWrapper title="Attendance" subtitle="Mark class and chapel attendance">
      <Card>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {['class', 'chapel'].map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${mode === m ? '#0F2B4A' : '#DDE1E7'}`, background: mode === m ? '#0F2B4A' : '#fff', color: mode === m ? '#fff' : '#3D4450', fontWeight: 600, fontSize: 13, cursor: 'pointer', textTransform: 'capitalize' }}>
                {m}
              </button>
            ))}
          </div>
          {mode === 'class' && (
            <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff' }}>
              <option value="">Select subject…</option>
              {(subjects?.subjects || []).map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          )}
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13 }} />
          {studentList.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn size="sm" onClick={() => markAll('present')}>All Present</Btn>
              <Btn size="sm" variant="outline" onClick={() => markAll('absent')}>All Absent</Btn>
            </div>
          )}
        </div>

        {studentList.length > 0 ? (
          <div>
            {studentList.map(s => {
              const status = records[s.id] || null;
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #DDE1E7', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{s.firstName} {s.lastName}</div>
                    <div style={{ fontSize: 11, color: '#7B8494' }}>{s.userIdDisplay}</div>
                  </div>
                  {s.attendanceRate !== undefined && (
                    <span style={{ fontSize: 12, color: s.attendanceRate < 75 ? '#991B1B' : '#7B8494' }}>{s.attendanceRate}% this sem</span>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['present', 'absent', 'late', 'holiday'].map(st => (
                      <button key={st} onClick={() => setRecords(r => ({ ...r, [s.id]: st }))}
                        style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                          background: status === st ? (st === 'present' ? '#166534' : st === 'absent' ? '#991B1B' : st === 'late' ? '#C9920A' : '#7B8494') : '#DDE1E7',
                          color: status === st ? '#fff' : '#5A6272', textTransform: 'capitalize' }}>
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Attendance'}</Btn>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#7B8494', padding: 40 }}>
            {mode === 'class' ? 'Select a subject to mark attendance.' : 'No students found.'}
          </div>
        )}
      </Card>
    </PageWrapper>
  );
}
