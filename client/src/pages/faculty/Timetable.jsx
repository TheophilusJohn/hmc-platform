// Timetable.jsx
import { PageWrapper, Card } from '../../components/common';
import { useApi } from '../../hooks/useApi';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Timetable() {
  const { data } = useApi('/timetable?mine=true');
  const slots = data?.slots || [];

  const byDay = DAYS.reduce((acc, d) => {
    acc[d] = slots.filter(s => s.day === d.toUpperCase()).sort((a, b) => a.startTime.localeCompare(b.startTime));
    return acc;
  }, {});

  return (
    <PageWrapper title="Timetable" subtitle="Your weekly teaching schedule">
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${DAYS.length}, 1fr)`, gap: 8, minWidth: 700 }}>
            {DAYS.map(d => (
              <div key={d}>
                <div style={{ padding: '8px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: '#0F2B4A', background: '#EEF4FA', borderRadius: 6, marginBottom: 8 }}>{d}</div>
                {byDay[d].map((slot, i) => (
                  <div key={i} style={{ padding: '10px', background: '#fff', border: '1px solid #DDE1E7', borderRadius: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#C9920A' }}>{slot.startTime}–{slot.endTime}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0F2B4A', marginTop: 2 }}>{slot.subjectCode}</div>
                    <div style={{ fontSize: 11, color: '#7B8494' }}>{slot.room || 'TBD'}</div>
                  </div>
                ))}
                {byDay[d].length === 0 && <div style={{ textAlign: 'center', color: '#C8CDD5', fontSize: 11, padding: '12px 0' }}>Free</div>}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </PageWrapper>
  );
}
