import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

export default function FacultyMessages() {
  const [compose, setCompose] = useState(false);
  const [form, setForm] = useState({ recipientId: '', subject: '', body: '' });
  const { data: messages, refetch } = useApi('/messages?mine=true');
  const { data: students } = useApi('/students?mine=true');
  const msgs = messages?.messages || [];

  const handleSend = async () => {
    await api.post('/messages', { ...form, type: 'direct' });
    setCompose(false); setForm({ recipientId: '', subject: '', body: '' }); refetch();
  };

  return (
    <PageWrapper title="Messages" subtitle="Direct messages with students and staff">
      <Card>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <Btn onClick={() => setCompose(!compose)}>+ New Message</Btn>
        </div>
        {compose && (
          <div style={{ padding: '16px', background: '#F8F9FA', borderRadius: 8, marginBottom: 20 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <select value={form.recipientId} onChange={e => setForm(f => ({ ...f, recipientId: e.target.value }))}
                style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                <option value="">To: Select student…</option>
                {(students?.students || []).map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.userIdDisplay})</option>)}
              </select>
              <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Subject"
                style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13 }} />
              <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Message…"
                style={{ width: '100%', minHeight: 80, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans', boxSizing: 'border-box', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={handleSend}>Send</Btn>
                <Btn variant="outline" onClick={() => setCompose(false)}>Cancel</Btn>
              </div>
            </div>
          </div>
        )}
        {msgs.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#7B8494', padding: 40 }}>No messages yet.</div>
        ) : (
          msgs.map(m => (
            <div key={m.id} style={{ padding: '12px 0', borderBottom: '1px solid #DDE1E7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <strong style={{ fontSize: 13 }}>{m.recipientName || m.senderName}</strong>
                <Badge color={m.read ? 'gray' : 'navy'}>{m.read ? 'Read' : 'Unread'}</Badge>
                <span style={{ fontSize: 11, color: '#7B8494', marginLeft: 'auto' }}>{new Date(m.createdAt).toLocaleDateString('en-IN')}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{m.subject}</div>
              <div style={{ fontSize: 12, color: '#5A6272' }}>{m.body?.slice(0, 100)}{m.body?.length > 100 ? '…' : ''}</div>
            </div>
          ))
        )}
      </Card>
    </PageWrapper>
  );
}
