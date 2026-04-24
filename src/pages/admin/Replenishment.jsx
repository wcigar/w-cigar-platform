// src/pages/admin/Replenishment.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, ChevronRight } from 'lucide-react'
import { listReplenishmentRuns, generateDailyReplenishment } from '../../lib/services/replenishment'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

const STATUS_COLORS = { draft: '#6b7280', confirmed: '#3b82f6', picking: '#f59e0b', shipped: '#c9a84c', closed: '#22c55e' }
const STATUS_LABELS = { draft: '草稿', confirmed: '已確認', picking: '撿貨中', shipped: '已出貨', closed: '已結案' }

export default function Replenishment() {
  const navigate = useNavigate()
  const [list, setList] = useState([])

  useEffect(() => { listReplenishmentRuns().then(setList).catch(() => {}) }, [])

  async function regen() {
    await generateDailyReplenishment(new Date().toISOString().slice(0, 10))
    alert('MVP: 已呼叫 generate_daily_replenishment (mock)')
    listReplenishmentRuns().then(setList)
  }

  return (
    <PageShell
      title="補貨單列表"
      subtitle="HQ · REPLENISHMENT"
      actions={
        <button onClick={regen} style={primaryBtn()}>
          <RefreshCw size={14} /> 重新生成今日
        </button>
      }
    >
      {list.length === 0 ? <EmptyState label="沒有補貨單" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(r => (
            <Card key={r.id} style={{ cursor: 'pointer' }}>
              <div onClick={() => navigate(`/admin/replenishment/${r.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ color: '#e8e0d0', fontSize: 14, fontWeight: 500 }}>{r.run_date}</span>
                    <Badge color={STATUS_COLORS[r.status] || '#6b7280'}>{STATUS_LABELS[r.status] || r.status}</Badge>
                  </div>
                  <div style={{ fontSize: 11, color: '#8a8278' }}>
                    {r.total_items || 0} 項 · 總數量 {r.total_qty || 0}
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

function primaryBtn() {
  return { background: 'linear-gradient(135deg, #c9a84c 0%, #8b6d2f 100%)', color: '#0a0a0a', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }
}
