import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { TrendingUp, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { format, subDays } from 'date-fns'

function MiniChart({ data, safeStock, width = 200, height = 50 }) {
  if (!data.length) return <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>無歷史資料</span>
  const vals = data.map(d => d.stock)
  const maxV = Math.max(...vals, safeStock || 0, 1)
  const minV = 0
  const range = maxV - minV || 1
  const points = vals.map((v, i) => {
    const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * (width - 20) + 10
    const y = height - 8 - ((v - minV) / range) * (height - 16)
    return { x, y, v }
  })
  const safeY = safeStock ? height - 8 - ((safeStock - minV) / range) * (height - 16) : null
  const line = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ')
  const areaPath = line + ' L' + points[points.length - 1].x + ',' + (height - 4) + ' L' + points[0].x + ',' + (height - 4) + ' Z'

  return (
    <svg viewBox={'0 0 ' + width + ' ' + height} style={{ width: '100%', maxWidth: width, height: height }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {safeY != null && <line x1="0" y1={safeY} x2={width} y2={safeY} stroke="var(--red)" strokeWidth="1" strokeDasharray="4,3" opacity="0.5" />}
      {safeY != null && <text x={width - 2} y={safeY - 3} fill="var(--red)" fontSize="7" textAnchor="end" opacity="0.6">安全值</text>}
      <path d={areaPath} fill="url(#areaGrad)" />
      <path d={line} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--gold)" stroke="var(--black-card)" strokeWidth="1.5" />)}
      {points.map((p, i) => <text key={'t' + i} x={p.x} y={p.y - 7} fill="var(--text)" fontSize="8" textAnchor="middle" fontFamily="var(--font-mono)">{p.v}</text>)}
      {data.length > 1 && data.map((d, i) => {
        const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * (width - 20) + 10
        return <text key={'d' + i} x={x} y={height - 0} fill="var(--text-muted)" fontSize="7" textAnchor="middle">{d.label}</text>
      })}
    </svg>
  )
}

export default function InventoryTrend() {
  const [items, setItems] = useState([])
  const [records, setRecords] = useState([])
  const [keyword, setKeyword] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const since = format(subDays(new Date(), 60), 'yyyy-MM-dd')
    const [iR, rR] = await Promise.all([
      supabase.from('inventory_master').select('*').eq('enabled', true).order('category').order('name'),
      supabase.from('inventory_records').select('*').gte('time', since).order('time'),
    ])
    setItems(iR.data || [])
    setRecords(rR.data || [])
    setLoading(false)
  }

  function getItemHistory(itemId) {
    const recs = records.filter(r => r.item_id === itemId)
    const byDate = {}
    recs.forEach(r => {
      const d = r.time?.slice(0, 10)
      if (d) byDate[d] = { stock: r.after_stock, label: d.slice(5) }
    })
    return Object.values(byDate).sort((a, b) => a.label.localeCompare(b.label))
  }

  const filtered = keyword
    ? items.filter(i => i.name?.toLowerCase().includes(keyword.toLowerCase()) || i.category?.toLowerCase().includes(keyword.toLowerCase()))
    : items

  const byCat = {}
  filtered.forEach(i => { const c = i.category || '未分類'; if (!byCat[c]) byCat[c] = []; byCat[c].push(i) })

  if (loading) return <div>{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8 }} />)}</div>

  return (
    <div>
      <div className="card" style={{ padding: 12, marginBottom: 12, background: 'var(--gold-glow)', borderColor: 'var(--border-gold)' }}>
        <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>📊 庫存走勢（近60天），點擊品項展開趨勢圖。資料越多圖表越精準</div>
      </div>

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input placeholder="搜尋品項/分類" value={keyword} onChange={e => setKeyword(e.target.value)} style={{ width: '100%', paddingLeft: 30, fontSize: 12, padding: '8px 8px 8px 30px' }} />
      </div>

      {Object.entries(byCat).map(([cat, catItems]) => (
        <div key={cat} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', padding: '8px 0 6px', borderBottom: '1px solid var(--border)' }}>{cat} ({catItems.length})</div>
          {catItems.map(item => {
            const history = getItemHistory(item.id)
            const pct = item.safe_stock > 0 ? Math.min(100, Math.round((item.current_stock || 0) / item.safe_stock * 100)) : 100
            const isSelected = selectedId === item.id
            const barColor = pct === 0 ? 'var(--red)' : pct < 50 ? '#f59e0b' : pct < 100 ? 'var(--gold)' : 'var(--green)'

            return (
              <div key={item.id} className="card" style={{ padding: 10, marginBottom: 4, cursor: 'pointer', borderColor: isSelected ? 'var(--border-gold)' : undefined }} onClick={() => setSelectedId(isSelected ? null : item.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {item.name}
                      {history.length > 0 && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>({history.length}筆)</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.sub_category} · {item.owner}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 60, textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color: pct <= 0 ? 'var(--red)' : 'var(--text)' }}>{item.current_stock ?? 0}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>/{item.safe_stock ?? 0}{item.unit}</div>
                    </div>
                    {isSelected ? <ChevronUp size={14} color="var(--text-dim)" /> : <ChevronDown size={14} color="var(--text-dim)" />}
                  </div>
                </div>

                {/* Stock bar */}
                <div style={{ height: 4, background: 'var(--black)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
                  <div style={{ height: '100%', width: pct + '%', background: barColor, borderRadius: 2, transition: 'width .3s' }} />
                </div>

                {/* Expanded: trend chart */}
                {isSelected && (
                  <div style={{ marginTop: 12, padding: 10, background: 'var(--black)', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <TrendingUp size={12} /> 庫存走勢
                    </div>
                    <MiniChart data={history} safeStock={item.safe_stock} />
                    {history.length === 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 10 }}>
                        尚無盤點紀錄，盤點後會自動產生趨勢圖
                      </div>
                    )}
                    {item.last_update && (
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
                        最後更新: {item.last_update?.slice(0, 16)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {filtered.length === 0 && <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>無符合條件的品項</div>}
    </div>
  )
}
