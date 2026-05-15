import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageWrapper, Card, Badge } from '../../components/common';
import { useApi } from '../../hooks/useApi';

const TYPE_ICONS = { lecture: '📄', assignment: '✏️', video: '🎬', link: '🔗', material: '📦' };
const TYPE_COLORS = { lecture: 'navy', assignment: 'purple', video: 'teal', link: 'amber', material: 'green' };

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN');
}

export default function CourseContent() {
  const [params] = useSearchParams();
  const [selectedSubject, setSelectedSubject] = useState(params.get('subject') || '');
  const { data: subjects } = useApi('/enrollments/my-subjects');
  const enrolled = subjects?.subjects || [];
  // Drop a `?subject=<id>` value if the student isn't enrolled in it — otherwise
  // the select renders empty and the page silently stays blank.
  const isEnrolledIn = !!(selectedSubject && enrolled.some(s => s.id === selectedSubject));
  const effectiveSubject = isEnrolledIn ? selectedSubject : '';
  const { data: content } = useApi(effectiveSubject ? `/subjects/${effectiveSubject}/content` : null, [effectiveSubject]);

  const contentList = content?.content || [];
  const grouped = contentList.reduce((acc, c) => { const w = c.week || 0; if (!acc[w]) acc[w] = []; acc[w].push(c); return acc; }, {});
  const showNotEnrolled = selectedSubject && !isEnrolledIn && enrolled.length > 0;

  return (
    <PageWrapper title="Course Content" subtitle="Lectures, assignments and study materials">
      <div style={{ marginBottom: 16 }}>
        <select value={effectiveSubject} onChange={e => setSelectedSubject(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff', minWidth: 240 }}>
          <option value="">Select subject…</option>
          {enrolled.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
        </select>
        {showNotEnrolled && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#92400E' }}>You are not enrolled in the requested subject. Pick one above.</div>
        )}
      </div>

      {effectiveSubject && (
        <Card>
          {Object.keys(grouped).sort((a, b) => Number(a) - Number(b)).map(week => (
            <div key={week} style={{ marginBottom: 24 }}>
              <h4 style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0F2B4A', margin: '0 0 10px', borderBottom: '2px solid #EEF4FA', paddingBottom: 6 }}>
                {week === '0' ? 'General' : `Week ${week}`}
              </h4>
              {grouped[week].map(c => {
                const linkUrl = c.fileUrl || c.url;
                const rowStyle = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, marginBottom: 6, background: '#fff', textDecoration: 'none', color: 'inherit', transition: 'background 0.15s' };
                const body = (
                  <>
                    <span style={{ fontSize: 20 }}>{TYPE_ICONS[c.type] || '📄'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{c.title}</div>
                      {c.description && <div style={{ fontSize: 12, color: '#7B8494', marginTop: 1 }}>{c.description}</div>}
                      {c.deadline && <div style={{ fontSize: 11, color: '#C9920A', marginTop: 2 }}>Due: {fmtDate(c.deadline)}</div>}
                    </div>
                    <Badge color={TYPE_COLORS[c.type] || 'gray'}>{c.type}</Badge>
                    <span style={{ fontSize: 11, color: '#7B8494' }}>{fmtDate(c.createdAt)}</span>
                  </>
                );
                return linkUrl ? (
                  <a key={c.id} href={linkUrl} target="_blank" rel="noreferrer" style={rowStyle}
                    onMouseEnter={e => e.currentTarget.style.background = '#F8F9FA'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    {body}
                  </a>
                ) : (
                  <div key={c.id} style={rowStyle}>{body}</div>
                );
              })}
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
