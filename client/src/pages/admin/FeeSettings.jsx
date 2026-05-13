// FeeSettings.jsx
import { useState } from 'react';
import { PageWrapper, Card, Btn, Table, Modal, Input, Select, Badge } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const AUTO_APPLY_OPTS = [
  { value: 'all', label: 'All Students' }, { value: 'offline', label: 'Offline Only' },
  { value: 'online', label: 'Online Only' }, { value: 'monthly', label: 'Monthly (Hostel)' }, { value: 'manual', label: 'Manual Only' }
];

export default function FeeSettings() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', domesticAmount: '', internationalAmount: '', autoApply: 'manual' });
  const { data, refetch } = useApi('/fee-types');

  const handleCreate = async () => {
    await api.post('/fee-types', form);
    setOpen(false); refetch();
  };

  const cols = [
    { key: 'name', label: 'Fee Name', render: v => <strong style={{ color: '#1A1D23' }}>{v}</strong> },
    { key: 'domesticAmount', label: 'Domestic (₹)', render: v => `₹${Number(v).toLocaleString()}` },
    { key: 'internationalAmount', label: 'International ($)', render: v => v ? `$${v}` : '—' },
    { key: 'autoApply', label: 'Auto Apply', render: v => <Badge color="teal">{v}</Badge> },
    { key: 'isActive', label: 'Status', render: v => <Badge color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Badge> },
    { key: 'id', label: '', render: (id) => <Btn size="sm" variant="outline" onClick={async () => { await api.delete(`/fee-types/${id}`); refetch(); }}>Deactivate</Btn> }
  ];

  return (
    <PageWrapper title="Fee Settings" subtitle="Fee library and tuition configuration">
      <Card title="Fee Library" action={<Btn onClick={() => setOpen(true)}>+ Add Fee Type</Btn>}>
        <Table columns={cols} rows={data?.fees || []} />
      </Card>
      {open && (
        <Modal title="Add Fee Type" onClose={() => setOpen(false)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
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
    </PageWrapper>
  );
}
