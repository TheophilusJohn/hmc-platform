import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageWrapper, Card, Badge } from '../../components/common';
import { useApi } from '../../hooks/useApi';

const TYPE_ICONS = { lecture: '📄', assignment: '✏️', video: '🎬', link: '🔗', material: '📦' };
const TYPE_COLORS = { lecture: 'navy', assignment: 'purple', video: 'teal', link: 'amber', material: 'green' };

export default function CourseContent() {
  const [params] = useSearchParams();
  const [selectedSubject, setSelectedSubject] = useState(params.get('subject') || '');
  const { data: subjects } = useApi('/enrollments/my-subjects');
  const { data: content } = useApi(selectedSubject ? `/subjects/${selectedSubject}/content` : null, [selectedSubject]);

  const contentList = content?.content || [];
  const grouped = contentList.reduce((acc, c) => { const w = c.week || 0; if (!acc[w]) acc[w] = []; acc[w].push(c); return acc; }, {});

  return (
    <PageWrapper title="Course Content" subtitle="Lectures, assignments and study materials">
      <div style={{ marginBottom: 16 }}>
        <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff', minWidth: 240 }}>
          <option value="">Select subject…</option>
          {(subjects?.subjects || []).map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
        </select>
      </div>

      {selectedSubject && (
        <Card>
          {Object.keys(grouped).sort((a, b) => Number(a) - Number(b)).map(week => (
            <div key={week} style={{ marginBottom: 24 }}>
              <h4 style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0F2B4A', margin: '0 0 10px', borderBottom: '2px solid #EEF4FA', paddingBottom: 6 }}>
                {week === '0' ? 'General' : `Week ${week}`}
              </h4>
              {grouped[week].map(c => (
                <a key={c.id} href={c.fileUrl || c.url} target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, marginBottom: 6, background: '#fff', textDecoration: 'none', color: 'inherit', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8F9FA'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <span style={{ fontSize: 20 }}>{TYPE_ICONS[c.type] || '📄'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{c.title}</div>
                    {c.description && <div style={{ fontSize: 12, color: '#7B8494', marginTop: 1 }}>{c.description}</div>}
                    {c.deadline && <div style={{ fontSize: 11, color: '#C9920A', marginTop: 2 }}>Due: {new Date(c.deadline).toLocaleDateString('en-IN')}</div>}
                  </div>
                  <Badge color={TYPE_COLORS[c.type] || 'gray'}>{c.type}</Badge>
                  <span style={{ fontSize: 11, color: '#7B8494' }}>{new Date(c.createdAt).toLocaleDateString('en-IN')}</span>
                </a>
              ))}
            </div>
          ))}
          {contentList.length === 0 && (
            <div style={{ textAlign: 'center', color: '#7B8494', padding: 40 }}>No content uploaded yet for this subject.</div>
          )}
        </Card>
      )}
    </PageWrapper>
  );
}
