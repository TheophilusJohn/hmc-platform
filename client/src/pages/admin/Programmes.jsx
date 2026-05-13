import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Modal, Input, Select } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

export default function Programmes() {
  const [selectedProg, setSelectedProg] = useState(null);
  const [progOpen, setProgOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [progForm, setProgForm] = useState({ name: '', code: '', durationYears: 1, medium: 'en', availableOffline: true, availableOnline: true });
  const [batchForm, setBatchForm] = useState({ name: '', startYear: new Date().getFullYear(), maxIntake: 30 });
  const { data, refetch } = useApi('/programmes');

  const programmes = data?.programmes || [];

  const handleCreateProg = async () => {
    await api.post('/programmes', progForm);
    setProgOpen(false); refetch();
  };

  const handleCreateBatch = async () => {
    await api.post(`/programmes/${selectedProg.id}/batches`, batchForm);
    setBatchOpen(false); refetch();
  };

  const handleProgression = async (batchId) => {
    if (!confirm('Run year-end progression? This will check all results and advance qualifying students.')) return;
    try {
      const { data } = await api.post(`/batches/${batchId}/progression`);
      alert(`Progression complete. ${data.progressed} progressed, ${data.flagged} need manual review.`);
      refetch();
    } catch (e) { alert(e.response?.data?.message || 'Error running progression'); }
  };

  return (
    <PageWrapper title="Programmes & Batches" subtitle="Academic programmes and batch management">
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        {/* Programme list */}
        <Card title="Programmes" action={<Btn size="sm" onClick={() => setProgOpen(true)}>+</Btn>}>
          {programmes.map(p => (
            <div key={p.id} onClick={() => setSelectedProg(p)}
              style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: selectedProg?.id === p.id ? '#EEF4FA' : 'transparent', border: `1px solid ${selectedProg?.id === p.id ? '#0F2B4A' : 'transparent'}` }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#0F2B4A' }}>{p.name}</div>
              <div style={{ fontSize: 12, color: '#7B8494' }}>{p.code} · {p.durationYears} yr</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {p.availableOnline && <Badge color="teal" size="xs">Online</Badge>}
                {p.availableOffline && <Badge color="navy" size="xs">Offline</Badge>}
              </div>
            </div>
          ))}
          {programmes.length === 0 && <div style={{ color: '#7B8494', fontSize: 13, padding: 8 }}>No programmes yet.</div>}
        </Card>

        {/* Batch details */}
        <Card title={selectedProg ? `${selectedProg.name} — Batches` : 'Select a programme'} action={selectedProg ? <Btn size="sm" onClick={() => setBatchOpen(true)}>+ Batch</Btn> : null}>
          {selectedProg ? (
            <div>
              {(selectedProg.batches || []).map(b => (
                <div key={b.id} style={{ padding: '14px 16px', border: '1px solid #DDE1E7', borderRadius: 8, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#0F2B4A' }}>{b.name}</div>
                      <div style={{ fontSize: 13, color: '#7B8494', marginTop: 2 }}>
                        Year {b.currentYear} of {selectedProg.durationYears} · {b.studentCount || 0} students · Intake {b.maxIntake}
                      </div>
                    </div>
                    <Badge color={b.status === 'active' ? 'green' : 'gray'}>{b.status}</Badge>
                    {b.status === 'active' && (
                      <Btn size="sm" variant="outline" onClick={() => handleProgression(b.id)}>Run Progression</Btn>
                    )}
                  </div>
                </div>
              ))}
              {(selectedProg.batches || []).length === 0 && <div style={{ color: '#7B8494', fontSize: 13, padding: 8 }}>No batches for this programme yet.</div>}
            </div>
          ) : <div style={{ color: '#7B8494', padding: 20, textAlign: 'center' }}>Select a programme from the left to view its batches.</div>}
        </Card>
      </div>

      {progOpen && (
        <Modal title="New Programme" onClose={() => setProgOpen(false)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Input label="Name" value={progForm.name} onChange={e => setProgForm(f => ({ ...f, name: e.target.value }))} />
            <Input label="Code" value={progForm.code} onChange={e => setProgForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. BTH" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Duration (years)" type="number" value={progForm.durationYears} onChange={e => setProgForm(f => ({ ...f, durationYears: e.target.value }))} />
              <Select label="Medium" value={progForm.medium} onChange={e => setProgForm(f => ({ ...f, medium: e.target.value }))} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'Hindi' }]} />
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

      {batchOpen && selectedProg && (
        <Modal title={`New Batch — ${selectedProg.name}`} onClose={() => setBatchOpen(false)}>
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
    </PageWrapper>
  );
}
