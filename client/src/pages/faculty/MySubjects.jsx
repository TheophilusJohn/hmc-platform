import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper, Card, Badge, Btn, Table } from '../../components/common';
import { useApi } from '../../hooks/useApi';

export default function MySubjects() {
  const navigate = useNavigate();
  const { data } = useApi('/subjects?mine=true');
  const subjects = data?.subjects || [];

  const cols = [
    { key: 'code', label: 'Code', render: v => <code style={{ background: '#EEF4FA', padding: '2px 6px', borderRadius: 4, fontSize: 12, color: '#0F2B4A' }}>{v}</code> },
    { key: 'name', label: 'Subject', render: (v, r) => <div><div style={{ fontWeight: 500 }}>{v}</div><div style={{ fontSize: 12, color: '#7B8494' }}>{r.batchName} · {r.semesterName}</div></div> },
    { key: 'creditHours', label: 'Credits', render: v => <Badge color="navy">{v}</Badge> },
    { key: 'examMode', label: 'Exam', render: v => <Badge color={v === 'online' ? 'teal' : 'navy'}>{v}</Badge> },
    { key: 'studentCount', label: 'Students', render: v => v || 0 },
    { key: 'attendanceAvg', label: 'Avg. Att.', render: v => v !== undefined ? <span style={{ color: v < 75 ? '#991B1B' : '#166534', fontWeight: 600 }}>{v}%</span> : '—' },
    { key: 'id', label: '', render: (id, r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Btn size="sm" variant="outline" onClick={() => navigate(`/faculty/content?subject=${id}`)}>Content</Btn>
        <Btn size="sm" onClick={() => navigate(`/faculty/exams?subject=${id}`)}>Exams</Btn>
      </div>
    )},
  ];

  return (
    <PageWrapper title="My Subjects" subtitle="Subjects assigned to you this semester">
      <Card>
        <Table columns={cols} rows={subjects} />
        {subjects.length === 0 && (
          <div style={{ textAlign: 'center', color: '#7B8494', padding: 40 }}>
            No subjects assigned yet. Contact your Teacher-Admin.
          </div>
        )}
      </Card>
    </PageWrapper>
  );
}
