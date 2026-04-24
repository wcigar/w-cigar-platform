// src/pages/admin/VenueSales.jsx
// HQ/Staff 每日酒店銷售 key-in
import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { listVenueSales, todayISO } from '../../lib/services/venueSales'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

export default function VenueSales() {
  const [list, setList] = useState([])
  const [date, setDate] = useState(todayISO())

  useEffect(() => { listVenueSales({ date }).then(setList).catch(() => {}) }, [date])

  return (
    <PageShell
      title="酒店銷售 Key-in"
      subtitle="HQ · VENUE SALES"
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ background: '#1a1714', border: '1px solid #2a2520', color: '#e8dcc8', padding: '6px 10px', borderRadius: 6, fontSize: 13 }} />
          <button style={primaryBtn()}><Plus size={14} /> 新增銷售</button>
        </div>
      }
    >
      <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 10 }}>共 {list.length} 筆 · {date}</div>
      {list.length === 0 ? <EmptyState label="當日無銷售紀錄" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(s => (
            <Card key={s.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div>
                  <span style={{ color: '#e8e0d0', fontSize: 14, fontWeight: 500 }}>{s.venue_name}</span>
                  <span style={{ marginLeft: 10, color: '#8a8278', fontSize: 12 }}>{s.ambassador_name}</span>
                </div>
                <PaymentBadge status={s.payment_status} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 11 }}>
                <Mini label="總額" value={`NT$ ${s.total_amount?.toLocaleString() || 0}`} />
                <Mini label="現金" value={`NT$ ${s.cash_amount?.toLocaleString() || 0}`} />
                <Mini label="匯款" value={`NT$ ${s.transfer_amount?.toLocaleString() || 0}`} />
                <Mini label="未收" value={`NT$ ${s.unpaid_amount?.toLocaleString() || 0}`} color={s.unpaid_amount > 0 ? '#f87171' : '#6a655c'} />
              </div>
            </Card>
          ))}
        </div>
      )}
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
function PaymentBadge({ status }) {
  const map = {
    paid: { label: '已收齊', c: '#10b981' },
    partial: { label: '部分', c: '#f59e0b' },
    unpaid: { label: '未收款', c: '#f87171' },
    monthly: { label: '月結', c: '#3b82f6' },
  }
  const { label, c } = map[status] || map.unpaid
  return <Badge color={c}>{label}</Badge>
}
function primaryBtn() {
  return { background: 'linear-gradient(135deg, #c9a84c 0%, #8b6d2f 100%)', color: '#0a0a0a', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }
}
