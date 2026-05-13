import { PageWrapper, Card, StatCard, Badge, Btn, Table, Tabs } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import { Link } from 'react-router-dom';
import { BarChart, PieChart } from '../../components/charts';

// AdmissionsView.jsx
export function AdmissionsView() {
  const { data } = useApi('/admissions/stats');
  const stats = data || {};
  const STAGES = ['Received','Docs Review','Interview Scheduled','Interview Done','Waitlisted','Accepted','Enrolled'];

  return (
    <PageWrapper title="Admissions Overview" subtitle="Read-only view of the admissions pipeline">
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard icon="📋" label="Total Applicants" value={stats.total || 0} color="#0F2B4A" />
        <StatCard icon="✅" label="Accepted" value={stats.accepted || 0} color="#166534" />
        <StatCard icon="🎓" label="Enrolled" value={stats.enrolled || 0} color="#0F766E" />
        <StatCard icon="❌" label="Rejected" value={stats.rejected || 0} color="#991B1B" />
      </div>
      <Card title="Pipeline by Stage">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
          {STAGES.map(s => (
            <div key={s} style={{ padding: '12px 8px', background: '#EEF4FA', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0F2B4A' }}>{stats.byStage?.[s.toLowerCase().replace(/ /g,'_')] || 0}</div>
              <div style={{ fontSize: 11, color: '#5A6272', marginTop: 4 }}>{s}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <Link to="/admissions/pipeline"><Btn>Go to Admissions Portal →</Btn></Link>
        </div>
      </Card>
    </PageWrapper>
  );
}
export default AdmissionsView;
