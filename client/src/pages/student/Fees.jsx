import { useState } from 'react';
import { PageWrapper, Card, Badge, Btn, StatCard } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import { loadRazorpay } from '../../utils/razorpay';
import api from '../../utils/api';

const STATUS_COLORS = { paid: 'green', partial: 'amber', unpaid: 'red', waived: 'teal', carried: 'amber' };

export default function Fees() {
  const { data, refetch } = useApi('/fees/my-summary');
  const [paying, setPaying] = useState(null); // holds the ledgerId currently paying

  const semesters = data?.semesters || [];
  const summary = data?.summary || {};
  const isInternational = data?.isInternational;

  // Pay a specific ledger row. The amount is derived server-side from the
  // ledger balance — we never accept a client-supplied amount, so a student
  // can't mark themselves "paid" for ₹1 against a ₹30k ledger.
  const handlePayLedger = async (ledgerId) => {
    if (!ledgerId || paying) return;
    setPaying(ledgerId);
    try {
      const { data: order } = await api.post('/payments/create-order', { ledgerId });
      const loaded = await loadRazorpay();
      if (!loaded) { alert('Could not load payment gateway.'); setPaying(null); return; }
      const { data: settings } = await api.get('/settings/public');

      const options = {
        key: settings.razorpay_key_id,
        amount: order.amount, // minor units from server
        currency: order.currency || 'INR',
        name: 'Harvest Mission College',
        description: 'Fee Payment',
        order_id: order.id,
        prefill: { name: data.studentName, email: data.studentEmail, contact: data.studentPhone },
        theme: { color: '#0F2B4A' },
        handler: async (response) => {
          try {
            await api.post('/payments/razorpay/verify', response);
            refetch();
          } catch (err) {
            alert(err?.response?.data?.error || 'Payment was received by the gateway but could not be verified. Please contact the finance office before retrying.');
          } finally {
            setPaying(null);
          }
        },
        modal: { ondismiss: () => setPaying(null) }
      };

      const rzpInstance = new window.Razorpay(options);
      rzpInstance.open();
    } catch (e) {
      alert(e?.response?.data?.error || 'Could not initiate payment. Please try again.');
      setPaying(null);
    }
  };

  const handleInstallmentPay = async (planId, installmentIndex) => {
    if (isInternational) {
      alert('International students must pay via Wise or SWIFT transfer. Contact finance@hmc.college for details.');
      return;
    }
    const key = `inst:${planId}:${installmentIndex}`;
    if (paying) return;
    setPaying(key);
    try {
      const { data: order } = await api.post('/payments/installment-order', { installmentId: planId, installmentIndex });
      const loaded = await loadRazorpay();
      if (!loaded) { alert('Could not load payment gateway.'); setPaying(null); return; }
      const { data: settings } = await api.get('/settings/public');
      const options = {
        key: settings.razorpay_key_id, amount: order.amount, currency: 'INR',
        name: 'HMC Fee Payment', order_id: order.id, theme: { color: '#0F2B4A' },
        handler: async (r) => {
          try { await api.post('/payments/razorpay/verify', r); refetch(); }
          catch (err) { alert(err?.response?.data?.error || 'Payment received but verification failed. Contact finance.'); }
          finally { setPaying(null); }
        },
        modal: { ondismiss: () => setPaying(null) }
      };
      new window.Razorpay(options).open();
    } catch (err) {
      alert(err?.response?.data?.error || 'Could not initiate payment.');
      setPaying(null);
    }
  };

  return (
    <PageWrapper title="Fees & Payments" subtitle={isInternational ? 'Amounts shown in USD' : 'Amounts shown in INR'}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard icon="💳" label="Total Charged" value={isInternational ? `$${Number(summary.totalUSD || 0).toLocaleString()}` : `₹${Number(summary.total || 0).toLocaleString()}`} color="#0F2B4A" />
        <StatCard icon="✅" label="Paid" value={isInternational ? `$${Number(summary.paidUSD || 0).toLocaleString()}` : `₹${Number(summary.paid || 0).toLocaleString()}`} color="#166534" />
        <StatCard icon="⚠️" label="Outstanding" value={isInternational ? `$${Number(summary.outstandingUSD || 0).toLocaleString()}` : `₹${Number(summary.outstanding || 0).toLocaleString()}`} color={summary.outstanding > 0 ? '#991B1B' : '#166534'} />
        {summary.waived > 0 && <StatCard icon="🎁" label="Waived" value={`₹${Number(summary.waived).toLocaleString()}`} color="#6D28D9" />}
      </div>

      {/* Installment plan (if present) — pay one installment at a time */}
      {!isInternational && data?.installments?.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: '#0F2B4A', margin: '0 0 12px' }}>Installment Plan</h3>
          {data.installments.map(inst => {
            const key = `inst:${inst.planId}:${inst.index}`;
            return (
              <div key={inst.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{inst.name}</div>
                  <div style={{ fontSize: 12, color: '#7B8494' }}>Due: {inst.dueDate ? new Date(inst.dueDate).toLocaleDateString('en-IN') : '—'}</div>
                </div>
                <div style={{ fontWeight: 700, marginRight: 12, color: inst.status === 'paid' ? '#166534' : inst.overdue ? '#991B1B' : '#1A1D23' }}>₹{Number(inst.amount).toLocaleString()}</div>
                <Badge color={STATUS_COLORS[inst.status] || 'gray'}>{inst.status}</Badge>
                {inst.status !== 'paid' && !data.feeLocked && (
                  <Btn size="sm" style={{ marginLeft: 8 }} onClick={() => handleInstallmentPay(inst.planId, inst.index)} disabled={paying !== null}>
                    {paying === key ? '…' : 'Pay'}
                  </Btn>
                )}
                {data.feeLocked && inst.status !== 'paid' && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#991B1B', fontWeight: 600 }}>LOCKED</span>
                )}
              </div>
            );
          })}
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
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Badge color={STATUS_COLORS[e.status] || 'gray'}>{e.status}</Badge>
                      {!isInternational && Number(e.balance || 0) > 0 && !data?.feeLocked && (
                        <Btn size="sm" onClick={() => handlePayLedger(e.id)} disabled={paying !== null}>
                          {paying === e.id ? '…' : 'Pay'}
                        </Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </PageWrapper>
  );
}
