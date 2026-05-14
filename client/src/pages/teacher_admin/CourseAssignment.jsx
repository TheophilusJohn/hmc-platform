import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Select, Modal } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

export default function CourseAssignment() {
  const [semId, setSemId] = useState('');
  const [assigning, setAssigning] = useState(null);
  const [facultyId, setFacultyId] = useState('');

  const { data: semesters } = useApi('/semesters?status=active,draft');
  const { data: subjects, refetch } = useApi(semId ? `/subjects?semesterId=${semId}` : null, [semId]);
  const { data: faculty } = useApi('/users?role=FACULTY,TEACHER_ADMIN');

  const handleAssign = async () => {
    await api.put(`/subjects/${assigning.id}`, { facultyId });
    setAssigning(null); setFacultyId(''); refetch();
  };

  const subjectList = subjects?.subjects || [];

  return (
    <PageWrapper title="Course Assignment" subtitle="Assign faculty to subjects">
      <Card>
        <div style={{ marginBottom: 16 }}>
          <select value={semId} onChange={e => setSemId(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 13, background: '#fff', minWidth: 240 }}>
            <option value="">Select semester…</option>
            {(semesters?.semesters || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {subjectList.length > 0 && (
          <div>
            {subjectList.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #DDE1E7', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{s.code} — {s.name}</div>
                  <div style={{ fontSize: 12, color: '#7B8494' }}>{s.batchName}</div>
                </div>
                {s.facultyName ? (
                  <Badge color="green">{s.facultyName}</Badge>
                ) : (
                  <Badge color="red">Unassigned</Badge>
                )}
                <Btn size="sm" variant="outline" onClick={() => { setAssigning(s); setFacultyId(s.facultyId || ''); }}>
                  {s.facultyId ? 'Change' : 'Assign'}
                </Btn>
              </div>
            ))}
          </div>
        )}
      </Card>

      {assigning && (
        <Modal title={`Assign Faculty — ${assigning.name}`} onClose={() => setAssigning(null)}>
          <Select label="Faculty" value={facultyId} onChange={e => setFacultyId(e.target.value)}
            options={[{ value: '', label: '— Unassigned —' }, ...(faculty?.users || []).map(u => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))]} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="outline" onClick={() => setAssigning(null)}>Cancel</Btn>
            <Btn onClick={handleAssign}>Save Assignment</Btn>
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
