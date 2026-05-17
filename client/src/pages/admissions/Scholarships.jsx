// client/src/pages/admissions/Scholarships.jsx
//
// Admin-side scholarship review (sub-stage 4 = read-only list + detail).
// Sub-stage 5 wires the Approve / Partial / Decline decision controls,
// ledger integration, and applicant notification.
//
// Auth handled by the parent /admissions route in App.jsx:
//   <AuthGuard roles={['ADMISSIONS_OFFICER', 'FULL_ADMIN']}>
//     <AdmissionsLayout>
//       ...children including this page...
// (Backend admissionsAccess middleware also gates TEACHER_ADMIN — matching
// the existing pipeline pattern.)

import { useState } from 'react';
import { PageWrapper, Card, Btn, Badge, Table, Modal, Tabs, StatCard } from '../../components/common';
import { useApi } from '../../hooks/useApi';

const REQUEST_TYPE_LABELS = {
  workScholarship: 'Work Scholarship',
  financialAid:    'Financial Aid',
};
const STATUS_LABELS = {
  PENDING:  'Pending',
  APPROVED: 'Approved',
  PARTIAL:  'Partial',
  DECLINED: 'Declined',
};
// Mirrors the colour tiers used on ApplyStatus.jsx for consistency.
const STATUS_BADGE_COLOR = {
  PENDING:  'amber',
  APPROVED: 'green',
  PARTIAL:  'teal',
  DECLINED: 'red',
};

function formatMoney(amount, currency) {
  if (amount == null || amount === '') return '—';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : '';
  const locale  = currency === 'INR' ? 'en-IN' : 'en-US';
  return `${symbol} ${n.toLocaleString(locale)}`;
}

function formatDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function valueOrDash(v) {
  if (v == null) return '—';
  const s = String(v).trim();
  return s === '' ? '—' : s;
}

function yesNoOrDash(v) {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return '—';
}

export default function Scholarships() {
  const [tab, setTab] = useState('all');
  const [viewId, setViewId] = useState(null);

  // Pass the status filter as a query param. The "all" tab omits it so the
  // server returns every row.
  const statusParam = tab === 'all' ? '' : tab.toUpperCase();
  const query = statusParam
    ? `/admissions/scholarships?status=${statusParam}`
    : `/admissions/scholarships`;
  const { data, isLoading } = useApi(query, [tab]);

  const rows    = data?.scholarships || [];
  const counts  = data?.counts?.byStatus || { PENDING: 0, APPROVED: 0, PARTIAL: 0, DECLINED: 0 };
  const total   = (counts.PENDING || 0) + (counts.APPROVED || 0) + (counts.PARTIAL || 0) + (counts.DECLINED || 0);

  // Table columns. Keep them compact — long-form notes live in the detail
  // modal so admins can scan many rows at a glance.
  const cols = [
    {
      key: 'applicantName',
      label: 'Applicant',
      render: (_v, r) => (
        <div>
          <div style={{ fontWeight: 500, color: '#1A1D23' }}>{r.applicantName || '—'}</div>
          <div style={{ fontSize: 12, color: '#7B8494' }}>{r.applicationNo || '—'} · {r.applicantEmail || '—'}</div>
        </div>
      ),
    },
    {
      key: 'programmeName',
      label: 'Programme',
      render: (_v, r) => (
        <div>
          <div style={{ color: '#1A1D23', fontSize: 13 }}>{r.programmeName || r.programmeCode || '—'}</div>
          <div style={{ fontSize: 12, color: '#7B8494' }}>
            {r.studentType || '—'}{r.studyMode ? ` · ${r.studyMode}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'requestType',
      label: 'Request',
      render: (v, r) => (
        <div>
          <div style={{ color: '#1A1D23', fontSize: 13 }}>{REQUEST_TYPE_LABELS[v] || v}</div>
          <div style={{ fontSize: 12, color: '#7B8494' }}>
            {v === 'workScholarship'
              ? `Commit 2 hrs/day: ${yesNoOrDash(r.workCommitment)}`
              : (r.applicantNoteExcerpt || '—')}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (v) => <Badge color={STATUS_BADGE_COLOR[v] || 'gray'}>{STATUS_LABELS[v] || v}</Badge>,
    },
    {
      key: 'submittedAt',
      label: 'Submitted',
      render: (v) => <span style={{ fontSize: 13, color: '#5A6272' }}>{formatDate(v)}</span>,
    },
    {
      key: '_action',
      label: '',
      render: (_v, r) => (
        <Btn size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setViewId(r.id); }}>
          Review
        </Btn>
      ),
    },
  ];

  return (
    <PageWrapper title="Scholarship Applications" subtitle="Review work-scholarship and financial-aid requests">
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard icon="📋" label="Total Requests" value={total} color="#0F2B4A" />
        <StatCard icon="⏳" label="Pending" value={counts.PENDING || 0} color="#92400E" />
        <StatCard icon="✅" label="Approved" value={counts.APPROVED || 0} color="#166534" />
        <StatCard icon="📊" label="Partial" value={counts.PARTIAL || 0} color="#0F766E" />
        <StatCard icon="✖" label="Declined" value={counts.DECLINED || 0} color="#991B1B" />
      </div>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'all',      label: `All (${total})` },
            { value: 'pending',  label: `Pending (${counts.PENDING || 0})` },
            { value: 'approved', label: `Approved (${counts.APPROVED || 0})` },
            { value: 'partial',  label: `Partial (${counts.PARTIAL || 0})` },
            { value: 'declined', label: `Declined (${counts.DECLINED || 0})` },
          ]} />
        </div>
        <Table
          columns={cols}
          rows={rows}
          loading={isLoading}
          onRowClick={r => setViewId(r.id)}
        />
      </Card>

      {viewId && (
        <ScholarshipDetailModal id={viewId} onClose={() => setViewId(null)} />
      )}
    </PageWrapper>
  );
}

function ScholarshipDetailModal({ id, onClose }) {
  const { data, isLoading } = useApi(`/admissions/scholarships/${id}`, [id]);
  const s = data?.scholarship;
  const a = s?.applicant;

  return (
    <Modal title="Scholarship Application" onClose={onClose} wide>
      {isLoading || !s ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#7B8494' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Status + decision audit at the top */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Badge color={STATUS_BADGE_COLOR[s.status] || 'gray'}>{STATUS_LABELS[s.status] || s.status}</Badge>
            {s.decidedAt && (
              <span style={{ fontSize: 12, color: '#5A6272' }}>
                Decided {formatDate(s.decidedAt)}
                {s.decider ? ` by ${s.decider.firstName || ''} ${s.decider.lastName || ''}`.trim() : ''}
              </span>
            )}
          </div>

          {/* Applicant block */}
          <Section title="Applicant">
            <Row label="Name"           value={`${a.firstName || ''} ${a.lastName || ''}`.trim() || '—'} />
            <Row label="Application No" value={a.applicationNo} />
            <Row label="Email"          value={a.email} />
            <Row label="Mobile"         value={a.mobile} />
            <Row label="Programme"      value={a.programmeName || a.programmeCode} />
            <Row label="Student type"   value={a.studentType} />
            <Row label="Study mode"     value={a.studyMode} />
            <Row label="Marital status" value={a.maritalStatus} />
            <Row label="Pipeline stage" value={a.pipelineStage} />
            <Row label="Submitted"      value={formatDate(a.submittedAt)} />
            <Row label="Payment"        value={a.paymentStatus} />
          </Section>

          {/* Scholarship request block */}
          <Section title="Request">
            <Row label="Type" value={REQUEST_TYPE_LABELS[s.requestType] || s.requestType} />
            {s.requestType === 'workScholarship' && (
              <Row label="Commits to 2 hrs/day work" value={yesNoOrDash(s.workCommitment)} />
            )}
            {s.requestType === 'financialAid' && (
              <RowBlock label="Applicant note">
                <div style={{ background: '#F8F9FA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1A1D23', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {valueOrDash(s.applicantNote)}
                </div>
              </RowBlock>
            )}
          </Section>

          {/* Family + financial context (admin uses this to evaluate the request) */}
          <Section title="Family & Financial Context">
            <Row label="Father" value={a.fatherName} />
            {a.fatherOccupation && <Row label="Father's occupation" value={a.fatherOccupation} />}
            <Row label="Mother" value={a.motherName} />
            {a.motherOccupation && <Row label="Mother's occupation" value={a.motherOccupation} />}
            {a.numberOfSiblings != null && a.numberOfSiblings !== '' && (
              <Row label="Siblings" value={String(a.numberOfSiblings)} />
            )}
            <Row label="Christian background" value={a.familyChristianBackground} />
            <Row label="Fee responsibility"   value={a.feeResponsibility} />
            <Row label="Needs financial aid"  value={yesNoOrDash(a.needsFinancialAid)} />
            {a.sponsoredByOrg && <Row label="Sponsoring organization" value={a.sponsoredByOrg} />}
            {a.sponsorName    && <Row label="Sponsor name"            value={a.sponsorName} />}
            {a.sponsorDetails && <Row label="Sponsor details"         value={a.sponsorDetails} />}
          </Section>

          {/* Decision audit — populated once sub-stage 5 ships the PUT endpoint. */}
          <Section title="Decision">
            {s.status === 'PENDING' ? (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 8, padding: '12px 14px', fontSize: 13, lineHeight: 1.6 }}>
                Decision controls (Approve / Partial / Decline + amount + notes) are
                being finalized — sub-stage 5. For now, this view is read-only.
              </div>
            ) : (
              <>
                <Row label="Status" value={STATUS_LABELS[s.status] || s.status} />
                {(s.status === 'APPROVED' || s.status === 'PARTIAL') && (
                  <Row label="Approved amount" value={formatMoney(s.approvedAmount, s.approvedCurrency)} />
                )}
                {s.decisionNotes && (
                  <RowBlock label="Decision notes">
                    <div style={{ background: '#F8F9FA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1A1D23', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {s.decisionNotes}
                    </div>
                  </RowBlock>
                )}
                {s.decider && (
                  <Row label="Decided by" value={`${s.decider.firstName || ''} ${s.decider.lastName || ''}`.trim() || s.decider.email} />
                )}
                <Row label="Decided at" value={formatDate(s.decidedAt)} />
              </>
            )}
          </Section>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Btn variant="outline" onClick={onClose}>Close</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#7B8494', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, fontSize: 13, lineHeight: 1.6, padding: '4px 0' }}>
      <div style={{ color: '#7B8494' }}>{label}</div>
      <div style={{ color: '#1A1D23', wordBreak: 'break-word' }}>{valueOrDash(value)}</div>
    </div>
  );
}

function RowBlock({ label, children }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ color: '#7B8494', fontSize: 13, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
