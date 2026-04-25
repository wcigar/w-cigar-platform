// src/pages/admin/Replenishment.jsx
// 補貨單列表（Tab：待確認 / 待出貨 / 配送中 / 已完成 / 全部）
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronRight, Package, Clock, Truck, CheckCircle2 } from 'lucide-react'
import {
  listReplenishmentRuns, REPLENISHMENT_STATUS as ST, REPLENISHMENT_STATUS_LABEL as STL,
} from '../../lib/services/replenishment'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

const TABS = [
  { key: 'all', label: '全部', icon: Package },
  { key: ST.MAKER_DONE, label: '待確認', icon: Clock, color: '#f59e0b' },
  { key: ST.CHECKER_DONE, label: '待出貨', icon: Truck, color: '#3b82f6' },
  { key: ST.SHIPPING, label: '配送中', icon: Truck, color: '#c9a84c' },
  { key: ST.DELIVERED, label: '已完成', icon: CheckCircle2, color: '#10b981' },
]

export default function Replenishment() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [tab, setTab] = useState(ST.MAKER_DONE)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  async function reload() {
    setLoading(true)
    const all = await listReplenishmentRuns()
    setList(all)
    setLoading(false)
  }
  useEffect(() => { reload() }, [])

  const counts = useMemo(() => {
    const c = { all: list.length }
    Object.values(ST).forEach(s => { c[s] = list.filter(r => r.status === s).length })
    return c
  }, [list])

  const filtered = useMemo(() => {
    let out = tab === 'all' ? list : list.filter(r => r.status === tab)
    if (q.trim()) {
      const qq = q.trim().toLowerCase()
      out = out.filter(r => r.run_no?.toLowerCase().includes(qq) || (r.created_by_name || '').toLowerCase().includes(qq))
    }
    return out
  }, [list, tab, q])

  return (
    <PageShell title="補貨單" subtitle="ADMIN · REPLENISHMENT">
      <Card style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {TABS.map(t => {
          const active = tab === t.key
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                padding: '8px 14px', background: active ? '#c9a84c22' : 'transparent',
                border: '1px solid ' + (active ? '#c9a84c' : '#2a2520'),
                borderRadius: 6, color: active ? '#c9a84c' : t.color || '#8a8278',
                fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              <Icon size={13} /> {t.label} ({counts[t.key] || 0})
            </button>
          )
        })}
      </Card>

      <Card style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#6a655c' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋單號 / 建立人"
            style={{ width: '100%', padding: '8px 10px 8px 30px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <button onClick={() => navigate('/admin/inventory')} style={{ padding: '8px 14px', background: '#c9a84c', border: 'none', borderRadius: 6, color: '#0a0a0a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          + 從庫存矩陣建單
        </button>
      </Card>

      {loading ? (
        <Card>載入中…</Card>
      ) : filtered.length === 0 ? (
        <Card style={{ textAlign: 'center', color: '#6a655c', padding: 30, fontSize: 13 }}>
          沒有符合條件的補貨單{tab === ST.MAKER_DONE && '（請先到「庫存管理」一鍵生成）'}
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(r => <RunRow key={r.id} run={r} onClick={() => navigate(`/admin/replenishment/${r.id}`)} />)}
        </div>
      )}
    </PageShell>
  )
}

function RunRow({ run, onClick }) {
  const statusColor = {
    [ST.DRAFT]: '#6b7280',
    [ST.MAKER_DONE]: '#f59e0b',
    [ST.CHECKER_DONE]: '#3b82f6',
    [ST.SHIPPING]: '#c9a84c',
    [ST.DELIVERED]: '#10b981',
    [ST.CANCELLED]: '#ef4444',
  }[run.status] || '#8a8278'

  return (
    <div onClick={onClick} style={{ background: '#15110f', border: '1px solid #2a2520', borderLeft: `3px solid ${statusColor}`, borderRadius: 10, padding: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#c9a84c' }}>{run.run_no}</span>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: statusColor + '22', color: statusColor }}>{STL[run.status]}</span>
          {run.single_user_mode && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f59e0b22', color: '#f59e0b' }}>單人模式</span>}
        </div>
        <div style={{ fontSize: 11, color: '#8a8278', marginTop: 4 }}>
          {run.venue_count} 店 · {run.item_count} 項 · NT$ {(run.total_amount || 0).toLocaleString()}
        </div>
        <div style={{ fontSize: 10, color: '#5a554e', marginTop: 2 }}>
          建立：{run.created_by_name || '?'} · {run.created_at?.slice(5, 16).replace('T', ' ')}
          {run.confirmed_by_name && ` · 確認：${run.confirmed_by_name}`}
        </div>
      </div>
      <ChevronRight size={16} color="#6a655c" />
    </div>
  )
}
