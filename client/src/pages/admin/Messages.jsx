import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Table, Tabs, Modal, Input, Select } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const MSG_TYPES = [{ value: 'fee', label: 'Fee Reminder' }, { value: 'exam', label: 'Exam Reminder' }, { value: 'assignment', label: 'Assignment Deadline' }, { value: 'general', label: 'General Announcement' }];
const SCOPES = [{ value: 'all', label: 'All Students' }, { value: 'offline', label: 'Offline Students' }, { value: 'online', label: 'Online Students' }, { value: 'programme', label: 'By Programme' }, { value: 'batch', label: 'By Batch' }];
const TAGS = ['{student_name}', '{balance_due}', '{due_date}', '{exam_date}', '{exam_name}', '{subject_name}', '{deadline}', '{programme}'];

export default function Messages() {
  const [tab, setTab] = useState('compose');
  const [form, setForm] = useState({ type: 'general', scope: 'all', subject: '', body: '', channels: { email: true, sms: false, whatsapp: false } });
  const [previewRecipients, setPreviewRecipients] = useState(null);
  const [queryId, setQueryId] = useState(null);
  const [response, setResponse] = useState('');
  const { data: messages } = useApi('/messages');
  const { data: queries, refetch: refetchQ } = useApi('/queries');
  const { data: settings } = useApi('/settings');

  const configured = settings?.communication || {};
  const canSMS = !!configured.msg91_key || !!configured.twilio_account_sid;
  const canWhatsApp = !!configured.whatsapp_business_id;

  const handlePreview = async () => {
    const { data } = await api.post('/messages/preview-recipients', { scope: form.scope });
    setPreviewRecipients(data);
  };

  const handleSend = async () => {
    await api.post('/messages', form);
    setPreviewRecipients(null);
    setForm({ type: 'general', scope: 'all', subject: '', body: '', channels: { email: true, sms: false, whatsapp: false } });
  };

  const handleResolve = async (id) => {
    await api.put(`/queries/${id}/respond`, { response, status: 'resolved' });
    setQueryId(null); setResponse(''); refetchQ();
  };

  const insertTag = (tag) => setForm(f => ({ ...f, body: f.body + ' ' + tag }));

  const qCols = [
    { key: 'studentName', label: 'Student', render: v => <strong>{v}</strong> },
    { key: 'category', label: 'Category', render: v => <Badge color="navy">{v}</Badge> },
    { key: 'subject', label: 'Subject', render: v => <span style={{ fontSize: 13 }}>{v}</span> },
    { key: 'status', label: 'Status', render: v => <Badge color={v === 'resolved' ? 'green' : v === 'open' ? 'amber' : 'teal'}>{v}</Badge> },
    { key: 'slaDeadline', label: 'SLA', render: v => v && new Date(v) < new Date() ? <span style={{ color: '#991B1B', fontWeight: 600, fontSize: 12 }}>OVERDUE</span> : <span style={{ fontSize: 12 }}>{v ? new Date(v).toLocaleDateString('en-IN') : '—'}</span> },
    { key: 'id', label: '', render: id => <Btn size="sm" onClick={() => setQueryId(id)}>Respond</Btn> },
  ];

  return (
    <PageWrapper title="Messages & Queries" subtitle="Send communications and manage student queries">
      <Card>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'compose', label: 'Compose' }, { value: 'sent', label: 'Sent Log' }, { value: 'queries', label: `Student Queries ${queries?.total > 0 ? `(${queries.total})` : ''}` }]} />

        {tab === 'compose' && (
          <div style={{ marginTop: 20, maxWidth: 600 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <Select label="Message Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} options={MSG_TYPES} />
              <Select label="Recipients" value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} options={SCOPES} />
            </div>
            <Input label="Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} style={{ marginBottom: 14 }} />
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Message Body</label>
              <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TAGS.map(t => <button key={t} onClick={() => insertTag(t)} style={{ padding: '3px 8px', fontSize: 11, background: '#EEF4FA', border: '1px solid #DDE1E7', borderRadius: 4, cursor: 'pointer', color: '#0F2B4A' }}>{t}</button>)}
              </div>
              <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                style={{ width: '100%', minHeight: 120, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', marginBottom: 8, display: 'block' }}>Send via</label>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={form.channels.email} onChange={e => setForm(f => ({ ...f, channels: { ...f.channels, email: e.target.checked } }))} /> Email</label>
                {canSMS && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={form.channels.sms} onChange={e => setForm(f => ({ ...f, channels: { ...f.channels, sms: e.target.checked } }))} /> SMS</label>}
                {canWhatsApp && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={form.channels.whatsapp} onChange={e => setForm(f => ({ ...f, channels: { ...f.channels, whatsapp: e.target.checked } }))} /> WhatsApp</label>}
              </div>
            </div>
            {previewRecipients && (
              <div style={{ padding: '12px 16px', background: '#EEF4FA', borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, color: '#0F2B4A' }}>{previewRecipients.count} recipients</div>
                <div style={{ fontSize: 12, color: '#5A6272', marginTop: 4 }}>{previewRecipients.samples?.join(', ')}...</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="outline" onClick={handlePreview}>Preview Recipients</Btn>
              <Btn onClick={handleSend}>Send Message</Btn>
            </div>
          </div>
        )}

        {tab === 'sent' && (
          <div style={{ marginTop: 20 }}>
            <Table columns={[
              { key: 'subject', label: 'Subject', render: v => <strong style={{ fontSize: 13 }}>{v}</strong> },
              { key: 'type', label: 'Type', render: v => <Badge color="navy">{v}</Badge> },
              { key: 'recipientCount', label: 'Recipients', render: v => v },
              { key: 'channels', label: 'Channels', render: v => Object.entries(v || {}).filter(([,on]) => on).map(([ch]) => <Badge key={ch} color="teal" style={{ marginRight: 4 }}>{ch}</Badge>) },
              { key: 'sentAt', label: 'Sent', render: v => new Date(v).toLocaleDateString('en-IN') },
              { key: 'status', label: 'Status', render: v => <Badge color={v === 'sent' ? 'green' : 'red'}>{v}</Badge> },
            ]} rows={messages?.messages || []} />
          </div>
        )}

        {tab === 'queries' && (
          <div style={{ marginTop: 20 }}>
            <Table columns={qCols} rows={queries?.queries || []} />
          </div>
        )}
      </Card>

      {queryId && (
        <Modal title="Respond to Query" onClose={() => setQueryId(null)}>
          <div style={{ marginBottom: 12, fontSize: 13, color: '#5A6272' }}>Write your response below. The student will be notified immediately.</div>
          <textarea value={response} onChange={e => setResponse(e.target.value)}
            style={{ width: '100%', minHeight: 100, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'DM Sans' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="outline" onClick={() => setQueryId(null)}>Cancel</Btn>
            <Btn onClick={() => handleResolve(queryId)}>Send & Resolve</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
