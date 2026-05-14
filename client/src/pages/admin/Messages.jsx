import { useState, useEffect } from 'react';
import { PageWrapper, Card, Btn, Badge, Table, Tabs, Modal, Input, Select, SearchInput } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

// Schema enum MessageType: FEE_REMINDER | EXAM_REMINDER | ASSIGNMENT_DEADLINE | GENERAL_ANNOUNCEMENT
const MSG_TYPES = [
  { value: 'FEE_REMINDER', label: 'Fee Reminder' },
  { value: 'EXAM_REMINDER', label: 'Exam Reminder' },
  { value: 'ASSIGNMENT_DEADLINE', label: 'Assignment Deadline' },
  { value: 'GENERAL_ANNOUNCEMENT', label: 'General Announcement' },
];
const humanizeType = v => String(v || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const SCOPES = [
  { value: 'all', label: 'All Students' },
  { value: 'offline', label: 'Offline Students' },
  { value: 'online', label: 'Online Students' },
  { value: 'programme', label: 'By Programme' },
  { value: 'batch', label: 'By Batch' },
  { value: 'individual', label: 'Specific Students' },
];
const TAGS = ['{student_name}', '{balance_due}', '{due_date}', '{exam_date}', '{exam_name}', '{subject_name}', '{deadline}', '{programme}'];

export default function Messages() {
  const [tab, setTab] = useState('compose');
  // MessageType enum is UPPERCASE on the wire. Default to GENERAL_ANNOUNCEMENT
  // so an admin who never touches the Type dropdown still submits a valid value.
  const [form, setForm] = useState({ type: 'GENERAL_ANNOUNCEMENT', scope: 'all', subject: '', body: '', channels: { email: true, sms: false, whatsapp: false }, programmeId: '', batchId: '' });
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  // Debounce the picker search so we don't hit /users on every keystroke —
  // pre-fix this hammered the backend with one request per character.
  const [debouncedPickerSearch, setDebouncedPickerSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPickerSearch(pickerSearch), 250);
    return () => clearTimeout(t);
  }, [pickerSearch]);
  const [previewRecipients, setPreviewRecipients] = useState(null);
  const [queryId, setQueryId] = useState(null);
  const [response, setResponse] = useState('');

  const { data: messages } = useApi('/messages');
  const { data: queries, refetch: refetchQ } = useApi('/queries');
  const { data: settings } = useApi('/settings');
  const { data: progData } = useApi('/programmes');
  const { data: pickerStudents } = useApi(pickerOpen ? `/users?role=STUDENT&search=${encodeURIComponent(debouncedPickerSearch)}` : null, [pickerOpen, debouncedPickerSearch]);

  const settingsMap = settings?.settings || settings || {};
  const configured = settingsMap.communication || {};
  const canSMS = !!configured.msg91_key || !!configured.twilio_account_sid;
  const canWhatsApp = !!configured.whatsapp_business_id;

  const programmes = progData?.programmes || [];
  const allBatches = programmes.flatMap(p => (p.batches || []).map(b => ({ value: b.id, label: `${p.name} – ${b.name}` })));

  const buildRecipientScope = () => {
    const scope = { type: form.scope };
    if (form.scope === 'individual') scope.studentIds = selectedStudentIds;
    if (form.scope === 'programme') scope.programmeId = form.programmeId;
    if (form.scope === 'batch') scope.batchId = form.batchId;
    return scope;
  };

  const handlePreview = async () => {
    if (form.scope === 'individual' && selectedStudentIds.length === 0) {
      alert('Please select at least one recipient.');
      return;
    }
    try {
      const { data } = await api.post('/messages/preview-recipients', { recipientScope: buildRecipientScope() });
      setPreviewRecipients(data);
    } catch (e) { alert('Preview failed: ' + (e.response?.data?.error || e.message)); }
  };

  const [sending, setSending] = useState(false);
  const handleSend = async () => {
    if (sending) return;
    if (form.scope === 'individual' && selectedStudentIds.length === 0) {
      alert('Please select at least one recipient.');
      return;
    }
    if (!form.subject || !form.body) {
      alert('Subject and message body are required.');
      return;
    }
    const channelArr = Object.entries(form.channels || {}).filter(([_, on]) => on).map(([ch]) => ch);
    if (channelArr.length === 0) {
      alert('Select at least one channel.');
      return;
    }
    setSending(true);
    try {
      await api.post('/messages', {
        type: form.type, subject: form.subject, body: form.body,
        channels: channelArr,
        recipientScope: buildRecipientScope(),
      });
      setPreviewRecipients(null);
      setForm({ type: 'GENERAL_ANNOUNCEMENT', scope: 'all', subject: '', body: '', channels: { email: true, sms: false, whatsapp: false }, programmeId: '', batchId: '' });
      setSelectedStudentIds([]);
      alert('Message queued for sending.');
    } catch (e) { alert('Send failed: ' + (e?.response?.data?.error || e.message)); }
    finally { setSending(false); }
  };

  const handleResolve = async (id) => {
    if (!response || !response.trim()) {
      alert('Please enter a response before resolving the query.');
      return;
    }
    try {
      await api.put(`/queries/${id}/respond`, { response, status: 'RESOLVED' });
      setQueryId(null); setResponse(''); refetchQ();
    } catch (e) {
      alert('Failed to resolve query: ' + (e?.response?.data?.error || e.message));
    }
  };

  const insertTag = (tag) => setForm(f => ({ ...f, body: f.body + ' ' + tag }));

  const handleScopeChange = (newScope) => {
    setForm(f => ({ ...f, scope: newScope, programmeId: '', batchId: '' }));
    if (newScope !== 'individual') setSelectedStudentIds([]);
    setPreviewRecipients(null);
  };

  const toggleStudent = (id) => {
    setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Server returns nested `student.studentProfile.firstName` etc., and statuses
  // are UPPERCASE (OPEN / IN_PROGRESS / RESOLVED). Render from that shape.
  const qCols = [
    { key: 'student', label: 'Student', render: (_, row) => {
      const sp = row?.student?.studentProfile;
      const name = sp ? `${sp.firstName || ''} ${sp.lastName || ''}`.trim() : (row?.student?.email || '—');
      return <strong>{name}</strong>;
    } },
    { key: 'category', label: 'Category', render: v => <Badge color="navy">{String(v || '').toLowerCase().replace(/_/g, ' ')}</Badge> },
    { key: 'subject', label: 'Subject', render: v => <span style={{ fontSize: 13 }}>{v}</span> },
    { key: 'status', label: 'Status', render: v => {
      const k = String(v || '').toUpperCase();
      const color = k === 'RESOLVED' ? 'green' : k === 'OPEN' ? 'amber' : 'teal';
      return <Badge color={color}>{k.toLowerCase().replace(/_/g, ' ')}</Badge>;
    } },
    { key: 'slaDeadline', label: 'SLA', render: v => v && new Date(v) < new Date() ? <span style={{ color: '#991B1B', fontWeight: 600, fontSize: 12 }}>OVERDUE</span> : <span style={{ fontSize: 12 }}>{v ? new Date(v).toLocaleDateString('en-IN') : '—'}</span> },
    { key: 'id', label: '', render: id => <Btn size="sm" onClick={() => setQueryId(id)}>Respond</Btn> },
  ];

  return (
    <PageWrapper title="Messages & Queries" subtitle="Send communications and manage student queries">
      <Card>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'compose', label: 'Compose' }, { value: 'sent', label: 'Sent Log' }, { value: 'queries', label: `Student Queries ${queries?.total > 0 ? `(${queries.total})` : ''}` }]} />

        {tab === 'compose' && (
          <div style={{ marginTop: 20, maxWidth: 640 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <Select label="Message Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} options={MSG_TYPES} />
              <Select label="Recipients" value={form.scope} onChange={e => handleScopeChange(e.target.value)} options={SCOPES} />
            </div>

            {form.scope === 'programme' && (
              <div style={{ marginBottom: 14 }}>
                <Select label="Programme" value={form.programmeId} onChange={e => setForm(f => ({ ...f, programmeId: e.target.value }))}
                  options={[{ value: '', label: '— Select programme —' }, ...programmes.map(p => ({ value: p.id, label: p.name }))]} />
              </div>
            )}

            {form.scope === 'batch' && (
              <div style={{ marginBottom: 14 }}>
                <Select label="Batch" value={form.batchId} onChange={e => setForm(f => ({ ...f, batchId: e.target.value }))}
                  options={[{ value: '', label: '— Select batch —' }, ...allBatches]} />
              </div>
            )}

            {form.scope === 'individual' && (
              <div style={{ marginBottom: 14, padding: '12px 16px', background: '#EEF4FA', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#0F2B4A', fontSize: 14 }}>
                    {selectedStudentIds.length === 0 ? 'No recipients selected' : `${selectedStudentIds.length} student${selectedStudentIds.length === 1 ? '' : 's'} selected`}
                  </div>
                  <div style={{ fontSize: 12, color: '#5A6272', marginTop: 2 }}>Pick specific students to message individually.</div>
                </div>
                <Btn variant="outline" size="sm" onClick={() => setPickerOpen(true)}>Select Recipients</Btn>
              </div>
            )}

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
              {!canSMS && !canWhatsApp && <div style={{ fontSize: 11, color: '#7B8494', marginTop: 6 }}>Configure SMS/WhatsApp in System Settings to enable additional channels.</div>}
            </div>
            {previewRecipients && (
              <div style={{ padding: '12px 16px', background: '#EEF4FA', borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, color: '#0F2B4A' }}>{previewRecipients.count} recipient{previewRecipients.count === 1 ? '' : 's'}</div>
                <div style={{ fontSize: 12, color: '#5A6272', marginTop: 4 }}>{(previewRecipients.recipients || []).slice(0, 5).map(r => r.name).filter(Boolean).join(', ')}{previewRecipients.recipients?.length > 5 ? '…' : ''}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="outline" onClick={handlePreview}>Preview Recipients</Btn>
              <Btn onClick={handleSend} disabled={sending}>{sending ? 'Sending…' : 'Send Message'}</Btn>
            </div>
          </div>
        )}

        {tab === 'sent' && (
          <div style={{ marginTop: 20 }}>
            <Table columns={[
              { key: 'subject', label: 'Subject', render: v => <strong style={{ fontSize: 13 }}>{v}</strong> },
              { key: 'type', label: 'Type', render: v => <Badge color="navy">{humanizeType(v)}</Badge> },
              { key: 'recipientCount', label: 'Recipients', render: v => v || '—' },
              { key: 'channels', label: 'Channels', render: v => {
                const list = Array.isArray(v) ? v : Object.entries(v || {}).filter(([_, on]) => on).map(([ch]) => ch);
                return list.map(ch => <Badge key={ch} color="teal" style={{ marginRight: 4 }}>{ch}</Badge>);
              }},
              { key: 'sentAt', label: 'Sent', render: v => v ? new Date(v).toLocaleDateString('en-IN') : '—' },
              { key: 'status', label: 'Status', render: v => <Badge color={v === 'SENT' || v === 'sent' ? 'green' : v === 'DRAFT' || v === 'draft' ? 'gray' : 'red'}>{String(v || '').toLowerCase()}</Badge> },
            ]} rows={messages?.messages || []} />
          </div>
        )}

        {tab === 'queries' && (
          <div style={{ marginTop: 20 }}>
            <Table columns={qCols} rows={queries?.queries || []} />
          </div>
        )}
      </Card>

      {/* Recipient picker modal */}
      {pickerOpen && (
        <Modal title="Select Recipients" onClose={() => setPickerOpen(false)} wide>
          <SearchInput value={pickerSearch} onChange={setPickerSearch} placeholder="Search by name, ID or email..." style={{ marginBottom: 12 }} />
          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #DDE1E7', borderRadius: 8 }}>
            {(pickerStudents?.users || []).map(s => {
              const fn = s.firstName || s.studentProfile?.firstName || '';
              const ln = s.lastName || s.studentProfile?.lastName || '';
              const checked = selectedStudentIds.includes(s.id);
              return (
                <label key={s.id} style={{ display: 'flex', gap: 12, padding: '10px 12px', borderBottom: '1px solid #EEF4FA', cursor: 'pointer', alignItems: 'center', background: checked ? '#EEF4FA' : '#fff' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleStudent(s.id)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{fn} {ln}</div>
                    <div style={{ fontSize: 12, color: '#7B8494' }}>{s.userIdDisplay} · {s.email}</div>
                  </div>
                </label>
              );
            })}
            {(pickerStudents?.users || []).length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: '#7B8494', fontSize: 13 }}>
                {pickerSearch ? 'No students found.' : 'Start typing to search students.'}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 16, alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: '#5A6272' }}>{selectedStudentIds.length} selected</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="outline" onClick={() => setSelectedStudentIds([])}>Clear All</Btn>
              <Btn onClick={() => setPickerOpen(false)}>Done</Btn>
            </div>
          </div>
        </Modal>
      )}

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
