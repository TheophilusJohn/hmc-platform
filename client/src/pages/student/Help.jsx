// Help.jsx
import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Tabs, Input, Select } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const CATEGORIES = ['fees', 'academics', 'exam', 'hostel', 'technical', 'general'];

export function Help() {
  const [tab, setTab] = useState('submit');
  const [form, setForm] = useState({ category: 'general', subject: '', body: '' });
  const { data: queries, refetch } = useApi('/queries/my');

  const handleSubmit = async () => {
    await api.post('/queries', form);
    setForm({ category: 'general', subject: '', body: '' }); refetch();
    setTab('history');
  };

  const statusColors = { open: 'amber', in_progress: 'teal', resolved: 'green', closed: 'gray' };

  return (
    <PageWrapper title="Help & Queries" subtitle="Submit queries and track responses">
      <Card>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'submit', label: 'New Query' }, { value: 'history', label: 'My Queries' }]} />
        {tab === 'submit' && (
          <div style={{ marginTop: 20, maxWidth: 500 }}>
            <div style={{ display: 'grid', gap: 14 }}>
              <Select label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                options={CATEGORIES.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))} />
              <Input label="Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Message</label>
                <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  style={{ width: '100%', minHeight: 120, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans', boxSizing: 'border-box' }} />
              </div>
            </div>
            <Btn style={{ marginTop: 16 }} onClick={handleSubmit} disabled={!form.subject || !form.body}>Submit Query</Btn>
          </div>
        )}
        {tab === 'history' && (
          <div style={{ marginTop: 16 }}>
            {(queries?.queries || []).map(q => (
              <div key={q.id} style={{ padding: '14px 0', borderBottom: '1px solid #DDE1E7' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <Badge color="navy">{q.category}</Badge>
                  <Badge color={statusColors[q.status] || 'gray'}>{q.status.replace(/_/g, ' ')}</Badge>
                </div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{q.subject}</div>
                <div style={{ fontSize: 12, color: '#7B8494', marginTop: 2 }}>{new Date(q.createdAt).toLocaleDateString('en-IN')}</div>
                {q.response && (
                  <div style={{ marginTop: 8, padding: '10px 12px', background: '#F0FDF4', borderRadius: 6, fontSize: 13, color: '#166534' }}>
                    <strong>Response:</strong> {q.response}
                  </div>
                )}
              </div>
            ))}
            {(queries?.queries || []).length === 0 && <div style={{ color: '#7B8494', fontSize: 13, padding: '12px 0' }}>No queries submitted yet.</div>}
          </div>
        )}
      </Card>
    </PageWrapper>
  );
}
export default Help;
