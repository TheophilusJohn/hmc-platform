// AdminDashboard.jsx
import { PageWrapper, Card, StatCard, Badge, Btn } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import { useNavigate } from 'react-router-dom';

export default function TAAdminDashboard() {
  const navigate = useNavigate();
  const { data: stats } = useApi('/ta/stats');
  const { data: pending } = useApi('/ta/pending-actions');

  const items = pending?.items || [];

  return (
    <PageWrapper title="Academic Management" subtitle="Coordination, grading oversight and records">
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard icon="📚" label="Active Subjects" value={stats?.activeSubjects || 0} color="#0F2B4A" />
        <StatCard icon="⏰" label="Marks Overdue" value={stats?.marksOverdue || 0} color="#991B1B" />
        <StatCard icon="⚠️" label="Below 75% Att." value={stats?.belowAttendance || 0} color="#C9920A" />
        <StatCard icon="📋" label="Exceptions Pending" value={stats?.exceptionsPending || 0} color="#6D28D9" />
      </div>

      <Card title="Pending Actions">
        {items.length === 0 ? (
          <div style={{ color: '#7B8494', fontSize: 13, padding: '12px 0' }}>No urgent actions needed.</div>
        ) : items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #DDE1E7' }}>
            <Badge color={item.severity === 'high' ? 'red' : 'amber'}>{item.type}</Badge>
            <span style={{ flex: 1, fontSize: 13 }}>{item.description}</span>
            <Btn size="sm" onClick={() => navigate(item.link)}>Resolve</Btn>
          </div>
        ))}
      </Card>
    </PageWrapper>
  );
}
