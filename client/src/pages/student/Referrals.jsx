// Referrals.jsx
import { useState } from 'react';
import { PageWrapper, Card, Badge, StatCard } from '../../components/common';
import { useApi } from '../../hooks/useApi';

export function Referrals() {
  const { data } = useApi('/referrals/my');
  const referrals = data?.referrals || [];
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data?.referralCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <PageWrapper title="Referral Programme" subtitle="Earn rewards for bringing new students">
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard icon="🔗" label="Total Referrals" value={data?.total || 0} color="#0F2B4A" />
        <StatCard icon="✅" label="Enrolled" value={data?.enrolled || 0} color="#166534" />
        <StatCard icon="🎁" label="Rewards Earned" value={`₹${Number(data?.rewardsTotal || 0).toLocaleString()}`} color="#C9920A" />
      </div>

      {data?.referralCode && (
        <Card style={{ marginBottom: 20 }}>
          <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: '#0F2B4A', margin: '0 0 12px' }}>Your Referral Code</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <code style={{ padding: '10px 16px', background: '#EEF4FA', borderRadius: 8, fontSize: 18, fontWeight: 700, color: '#0F2B4A', letterSpacing: 2 }}>{data.referralCode}</code>
            <button onClick={handleCopy}
              style={{ padding: '10px 16px', border: '1px solid #DDE1E7', borderRadius: 8, background: copied ? '#F0FDF4' : '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans', color: copied ? '#166534' : '#5A6272' }}>
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#7B8494', marginTop: 8 }}>Share this code with friends. When they enroll, you earn a fee credit.</p>
        </Card>
      )}

      <Card title="Your Referrals">
        {referrals.map(r => (
          <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid #DDE1E7', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{r.refereeName || '(Applied)'}</div>
              <div style={{ fontSize: 12, color: '#7B8494' }}>{r.programmeName} · Applied {new Date(r.appliedAt).toLocaleDateString('en-IN')}</div>
            </div>
            <Badge color={r.stage === 'enrolled' ? 'green' : r.stage === 'accepted' ? 'teal' : 'amber'}>{r.stage}</Badge>
            {r.reward > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: '#C9920A' }}>₹{Number(r.reward).toLocaleString()}</span>}
          </div>
        ))}
        {referrals.length === 0 && <div style={{ color: '#7B8494', fontSize: 13, padding: '12px 0' }}>No referrals yet. Share your code!</div>}
      </Card>
    </PageWrapper>
  );
}
export default Referrals;
