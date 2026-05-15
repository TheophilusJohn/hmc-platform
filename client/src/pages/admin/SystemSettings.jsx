import { useState, useEffect } from 'react';
import { PageWrapper, Card, Btn, Input, Tabs, Table } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

export default function SystemSettings() {
  const [tab, setTab] = useState('college');
  const { data, refetch } = useApi('/settings');
  const { data: completion } = useApi('/settings/completion');
  const [settings, setSettings] = useState({});

  useEffect(() => { if (data) setSettings(data?.settings || data || {}); }, [data]);

  const handleSave = async (section) => {
    try {
      await api.put(`/settings`, { [section]: settings[section] });
      refetch();
      alert('Settings saved.');
    } catch (e) {
      // Pre-fix this swallowed errors and always alerted "saved" — admins had
      // no way to know a 5xx had silently dropped their config change.
      alert('Failed to save: ' + (e?.response?.data?.error || e.message));
    }
  };

  const set = (section, key, val) => setSettings(s => ({ ...s, [section]: { ...(s[section] || {}), [key]: val } }));
  const get = (section, key, def = '') => settings[section]?.[key] ?? def;

  // 'banks' and 'privacy' had no render path — removed to avoid blank tabs.
  const tabs = [
    { value: 'college', label: 'College' },
    { value: 'communication', label: 'Communication' },
    { value: 'gateways', label: 'Payment Gateways' },
    { value: 'security', label: 'Security' },
    { value: 'audit', label: 'Audit Log' },
  ];

  return (
    <PageWrapper title="System Settings" subtitle="Configure the platform for HMC">
      {completion && (
        <div style={{ marginBottom: 20, padding: '16px 20px', background: '#fff', border: '1px solid #DDE1E7', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2B4A' }}>Setup Completion — {completion.percent}%</div>
            </div>
            <span style={{ fontSize: 13, color: '#7B8494' }}>{completion.completed}/{completion.total} sections</span>
          </div>
          <div style={{ height: 6, background: '#DDE1E7', borderRadius: 3 }}>
            <div style={{ height: '100%', width: `${completion.percent}%`, background: completion.percent === 100 ? '#166534' : '#C9920A', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          {completion.incomplete?.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#92400E' }}>Incomplete: {completion.incomplete.join(', ')}</div>
          )}
        </div>
      )}

      <Card>
        <Tabs value={tab} onChange={setTab} tabs={tabs} variant="pill" />

        {tab === 'college' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Input label="College Name" value={get('college_info','name')} onChange={e => set('college_info','name',e.target.value)} />
              <Input label="Short Name" value={get('college_info','short_name')} onChange={e => set('college_info','short_name',e.target.value)} />
              <Input label="Address" value={get('college_info','address')} onChange={e => set('college_info','address',e.target.value)} />
              <Input label="City" value={get('college_info','city')} onChange={e => set('college_info','city',e.target.value)} />
              <Input label="State" value={get('college_info','state')} onChange={e => set('college_info','state',e.target.value)} />
              <Input label="PIN Code" value={get('college_info','pin')} onChange={e => set('college_info','pin',e.target.value)} />
              <Input label="Phone" value={get('college_info','phone')} onChange={e => set('college_info','phone',e.target.value)} />
              <Input label="Website" value={get('college_info','website')} onChange={e => set('college_info','website',e.target.value)} />
              <Input label="Accreditation Body" value={get('college_info','accreditation')} onChange={e => set('college_info','accreditation',e.target.value)} />
              <Input label="Registrar Email" value={get('college_info','registrar_email')} onChange={e => set('college_info','registrar_email',e.target.value)} />
            </div>
            <Btn style={{ marginTop: 20 }} onClick={() => handleSave('college_info')}>Save College Info</Btn>
          </div>
        )}

        {tab === 'communication' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Input label="Phone (+91)" value={get('communication_phone','phone_number')} onChange={e => set('communication_phone','phone_number',e.target.value)} />
              <Input label="WhatsApp Business ID" value={get('communication_phone','whatsapp_business_id')} onChange={e => set('communication_phone','whatsapp_business_id',e.target.value)} />
              <Input label="MSG91 API Key (India SMS)" value={get('communication_phone','msg91_key')} onChange={e => set('communication_phone','msg91_key',e.target.value)} />
              <Input label="Twilio Account SID" value={get('communication_phone','twilio_account_sid')} onChange={e => set('communication_phone','twilio_account_sid',e.target.value)} />
              <Input label="Twilio Auth Token" value={get('communication_phone','twilio_auth_token')} onChange={e => set('communication_phone','twilio_auth_token',e.target.value)} />
              <Input label="Twilio Phone Number" value={get('communication_phone','twilio_phone')} onChange={e => set('communication_phone','twilio_phone',e.target.value)} />
              <Input label="SendGrid API Key" type="password" value={get('sendgrid','api_key')} onChange={e => set('sendgrid','api_key',e.target.value)} />
            </div>
            <Btn style={{ marginTop: 20 }} onClick={() => { handleSave('communication_phone'); handleSave('sendgrid'); }}>Save Communication</Btn>
          </div>
        )}

        {tab === 'gateways' && (
          <div style={{ marginTop: 20 }}>
            <h4 style={{ fontFamily: "'Playfair Display',serif", color: '#0F2B4A', margin: '0 0 16px' }}>Razorpay</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <Input label="API Key ID" value={get('razorpay','key_id')} onChange={e => set('razorpay','key_id',e.target.value)} />
              <Input label="API Key Secret" type="password" value={get('razorpay','key_secret')} onChange={e => set('razorpay','key_secret',e.target.value)} />
              <Input label="Webhook Secret" type="password" value={get('razorpay','webhook_secret')} onChange={e => set('razorpay','webhook_secret',e.target.value)} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                <input type="checkbox" checked={get('razorpay','test_mode',true)} onChange={e => set('razorpay','test_mode',e.target.checked)} />
                Test Mode
              </label>
            </div>
            <h4 style={{ fontFamily: "'Playfair Display',serif", color: '#0F2B4A', margin: '0 0 16px' }}>Wise</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Input label="API Key" type="password" value={get('wise','api_key')} onChange={e => set('wise','api_key',e.target.value)} />
              <Input label="Profile ID" value={get('wise','receiving_account_id')} onChange={e => set('wise','receiving_account_id',e.target.value)} />
            </div>
            <Btn style={{ marginTop: 20 }} onClick={() => { handleSave('razorpay'); handleSave('wise'); }}>Save Gateways</Btn>
          </div>
        )}

        {tab === 'security' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Input label="Session Timeout (minutes)" type="number" value={get('security','session_timeout_mins',480)} onChange={e => set('security','session_timeout_mins',e.target.value)} />
              <Input label="Max Login Attempts" type="number" value={get('security','max_login_attempts',5)} onChange={e => set('security','max_login_attempts',e.target.value)} />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 16 }}>
              <input type="checkbox" checked={get('security','two_fa_required',false)} onChange={e => set('security','two_fa_required',e.target.checked)} />
              Require 2FA for Admin users
            </label>
            <Btn style={{ marginTop: 20 }} onClick={() => handleSave('security')}>Save Security</Btn>
          </div>
        )}

        {tab === 'audit' && (
          <AuditLog />
        )}
      </Card>
    </PageWrapper>
  );
}

function AuditLog() {
  const [page, setPage] = useState(1);
  const { data } = useApi(`/settings/audit-log?page=${page}`);
  const cols = [
    { key: 'actorName', label: 'Actor', render: v => <strong style={{ fontSize: 13 }}>{v}</strong> },
    { key: 'action', label: 'Action', render: v => <code style={{ fontSize: 12, background: '#EEF4FA', padding: '2px 6px', borderRadius: 4 }}>{v}</code> },
    { key: 'tableName', label: 'Table', render: v => <span style={{ fontSize: 12, color: '#5A6272' }}>{v}</span> },
    { key: 'timestamp', label: 'When', render: v => <span style={{ fontSize: 12, color: '#7B8494' }}>{new Date(v).toLocaleString('en-IN')}</span> },
    { key: 'ipAddress', label: 'IP', render: v => <span style={{ fontSize: 12, color: '#A0A8B4' }}>{v}</span> },
  ];
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, color: '#7B8494', marginBottom: 12 }}>Audit log is immutable and read-only. Every action ever taken is permanently recorded here.</div>
      <Table columns={cols} rows={data?.logs || []} />
    </div>
  );
}
