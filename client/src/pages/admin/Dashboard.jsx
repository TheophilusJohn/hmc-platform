import React from 'react';
import { useNavigate } from 'react-router-dom';
import { StatCard, Card, Badge, Btn } from '../../components/common/index';
import { useApi } from '../../hooks/useApi';
import { formatCurrency } from '../../utils/currency';
import { fromNow } from '../../utils/dates';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data: completionData } = useApi('settings-completion', '/settings/completion');
  const { data: pipeline } = useApi('pipeline-stats', '/admissions/stats');
  const { data: financeSummary } = useApi('finance-summary', '/reports/financial/summary');
  const { data: atRisk } = useApi('at-risk', '/reports/at-risk');

  const completion = completionData?.percent || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {completion < 80 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <span style={{ fontWeight: 600, color: '#92400E', fontFamily: 'DM Sans,sans-serif', fontSize: 13 }}>⚠ Setup incomplete</span>
            <span style={{ color: '#92400E', fontSize: 13, marginLeft: 8 }}>{completion}% configured — some features may not work correctly.</span>
          </div>
          <Btn variant="outline" size="sm" onClick={() => navigate('/admin/settings')}>Complete Setup</Btn>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <StatCard icon="🎓" label="Active Students" value={atRisk?.length != null ? '—' : '—'} color="#0F2B4A" />
        <StatCard icon="📋" label="In Pipeline" value={pipeline?.total_active || '—'} color="#C9920A" />
        <StatCard icon="₹" label="INR Collected" value={financeSummary ? formatCurrency(financeSummary.collected?.inr) : '—'} color="#166534" />
        <StatCard icon="💲" label="USD Collected" value={financeSummary ? `$${Number(financeSummary.collected?.usd || 0).toLocaleString()}` : '—'} color="#0F766E" />
        <StatCard icon="⚠" label="Outstanding INR" value={financeSummary ? formatCurrency(financeSummary.outstanding?.inr) : '—'} color="#991B1B" />
        <StatCard icon="🚨" label="At-Risk Students" value={atRisk?.length ?? '—'} color="#6D28D9" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card title="Admissions Pipeline">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pipeline ? Object.entries(pipeline).filter(([k]) => k !== 'total_active').map(([stage, count]) => (
              <div key={stage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontFamily: 'DM Sans,sans-serif', color: '#3D4450', textTransform: 'capitalize' }}>{stage.replace(/_/g, ' ')}</span>
                <Badge variant="navy">{count}</Badge>
              </div>
            )) : <div style={{ color: '#7B8494', fontSize: 13 }}>Loading…</div>}
          </div>
        </Card>

        <Card title="Quick Actions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Btn variant="outline" full onClick={() => navigate('/admin/users')}>Manage Users</Btn>
            <Btn variant="outline" full onClick={() => navigate('/admin/finance')}>View Finance</Btn>
            <Btn variant="outline" full onClick={() => navigate('/admin/admissions')}>Admissions Overview</Btn>
            <Btn variant="outline" full onClick={() => navigate('/admin/reports')}>Reports</Btn>
            <Btn variant="outline" full onClick={() => navigate('/admin/messages')}>Send Message</Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}
