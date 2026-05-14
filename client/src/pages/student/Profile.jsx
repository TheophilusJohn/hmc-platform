import { useState, useEffect } from 'react';
import { PageWrapper, Card, Btn, Input } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

export default function Profile() {
  const { data, refetch } = useApi('/me/profile');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState('');

  useEffect(() => { if (data) setForm({ phone: data.phone, permanentAddress: data.permanentAddress, emergencyContact: data.emergencyContact, emergencyPhone: data.emergencyPhone }); }, [data]);

  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.put('/me/profile', form);
      setEditing(false);
      refetch();
    } catch (e) {
      alert('Save failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePw = async () => {
    if (changingPw) return;
    if (pwForm.newPassword !== pwForm.confirm) { setPwError('Passwords do not match.'); return; }
    if (pwForm.newPassword.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    setChangingPw(true);
    try {
      await api.post('/auth/change-password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' }); setPwError('');
      alert('Password changed successfully.');
    } catch (e) {
      setPwError(e.response?.data?.error || e.response?.data?.message || 'Incorrect current password.');
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <PageWrapper title="My Profile" subtitle="Personal details and settings">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <Card title="Personal Information" action={<Btn size="sm" variant="outline" onClick={() => setEditing(!editing)}>{editing ? 'Cancel' : 'Edit'}</Btn>}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['Full Name', `${data?.firstName || ''} ${data?.lastName || ''}`],
              ['Student ID', data?.userIdDisplay],
              ['Email', data?.email],
              ['Programme', data?.programmeName],
              ['Year', data?.currentYear ? `Year ${data.currentYear}` : '—'],
              ['Student Type', data?.studentType],
              ['Study Mode', data?.studyMode],
              ['Batch', data?.batchName],
            ].map(([l, v]) => (
              <div key={l} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#7B8494', marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1D23' }}>{v || '—'}</div>
              </div>
            ))}
          </div>

          {editing && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: '#0F2B4A', margin: '0 0 14px' }}>Editable Fields</h4>
              <div style={{ display: 'grid', gap: 14 }}>
                <Input label="Phone" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Permanent Address</label>
                  <textarea value={form.permanentAddress || ''} onChange={e => setForm(f => ({ ...f, permanentAddress: e.target.value }))}
                    style={{ width: '100%', minHeight: 80, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', fontFamily: 'DM Sans' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Input label="Emergency Contact Name" value={form.emergencyContact || ''} onChange={e => setForm(f => ({ ...f, emergencyContact: e.target.value }))} />
                  <Input label="Emergency Phone" value={form.emergencyPhone || ''} onChange={e => setForm(f => ({ ...f, emergencyPhone: e.target.value }))} />
                </div>
              </div>
              <Btn style={{ marginTop: 16 }} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Btn>
            </div>
          )}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Academic Summary">
            {[['CGPA', data?.cgpa || '—'], ['Credits Earned', data?.creditsEarned || 0], ['Semesters Completed', data?.semestersCompleted || 0]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #DDE1E7', fontSize: 13 }}>
                <span style={{ color: '#7B8494' }}>{l}</span>
                <strong style={{ color: '#0F2B4A' }}>{v}</strong>
              </div>
            ))}
          </Card>

          <Card title="Change Password">
            <div style={{ display: 'grid', gap: 12 }}>
              <Input label="Current Password" type="password" value={pwForm.currentPassword} onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} />
              <Input label="New Password" type="password" value={pwForm.newPassword} onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} />
              <Input label="Confirm Password" type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
            {pwError && <div style={{ marginTop: 8, fontSize: 12, color: '#991B1B' }}>{pwError}</div>}
            <Btn size="sm" style={{ marginTop: 14 }} onClick={handleChangePw} disabled={changingPw}>{changingPw ? 'Changing…' : 'Change Password'}</Btn>
          </Card>
        </div>
      </div>
    </PageWrapper>
  );
}
