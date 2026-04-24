// src/pages/ambassador/AmbassadorPayroll.jsx
// 大使自己的薪資單（只能看自己，不顯示公司完整毛利）
import { useEffect, useState } from 'react'
import { getAmbassadorSession } from '../../lib/services/ambassadorAuth'
import { listPayrollPeriods, listPayrollItems } from '../../lib/services/payroll'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

export default function AmbassadorPayroll() {
  const session = getAmbassadorSession()
  const [periods, setPeriods] = useState([])
  const [active, setActive] = useState(null)

  useEffect(() => {
    listPayrollPeriods().then(ps => {
      setPeriods(ps)
      if (ps[0]) loadItem(ps[0].id)
    })
  }, [])

  async function loadItem(periodId) {
    const items = await listPayrollItems(periodId)
    const my = items.find(i => i.ambassador_id === session?.ambassador_id) || items[0]
    setActive({ ...my, period_id: periodId })
  }

  return (
    <PageShell title="我的薪資" subtitle="MY PAYROLL">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {periods.map(p => (
          <button key={p.id} onClick={() => loadItem(p.id)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12,
              background: active?.period_id === p.id ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.02)',
              color: active?.period_id === p.id ? '#c9a84c' : '#8a8278',
              border: `1px solid ${active?.period_id === p.id ? '#c9a84c' : '#2a2520'}`,
              cursor: 'pointer',
            }}>{p.period_name}</button>
        ))}
      </div>

      {!active ? <EmptyState /> : (
        <>
          {/* 總額大字 */}
          <Card style={{ marginBottom: 12, padding: '20px 16px', textAlign: 'center',
            borderLeft: '3px solid #c9a84c', background: 'rgba(201,168,76,0.04)' }}>
            <div style={{ fontSize: 10, color: '#8a8278', letterSpacing: 3 }}>本期可發薪資</div>
            <div style={{ fontSize: 32, color: '#c9a84c', fontWeight: 700, margin: '8px 0' }}>
              NT$ {(active.total_payable_amount || 0).toLocaleString()}
            </div>
            <Badge color={active.status === 'paid' ? '#10b981' : '#f59e0b'}>
              {active.status === 'paid' ? '已發放' : '計算中'}
            </Badge>
          </Card>

          {/* 明細拆解 */}
          <Card style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#8a8278', letterSpacing: 2, marginBottom: 10 }}>組成</div>
            <LineRow label="工時" detail={`${active.approved_hours}h × NT$ ${active.hourly_rate_snapshot}`} value={active.hourly_pay} />
            <LineRow label="可發抽成" detail="已收帳驗證" value={active.payable_commission_amount} color="#10b981" />
            <LineRow label="待收抽成" detail="收帳 verified 後才能領" value={active.pending_commission_amount} color="#f59e0b" />
            <LineRow label="獎金" value={active.bonus_amount} />
            <LineRow label="扣款" value={-active.deduction_amount} color="#f87171" />
            <LineRow label="調整" value={active.adjustment_amount} />
          </Card>

          {/* 業績概況（只給銷售額與收款、不給毛利） */}
          <Card>
            <div style={{ fontSize: 10, color: '#8a8278', letterSpacing: 2, marginBottom: 10 }}>本期業績</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, fontSize: 12 }}>
              <Mini label="銷售總額" value={`NT$ ${active.sales_amount?.toLocaleString()}`} />
              <Mini label="已收款" value={`NT$ ${active.collected_amount?.toLocaleString()}`} color="#10b981" />
              <Mini label="未收款" value={`NT$ ${active.pending_collection_amount?.toLocaleString()}`} color="#f59e0b" />
            </div>
          </Card>

          <div style={{ marginTop: 16, fontSize: 10, color: '#5a554e', textAlign: 'center', letterSpacing: 1 }}>
            薪資最終金額以會計報表為準 · 有疑問請聯絡督導或 HQ
          </div>
        </>
      )}
    </PageShell>
  )
}

function LineRow({ label, detail, value, color = '#e8e0d0' }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #2a2520' }}>
      <div>
        <div style={{ color: '#e8e0d0', fontSize: 13 }}>{label}</div>
        {detail && <div style={{ color: '#6a655c', fontSize: 10, marginTop: 2 }}>{detail}</div>}
      </div>
      <div style={{ color, fontSize: 14, fontWeight: 500 }}>NT$ {value.toLocaleString()}</div>
    </div>
  )
}

function Mini({ label, value, color }) {
  return (
    <div>
      <div style={{ color: '#6a655c', fontSize: 10 }}>{label}</div>
      <div style={{ color: color || '#e8e0d0', fontSize: 13 }}>{value}</div>
    </div>
  )
}
