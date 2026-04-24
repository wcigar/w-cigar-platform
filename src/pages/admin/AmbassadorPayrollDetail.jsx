// src/pages/admin/AmbassadorPayrollDetail.jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Calculator, CheckCircle2, Landmark, CreditCard, Lock, FileText } from 'lucide-react'
import { getPeriod, listPayrollItems, calculatePayroll, bossApprove, accountingConfirm, schedulePayment, markPaid, lockPeriod } from '../../lib/services/payroll'
import { generateReport } from '../../lib/services/accountingReports'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

export default function AmbassadorPayrollDetail() {
  const { periodId } = useParams()
  const navigate = useNavigate()
  const [period, setPeriod] = useState(null)
  const [items, setItems] = useState([])
  const [working, setWorking] = useState(false)

  useEffect(() => { load() }, [periodId])

  async function load() {
    setPeriod(await getPeriod(periodId))
    setItems(await listPayrollItems(periodId))
  }

  async function run(fn, label) {
    if (working) return
    setWorking(true)
    try {
      await fn()
      alert(`MVP: ${label}（mock）`)
      load()
    } catch (e) { alert('失敗：' + e.message) }
    setWorking(false)
  }

  if (!period) return <PageShell title="載入中..."><EmptyState /></PageShell>

  const checklist = [
    { done: period.status !== 'open', label: '① 計算薪資' },
    { done: ['boss_approved','accounting_confirmed','payment_scheduled','paid','locked'].includes(period.status), label: '② 老闆確認' },
    { done: ['accounting_confirmed','payment_scheduled','paid','locked'].includes(period.status), label: '③ 會計確認' },
    { done: ['payment_scheduled','paid','locked'].includes(period.status), label: '④ 排程付款' },
    { done: ['paid','locked'].includes(period.status), label: '⑤ 發放薪資' },
    { done: period.status === 'locked', label: '⑥ 鎖定期' },
  ]

  return (
    <PageShell
      title={period.period_name}
      subtitle="AMBASSADOR PAYROLL DETAIL"
      actions={<button onClick={() => navigate('/admin/ambassador-payroll')} style={backBtn()}><ArrowLeft size={14} /> 返回</button>}
    >
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: '#8a8278', letterSpacing: 2, marginBottom: 8 }}>薪資期檢查清單</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {checklist.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.done ? '#22c55e' : '#6a655c' }}>
              <CheckCircle2 size={14} />
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* 動作列 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <ActionBtn icon={<Calculator size={14} />} label="重新計算"
          onClick={() => run(() => calculatePayroll(periodId, 'me'), '已重新計算')} disabled={working}  />
        <ActionBtn icon={<CheckCircle2 size={14} />} label="老闆確認"
          onClick={() => run(() => bossApprove(periodId, 'me'), '老闆已確認')} disabled={working || period.status !== 'calculated'} />
        <ActionBtn icon={<Landmark size={14} />} label="會計確認"
          onClick={() => run(() => accountingConfirm(periodId, 'me'), '會計已確認')} disabled={working || period.status !== 'boss_approved'} />
        <ActionBtn icon={<CreditCard size={14} />} label="排程付款"
          onClick={() => run(() => schedulePayment(periodId, 'me'), '已排程')} disabled={working || period.status !== 'accounting_confirmed'} />
        <ActionBtn icon={<CreditCard size={14} />} label="標記已發"
          onClick={() => run(() => markPaid(periodId, 'me'), '已標記發放')} disabled={working || period.status !== 'payment_scheduled'} />
        <ActionBtn icon={<Lock size={14} />} label="鎖定期"
          onClick={() => run(() => lockPeriod(periodId, 'me'), '已鎖定')} disabled={working || period.status !== 'paid'} />
        <ActionBtn icon={<FileText size={14} />} label="產生會計報表"
          onClick={() => run(() => generateReport(periodId, 'me'), '報表已生成')} disabled={working} />
      </div>

      {/* 大使薪資總表 */}
      <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 2, marginBottom: 8 }}>大使薪資總表（{items.length}）</div>
      {items.length === 0 ? <EmptyState /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(it => (
            <Card key={it.id} style={{ cursor: 'pointer' }}>
              <div onClick={() => navigate(`/admin/ambassador-payroll/${periodId}/${it.ambassador_id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: '#e8e0d0', fontSize: 14, fontWeight: 500 }}>{it.ambassador?.name}</span>
                  <span style={{ color: '#c9a84c', fontSize: 16, fontWeight: 600 }}>NT$ {it.total_payable_amount?.toLocaleString()}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, fontSize: 11 }}>
                  <Mini label="工時" value={`${it.approved_hours}h`} />
                  <Mini label="時薪工資" value={`${(it.hourly_pay||0).toLocaleString()}`} />
                  <Mini label="抽成" value={`${(it.payable_commission_amount||0).toLocaleString()}`} color="#10b981" />
                  <Mini label="待收" value={`${(it.pending_commission_amount||0).toLocaleString()}`} color="#f59e0b" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}

function ActionBtn({ icon, label, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        padding: '8px 12px', borderRadius: 6, fontSize: 12,
        background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(201,168,76,0.1)',
        border: `1px solid ${disabled ? '#2a2520' : 'rgba(201,168,76,0.3)'}`,
        color: disabled ? '#5a554e' : '#c9a84c',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{icon}{label}</button>
  )
}

function Mini({ label, value, color }) {
  return (
    <div>
      <div style={{ color: '#6a655c', fontSize: 9 }}>{label}</div>
      <div style={{ color: color || '#e8e0d0', fontSize: 12 }}>{value}</div>
    </div>
  )
}

function backBtn() {
  return { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }
}
