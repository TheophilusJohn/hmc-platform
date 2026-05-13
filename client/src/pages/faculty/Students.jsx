import { useState } from 'react';
import { PageWrapper, Card, Badge, SearchInput, Modal } from '../../components/common';
import { useApi } from '../../hooks/useApi';

const GRADE_COLORS = { 'A+': 'green', A: 'green', B: 'teal', C: 'amber', D: 'amber', F: 'red' };

export default function Students() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const { data } = useApi(`/students?mine=true&search=${search}`);
  const { data: detail } = useApi(selected ? `/students/${selected.id}/academic-summary` : null, [selected]);

  return (
    <PageWrapper title="Students" subtitle="Students enrolled in your subjects">
      <Card>
        <div style={{ marginBottom: 16 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search students…" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
          {(data?.students || []).map(s => (
            <div key={s.id} onClick={() => setSelected(s)}
              style={{ padding: '14px 16px', border: '1px solid #DDE1E7', borderRadius: 10, cursor: 'pointer', background: '#fff', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#0F2B4A'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#DDE1E7'}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EEF4FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#0F2B4A', fontSize: 14, marginBottom: 8 }}>
                {s.firstName?.[0]}{s.lastName?.[0]}
              </div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{s.firstName} {s.lastName}</div>
              <div style={{ fontSize: 11, color: '#7B8494', marginTop: 2 }}>{s.userIdDisplay}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                {s.cgpa && <Badge color={GRADE_COLORS[s.cgpaGrade] || 'gray'} style={{ fontSize: 10 }}>CGPA {s.cgpa}</Badge>}
                {s.attendanceRate < 75 && <Badge color="red" style={{ fontSize: 10 }}>{s.attendanceRate}% att.</Badge>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {selected && (
        <Modal title={`${selected.firstName} ${selected.lastName}`} onClose={() => setSelected(null)} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[['ID', selected.userIdDisplay], ['Programme', detail?.programme], ['Year', detail?.year], ['Mode', detail?.studyMode], ['CGPA', detail?.cgpa], ['Attendance', `${detail?.attendanceRate || 0}%`]].map(([l, v]) => (
              <div key={l} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#7B8494' }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1D23' }}>{v || '—'}</div>
              </div>
            ))}
          </div>
          {detail?.marks && (
            <div>
              <h4 style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0F2B4A', margin: '0 0 10px' }}>My Subject Marks</h4>
              {detail.marks.map(m => (
                <div key={m.subjectId} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #DDE1E7' }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{m.subjectName}</span>
                  <span style={{ fontWeight: 600, color: m.marks < m.passmark ? '#991B1B' : '#166534' }}>{m.marks ?? '—'}/{m.totalMarks}</span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </PageWrapper>
  );
}
