// src/pages/admin/AccountingPayrollReports.jsx
import { useEffect, useState } from 'react'
import { Printer, Download, FileText } from 'lucide-react'
import { listReports, getReport } from '../../lib/services/accountingReports'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

export default function AccountingPayrollReports() {
  const [reports, setReports] = useState([])
  const [active, setActive] = useState(null)

  useEffect(() => {
    listReports().then(rs => {
      setReports(rs)
      if (rs[0]) getReport(rs[0].id).then(setActive)
    }).catch(() => {})
  }, [])

  return (
    <PageShell
      title="會計視角總報表"
      subtitle="ACCOUNTING PAYROLL REPORTS"
      actions={
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => window.print()} style={btn()}><Printer size={14} /> 列印</button>
          <button onClick={() => alert('Phase 2: PDF 匯出')} style={btn()}><Download size={14} /> PDF</button>
        </div>
      }
    >
      <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 2, marginBottom: 8 }}>報表清單</div>
      {reports.length === 0 ? <EmptyState /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {reports.map(r => (
            <Card key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#c9a84c', fontSize: 13, fontWeight: 500 }}>{r.report_no}</div>
                  <div style={{ fontSize: 11, color: '#8a8278' }}>{r.period?.period_name} · v{r.report_version}</div>
                </div>
                <Badge color={r.status === 'finalized' ? '#10b981' : '#f59e0b'}>{r.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {active && (
        <>
          <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 2, marginBottom: 8 }}>報表內容 · {active.report_no}</div>
          <Card style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#8a8278', letterSpacing: 2, marginBottom: 10 }}>大使薪資總表</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(80px,1fr) repeat(7, minmax(60px, 1fr))', gap: 4, fontSize: 10, color: '#6a655c', paddingBottom: 6, borderBottom: '1px solid #2a2520' }}>
              <div>姓名</div><div>工資</div><div>抽成</div><div>待發</div><div>獎金</div><div>扣款</div><div>調整</div><div style={{ textAlign: 'right' }}>應發</div>
            </div>
            {(active.items || []).map(it => (
              <div key={it.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px,1fr) repeat(7, minmax(60px, 1fr))', gap: 4, fontSize: 12, padding: '8px 0', borderBottom: '1px solid #2a2520' }}>
                <div style={{ color: '#e8e0d0' }}>{it.ambassador?.name}</div>
                <div style={{ color: '#c9a84c' }}>{(it.hourly_pay||0).toLocaleString()}</div>
                <div style={{ color: '#10b981' }}>{(it.payable_commission||0).toLocaleString()}</div>
                <div style={{ color: '#f59e0b' }}>{(it.pending_commission||0).toLocaleString()}</div>
                <div>{(it.bonus_amount||0).toLocaleString()}</div>
                <div style={{ color: '#f87171' }}>{(it.deduction_amount||0).toLocaleString()}</div>
                <div>{(it.adjustment_amount||0).toLocaleString()}</div>
                <div style={{ textAlign: 'right', fontWeight: 600, color: '#c9a84c' }}>{(it.total_payable||0).toLocaleString()}</div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 8, borderTop: '1px solid #c9a84c' }}>
              <span style={{ color: '#c9a84c', fontSize: 12, fontWeight: 600 }}>總應發</span>
              <span style={{ color: '#c9a84c', fontSize: 16, fontWeight: 700 }}>
                NT$ {active.total_payable?.toLocaleString()}
              </span>
            </div>
          </Card>

          <div style={{ fontSize: 10, color: '#5a554e', textAlign: 'right' }}>
            生成：{new Date(active.generated_at).toLocaleString('zh-TW')} · 版本 v{active.report_version}
          </div>
        </>
      )}
    </PageShell>
  )
}

function btn() {
  return { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }
}
