import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Table, SearchInput, Modal, Input, Select, StatCard, Tabs } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const ROLE_LABELS = { ADMIN: 'Admin', TEACHER_ADMIN: 'Teacher-Admin', FACULTY: 'Faculty', ADMISSIONS: 'Admissions', STUDENT: 'Student' };
const STATUS_COLORS = { active: 'green', inactive: 'red', graduated: 'teal', suspended: 'amber' };

export default function UserManagement() {
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [viewUser, setViewUser] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: 'STUDENT', programme: '', studyMode: 'offline', studentType: 'domestic' });

  const roleFilter = tab === 'all' ? '' : tab === 'students' ? 'STUDENT' : tab === 'faculty' ? 'FACULTY' : 'ADMIN,TEACHER_ADMIN,ADMISSIONS';
  const { data, loading, refetch } = useApi(`/users?search=${search}&role=${roleFilter}`, [search, tab]);

  const users = data?.users || [];

  const handleCreate = async () => {
    await api.post('/users', form);
    setAddOpen(false);
    setForm({ firstName: '', lastName: '', email: '', role: 'STUDENT', programme: '', studyMode: 'offline', studentType: 'domestic' });
    refetch();
  };

  const handleDeactivate = async (id) => {
    await api.delete(`/users/${id}`);
    setViewUser(null);
    refetch();
  };

  const handleResetPw = async (id) => {
    await api.post(`/users/${id}/reset-password`);
    alert('Password reset email sent.');
  };

  const cols = [
    { key: 'avatar', label: '', render: (_, r) => <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EEF4FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#0F2B4A', fontSize: 12 }}>{r.firstName?.[0]}{r.lastName?.[0]}</div> },
    { key: 'name', label: 'Name', render: (_, r) => <div><div style={{ fontWeight: 500, color: '#1A1D23' }}>{r.firstName} {r.lastName}</div><div style={{ fontSize: 12, color: '#7B8494' }}>{r.userIdDisplay}</div></div> },
    { key: 'email', label: 'Email', render: v => <span style={{ color: '#5A6272', fontSize: 13 }}>{v}</span> },
    { key: 'role', label: 'Role', render: v => <Badge color="navy">{ROLE_LABELS[v] || v}</Badge> },
    { key: 'status', label: 'Status', render: v => <Badge color={STATUS_COLORS[v] || 'gray'}>{v}</Badge> },
    { key: 'balance', label: 'Balance', render: (_, r) => r.balance > 0 ? <span style={{ color: '#991B1B', fontWeight: 600, fontSize: 13 }}>₹{r.balance?.toLocaleString()}</span> : <span style={{ color: '#7B8494', fontSize: 13 }}>—</span> },
  ];

  return (
    <PageWrapper title="User Management" subtitle="All users, roles and accounts">
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard icon="👥" label="Total Users" value={data?.total || 0} color="#0F2B4A" />
        <StatCard icon="🎒" label="Students" value={data?.students || 0} color="#0F766E" />
        <StatCard icon="📚" label="Faculty" value={data?.faculty || 0} color="#6D28D9" />
        <StatCard icon="🔴" label="With Dues" value={data?.withDues || 0} color="#991B1B" />
      </div>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All' }, { value: 'students', label: 'Students' }, { value: 'faculty', label: 'Faculty' }, { value: 'staff', label: 'Staff' }]} />
          <div style={{ flex: 1 }} />
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, ID, email..." />
          <Btn onClick={() => setAddOpen(true)}>+ Add User</Btn>
        </div>
        <Table columns={cols} rows={users} loading={loading} onRowClick={r => setViewUser(r)} />
      </Card>

      {/* Add user modal */}
      {addOpen && (
        <Modal title="Add New User" onClose={() => setAddOpen(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input label="First Name" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
            <Input label="Last Name" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
            <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <Select label="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              options={[{ value: 'STUDENT', label: 'Student' }, { value: 'FACULTY', label: 'Faculty' }, { value: 'TEACHER_ADMIN', label: 'Teacher-Admin' }, { value: 'ADMISSIONS', label: 'Admissions Officer' }, { value: 'ADMIN', label: 'Full Admin' }]} />
            {form.role === 'STUDENT' && <>
              <Select label="Student Type" value={form.studentType} onChange={e => setForm(f => ({ ...f, studentType: e.target.value }))}
                options={[{ value: 'domestic', label: 'Domestic (India)' }, { value: 'international', label: 'International' }]} />
              <Select label="Study Mode" value={form.studyMode} onChange={e => setForm(f => ({ ...f, studyMode: e.target.value }))}
                options={[{ value: 'offline', label: 'Offline (Campus)' }, { value: 'online', label: 'Online' }]} />
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

      {/* View user modal */}
      {viewUser && (
        <Modal title={`${viewUser.firstName} ${viewUser.lastName}`} onClose={() => setViewUser(null)} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[['User ID', viewUser.userIdDisplay], ['Role', ROLE_LABELS[viewUser.role]], ['Email', viewUser.email], ['Status', viewUser.status], ['Joined', new Date(viewUser.createdAt).toLocaleDateString('en-IN')]].map(([l, v]) => (
              <div key={l} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#7B8494', marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 14, color: '#1A1D23', fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn variant="outline" onClick={() => handleResetPw(viewUser.id)}>Reset Password</Btn>
            {viewUser.status === 'active' && <Btn variant="danger" onClick={() => handleDeactivate(viewUser.id)}>Deactivate</Btn>}
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
