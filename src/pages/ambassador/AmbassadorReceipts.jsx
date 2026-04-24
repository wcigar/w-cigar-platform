// src/pages/ambassador/AmbassadorReceipts.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackageCheck, ChevronRight } from 'lucide-react'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

const mock = [
  { id: 'r1', shipment_no: 'WS-260425-0001', venue_name: '君悅酒店', items_count: 5, shipped_at: new Date().toISOString(), status: 'pending' },
  { id: 'r2', shipment_no: 'WS-260424-0003', venue_name: '文華東方', items_count: 3, shipped_at: '2026-04-24T10:30:00Z', status: 'pending' },
]

export default function AmbassadorReceipts() {
  const navigate = useNavigate()
  const [list, setList] = useState([])

  useEffect(() => { setList(mock) }, [])

  return (
    <PageShell title="待收貨批次" subtitle="AMBASSADOR RECEIPTS">
      {list.length === 0 ? <EmptyState label="目前沒有待簽收商品" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(r => (
            <Card key={r.id} style={{ cursor: 'pointer' }}>
              <div onClick={() => navigate(`/ambassador/receipts/${r.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <PackageCheck size={22} color="#14b8a6" />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, color: '#e8e0d0', fontWeight: 500 }}>{r.venue_name}</span>
                    <Badge color="#f59e0b">待簽收</Badge>
                  </div>
                  <div style={{ fontSize: 11, color: '#8a8278' }}>
                    {r.shipment_no} · {r.items_count} 項 · {new Date(r.shipped_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
