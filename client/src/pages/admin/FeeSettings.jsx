import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Table, Modal, Input, Select } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const AUTO_APPLY_OPTS = [
  { value: 'ALL', label: 'All Students' },
  { value: 'OFFLINE_ONLY', label: 'Offline Only' },
  { value: 'ONLINE_ONLY', label: 'Online Only' },
  { value: 'MONTHLY', label: 'Monthly (Hostel)' },
  { value: 'MANUAL', label: 'Manual Only' }
];

const EMPTY = { name: '', domesticAmount: '', internationalAmount: '', autoApply: 'MANUAL', description: '' };

export default function FeeSettings() {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editForm, setEditForm] = useState({ id: '', ...EMPTY });
  const { data, refetch } = useApi('/fee-types');

  const handleCreate = async () => {
    if (!form.name?.trim()) { alert('Fee type name is required.'); return; }
    // At least one of domestic/international amount must be provided.
    const dom = String(form.domesticAmount).trim();
    const intl = String(form.internationalAmount).trim();
    if (!dom && !intl) {
      alert('Please enter at least one of: Domestic Amount or International Amount.');
      return;
    }
    if (dom && (Number(dom) < 0 || isNaN(Number(dom)))) { alert('Domestic amount must be a non-negative number.'); return; }
    if (intl && (Number(intl) < 0 || isNaN(Number(intl)))) { alert('International amount must be a non-negative number.'); return; }
    try {
      await api.post('/fee-types', form);
      setOpen(false);
      setForm(EMPTY);
      refetch();
    } catch (e) { alert(e.response?.data?.error || 'Failed'); }
  };

  const handleEdit = (row) => {
    setEditForm({
      id: row.id,
      name: row.name || '',
      domesticAmount: row.domesticAmount || '',
      internationalAmount: row.internationalAmount || '',
      autoApply: row.autoApply || 'MANUAL',
      description: row.description || '',
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      const { id, ...payload } = editForm;
      await api.put(`/fee-types/${id}`, payload);
      setEditOpen(false);
      refetch();
    } catch (e) { alert(e.response?.data?.error || 'Save failed'); }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this fee type? Existing ledger entries are unaffected.')) return;
    await api.delete(`/fee-types/${id}`);
    refetch();
  };

  const cols = [
    { key: 'name', label: 'Fee Type', render: (v, r) => <div><div style={{ fontWeight: 600, color: '#0F2B4A' }}>{v}</div>{r.description && <div style={{ fontSize: 12, color: '#7B8494' }}>{r.description}</div>}</div> },
    { key: 'domesticAmount', label: 'Domestic', render: v => <span>₹{Number(v || 0).toLocaleString()}</span> },
    { key: 'internationalAmount', label: 'International', render: v => <span>${Number(v || 0).toLocaleString()}</span> },
    { key: 'autoApply', label: 'Auto Apply', render: v => <Badge color="teal">{String(v || '').toLowerCase().replace(/_/g, ' ')}</Badge> },
    { key: 'isActive', label: 'Status', render: v => <Badge color={v ? 'green' : 'gray'}>{v ? 'active' : 'inactive'}</Badge> },
    { key: 'id', label: '', render: (id, r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Btn size="sm" variant="outline" onClick={() => handleEdit(r)}>Edit</Btn>
        {r.isActive !== false && <Btn size="sm" variant="danger" onClick={() => handleDeactivate(id)}>Deactivate</Btn>}
      </div>
    )},
  ];

  return (
    <PageWrapper title="Fee Library" subtitle="Manage fee types and auto-apply rules">
      <Card title="Fee Library" action={<Btn onClick={() => setOpen(true)}>+ Add Fee Type</Btn>}>
        <Table columns={cols} rows={data?.fees || data?.feeTypes || []} />
      </Card>

      {open && (
        <Modal title="New Fee Type" onClose={() => setOpen(false)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Tuition Fee — Year 1" />
            <Input label="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Domestic Amount (₹)" type="number" value={form.domesticAmount} onChange={e => setForm(f => ({ ...f, domesticAmount: e.target.value }))} />
              <Input label="International Amount ($)" type="number" value={form.internationalAmount} onChange={e => setForm(f => ({ ...f, internationalAmount: e.target.value }))} />
            </div>
            <Select label="Auto Apply Rule" value={form.autoApply} onChange={e => setForm(f => ({ ...f, autoApply: e.target.value }))} options={AUTO_APPLY_OPTS} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn onClick={handleCreate}>Save</Btn>
          </div>
        </Modal>
      )}

      {editOpen && (
        <Modal title="Edit Fee Type" onClose={() => setEditOpen(false)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Name" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            <Input label="Description" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Domestic Amount (₹)" type="number" value={editForm.domesticAmount} onChange={e => setEditForm(f => ({ ...f, domesticAmount: e.target.value }))} />
              <Input label="International Amount ($)" type="number" value={editForm.internationalAmount} onChange={e => setEditForm(f => ({ ...f, internationalAmount: e.target.value }))} />
            </div>
            <Select label="Auto Apply Rule" value={editForm.autoApply} onChange={e => setEditForm(f => ({ ...f, autoApply: e.target.value }))} options={AUTO_APPLY_OPTS} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setEditOpen(false)}>Cancel</Btn>
            <Btn onClick={handleSaveEdit}>Save Changes</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
