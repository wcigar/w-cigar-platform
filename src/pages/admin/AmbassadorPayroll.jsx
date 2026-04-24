// src/pages/admin/AmbassadorPayroll.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Calculator, CheckCircle2, Lock } from 'lucide-react'
import { listPayrollPeriods } from '../../lib/services/payroll'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

const STATUS_COLORS = {
  open: '#6b7280', calculating: '#3b82f6', calculated: '#14b8a6',
  boss_reviewing: '#f59e0b', boss_approved: '#10b981',
  accounting_reviewing: '#f59e0b', accounting_confirmed: '#22c55e',
  payment_scheduled: '#c9a84c', paid: '#a3e635', locked: '#71717a', cancelled: '#ef4444',
}
const STATUS_LABELS = {
  open: '開放中', calculating: '計算中', calculated: '已計算',
  boss_reviewing: '老闆審核中', boss_approved: '老闆已核准',
  accounting_reviewing: '會計審核中', accounting_confirmed: '會計已確認',
  payment_scheduled: '排程發放', paid: '已發放', locked: '已鎖定', cancelled: '已取消',
}

export default function AmbassadorPayroll() {
  const navigate = useNavigate()
  const [periods, setPeriods] = useState([])

  useEffect(() => { listPayrollPeriods().then(setPeriods).catch(() => {}) }, [])

  return (
    <PageShell title="大使薪資期" subtitle="ADMIN · AMBASSADOR PAYROLL">
      {periods.length === 0 ? <EmptyState /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {periods.map(p => (
            <Card key={p.id} style={{ cursor: 'pointer' }}>
              <div onClick={() => navigate(`/admin/ambassador-payroll/${p.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ color: '#e8e0d0', fontSize: 15, fontWeight: 600 }}>{p.period_name}</span>
                    <Badge color={STATUS_COLORS[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                    {p.status === 'locked' && <Lock size={12} color="#71717a" />}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 11 }}>
                    <Mini label="應發總額" value={`NT$ ${(p.total_payable || 0).toLocaleString()}`} color="#c9a84c" />
                    <Mini label="銷售總額" value={`NT$ ${(p.total_sales || 0).toLocaleString()}`} />
                    <Mini label="大使數" value={`${p.ambassador_count || 0} 位`} />
                  </div>
                </div>
                <ChevronRight size={18} color="#5a554e" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.15)', fontSize: 11, color: '#8a8278', lineHeight: 1.7 }}>
        <div style={{ color: '#c9a84c', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calculator size={12} /> 薪資狀態流程
        </div>
        open → calculating → calculated → boss_reviewing → boss_approved → accounting_reviewing → accounting_confirmed → payment_scheduled → paid → locked
      </div>
    </PageShell>
  )
}

function Mini({ label, value, color }) {
  return (
    <div>
      <div style={{ color: '#6a655c', fontSize: 10 }}>{label}</div>
      <div style={{ color: color || '#e8e0d0', fontSize: 12, fontWeight: 500 }}>{value}</div>
    </div>
  )
}
