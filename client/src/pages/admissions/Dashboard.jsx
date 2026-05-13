import { useNavigate } from 'react-router-dom';
import { PageWrapper, Card, StatCard, Badge, Btn } from '../../components/common';
import { useApi } from '../../hooks/useApi';

const STAGE_COLORS = { received: 'gray', docs_review: 'amber', interview_scheduled: 'teal', interview_done: 'purple', waitlisted: 'navy', accepted: 'green', enrolled: 'teal' };

export default function AdmissionsDashboard() {
  const navigate = useNavigate();
  const { data: stats } = useApi('/admissions/stats');
  const { data: tasks } = useApi('/admissions?today=true&limit=10');

  const todayTasks = tasks?.applicants || [];

  return (
    <PageWrapper title="Admissions Dashboard" subtitle="Your tasks and pipeline overview">
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard icon="📋" label="Total Applicants" value={stats?.total || 0} color="#0F2B4A" />
        <StatCard icon="🔄" label="In Pipeline" value={stats?.inPipeline || 0} color="#0F766E" />
        <StatCard icon="🗓️" label="Interviews Today" value={stats?.interviewsToday || 0} color="#C9920A" />
        <StatCard icon="🎓" label="Enrolled This Sem" value={stats?.enrolled || 0} color="#166534" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <Card title="Pipeline Snapshot">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
            {['Received','Docs Review','Interview Scheduled','Interview Done','Waitlisted','Accepted','Enrolled','Rejected'].map(s => (
              <div key={s} onClick={() => navigate('/admissions/pipeline')}
                style={{ padding: '10px 12px', background: '#F8F9FA', borderRadius: 8, textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#0F2B4A' }}>{stats?.byStage?.[s.toLowerCase().replace(/ /g,'_')] || 0}</div>
                <div style={{ fontSize: 11, color: '#7B8494', marginTop: 2 }}>{s}</div>
              </div>
            ))}
          </div>
          <Btn onClick={() => navigate('/admissions/pipeline')}>View Full Pipeline →</Btn>
        </Card>

        <Card title="Today's Tasks">
          {todayTasks.length === 0 ? (
            <div style={{ color: '#7B8494', fontSize: 13, padding: '12px 0' }}>No pending tasks for today.</div>
          ) : (
            <div>
              {todayTasks.map(t => (
                <div key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid #DDE1E7', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Badge color={STAGE_COLORS[t.pipelineStage] || 'gray'} style={{ fontSize: 11 }}>{t.pipelineStage?.replace(/_/g,' ')}</Badge>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.firstName} {t.lastName}</div>
                    <div style={{ fontSize: 11, color: '#7B8494' }}>{t.programmeName}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageWrapper>
  );
}
