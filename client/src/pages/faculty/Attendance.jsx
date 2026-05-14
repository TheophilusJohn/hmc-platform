// Attendance.jsx
import { useState } from 'react';
import { PageWrapper, Card, Btn } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const STATUSES = [
  { value: 'PRESENT', label: 'Present', color: '#166534' },
  { value: 'ABSENT',  label: 'Absent',  color: '#991B1B' },
  { value: 'LATE',    label: 'Late',    color: '#C9920A' },
  { value: 'EXCUSED', label: 'Excused', color: '#7B8494' },
];

export default function Attendance() {
  const [mode, setMode] = useState('class');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const { data: subjects } = useApi('/subjects?mine=true');
  const { data: students } = useApi(selectedSubject ? `/subjects/${selectedSubject}/enrolled-students` : null, [selectedSubject]);
  const { data: chapelStudents } = useApi(mode === 'chapel' ? '/enrollments/active-students' : null, [mode]);

  const studentList = mode === 'class' ? (students?.students || []) : (chapelStudents?.students || []);

  const markAll = (status) => {
    const all = {};
    studentList.forEach(s => { all[s.id] = status; });
    setRecords(all);
  };

  const handleSave = async () => {
    if (mode === 'class' && !selectedSubject) { alert('Select a subject first.'); return; }
    const entries = Object.entries(records);
    if (entries.length === 0) { alert('Mark at least one student.'); return; }
    setSaving(true);
    setSavedAt(null);
    try {
      const endpoint = mode === 'chapel' ? '/attendance/chapel' : '/attendance/class';
      const body = {
        date,
        records: entries.map(([studentId, status]) => ({ studentId, status })),
      };
      if (mode === 'class') body.subjectId = selectedSubject;
      await api.post(endpoint, body);
      setSavedAt(new Date().toLocaleTimeString('en-IN'));
    } catch (e) {
      alert('Save failed: ' + (e?.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageWrapper title="Attendance" subtitle="Mark class and chapel attendance">
      <Card>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {['class', 'chapel'].map(m => (
              <button key={m} onClick={() => { setMode(m); setRecords({}); setSavedAt(null); }}
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
              <Btn size="sm" onClick={() => markAll('PRESENT')}>All Present</Btn>
              <Btn size="sm" variant="outline" onClick={() => markAll('ABSENT')}>All Absent</Btn>
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
                  {s.attendanceRate != null && (
                    <span style={{ fontSize: 12, color: s.attendanceRate < 75 ? '#991B1B' : '#7B8494' }}>{s.attendanceRate}% this sem</span>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {STATUSES.map(st => (
                      <button key={st.value} onClick={() => setRecords(r => ({ ...r, [s.id]: st.value }))}
                        style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                          background: status === st.value ? st.color : '#DDE1E7',
                          color: status === st.value ? '#fff' : '#5A6272' }}>
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
              <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Attendance'}</Btn>
              {savedAt && <span style={{ fontSize: 12, color: '#166534' }}>✓ Saved at {savedAt}</span>}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#7B8494', padding: 40 }}>
            {mode === 'class' && !selectedSubject ? 'Select a subject to mark attendance.' :
             mode === 'class' ? 'No students enrolled in this subject yet.' :
             'No active students.'}
          </div>
        )}
      </Card>
    </PageWrapper>
  );
}
