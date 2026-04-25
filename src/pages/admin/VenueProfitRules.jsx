// src/pages/admin/VenueProfitRules.jsx
import { useEffect, useState } from 'react'
import { listVenueProfitRules, getVenueProfitSummary } from '../../lib/services/venueProfitRules'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

const SETTLEMENT_LABEL = {
  consignment: '寄賣', revenue_share: '拆帳', wholesale: '批發',
  fixed_margin: '固定毛利', monthly_settlement: '月結', custom: '自訂',
}

export default function VenueProfitRules() {
  const [rules, setRules] = useState([])
  const [summary, setSummary] = useState([])

  useEffect(() => {
    listVenueProfitRules().then(setRules).catch(() => {})
    getVenueProfitSummary().then(setSummary).catch(() => {})
  }, [])

  return (
    <PageShell title="場域利潤規則" subtitle="ADMIN · VENUE PROFIT RULES">
      <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 2, marginBottom: 8 }}>現行規則（每家酒店 1 筆 active）</div>
      {rules.length === 0 ? <EmptyState /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {rules.map(r => (
            <Card key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ color: '#e8e0d0', fontSize: 14, fontWeight: 500 }}>{r.venue?.name}</div>
                <Badge color="#c9a84c">{SETTLEMENT_LABEL[r.settlement_type]}</Badge>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 11 }}>
                <Mini label="場域分潤" value={`${(r.venue_share_rate*100).toFixed(0)}%`} />
                <Mini label="公司毛利" value={`${(r.company_margin_rate*100).toFixed(0)}%`} />
                <Mini label="大使抽成基準" value={r.ambassador_commission_basis} />
                <Mini label="結算週期" value={r.settlement_cycle} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 2, marginBottom: 8 }}>場域利潤總表（近 30 日）</div>
      {summary.length === 0 ? <EmptyState /> : (
        <Card>
          {summary.map((s, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: i < summary.length - 1 ? '1px solid #2a2520' : 'none' }}>
              <div style={{ color: '#e8e0d0', fontSize: 13, marginBottom: 4 }}>{s.venue_name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 11 }}>
                <Mini label="營業額" value={`NT$ ${s.revenue?.toLocaleString()}`} />
                <Mini label="公司毛利" value={`NT$ ${s.company_gross?.toLocaleString()}`} color="#10b981" />
                <Mini label="淨利估算" value={`NT$ ${s.company_net_est?.toLocaleString()}`} color="#c9a84c" />
              </div>
            </div>
          ))}
        </Card>
      )}
    </PageShell>
  )
}

function Mini({ label, value, color }) {
  return (
    <div>
      <div style={{ color: '#6a655c', fontSize: 10 }}>{label}</div>
      <div style={{ color: color || '#e8e0d0', fontSize: 12 }}>{value}</div>
    </div>
  )
}
