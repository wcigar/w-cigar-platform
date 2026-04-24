import { useEffect, useState } from 'react'
import { listShipments } from '../../lib/services/warehouse'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

export default function Shipments() {
  const [list, setList] = useState([])
  useEffect(() => { listShipments().then(setList).catch(() => {}) }, [])
  return (
    <PageShell title="出貨歷史" subtitle="WAREHOUSE · SHIPMENTS">
      {list.length === 0 ? <EmptyState /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(s => (
            <Card key={s.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#e8e0d0', fontSize: 14 }}>{s.shipment_no}</div>
                  <div style={{ fontSize: 11, color: '#8a8278' }}>{s.run_date} · {s.items_count} 項</div>
                </div>
                <Badge color="#c9a84c">{s.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}
