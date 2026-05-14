// Faculty Dashboard
import { useNavigate } from 'react-router-dom';
import { PageWrapper, Card, StatCard, Btn } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';

export default function FacultyDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: stats } = useApi('/me/stats');

  const pendingExams = stats?.pendingExams || [];

  return (
    <PageWrapper title={`Welcome, ${user?.firstName || 'Faculty'}`} subtitle="Your teaching overview">
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard icon="📚" label="My Subjects" value={stats?.subjects || 0} color="#0F2B4A" />
        <StatCard icon="✏️" label="Pending Grading" value={stats?.pendingGrading || 0} color="#C9920A" />
        <StatCard icon="⏰" label="Exams Today" value={stats?.dueToday || 0} color="#6D28D9" />
        <StatCard icon="👥" label="Total Students" value={stats?.students || 0} color="#0F766E" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <Card title="Pending Grading">
          {pendingExams.length === 0 ? (
            <div style={{ color: '#7B8494', fontSize: 13, padding: '12px 0' }}>All caught up! No pending grading.</div>
          ) : (
            pendingExams.map(s => (
              <div key={s.examId} style={{ padding: '10px 0', borderBottom: '1px solid #DDE1E7', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{s.examTitle}</div>
                  <div style={{ fontSize: 12, color: '#7B8494' }}>{s.subjectName} · {s.submittedCount} submissions</div>
                </div>
                <Btn size="sm" onClick={() => navigate(`/faculty/exams?exam=${s.examId}`)}>Grade</Btn>
              </div>
            ))
          )}
        </Card>
        <Card title="Today">
          <div style={{ fontSize: 13, color: '#7B8494' }}>Today's classes will appear here once the timetable module is set up.</div>
        </Card>
      </div>
    </PageWrapper>
  );
}
