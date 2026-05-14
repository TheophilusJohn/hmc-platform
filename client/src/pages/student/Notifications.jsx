import { useState } from 'react';
import { PageWrapper, Card, Badge, Btn } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import api from '../../utils/api';

const TYPE_ICONS = { fee: '💰', exam: '📝', assignment: '✏️', general: '📢', marks: '🏆', attendance: '📅', hostel: '🏠' };
const TYPE_COLORS = { fee: 'amber', exam: 'purple', assignment: 'teal', general: 'navy', marks: 'green', attendance: 'red', hostel: 'navy' };

export default function Notifications() {
  // Server paginates at 20/page. Pre-fix the FE never requested page 2, so
  // students could only ever see their 20 most recent notifications.
  const [page, setPage] = useState(1);
  const { data, refetch } = useApi(`/notifications?page=${page}&limit=20`, [page]);
  const notifications = data?.notifications || [];
  const total = data?.total ?? notifications.length;
  const hasMore = page * 20 < total;

  const markRead = async (id) => {
    await api.put(`/notifications/${id}/read`);
    refetch();
  };

  const markAllRead = async () => {
    await api.put('/notifications/read-all');
    refetch();
  };

  return (
    <PageWrapper title="Notifications" subtitle="Updates from HMC">
      <Card>
        {notifications.some(n => !n.isRead) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn size="sm" variant="outline" onClick={markAllRead}>Mark All Read</Btn>
          </div>
        )}
        {notifications.map(n => (
          <div key={n.id} onClick={() => !n.isRead && markRead(n.id)}
            style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid #DDE1E7', cursor: !n.isRead ? 'pointer' : 'default', background: !n.isRead ? 'rgba(15,43,74,0.02)' : 'transparent' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#EEF4FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
              {TYPE_ICONS[n.type] || '📢'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                <Badge color={TYPE_COLORS[n.type] || 'navy'} style={{ fontSize: 10 }}>{n.type}</Badge>
                {!n.isRead && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#0F2B4A' }} />}
              </div>
              <div style={{ fontWeight: n.isRead ? 400 : 600, fontSize: 13, color: '#1A1D23' }}>{n.title}</div>
              <div style={{ fontSize: 12, color: '#7B8494', marginTop: 2 }}>{n.body}</div>
              <div style={{ fontSize: 11, color: '#A0A8B4', marginTop: 4 }}>{new Date(n.createdAt).toLocaleString('en-IN')}</div>
            </div>
          </div>
        ))}
        {notifications.length === 0 && (
          <div style={{ textAlign: 'center', color: '#7B8494', padding: 40 }}>No notifications yet.</div>
        )}
        {hasMore && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <Btn size="sm" variant="outline" onClick={() => setPage(p => p + 1)}>Load older notifications</Btn>
          </div>
        )}
        {page > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8, fontSize: 12, color: '#7B8494' }}>
            Page {page} · showing {notifications.length} of {total}
          </div>
        )}
      </Card>
    </PageWrapper>
  );
}
