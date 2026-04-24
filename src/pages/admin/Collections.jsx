// src/pages/admin/Collections.jsx
// 督導收帳 + HQ 總覽（按角色遮資料）
import { useEffect, useState } from 'react'
import { listCollections, COLLECTION_STATUSES } from '../../lib/services/collections'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

export default function Collections() {
  const [list, setList] = useState([])
  useEffect(() => { listCollections().then(setList).catch(() => {}) }, [])

  return (
    <PageShell title="收帳總覽" subtitle="SUPERVISOR · COLLECTIONS">
      {list.length === 0 ? <EmptyState label="無待收帳記錄" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(c => {
            const status = COLLECTION_STATUSES[c.status] || {}
            const remaining = c.due_amount - (c.collected_amount || 0)
            return (
              <Card key={c.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ color: '#e8e0d0', fontSize: 14, fontWeight: 500 }}>{c.venue_name}</div>
                    <div style={{ fontSize: 11, color: '#8a8278' }}>{c.ambassador_name} · 到期 {c.due_date}</div>
                  </div>
                  <Badge color={status.color}>{status.label}</Badge>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 11 }}>
                  <Mini label="應收" value={`NT$ ${c.due_amount?.toLocaleString()}`} />
                  <Mini label="已收" value={`NT$ ${(c.collected_amount || 0).toLocaleString()}`} color="#10b981" />
                  <Mini label="未收" value={`NT$ ${remaining.toLocaleString()}`} color={remaining > 0 ? '#f87171' : '#6a655c'} />
                </div>
              </Card>
            )
          })}
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
