// BatchProgression.jsx
import { useState } from 'react';
import { PageWrapper, Card, Badge, Btn } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

export function BatchProgression() {
  const { data } = useApi('/programmes/batches?status=active');
  const batches = data?.batches || [];
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(null);

  const runProgression = async (batchId) => {
    // Progression is irreversible — confirm before firing. Pre-fix a single
    // mis-click moved the whole batch to the next academic year.
    const batch = batches.find(b => b.id === batchId);
    const label = batch ? `${batch.programmeName} — ${batch.name} (Year ${batch.currentYear})` : 'this batch';
    if (!window.confirm(`Run year-end progression for ${label}? This cannot be undone — students who pass will be advanced and flagged students will be queued for manual review.`)) {
      return;
    }
    setRunning(batchId);
    try {
      const { data } = await api.post(`/programmes/batches/${batchId}/progression`);
      setResult({ batchId, ...data });
    } catch (e) { alert(e.response?.data?.error || e.response?.data?.message || 'Failed to run progression'); }
    finally { setRunning(null); }
  };

  return (
    <PageWrapper title="Batch Progression" subtitle="Year-end progression check and advancement">
      <Card>
        <div style={{ padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, marginBottom: 20, fontSize: 13, color: '#92400E' }}>
          Progression advances students to the next academic year. Students failing two or more subjects or with attendance below 75% will be flagged for manual review.
        </div>
        {batches.map(b => (
          <div key={b.id} style={{ padding: '14px 0', borderBottom: '1px solid #DDE1E7', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{b.programmeName} — {b.name}</div>
              <div style={{ fontSize: 12, color: '#7B8494' }}>Year {b.currentYear} · {b.studentCount} students</div>
            </div>
            <Badge color={b.currentYear === b.durationYears ? 'teal' : 'navy'}>
              {b.currentYear === b.durationYears ? 'Final Year' : `Y${b.currentYear}`}
            </Badge>
            <Btn size="sm" onClick={() => runProgression(b.id)} disabled={running === b.id}>
              {running === b.id ? 'Running…' : 'Run Progression'}
            </Btn>
          </div>
        ))}
      </Card>

      {result && (
        <Card style={{ marginTop: 20, borderColor: '#166534' }} title="Progression Results">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ padding: '10px 16px', background: '#F0FDF4', borderRadius: 8 }}><div style={{ fontSize: 20, fontWeight: 700, color: '#166534' }}>{result.progressed}</div><div style={{ fontSize: 12, color: '#5A6272' }}>Progressed</div></div>
            <div style={{ padding: '10px 16px', background: '#FEF2F2', borderRadius: 8 }}><div style={{ fontSize: 20, fontWeight: 700, color: '#991B1B' }}>{result.flagged}</div><div style={{ fontSize: 12, color: '#5A6272' }}>Need Review</div></div>
            <div style={{ padding: '10px 16px', background: '#EEF4FA', borderRadius: 8 }}><div style={{ fontSize: 20, fontWeight: 700, color: '#0F2B4A' }}>{result.graduated}</div><div style={{ fontSize: 12, color: '#5A6272' }}>Graduated</div></div>
          </div>
          {result.flaggedStudents?.map(s => (
            <div key={s.id} style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: 6, marginBottom: 6, fontSize: 13 }}>
              <strong>{s.name}</strong>: {s.reason}
            </div>
          ))}
          <Btn variant="outline" style={{ marginTop: 12 }} onClick={() => setResult(null)}>Clear</Btn>
        </Card>
      )}
    </PageWrapper>
  );
}
export default BatchProgression;
