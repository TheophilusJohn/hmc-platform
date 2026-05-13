import { PageWrapper, Card, Badge, Btn, Table } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

export default function References() {
  const { data, refetch } = useApi('/references/pending');
  const refs = data?.references || [];

  const handleResend = async (id) => {
    await api.post(`/references/${id}/resend`);
    refetch();
  };

  const cols = [
    { key: 'applicantName', label: 'Applicant', render: v => <strong style={{ fontSize: 13 }}>{v}</strong> },
    { key: 'refereeName', label: 'Referee', render: (v, r) => <div><div style={{ fontWeight: 500 }}>{v}</div><div style={{ fontSize: 12, color: '#7B8494' }}>{r.refereeEmail}</div></div> },
    { key: 'refType', label: 'Type', render: v => <Badge color={v === 'pastoral' ? 'green' : 'teal'}>{v.replace(/_/g, ' ')}</Badge> },
    { key: 'status', label: 'Status', render: v => <Badge color={v === 'received' ? 'green' : v === 'expired' ? 'red' : 'amber'}>{v}</Badge> },
    { key: 'tokenExpiresAt', label: 'Expires', render: v => v ? new Date(v).toLocaleDateString('en-IN') : '—' },
    { key: 'id', label: '', render: (id, r) => r.status !== 'received' && <Btn size="sm" variant="outline" onClick={() => handleResend(id)}>Resend Link</Btn> },
  ];

  return (
    <PageWrapper title="References" subtitle="Track and manage referee submissions">
      <div style={{ padding: '10px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#92400E' }}>
        Both references must be received before an applicant can advance past Docs Review.
      </div>
      <Card>
        <Table columns={cols} rows={refs} />
      </Card>
    </PageWrapper>
  );
}
