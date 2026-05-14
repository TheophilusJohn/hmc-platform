import { useNavigate } from 'react-router-dom';
import { PageWrapper, Card, Badge, Btn, Tabs } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import { useState } from 'react';

const STATUS_COLORS = { upcoming: 'navy', active: 'green', completed: 'teal', missed: 'red' };

export default function StudentExams() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('upcoming');
  const { data } = useApi(`/exams/my-exams?filter=${tab}`);
  const exams = data?.exams || [];

  return (
    <PageWrapper title="Exams" subtitle="Your scheduled and past exams">
      <Card>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'active', label: 'Active Now' }, { value: 'completed', label: 'Completed' }]} />
        <div style={{ marginTop: 16 }}>
          {exams.map(e => (
            <div key={e.id} style={{ padding: '14px 0', borderBottom: '1px solid #DDE1E7', display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{e.title}</div>
                <div style={{ fontSize: 12, color: '#7B8494', marginTop: 2 }}>{e.subjectName} · {e.duration} minutes · {e.totalMarks} marks</div>
                <div style={{ fontSize: 12, color: '#5A6272', marginTop: 2 }}>
                  {new Date(e.startTime).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} at {new Date(e.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <Badge color={STATUS_COLORS[e.myStatus] || 'gray'}>{e.myStatus}</Badge>
              {e.myStatus === 'completed' && e.marksObtained !== null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: e.marksObtained >= e.passmark ? '#166534' : '#991B1B' }}>{e.marksObtained}/{e.totalMarks}</div>
                  <div style={{ fontSize: 11, color: '#7B8494' }}>{e.grade || ''}</div>
                </div>
              )}
              {e.myStatus === 'active' && (
                <Btn onClick={() => navigate(`/student/exams/${e.id}/take`)}>Enter Exam →</Btn>
              )}
              {e.myStatus === 'completed' && e.revaluationAllowed && (
                <Btn size="sm" variant="outline">Request Reval.</Btn>
              )}
            </div>
          ))}
          {exams.length === 0 && (
            <div style={{ textAlign: 'center', color: '#7B8494', padding: 40 }}>No {tab} exams.</div>
          )}
        </div>
      </Card>
    </PageWrapper>
  );
}
