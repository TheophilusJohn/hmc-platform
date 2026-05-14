import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Table, SearchInput, Modal, Input, Select, StatCard, Tabs } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const ROLE_LABELS = { FULL_ADMIN: 'Full Admin', TEACHER_ADMIN: 'Teacher-Admin', FACULTY: 'Faculty', ADMISSIONS_OFFICER: 'Admissions Officer', STUDENT: 'Student' };
const STATUS_COLORS = { ACTIVE: 'green', INACTIVE: 'red', GRADUATED: 'teal', SUSPENDED: 'amber', active: 'green', inactive: 'red', graduated: 'teal', suspended: 'amber' };

export default function UserManagement() {
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('hmc_user') || '{}'); } catch { return {}; } })();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [viewUser, setViewUser] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [setPwOpen, setSetPwOpen] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: 'STUDENT', programmeId: '', studyMode: 'OFFLINE', studentType: 'DOMESTIC' });

  const roleFilter = tab === 'all' ? '' : tab === 'students' ? 'STUDENT' : tab === 'faculty' ? 'FACULTY' : 'FULL_ADMIN,TEACHER_ADMIN,ADMISSIONS_OFFICER';
  const { data, isLoading, refetch } = useApi(`/users?search=${search}&role=${roleFilter}`, [search, tab]);
  const { data: progData } = useApi('/programmes');

  const users = data?.users || [];
  const programmes = progData?.programmes || [];
  const allBatches = programmes.flatMap(p => (p.batches || []).map(b => ({ value: b.id, label: `${p.name} – ${b.name}` })));

  // Server returns {users, total} only; derive the per-role counts here so the
  // header StatCards don't show 0. `withDues` isn't surfaced by the endpoint at
  // all — hide that tile until/if the server adds it.
  const studentCount = users.filter(u => u.role === 'STUDENT').length;
  const facultyCount = users.filter(u => u.role === 'FACULTY' || u.role === 'TEACHER_ADMIN').length;

  // After user creation we render the temp password in a proper modal with a
  // copy-to-clipboard button (instead of a native alert(), which makes copying
  // awkward and leaves the secret hanging in the OS-level dialog history).
  const [createdCreds, setCreatedCreds] = useState(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (creating) return;
    if (!form.firstName?.trim() || !form.lastName?.trim()) {
      window.alert('First name and last name are required.');
      return;
    }
    const email = String(form.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      window.alert('Please enter a valid email address.');
      return;
    }
    setCreating(true);
    try {
      const _res = await api.post('/users', { ...form, email });
      if (_res?.data?.tempPassword) {
        setCreatedCreds({
          name: `${form.firstName} ${form.lastName}`.trim(),
          email,
          userIdDisplay: _res.data.user?.userIdDisplay,
          tempPassword: _res.data.tempPassword,
        });
      }
      setAddOpen(false);
      setForm({ firstName: '', lastName: '', email: '', role: 'STUDENT', programmeId: '', studyMode: 'OFFLINE', studentType: 'DOMESTIC' });
      refetch();
    } catch (e) {
      window.alert('Failed to create user: ' + (e?.response?.data?.error || e.message));
    } finally {
      setCreating(false);
    }
  };

  const copyTempPw = async () => {
    if (!createdCreds?.tempPassword) return;
    try {
      await navigator.clipboard.writeText(createdCreds.tempPassword);
    } catch (_e) {
      // Clipboard API can be blocked (insecure context, permission denied) —
      // surface the password so admin can copy manually.
      window.prompt('Copy the temporary password:', createdCreds.tempPassword);
    }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this user? They will lose access immediately.')) return;
    try {
      await api.delete(`/users/${id}`);
      setViewUser(null);
      refetch();
    } catch (e) { alert(e.response?.data?.error || 'Deactivate failed'); }
  };

  const handleReactivate = async (id) => {
    try {
      await api.post(`/users/${id}/reactivate`);
      setViewUser(null);
      refetch();
    } catch (e) { alert(e.response?.data?.error || 'Reactivate failed'); }
  };

  const handleResetPw = async (id) => {
    try {
      const { data: r } = await api.post(`/users/${id}/reset-password`);
      if (r?.tempPassword) alert('Password reset!\n\nNew temporary password: ' + r.tempPassword);
      else alert('Password reset email sent.');
    } catch (e) { alert(e.response?.data?.error || 'Reset failed'); }
  };

  const handleSetPassword = async () => {
    if (!newPw || newPw.length < 8) { alert('Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { alert('Passwords do not match.'); return; }
    if (!window.confirm(`Set password for ${viewUser.userIdDisplay}? They will be able to log in with this password immediately.`)) return;
    try {
      await api.post(`/users/${viewUser.id}/set-password`, { password: newPw });
      alert('Password set successfully. Share it with the user securely.');
      setSetPwOpen(false);
      setNewPw(''); setConfirmPw(''); setShowPw(false);
    } catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)); }
  };

  const openEdit = async () => {
    try {
      const { data: r } = await api.get(`/users/${viewUser.id}`);
      const u = r.user;
      const sp = u.studentProfile;
      const fp = u.facultyProfile;
      setEditForm({
        firstName: sp?.firstName || fp?.firstName || '',
        lastName: sp?.lastName || fp?.lastName || '',
        email: u.email || '',
        phone: u.phone || '',
        status: u.status || 'ACTIVE',
        role: u.role,
        studentType: sp?.studentType || 'DOMESTIC',
        studyMode: sp?.studyMode || 'OFFLINE',
        batchId: sp?.batchId || '',
        programmeId: sp?.programmeId || '',
        designation: fp?.designation || '',
        qualification: fp?.qualification || '',
      });
      setEditOpen(true);
    } catch (e) { alert('Could not load user details'); }
  };

  const handleSaveEdit = async () => {
    try {
      const payload = { ...editForm };
      delete payload.role; // role is read-only
      await api.put(`/users/${viewUser.id}`, payload);
      setEditOpen(false);
      setViewUser(null);
      refetch();
    } catch (e) { alert('Save failed: ' + (e.response?.data?.error || e.message)); }
  };

  const cols = [
    { key: 'avatar', label: '', render: (_, r) => <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EEF4FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#0F2B4A', fontSize: 12 }}>{(r.firstName?.[0] || r.studentProfile?.firstName?.[0] || r.facultyProfile?.firstName?.[0] || '?')}{(r.lastName?.[0] || r.studentProfile?.lastName?.[0] || r.facultyProfile?.lastName?.[0] || '')}</div> },
    { key: 'name', label: 'Name', render: (_, r) => {
      const fn = r.firstName || r.studentProfile?.firstName || r.facultyProfile?.firstName || '';
      const ln = r.lastName || r.studentProfile?.lastName || r.facultyProfile?.lastName || '';
      return <div><div style={{ fontWeight: 500, color: '#1A1D23' }}>{fn} {ln}</div><div style={{ fontSize: 12, color: '#7B8494' }}>{r.userIdDisplay}</div></div>;
    } },
    { key: 'email', label: 'Email', render: v => <span style={{ color: '#5A6272', fontSize: 13 }}>{v}</span> },
    { key: 'role', label: 'Role', render: v => <Badge color="navy">{ROLE_LABELS[v] || v}</Badge> },
    { key: 'status', label: 'Status', render: v => <Badge color={STATUS_COLORS[v] || 'gray'}>{String(v || '').toLowerCase()}</Badge> },
  ];

  return (
    <PageWrapper title="User Management" subtitle="All users, roles and accounts">
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard icon="👥" label="Total Users" value={data?.total || 0} color="#0F2B4A" />
        <StatCard icon="🎒" label="Students" value={studentCount} color="#0F766E" />
        <StatCard icon="📚" label="Faculty" value={facultyCount} color="#6D28D9" />
      </div>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All' }, { value: 'students', label: 'Students' }, { value: 'faculty', label: 'Faculty' }, { value: 'staff', label: 'Staff' }]} />
          <div style={{ flex: 1 }} />
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, ID, email..." />
          <Btn onClick={() => setAddOpen(true)}>+ Add User</Btn>
        </div>
        <Table columns={cols} rows={users} loading={isLoading} onRowClick={r => setViewUser(r)} />
      </Card>

      {addOpen && (
        <Modal title="Add New User" onClose={() => setAddOpen(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input label="First Name" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
            <Input label="Last Name" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
            <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <Select label="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              options={[{ value: 'STUDENT', label: 'Student' }, { value: 'FACULTY', label: 'Faculty' }, { value: 'TEACHER_ADMIN', label: 'Teacher-Admin' }, { value: 'ADMISSIONS_OFFICER', label: 'Admissions Officer' }, { value: 'FULL_ADMIN', label: 'Full Admin' }]} />
            {form.role === 'STUDENT' && <>
              <Select label="Student Type" value={form.studentType} onChange={e => setForm(f => ({ ...f, studentType: e.target.value }))}
                options={[{ value: 'DOMESTIC', label: 'Domestic (India)' }, { value: 'INTERNATIONAL', label: 'International' }]} />
              <Select label="Study Mode" value={form.studyMode} onChange={e => setForm(f => ({ ...f, studyMode: e.target.value }))}
                options={[{ value: 'OFFLINE', label: 'Offline (Campus)' }, { value: 'ONLINE', label: 'Online' }]} />
            </>}
          </div>
          <div style={{ marginTop: 16, padding: '10px 12px', background: '#EEF4FA', borderRadius: 8, fontSize: 13, color: '#5A6272' }}>
            A temporary password will be generated and emailed to the user.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
            <Btn variant="outline" onClick={() => setAddOpen(false)}>Cancel</Btn>
            <Btn onClick={handleCreate}>Create User</Btn>
          </div>
        </Modal>
      )}

      {viewUser && !editOpen && (
        <Modal title={`${viewUser.firstName || viewUser.studentProfile?.firstName || viewUser.facultyProfile?.firstName || ''} ${viewUser.lastName || viewUser.studentProfile?.lastName || viewUser.facultyProfile?.lastName || viewUser.email}`} onClose={() => setViewUser(null)} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[['User ID', viewUser.userIdDisplay], ['Role', ROLE_LABELS[viewUser.role]], ['Email', viewUser.email], ['Phone', viewUser.phone || '—'], ['Status', viewUser.status], ['Joined', new Date(viewUser.createdAt).toLocaleDateString('en-IN')]].map(([l, v]) => (
              <div key={l} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#7B8494', marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 14, color: '#1A1D23', fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
          {viewUser.id === currentUser.id ? (
            <div style={{ padding: '10px 12px', background: '#EEF4FA', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, color: '#5A6272' }}>
              This is your own account. Use your profile page to edit your own details, or ask another admin to make role/status changes.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn onClick={openEdit}>Edit</Btn>
              <Btn variant="outline" onClick={() => handleResetPw(viewUser.id)}>Reset (random temp)</Btn>
              <Btn variant="outline" onClick={() => setSetPwOpen(true)}>Set Password</Btn>
              {viewUser.status === 'ACTIVE' && <Btn variant="danger" onClick={() => handleDeactivate(viewUser.id)}>Deactivate</Btn>}
              {viewUser.status === 'INACTIVE' && <Btn variant="outline" onClick={() => handleReactivate(viewUser.id)}>Reactivate</Btn>}
            </div>
          )}
        </Modal>
      )}

      {editOpen && (
        <Modal title="Edit User" onClose={() => setEditOpen(false)} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input label="First Name" value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} />
            <Input label="Last Name" value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} />
            <Input label="Email" type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            <Input label="Phone" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            <Select label="Status" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
              options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }, { value: 'GRADUATED', label: 'Graduated' }, { value: 'SUSPENDED', label: 'Suspended' }]} />
            <Input label="Role (read-only)" value={ROLE_LABELS[editForm.role] || editForm.role} disabled />
            {editForm.role === 'STUDENT' && <>
              <Select label="Student Type" value={editForm.studentType} onChange={e => setEditForm(f => ({ ...f, studentType: e.target.value }))}
                options={[{ value: 'DOMESTIC', label: 'Domestic' }, { value: 'INTERNATIONAL', label: 'International' }]} />
              <Select label="Study Mode" value={editForm.studyMode} onChange={e => setEditForm(f => ({ ...f, studyMode: e.target.value }))}
                options={[{ value: 'OFFLINE', label: 'Offline' }, { value: 'ONLINE', label: 'Online' }]} />
              <Select label="Programme" value={editForm.programmeId} onChange={e => setEditForm(f => ({ ...f, programmeId: e.target.value }))}
                options={[{ value: '', label: '— None —' }, ...programmes.map(p => ({ value: p.id, label: p.name }))]} />
              <Select label="Batch" value={editForm.batchId} onChange={e => setEditForm(f => ({ ...f, batchId: e.target.value }))}
                options={[{ value: '', label: '— None —' }, ...allBatches]} />
            </>}
            {['FACULTY','TEACHER_ADMIN'].includes(editForm.role) && <>
              <Input label="Designation" value={editForm.designation} onChange={e => setEditForm(f => ({ ...f, designation: e.target.value }))} />
              <Input label="Qualification" value={editForm.qualification} onChange={e => setEditForm(f => ({ ...f, qualification: e.target.value }))} />
            </>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
            <Btn variant="outline" onClick={() => setEditOpen(false)}>Cancel</Btn>
            <Btn onClick={handleSaveEdit}>Save Changes</Btn>
          </div>
        </Modal>
      )}

      {setPwOpen && viewUser && (
        <Modal title={`Set Password — ${viewUser.userIdDisplay}`} onClose={() => { setSetPwOpen(false); setNewPw(''); setConfirmPw(''); setShowPw(false); }}>
          <div style={{ padding: '10px 12px', background: '#FFFBF0', border: '1px solid #F5E6BE', borderRadius: 8, fontSize: 13, color: '#92400E', marginBottom: 14 }}>
            ⚠ This will set the user's actual password. They will be able to log in with it immediately. Share securely.
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Input label="New Password" type={showPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 8 characters" />
            <Input label="Confirm Password" type={showPw ? 'text' : 'password'} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#5A6272' }}>
              <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} />
              Show passwords
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => { setSetPwOpen(false); setNewPw(''); setConfirmPw(''); setShowPw(false); }}>Cancel</Btn>
            <Btn onClick={handleSetPassword}>Set Password</Btn>
          </div>
        </Modal>
      )}

      {createdCreds && (
        <Modal title="User Created — Temporary Credentials" onClose={() => setCreatedCreds(null)}>
          <div style={{ padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 13, color: '#92400E', marginBottom: 14 }}>
            ⚠ Share this credential with the user over a secure channel (not chat/SMS). They will be required to change it on first login.
          </div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 13 }}><strong>Name:</strong> {createdCreds.name}</div>
            <div style={{ fontSize: 13 }}><strong>Login (email):</strong> {createdCreds.email}</div>
            {createdCreds.userIdDisplay && <div style={{ fontSize: 13 }}><strong>User ID:</strong> {createdCreds.userIdDisplay}</div>}
            <div style={{ fontSize: 13 }}>
              <strong>Temporary Password:</strong>
              <code style={{ marginLeft: 8, padding: '4px 8px', background: '#F8F9FA', borderRadius: 4, fontSize: 14 }}>
                {createdCreds.tempPassword}
              </code>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="outline" onClick={copyTempPw}>Copy Password</Btn>
            <Btn onClick={() => setCreatedCreds(null)}>Done</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
