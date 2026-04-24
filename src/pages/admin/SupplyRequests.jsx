// src/pages/admin/SupplyRequests.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, AlertTriangle } from 'lucide-react'
import { listSupplyRequestsForHQ, SUPPLY_STATUSES } from '../../lib/services/supplies'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

export default function SupplyRequests() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [filter, setFilter] = useState('submitted')

  useEffect(() => { listSupplyRequestsForHQ({ status: filter }).then(setList).catch(() => {}) }, [filter])

  const statuses = ['submitted', 'approved', 'picking', 'shipped', 'received', 'rejected']

  return (
    <PageShell title="耗材申請審核" subtitle="HQ · SUPPLY REVIEW">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12,
              background: filter === s ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.02)',
              color: filter === s ? '#c9a84c' : '#8a8278',
              border: `1px solid ${filter === s ? '#c9a84c' : '#2a2520'}`,
              cursor: 'pointer',
            }}>
            {SUPPLY_STATUSES[s]?.label || s}
          </button>
        ))}
      </div>
      {list.length === 0 ? <EmptyState label="無資料" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(r => (
            <Card key={r.id} style={{ cursor: 'pointer' }}>
              <div onClick={() => navigate(`/admin/supply-requests/${r.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ color: '#e8e0d0', fontSize: 14, fontWeight: 500 }}>{r.ambassador_name}</span>
                    <span style={{ color: '#8a8278', fontSize: 12 }}>· {r.venue_name}</span>
                    {r.urgency === 'urgent' && <Badge color="#f87171">急件</Badge>}
                    {r.has_high_risk && <Badge color="#fbbf24">⚠ 高風險</Badge>}
                  </div>
                  <div style={{ fontSize: 11, color: '#8a8278' }}>
                    {r.request_date} · {r.items_count} 項
                  </div>
                </div>
                <ChevronRight size={18} color="#5a554e" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}
