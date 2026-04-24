// src/pages/ambassador/AmbassadorSupplies.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronRight } from 'lucide-react'
import { getAmbassadorSession } from '../../lib/services/ambassadorAuth'
import { myRequests, SUPPLY_STATUSES } from '../../lib/services/supplies'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

export default function AmbassadorSupplies() {
  const navigate = useNavigate()
  const session = getAmbassadorSession()
  const [list, setList] = useState([])

  useEffect(() => {
    myRequests(session?.ambassador_id).then(setList).catch(() => {})
  }, [session?.ambassador_id])

  return (
    <PageShell
      title="我的耗材申請"
      subtitle="SUPPLY REQUESTS"
      actions={
        <button onClick={() => navigate('/ambassador/supplies/new')}
          style={{ background: 'linear-gradient(135deg, #c9a84c 0%, #8b6d2f 100%)', color: '#0a0a0a', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> 新增申請
        </button>
      }
    >
      {list.length === 0 ? <EmptyState label="還沒有任何申請，點右上新增" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(r => {
            const status = SUPPLY_STATUSES[r.status] || {}
            return (
              <Card key={r.id} style={{ cursor: 'pointer' }}>
                <div onClick={() => navigate(`/ambassador/supplies/${r.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, color: '#e8e0d0' }}>{r.request_date}</span>
                      <Badge color={status.color}>{status.label || r.status}</Badge>
                      {r.urgency === 'urgent' && <Badge color="#f87171">急件</Badge>}
                    </div>
                    <div style={{ fontSize: 11, color: '#8a8278' }}>
                      {r.items_count} 項 · {r.reason || '無備註'}
                    </div>
                  </div>
                  <ChevronRight size={18} color="#5a554e" />
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
