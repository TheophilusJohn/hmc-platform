// MySubjects.jsx
import { useNavigate } from 'react-router-dom';
import { PageWrapper, Card, Badge, Btn } from '../../components/common';
import { useApi } from '../../hooks/useApi';

export default function MySubjects() {
  const navigate = useNavigate();
  const { data } = useApi('/enrollments/my-subjects');
  const subjects = data?.subjects || [];

  return (
    <PageWrapper title="My Subjects" subtitle="Subjects you are enrolled in this semester">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
        {subjects.map(s => (
          <div key={s.id} style={{ background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <code style={{ background: '#EEF4FA', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#0F2B4A', fontWeight: 600 }}>{s.code}</code>
              <Badge color={String(s.examMode).toUpperCase() === 'ONLINE' ? 'teal' : 'navy'}>{s.examMode}</Badge>
            </div>
            <h4 style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: '#0F2B4A', margin: '0 0 4px' }}>{s.name}</h4>
            <p style={{ fontSize: 12, color: '#7B8494', margin: '0 0 12px' }}>{s.facultyName}</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#7B8494' }}>ATTENDANCE</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.attendanceRate != null && s.attendanceRate < 75 ? '#991B1B' : '#166534' }}>{s.attendanceRate != null ? `${s.attendanceRate}%` : '—'}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#7B8494' }}>CREDITS</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F2B4A' }}>{s.creditHours}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#7B8494' }}>MATERIALS</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F2B4A' }}>{s.contentCount || 0}</div>
              </div>
            </div>
            <Btn size="sm" onClick={() => navigate(`/student/content?subject=${s.id}`)}>View Content</Btn>
          </div>
        ))}
        {subjects.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#7B8494', padding: 40 }}>No subjects enrolled yet.</div>
        )}
      </div>
    </PageWrapper>
  );
}
