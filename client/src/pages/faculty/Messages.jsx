import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Tabs, Modal } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

export default function FacultyMessages() {
  const [tab, setTab] = useState('inbox');
  const [compose, setCompose] = useState(false);
  const [form, setForm] = useState({ recipientUserId: '', subject: '', body: '' });

  const { data: messages, refetch } = useApi(`/direct-messages?box=${tab}`, [tab]);
  const { data: students } = useApi('/students?mine=true');
  const msgs = messages?.messages || [];

  const handleSend = async () => {
    if (!form.recipientUserId || !form.subject.trim() || !form.body.trim()) {
      alert('Recipient, subject and body all required.');
      return;
    }
    try {
      await api.post('/direct-messages', {
        recipientId: form.recipientUserId,
        subject: form.subject,
        body: form.body,
      });
      setCompose(false);
      setForm({ recipientUserId: '', subject: '', body: '' });
      setTab('sent');
      refetch();
    } catch (e) {
      alert('Send failed: ' + (e?.response?.data?.error || e.message));
    }
  };

  return (
    <PageWrapper title="Messages" subtitle="Direct messages with students and staff">
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'inbox', label: `Inbox${messages?.unread ? ` (${messages.unread})` : ''}` },
            { value: 'sent',  label: 'Sent' }
          ]} />
          <Btn onClick={() => setCompose(true)}>+ New Message</Btn>
        </div>

        {msgs.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#7B8494', padding: 40 }}>No messages.</div>
        ) : (
          msgs.map(m => (
            <div key={m.id} style={{ padding: '12px 0', borderBottom: '1px solid #DDE1E7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <strong style={{ fontSize: 13 }}>{tab === 'sent' ? `To: ${m.recipientName || '—'}` : `From: ${m.senderName || '—'}`}</strong>
                {tab === 'inbox' && <Badge color={m.isRead ? 'gray' : 'navy'}>{m.isRead ? 'Read' : 'Unread'}</Badge>}
                <span style={{ fontSize: 11, color: '#7B8494', marginLeft: 'auto' }}>{new Date(m.createdAt).toLocaleDateString('en-IN')}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{m.subject}</div>
              <div style={{ fontSize: 12, color: '#5A6272' }}>{m.body?.slice(0, 150)}{m.body?.length > 150 ? '…' : ''}</div>
            </div>
          ))
        )}
      </Card>

      {compose && (
        <Modal title="New Message" onClose={() => setCompose(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>To</label>
              <select value={form.recipientUserId} onChange={e => setForm(f => ({ ...f, recipientUserId: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                <option value="">Select student…</option>
                {(students?.students || []).filter(s => s.userId).map(s => (
                  <option key={s.userId} value={s.userId}>{s.firstName} {s.lastName} ({s.userIdDisplay})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Subject</label>
              <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Subject"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Message</label>
              <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Message…"
                style={{ width: '100%', minHeight: 120, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, fontFamily: 'DM Sans', boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="outline" onClick={() => setCompose(false)}>Cancel</Btn>
            <Btn onClick={handleSend}>Send</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
