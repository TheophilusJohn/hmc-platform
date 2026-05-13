// AllGrades.jsx
import { useState } from 'react';
import { PageWrapper, Card, Badge, Select } from '../../components/common';
import { useApi } from '../../hooks/useApi';

const GRADE_BG = { 'A+': '#F0FDF4', A: '#F0FDF4', B: '#EEF4FA', C: '#FFFBEB', D: '#FFF7ED', F: '#FEF2F2' };
const GRADE_COLOR = { 'A+': '#166534', A: '#166534', B: '#0F2B4A', C: '#92400E', D: '#C2410C', F: '#991B1B' };

export function AllGrades() {
  const [semId, setSemId] = useState('');
  const [batchId, setBatchId] = useState('');
  const { data: semesters } = useApi('/semesters');
  const { data: batches } = useApi('/programmes');
  const { data: grades } = useApi(semId ? `/ta/grades?semesterId=${semId}&batchId=${batchId}` : null, [semId, batchId]);

  const allBatches = (batches?.programmes || []).flatMap(p => (p.batches || []).map(b => ({ value: b.id, label: `${p.name} – ${b.name}` })));

  return (
    <PageWrapper title="All Grades" subtitle="Cross-subject marks and grade overview">
      <Card>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <select value={semId} onChange={e => setSemId(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff' }}>
            <option value="">Select semester…</option>
            {(semesters?.semesters || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={batchId} onChange={e => setBatchId(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff' }}>
            <option value="">All batches</option>
            {allBatches.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>

        {grades && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#EEF4FA' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#0F2B4A', whiteSpace: 'nowrap' }}>Student</th>
                  {(grades.subjects || []).map(s => (
                    <th key={s.id} style={{ padding: '8px', textAlign: 'center', fontWeight: 600, color: '#0F2B4A', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {s.code}<div style={{ fontSize: 10, color: '#7B8494', fontWeight: 400 }}>/{s.total}</div>
                    </th>
                  ))}
                  <th style={{ padding: '8px', textAlign: 'center', fontWeight: 600, color: '#0F2B4A' }}>CGPA</th>
                </tr>
              </thead>
              <tbody>
                {(grades.students || []).map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #DDE1E7', background: i % 2 ? '#FAFBFC' : '#fff' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 500 }}>{s.firstName} {s.lastName}</div>
                      <div style={{ fontSize: 10, color: '#7B8494' }}>{s.userIdDisplay}</div>
                    </td>
                    {(grades.subjects || []).map(sub => {
                      const m = s.marks?.[sub.id];
                      return (
                        <td key={sub.id} style={{ padding: '8px', textAlign: 'center' }}>
                          {m !== undefined ? <span style={{ fontWeight: 600, color: m < sub.passmark ? '#991B1B' : '#166534' }}>{m}</span> : <span style={{ color: '#C8CDD5' }}>—</span>}
                        </td>
                      );
                    })}
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {s.cgpa && (
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: GRADE_BG[s.cgpaGrade] || '#F8F9FA', color: GRADE_COLOR[s.cgpaGrade] || '#5A6272', fontWeight: 700, fontSize: 12 }}>
                          {s.cgpa}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageWrapper>
  );
}
export default AllGrades;
