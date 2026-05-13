// Marksheet.jsx
import { useState } from 'react';
import { PageWrapper, Card, Badge, Btn, Select } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const GRADE_COLORS = { 'A+': 'green', A: 'green', 'A-': 'green', B: 'teal', 'B+': 'teal', 'B-': 'teal', C: 'amber', D: 'amber', F: 'red', I: 'gray' };

export function Marksheet() {
  const [semId, setSemId] = useState('');
  const { data: semesters } = useApi('/semesters?my=true');
  const { data: marksheet } = useApi(semId ? `/marksheet?semesterId=${semId}` : '/marksheet/latest');
  const marks = marksheet?.subjects || [];

  const downloadTranscript = () => api.get('/transcripts/my', { responseType: 'blob' }).then(r => {
    const l = document.createElement('a'); l.href = URL.createObjectURL(r.data); l.download = 'transcript.pdf'; l.click();
  });

  return (
    <PageWrapper title="Marksheet" subtitle="Semester marks and cumulative CGPA">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <select value={semId} onChange={e => setSemId(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff' }}>
          <option value="">Latest semester</option>
          {(semesters?.semesters || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Btn variant="outline" onClick={downloadTranscript}>Download Transcript PDF</Btn>
      </div>

      {marksheet?.cgpaSummary && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          {[['Semester GPA', marksheet.cgpaSummary.semesterGpa], ['Cumulative CGPA', marksheet.cgpaSummary.cgpa], ['Credits Completed', marksheet.cgpaSummary.creditsCompleted], ['Standing', marksheet.cgpaSummary.standing]].map(([l, v]) => (
            <div key={l} style={{ padding: '14px 18px', background: '#fff', border: '1px solid #DDE1E7', borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: '#7B8494', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>{l}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#0F2B4A' }}>{v || '—'}</div>
            </div>
          ))}
        </div>
      )}

      <Card>
        {marks.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#EEF4FA' }}>
                {['Subject', 'Code', 'Credits', 'IA', 'ESE', 'Total', 'Pass', 'Grade'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Subject' ? 'left' : 'center', fontWeight: 600, color: '#0F2B4A', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {marks.map((m, i) => (
                <tr key={m.subjectId} style={{ borderBottom: '1px solid #DDE1E7', background: i % 2 ? '#FAFBFC' : '#fff' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{m.subjectName}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}><code style={{ fontSize: 11, background: '#EEF4FA', padding: '1px 6px', borderRadius: 3 }}>{m.subjectCode}</code></td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>{m.creditHours}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>{m.iaMarks ?? '—'}/{m.maxIa}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>{m.eseMarks ?? '—'}/{m.maxEse}</td>
                  <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700 }}>{m.totalMarks ?? '—'}/{m.maxTotal}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>{m.passmark}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    {m.grade ? <Badge color={GRADE_COLORS[m.grade] || 'gray'}>{m.grade}</Badge> : <span style={{ color: '#A0A8B4' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', color: '#7B8494', padding: 40 }}>No marks available yet.</div>
        )}
      </Card>
    </PageWrapper>
  );
}
export default Marksheet;
