import { useEffect, useState } from 'react'
import { listSupplyPickLists } from '../../lib/services/warehouse'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

export default function SupplyPickLists() {
  const [list, setList] = useState([])
  useEffect(() => { listSupplyPickLists().then(setList).catch(() => {}) }, [])
  return (
    <PageShell title="耗材待撿貨" subtitle="WAREHOUSE · SUPPLY PICK LISTS">
      {list.length === 0 ? <EmptyState label="無待撿貨耗材" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(r => (
            <Card key={r.request_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#e8e0d0', fontSize: 14 }}>{r.ambassador_name} · {r.venue_name}</div>
                  <div style={{ fontSize: 11, color: '#8a8278' }}>{r.items_count} 項</div>
                </div>
                {r.urgency === 'urgent' && <Badge color="#f87171">急件</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}
