// src/pages/warehouse/PickLists.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Package } from 'lucide-react'
import { listPickLists } from '../../lib/services/warehouse'
import PageShell, { Card, EmptyState } from '../../components/PageShell'

export default function PickLists() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  useEffect(() => { listPickLists().then(setList).catch(() => {}) }, [])

  return (
    <PageShell title="待撿貨補貨單" subtitle="WAREHOUSE · PICK LISTS">
      {list.length === 0 ? <EmptyState label="沒有待撿貨單" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(r => (
            <Card key={r.id} style={{ cursor: 'pointer' }}>
              <div onClick={() => navigate(`/warehouse/shipments/${r.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Package size={22} color="#f59e0b" />
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#e8e0d0', fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{r.run_date}</div>
                  <div style={{ fontSize: 11, color: '#8a8278' }}>
                    {r.venue_count || '-'} 間酒店 · {r.total_items} 項 · 總量 {r.total_qty}
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
