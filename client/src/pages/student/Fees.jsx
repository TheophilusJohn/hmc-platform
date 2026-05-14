import { useState } from 'react';
import { PageWrapper, Card, Badge, Btn, StatCard } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import { loadRazorpay } from '../../utils/razorpay';
import api from '../../utils/api';

const STATUS_COLORS = { paid: 'green', partial: 'amber', unpaid: 'red', waived: 'teal', carried: 'amber' };

export default function Fees() {
  const { data, refetch } = useApi('/fees/my-summary');
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);

  const semesters = data?.semesters || [];
  const summary = data?.summary || {};
  const isInternational = data?.isInternational;

  const handlePay = async (amount) => {
    if (!amount || Number(amount) <= 0) return;
    setPaying(true);
    try {
      const { data: order } = await api.post('/payments/create-order', { amount: Number(amount) });
      const loaded = await loadRazorpay();
      if (!loaded) { alert('Could not load payment gateway.'); setPaying(false); return; }
      const { data: settings } = await api.get('/settings/public');

      const options = {
        key: settings.razorpay_key_id,
        amount: order.amount,
        currency: 'INR',
        name: 'Harvest Mission College',
        description: 'Fee Payment',
        order_id: order.id,
        prefill: { name: data.studentName, email: data.studentEmail, contact: data.studentPhone },
        theme: { color: '#0F2B4A' },
        handler: async (response) => {
          await api.post('/payments/razorpay/verify', response);
          refetch();
        },
        modal: { ondismiss: () => setPaying(false) }
      };

      const rzpInstance = new window.Razorpay(options);
      rzpInstance.open();
    } catch (e) {
      alert('Could not initiate payment. Please try again.');
      setPaying(false);
    }
  };

  const handleInstallmentPay = async (installmentId) => {
    if (isInternational) {
      alert('International students must pay via Wise or SWIFT transfer. Contact finance@hmc.college for details.');
      return;
    }
    setPaying(true);
    try {
      const { data: order } = await api.post('/payments/installment-order', { installmentId });
      const loaded = await loadRazorpay();
      if (!loaded) { alert('Could not load payment gateway.'); setPaying(false); return; }
      const { data: settings } = await api.get('/settings/public');
      const options = {
        key: settings.razorpay_key_id, amount: order.amount, currency: 'INR',
        name: 'HMC Fee Payment', order_id: order.id, theme: { color: '#0F2B4A' },
        handler: async (r) => { await api.post('/payments/razorpay/verify', r); refetch(); },
        modal: { ondismiss: () => setPaying(false) }
      };
      new window.Razorpay(options).open();
    } catch { setPaying(false); }
  };

  return (
    <PageWrapper title="Fees & Payments" subtitle={isInternational ? 'Amounts shown in USD' : 'Amounts shown in INR'}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard icon="💳" label="Total Charged" value={isInternational ? `$${Number(summary.totalUSD || 0).toLocaleString()}` : `₹${Number(summary.total || 0).toLocaleString()}`} color="#0F2B4A" />
        <StatCard icon="✅" label="Paid" value={isInternational ? `$${Number(summary.paidUSD || 0).toLocaleString()}` : `₹${Number(summary.paid || 0).toLocaleString()}`} color="#166534" />
        <StatCard icon="⚠️" label="Outstanding" value={isInternational ? `$${Number(summary.outstandingUSD || 0).toLocaleString()}` : `₹${Number(summary.outstanding || 0).toLocaleString()}`} color={summary.outstanding > 0 ? '#991B1B' : '#166534'} />
        {summary.waived > 0 && <StatCard icon="🎁" label="Waived" value={`₹${Number(summary.waived).toLocaleString()}`} color="#6D28D9" />}
      </div>

      {/* Pay now box — domestic only, online mode */}
      {!isInternational && summary.outstanding > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: '#0F2B4A', margin: '0 0 12px' }}>Pay Online</h3>
          {data?.installments?.length > 0 ? (
            <div>
              <p style={{ fontSize: 13, color: '#7B8494', marginBottom: 12 }}>Your installment plan:</p>
              {data.installments.map(inst => (
                <div key={inst.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{inst.name}</div>
                    <div style={{ fontSize: 12, color: '#7B8494' }}>Due: {new Date(inst.dueDate).toLocaleDateString('en-IN')}</div>
                  </div>
                  <div style={{ fontWeight: 700, marginRight: 12, color: inst.status === 'paid' ? '#166534' : inst.overdue ? '#991B1B' : '#1A1D23' }}>₹{Number(inst.amount).toLocaleString()}</div>
                  <Badge color={STATUS_COLORS[inst.status] || 'gray'}>{inst.status}</Badge>
                  {inst.status !== 'paid' && !data.feeLocked && (
                    <Btn size="sm" style={{ marginLeft: 8 }} onClick={() => handleInstallmentPay(inst.id)} disabled={paying}>Pay</Btn>
                  )}
                  {data.feeLocked && inst.status !== 'paid' && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#991B1B', fontWeight: 600 }}>LOCKED</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Amount (₹)"
                style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, width: 160 }} />
              <Btn onClick={() => handlePay(payAmount)} disabled={paying || !payAmount}>{paying ? 'Processing…' : 'Pay via Razorpay'}</Btn>
            </div>
          )}
          {data?.feeLocked && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#991B1B' }}>
              ⚠️ Fee lock is active on an overdue installment. Please contact the admin office.
            </div>
          )}
        </Card>
      )}

      {isInternational && (
        <div style={{ padding: '14px 18px', background: '#EEF4FA', border: '1px solid #BDD6EE', borderRadius: 10, marginBottom: 20, fontSize: 13, color: '#1A1D23' }}>
          <strong>International students</strong> — Pay via Wise or SWIFT bank transfer. Contact finance@hmc.edu with your payment reference. Exchange rate is locked at time of invoice; no FX recalculation on carry-forwards.
        </div>
      )}

      {/* Semester-wise ledger */}
      {semesters.map(sem => (
        <Card key={sem.id} title={sem.name} style={{ marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8F9FA' }}>
                {['Fee', 'Charged', 'Waived', 'Paid', 'Balance', 'Status'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Fee' ? 'left' : 'center', fontWeight: 600, color: '#0F2B4A', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(sem.entries || []).map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #DDE1E7' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 500 }}>{e.feeName}</div>
                    {e.carryForwardFrom && <div style={{ fontSize: 11, color: '#C9920A' }}>↑ CF from {e.originSemester}</div>}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>{isInternational ? `$${e.amountUSD}` : `₹${Number(e.amount).toLocaleString()}`}</td>
                  <td style={{ padding: '8px', textAlign: 'center', color: '#0F766E' }}>{e.waivedAmount > 0 ? `₹${Number(e.waivedAmount).toLocaleString()}` : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'center', color: '#166534', fontWeight: 600 }}>{isInternational ? `$${e.paidUSD || 0}` : `₹${Number(e.paid || 0).toLocaleString()}`}</td>
                  <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: e.balance > 0 ? '#991B1B' : '#166534' }}>
                    {isInternational ? `$${e.balanceUSD || 0}` : `₹${Number(e.balance || 0).toLocaleString()}`}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center' }}><Badge color={STATUS_COLORS[e.status] || 'gray'}>{e.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </PageWrapper>
  );
}
