// Student Dashboard
import { useNavigate } from 'react-router-dom';
import { PageWrapper, Card, StatCard, Btn } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: stats } = useApi('/me/stats');
  const { data: upcoming } = useApi('/exams/my-exams?filter=upcoming');
  const { data: balance } = useApi('/fees/my-balance');

  const exams = (upcoming?.exams || []).slice(0, 5);
  const subjectAttendance = stats?.subjectAttendance || [];
  const attendanceVal = stats?.attendance ?? 0;

  return (
    <PageWrapper title={`Welcome, ${user?.firstName || 'Student'}`} subtitle="Your academic overview">
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard icon="📚" label="Enrolled Subjects" value={stats?.subjects || 0} color="#0F2B4A" />
        <StatCard icon="🏆" label="Current CGPA" value={stats?.cgpa || '—'} color="#166534" />
        <StatCard icon="📅" label="Attendance" value={`${attendanceVal}%`} color={attendanceVal < 75 ? '#991B1B' : '#0F766E'} />
        <StatCard icon="💰" label="Balance Due" value={balance?.outstanding > 0 ? `₹${Number(balance.outstanding).toLocaleString()}` : 'Clear'} color={balance?.outstanding > 0 ? '#991B1B' : '#166534'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        <Card title="Upcoming Exams">
          {exams.length === 0 ? (
            <div style={{ color: '#7B8494', fontSize: 13, padding: '12px 0' }}>No upcoming exams scheduled.</div>
          ) : exams.map(e => (
            <div key={e.id} style={{ padding: '12px 0', borderBottom: '1px solid #DDE1E7', display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{e.title}</div>
                <div style={{ fontSize: 12, color: '#7B8494' }}>{e.subjectName || ''} · {e.duration} min</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2B4A' }}>{e.startTime ? new Date(e.startTime).toLocaleDateString('en-IN') : ''}</div>
                <div style={{ fontSize: 11, color: '#7B8494' }}>{e.startTime ? new Date(e.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
              </div>
              {e.canStart && <Btn size="sm" onClick={() => navigate(`/student/exams/${e.id}/take`)}>Start</Btn>}
            </div>
          ))}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {balance?.outstanding > 0 && (
            <div style={{ padding: '14px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12 }}>
              <div style={{ fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>⚠️ Outstanding Fees</div>
              <div style={{ fontSize: 13, color: '#7B8494' }}>₹{Number(balance.outstanding).toLocaleString()} due</div>
              {balance.locked && <div style={{ fontSize: 12, color: '#991B1B', marginTop: 4 }}>Fee lock active — please clear dues.</div>}
              <Btn size="sm" style={{ marginTop: 8 }} onClick={() => navigate('/student/fees')}>Pay Now</Btn>
            </div>
          )}
          <Card title="Attendance Summary">
            {subjectAttendance.length === 0 ? (
              <div style={{ color: '#7B8494', fontSize: 12 }}>No attendance data yet.</div>
            ) : subjectAttendance.map(s => (
              <div key={s.subjectId} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span>{s.subjectCode}</span>
                  <span style={{ fontWeight: 600, color: s.rate < 75 ? '#991B1B' : '#166534' }}>{s.rate}%</span>
                </div>
                <div style={{ height: 4, background: '#DDE1E7', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${s.rate}%`, background: s.rate < 75 ? '#991B1B' : '#0F766E', borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </PageWrapper>
  );
}
