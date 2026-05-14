import { useState } from 'react';
import { PageWrapper, Card, Btn, Select, Badge, Table } from '../../components/common';
import { useApi } from '../../hooks/useApi';
import { BarChart } from '../../components/charts';
import api from '../../utils/api';

const REPORT_TYPES = [
  { id: 'academic', icon: '📊', label: 'Academic', desc: 'Marksheets, batch performance, CGPA distribution' },
  { id: 'financial', icon: '💰', label: 'Financial', desc: 'Collections, outstanding, payment methods, scholarships' },
  { id: 'admissions', icon: '📋', label: 'Admissions', desc: 'Pipeline summary, acceptance rates, student types' },
  { id: 'attendance', icon: '📅', label: 'Attendance', desc: 'Per student, chapel, below-threshold flags' },
  { id: 'referrals', icon: '🔗', label: 'Referrals', desc: 'Referral programme performance and rewards' },
  { id: 'at_risk', icon: '⚠️', label: 'At-Risk', desc: 'Students flagged across CGPA, attendance and fees' },
];

function downloadPDF(url, filename) {
  api.get(url, { params: { format: 'pdf' }, responseType: 'blob' }).then(res => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(res.data);
    link.download = filename;
    link.click();
  });
}

export default function Reports() {
  const [activeReport, setActiveReport] = useState(null);
  const [filters, setFilters] = useState({ semesterId: '', batchId: '', programmeId: '' });
  const { data: semesters } = useApi('/semesters');
  const { data: programmes } = useApi('/programmes');

  const reportUrl = activeReport ? `/reports/${activeReport.id.replace('_','/')}` : null;
  const { data: reportData, loading } = useApi(activeReport ? `${reportUrl}?semesterId=${filters.semesterId}&batchId=${filters.batchId}&programmeId=${filters.programmeId}` : null, [activeReport, filters]);

  if (!activeReport) {
    return (
      <PageWrapper title="Reports & Analytics" subtitle="Institutional data and insights">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {REPORT_TYPES.map(r => (
            <div key={r.id} onClick={() => setActiveReport(r)}
              style={{ padding: '20px', border: '1px solid #DDE1E7', borderRadius: 12, background: '#fff', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#0F2B4A'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#DDE1E7'}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>{r.icon}</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: '#0F2B4A', marginBottom: 4 }}>{r.label}</div>
              <div style={{ fontSize: 13, color: '#7B8494' }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title={`${activeReport.icon} ${activeReport.label} Report`} subtitle="Filter and export data">
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn variant="ghost" onClick={() => setActiveReport(null)}>← Back</Btn>
        <Select value={filters.semesterId} onChange={e => setFilters(f => ({ ...f, semesterId: e.target.value }))}
          options={[{ value: '', label: 'All Semesters' }, ...(semesters?.semesters || []).map(s => ({ value: s.id, label: s.name }))]} />
        <Select value={filters.programmeId} onChange={e => setFilters(f => ({ ...f, programmeId: e.target.value }))}
          options={[{ value: '', label: 'All Programmes' }, ...(programmes?.programmes || []).map(p => ({ value: p.id, label: p.name }))]} />
        <div style={{ flex: 1 }} />
        <Btn variant="outline" onClick={() => downloadPDF(`${reportUrl}`, `HMC-${activeReport.label}-Report.pdf`)}>Download PDF</Btn>
        <Btn variant="outline" onClick={() => api.get(reportUrl, { params: { ...filters, format: 'excel' }, responseType: 'blob' }).then(r => { const l = document.createElement('a'); l.href = URL.createObjectURL(r.data); l.download = `report.xlsx`; l.click(); })}>Download Excel</Btn>
      </div>
      <Card>
        {loading ? <div style={{ color: '#7B8494', padding: 40, textAlign: 'center' }}>Loading report data...</div> : (
          <div>
            {reportData?.summary && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                {Object.entries(reportData.summary).map(([k, v]) => (
                  <div key={k} style={{ padding: '12px 16px', background: '#EEF4FA', borderRadius: 8, minWidth: 120 }}>
                    <div style={{ fontSize: 11, color: '#7B8494', textTransform: 'uppercase', letterSpacing: 1 }}>{k.replace(/_/g, ' ')}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#0F2B4A', marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            )}
            {reportData?.chartData && <BarChart data={reportData.chartData} xKey="label" bars={[{ key: 'value', label: activeReport.label }]} />}
            {reportData?.rows && (
              <Table columns={(reportData.columns || []).map(c => ({ key: c, label: c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }))} rows={reportData.rows} />
            )}
          </div>
        )}
      </Card>
    </PageWrapper>
  );
}
