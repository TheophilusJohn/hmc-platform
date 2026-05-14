import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Tabs, Modal } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const EMPTY_COMPOSE = { recipientUserId: '', subject: '', body: '' };

export default function FacultyMessages() {
  const [tab, setTab] = useState('inbox');
  const [compose, setCompose] = useState(false);
  const [form, setForm] = useState(EMPTY_COMPOSE);
  // Clicked-on message detail (pre-fix the row had no detail view, so unread
  // never decremented and the body was truncated to 150 chars forever).
  const [open, setOpen] = useState(null);
  const [sending, setSending] = useState(false);

  const { data: messages, refetch } = useApi(`/direct-messages?box=${tab}`, [tab]);
  // Recipient pool: students you teach (default) and staff (so faculty can
  // reply to messages from admins/TAs/admissions, not just students).
  const { data: students } = useApi('/students?mine=true');
  const { data: staff } = useApi('/users?role=FULL_ADMIN,TEACHER_ADMIN,ADMISSIONS_OFFICER,FACULTY');
  const msgs = messages?.messages || [];

  const handleOpen = async (m) => {
    setOpen(m);
    if (tab === 'inbox' && !m.isRead) {
      try {
        await api.put(`/direct-messages/${m.id}/read`);
        refetch();
      } catch (_e) {}
    }
  };

  const handleSend = async () => {
    if (sending) return;
    if (!form.recipientUserId || !form.subject.trim() || !form.body.trim()) {
      alert('Recipient, subject and body all required.');
      return;
    }
    setSending(true);
    try {
      await api.post('/direct-messages', {
        recipientId: form.recipientUserId,
        subject: form.subject,
        body: form.body,
      });
      // Reset cleanly so the next compose isn't pre-filled with stale state.
      setCompose(false);
      setForm(EMPTY_COMPOSE);
      setTab('sent');
      refetch();
    } catch (e) {
      alert('Send failed: ' + (e?.response?.data?.error || e.message));
    } finally {
      setSending(false);
    }
  };

  const closeCompose = () => {
    setCompose(false);
    setForm(EMPTY_COMPOSE);
  };

  // Build a combined recipient list. Filter out self (the FE doesn't know our
  // user id reliably; rely on `staff` filter on the server side to drop self
  // if it does).
  const recipientOptions = [];
  for (const s of (students?.students || [])) {
    if (s.userId) recipientOptions.push({ value: s.userId, label: `${s.firstName} ${s.lastName} (${s.userIdDisplay}) — Student` });
  }
  for (const u of (staff?.users || [])) {
    recipientOptions.push({ value: u.id, label: `${u.firstName || ''} ${u.lastName || ''} (${u.userIdDisplay}) — ${u.role.replace(/_/g, ' ')}` });
  }

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
            <div key={m.id} onClick={() => handleOpen(m)}
              style={{ padding: '12px 0', borderBottom: '1px solid #DDE1E7', cursor: 'pointer' }}>
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

      {open && (
        <Modal title={open.subject || 'Message'} onClose={() => setOpen(null)}>
          <div style={{ fontSize: 12, color: '#7B8494', marginBottom: 8 }}>
            {tab === 'sent' ? `To: ${open.recipientName || '—'}` : `From: ${open.senderName || '—'}`}
            <span style={{ marginLeft: 8 }}>{new Date(open.createdAt).toLocaleString('en-IN')}</span>
          </div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: '#1A1D23', lineHeight: 1.5 }}>{open.body}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="outline" onClick={() => setOpen(null)}>Close</Btn>
            {tab === 'inbox' && open.senderId && (
              <Btn onClick={() => {
                setForm({
                  recipientUserId: open.senderId,
                  subject: open.subject?.startsWith('Re: ') ? open.subject : `Re: ${open.subject || ''}`,
                  body: '',
                });
                setOpen(null);
                setCompose(true);
              }}>Reply</Btn>
            )}
          </div>
        </Modal>
      )}

      {compose && (
        <Modal title="New Message" onClose={closeCompose}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>To</label>
              <select value={form.recipientUserId} onChange={e => setForm(f => ({ ...f, recipientUserId: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                <option value="">Select recipient…</option>
                {recipientOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
            <Btn variant="outline" onClick={closeCompose}>Cancel</Btn>
            <Btn onClick={handleSend} disabled={sending}>{sending ? 'Sending…' : 'Send'}</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
