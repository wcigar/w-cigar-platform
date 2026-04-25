import { useEffect, useState } from 'react'
import { getAmbassadorSession } from '../../lib/services/ambassadorAuth'
import { myPendingSupplyReceipts } from '../../lib/services/supplies'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

export default function AmbassadorSupplyReceipts() {
  const session = getAmbassadorSession()
  const [list, setList] = useState([])
  useEffect(() => {
    if (!session?.ambassador_id) return
    myPendingSupplyReceipts(session.ambassador_id).then(setList).catch(() => {})
  }, [session?.ambassador_id])
  return (
    <PageShell title="耗材待簽收" subtitle="SUPPLY RECEIPTS">
      {list.length === 0 ? <EmptyState label="目前沒有耗材待簽收" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(r => (
            <Card key={r.shipment_id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#e8e0d0', fontSize: 14, marginBottom: 4 }}>{r.shipment_no}</div>
                  <div style={{ fontSize: 11, color: '#8a8278' }}>{r.items_count} 項 · {new Date(r.shipped_at).toLocaleString('zh-TW')}</div>
                </div>
                <Badge color="#f59e0b">待簽收</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}
