import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Modal, Input, Select } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const EMPTY_PROG = { name: '', code: '', durationYears: 1, medium: 'ENGLISH', availableOffline: true, availableOnline: true, status: 'active' };
const EMPTY_BATCH = { name: '', startYear: new Date().getFullYear(), endYear: '', currentYear: 1, maxIntake: 30, status: 'ACTIVE' };

export default function Programmes() {
  const [selectedProg, setSelectedProg] = useState(null);
  const [progOpen, setProgOpen] = useState(false);
  const [progEditOpen, setProgEditOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [progForm, setProgForm] = useState(EMPTY_PROG);
  const [progEditForm, setProgEditForm] = useState({ id: '', ...EMPTY_PROG });
  const [batchForm, setBatchForm] = useState(EMPTY_BATCH);
  const [batchEditForm, setBatchEditForm] = useState({ id: '', ...EMPTY_BATCH });
  const { data, refetch } = useApi('/programmes');

  const programmes = data?.programmes || [];
  // Refresh selectedProg from latest data so its batches stay in sync after refetch
  const currentSelected = selectedProg ? programmes.find(p => p.id === selectedProg.id) : null;

  const handleCreateProg = async () => {
    try {
      await api.post('/programmes', {
        name: progForm.name,
        code: progForm.code,
        durationYears: parseInt(progForm.durationYears) || 1,
        medium: progForm.medium,
        availableOffline: progForm.availableOffline,
        availableOnline: progForm.availableOnline,
      });
      setProgOpen(false); setProgForm(EMPTY_PROG); refetch();
    } catch (e) { alert(e.response?.data?.error || 'Error creating programme'); }
  };

  const openEditProg = (p) => {
    setProgEditForm({
      id: p.id, name: p.name || '', code: p.code || '',
      durationYears: p.durationYears || 1,
      medium: p.medium || 'ENGLISH',
      availableOffline: !!p.availableOffline,
      availableOnline: !!p.availableOnline,
      status: p.status || 'active',
    });
    setProgEditOpen(true);
  };

  const handleSaveProg = async () => {
    try {
      const { id, ...payload } = progEditForm;
      payload.durationYears = parseInt(payload.durationYears) || 1;
      await api.put(`/programmes/${id}`, payload);
      setProgEditOpen(false); refetch();
    } catch (e) { alert('Save failed: ' + (e.response?.data?.error || e.message)); }
  };

  const handleDeleteProg = async (id, name) => {
    if (!window.confirm(`Delete programme "${name}"? Cannot be undone. This will fail if any batches/students exist.`)) return;
    try {
      await api.delete(`/programmes/${id}`);
      if (selectedProg?.id === id) setSelectedProg(null);
      refetch();
    } catch (e) { alert(e.response?.data?.error || 'Delete failed'); }
  };

  const handleCreateBatch = async () => {
    try {
      const startYear = parseInt(batchForm.startYear) || new Date().getFullYear();
      const endYear = startYear + (selectedProg?.durationYears || 3);
      await api.post(`/programmes/${selectedProg.id}/batches`, {
        name: batchForm.name, startYear, endYear, currentYear: 1,
        maxIntake: parseInt(batchForm.maxIntake) || 30,
      });
      setBatchOpen(false); setBatchForm(EMPTY_BATCH); refetch();
    } catch (e) { alert(e.response?.data?.error || 'Error creating batch'); }
  };

  const openEditBatch = (b) => {
    setBatchEditForm({
      id: b.id, name: b.name || '',
      startYear: b.startYear || '',
      endYear: b.endYear || '',
      currentYear: b.currentYear || 1,
      maxIntake: b.maxIntake || 30,
      status: b.status || 'ACTIVE',
    });
    setBatchEditOpen(true);
  };

  const handleSaveBatch = async () => {
    try {
      const { id, ...payload } = batchEditForm;
      payload.startYear = parseInt(payload.startYear) || undefined;
      payload.endYear = parseInt(payload.endYear) || undefined;
      payload.currentYear = parseInt(payload.currentYear) || 1;
      payload.maxIntake = parseInt(payload.maxIntake) || undefined;
      await api.put(`/programmes/batches/${id}`, payload);
      setBatchEditOpen(false); refetch();
    } catch (e) { alert('Save failed: ' + (e.response?.data?.error || e.message)); }
  };

  const handleDeleteBatch = async (id, name) => {
    if (!window.confirm(`Delete batch "${name}"? Cannot be undone.`)) return;
    try { await api.delete(`/programmes/batches/${id}`); refetch(); }
    catch (e) { alert(e.response?.data?.error || 'Delete failed'); }
  };

  const handleProgression = async (batchId) => {
    if (!window.confirm('Run year-end progression? This will check all results and advance qualifying students.')) return;
    try {
      const { data } = await api.post(`/programmes/batches/${batchId}/progression`);
      alert(`Progression complete. ${data.autoApproved?.length || 0} auto-approved, ${data.flagged?.length || 0} need manual review.`);
      refetch();
    } catch (e) { alert(e.response?.data?.error || 'Error running progression'); }
  };

  return (
    <PageWrapper title="Programmes & Batches" subtitle="Academic programmes and batch management">
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
        <Card title="Programmes" action={<Btn size="sm" onClick={() => setProgOpen(true)}>+</Btn>}>
          {programmes.map(p => {
            const isSel = currentSelected?.id === p.id;
            return (
              <div key={p.id}
                style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 4, background: isSel ? '#EEF4FA' : 'transparent', border: `1px solid ${isSel ? '#0F2B4A' : 'transparent'}`, cursor: 'pointer' }}
                onClick={() => setSelectedProg(p)}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#0F2B4A' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: '#7B8494' }}>{p.code} · {p.durationYears} yr</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  {p.availableOnline && <Badge color="teal" size="xs">Online</Badge>}
                  {p.availableOffline && <Badge color="navy" size="xs">Offline</Badge>}
                </div>
                {isSel && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={e => e.stopPropagation()}>
                    <Btn size="sm" variant="outline" onClick={() => openEditProg(p)}>Edit</Btn>
                    <Btn size="sm" variant="danger" onClick={() => handleDeleteProg(p.id, p.name)}>Delete</Btn>
                  </div>
                )}
              </div>
            );
          })}
          {programmes.length === 0 && <div style={{ color: '#7B8494', fontSize: 13, padding: 8 }}>No programmes yet.</div>}
        </Card>

        <Card title={currentSelected ? `${currentSelected.name} — Batches` : 'Select a programme'} action={currentSelected ? <Btn size="sm" onClick={() => setBatchOpen(true)}>+ Batch</Btn> : null}>
          {currentSelected ? (
            <div>
              {(currentSelected.batches || []).map(b => (
                <div key={b.id} style={{ padding: '14px 16px', border: '1px solid #DDE1E7', borderRadius: 8, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 600, color: '#0F2B4A' }}>{b.name}</div>
                      <div style={{ fontSize: 13, color: '#7B8494', marginTop: 2 }}>
                        Year {b.currentYear} of {currentSelected.durationYears} · Intake {b.maxIntake || '—'} · {b.startYear}–{b.endYear}
                      </div>
                    </div>
                    <Badge color={b.status === 'ACTIVE' ? 'green' : 'gray'}>{b.status}</Badge>
                    <Btn size="sm" variant="outline" onClick={() => openEditBatch(b)}>Edit</Btn>
                    {b.status === 'ACTIVE' && (
                      <Btn size="sm" variant="outline" onClick={() => handleProgression(b.id)}>Run Progression</Btn>
                    )}
                    <Btn size="sm" variant="danger" onClick={() => handleDeleteBatch(b.id, b.name)}>Delete</Btn>
                  </div>
                </div>
              ))}
              {(currentSelected.batches || []).length === 0 && <div style={{ color: '#7B8494', fontSize: 13, padding: 8 }}>No batches for this programme yet.</div>}
            </div>
          ) : <div style={{ color: '#7B8494', padding: 20, textAlign: 'center' }}>Select a programme from the left to view its batches.</div>}
        </Card>
      </div>

      {/* Create Programme */}
      {progOpen && (
        <Modal title="New Programme" onClose={() => setProgOpen(false)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Name" value={progForm.name} onChange={e => setProgForm(f => ({ ...f, name: e.target.value }))} />
            <Input label="Code" value={progForm.code} onChange={e => setProgForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. BTH" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Duration (years)" type="number" value={progForm.durationYears} onChange={e => setProgForm(f => ({ ...f, durationYears: e.target.value }))} />
              <Select label="Medium" value={progForm.medium} onChange={e => setProgForm(f => ({ ...f, medium: e.target.value }))} options={[{ value: 'ENGLISH', label: 'English' }, { value: 'HINDI', label: 'Hindi' }]} />
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={progForm.availableOffline} onChange={e => setProgForm(f => ({ ...f, availableOffline: e.target.checked }))} /> Offline Available</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={progForm.availableOnline} onChange={e => setProgForm(f => ({ ...f, availableOnline: e.target.checked }))} /> Online Available</label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setProgOpen(false)}>Cancel</Btn>
            <Btn onClick={handleCreateProg}>Create</Btn>
          </div>
        </Modal>
      )}

      {/* Edit Programme */}
      {progEditOpen && (
        <Modal title="Edit Programme" onClose={() => setProgEditOpen(false)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Name" value={progEditForm.name} onChange={e => setProgEditForm(f => ({ ...f, name: e.target.value }))} />
            <Input label="Code" value={progEditForm.code} onChange={e => setProgEditForm(f => ({ ...f, code: e.target.value }))} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Duration (years)" type="number" value={progEditForm.durationYears} onChange={e => setProgEditForm(f => ({ ...f, durationYears: e.target.value }))} />
              <Select label="Medium" value={progEditForm.medium} onChange={e => setProgEditForm(f => ({ ...f, medium: e.target.value }))} options={[{ value: 'ENGLISH', label: 'English' }, { value: 'HINDI', label: 'Hindi' }]} />
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={progEditForm.availableOffline} onChange={e => setProgEditForm(f => ({ ...f, availableOffline: e.target.checked }))} /> Offline Available</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={progEditForm.availableOnline} onChange={e => setProgEditForm(f => ({ ...f, availableOnline: e.target.checked }))} /> Online Available</label>
            </div>
            <Select label="Status" value={progEditForm.status} onChange={e => setProgEditForm(f => ({ ...f, status: e.target.value }))} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setProgEditOpen(false)}>Cancel</Btn>
            <Btn onClick={handleSaveProg}>Save Changes</Btn>
          </div>
        </Modal>
      )}

      {/* Create Batch */}
      {batchOpen && currentSelected && (
        <Modal title={`New Batch — ${currentSelected.name}`} onClose={() => setBatchOpen(false)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Batch Name" value={batchForm.name} onChange={e => setBatchForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Batch 2025-28" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Start Year" type="number" value={batchForm.startYear} onChange={e => setBatchForm(f => ({ ...f, startYear: e.target.value }))} />
              <Input label="Max Intake" type="number" value={batchForm.maxIntake} onChange={e => setBatchForm(f => ({ ...f, maxIntake: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setBatchOpen(false)}>Cancel</Btn>
            <Btn onClick={handleCreateBatch}>Create Batch</Btn>
          </div>
        </Modal>
      )}

      {/* Edit Batch */}
      {batchEditOpen && (
        <Modal title="Edit Batch" onClose={() => setBatchEditOpen(false)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Batch Name" value={batchEditForm.name} onChange={e => setBatchEditForm(f => ({ ...f, name: e.target.value }))} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Input label="Start Year" type="number" value={batchEditForm.startYear} onChange={e => setBatchEditForm(f => ({ ...f, startYear: e.target.value }))} />
              <Input label="End Year" type="number" value={batchEditForm.endYear} onChange={e => setBatchEditForm(f => ({ ...f, endYear: e.target.value }))} />
              <Input label="Current Year" type="number" value={batchEditForm.currentYear} onChange={e => setBatchEditForm(f => ({ ...f, currentYear: e.target.value }))} />
            </div>
            <Input label="Max Intake" type="number" value={batchEditForm.maxIntake} onChange={e => setBatchEditForm(f => ({ ...f, maxIntake: e.target.value }))} />
            <Select label="Status" value={batchEditForm.status} onChange={e => setBatchEditForm(f => ({ ...f, status: e.target.value }))} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'ARCHIVED', label: 'Archived' }, { value: 'COMPLETED', label: 'Completed' }]} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setBatchEditOpen(false)}>Cancel</Btn>
            <Btn onClick={handleSaveBatch}>Save Changes</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
