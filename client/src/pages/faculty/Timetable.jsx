// Timetable.jsx
import { PageWrapper, Card } from '../../components/common';
import { useApi } from '../../hooks/useApi';

const DAYS = [
  { label: 'Monday',    code: 'MON' },
  { label: 'Tuesday',   code: 'TUE' },
  { label: 'Wednesday', code: 'WED' },
  { label: 'Thursday',  code: 'THU' },
  { label: 'Friday',    code: 'FRI' },
  { label: 'Saturday',  code: 'SAT' },
];

export default function Timetable() {
  const { data } = useApi('/timetable/my');
  const slots = data?.slots || [];

  const byDay = DAYS.reduce((acc, d) => {
    acc[d.code] = slots
      .filter(s => String(s.day || '').toUpperCase() === d.code)
      .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    return acc;
  }, {});

  return (
    <PageWrapper title="Timetable" subtitle="Your weekly teaching schedule">
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${DAYS.length}, 1fr)`, gap: 8, minWidth: 700 }}>
            {DAYS.map(d => (
              <div key={d.code}>
                <div style={{ padding: '8px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: '#0F2B4A', background: '#EEF4FA', borderRadius: 6, marginBottom: 8 }}>{d.label}</div>
                {byDay[d.code].map((slot, i) => (
                  <div key={i} style={{ padding: '10px', background: '#fff', border: '1px solid #DDE1E7', borderRadius: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#C9920A' }}>{slot.startTime}–{slot.endTime}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0F2B4A', marginTop: 2 }}>{slot.subjectCode || slot.subjectName || '—'}</div>
                    <div style={{ fontSize: 11, color: '#7B8494' }}>{slot.room || 'TBD'}</div>
                  </div>
                ))}
                {byDay[d.code].length === 0 && <div style={{ textAlign: 'center', color: '#C8CDD5', fontSize: 11, padding: '12px 0' }}>Free</div>}
              </div>
            ))}
          </div>
        </div>
        {slots.length === 0 && (
          <div style={{ textAlign: 'center', color: '#7B8494', padding: 24, fontSize: 13 }}>
            No timetable slots assigned yet.
          </div>
        )}
      </Card>
    </PageWrapper>
  );
}
