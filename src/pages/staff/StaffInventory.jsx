import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Package, Send } from 'lucide-react'

const REASON_CODES = [
  { id: 'normal', label: '正常消耗', color: 'var(--green)' },
  { id: 'damage', label: '損耗報廢', color: 'var(--red)' },
  { id: 'restock', label: '進貨入庫', color: 'var(--blue)' },
  { id: 'error', label: '盤點誤差', color: '#f59e0b' },
  { id: 'gift', label: '贈送客戶', color: 'var(--gold)' },
  { id: 'other', label: '其他', color: 'var(--text-muted)' },
]

export default function StaffInventory() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [counts, setCounts] = useState({})
  const [notes, setNotes] = useState({})
  const [reasons, setReasons] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase.from('inventory_master').select('*').eq('enabled', true).order('name')
      if (err) { setError(err.message); setLoading(false); return }
      const myItems = (data || []).filter(i => i.owner === user.employee_id)
      setItems(myItems)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  function getDiff(itemId) {
    const item = items.find(i => i.id === itemId)
    const qty = counts[itemId]
    if (!item || qty === '' || qty == null) return null
    return Number(qty) - (item.current_stock || 0)
  }

  function needsReason(itemId) {
    const d = getDiff(itemId)
    return d !== null && d !== 0
  }

  async function handleSubmit() {
    const filled = Object.entries(counts).filter(([_, v]) => v !== '' && v != null)
    if (!filled.length) return alert('請先至少輸入 1 筆')

    const missingReason = filled.filter(([id]) => needsReason(id) && !reasons[id])
    if (missingReason.length) return alert('有 ' + missingReason.length + ' 筆數量有變動但未選原因碼，請補選')

    if (!confirm('確定上傳 ' + filled.length + ' 筆盤點？')) return
    setSubmitting(true)
    let success = 0
    for (const [itemId, qty] of filled) {
      const item = items.find(i => i.id === itemId)
      if (!item) continue
      const before = item.current_stock || 0, newQty = +qty, safe = item.safe_stock || 0
      const diff = newQty - before
      await supabase.from('inventory_master').update({ current_stock: newQty, is_low: safe > 0 && newQty < safe, last_update: new Date().toISOString() }).eq('id', itemId)
      await supabase.from('inventory_records').insert({
        staff_code: user.employee_id, item_id: itemId, item_name: item.name,
        before_stock: before, after_stock: newQty, diff: diff,
        is_low: safe > 0 && newQty < safe, note: notes[itemId] || '',
        source: '員工盤點', reason_code: diff !== 0 ? (reasons[itemId] || null) : null
      })
      success++
    }
    setSubmitting(false)
    alert('成功上傳 ' + success + ' 筆！')
    setCounts({}); setNotes({}); setReasons({}); load()
  }

  const filtered = items.filter(i => {
    if (filter === 'low' && !i.is_low) return false
    if (filter === 'mon' && i.count_day !== '週一') return false
    if (filter === 'tue' && i.count_day !== '週二') return false
    if (keyword) { const kw = keyword.toLowerCase(); return i.name?.toLowerCase().includes(kw) || i.id?.toLowerCase().includes(kw) }
    return true
  })

  const filledCount = Object.values(counts).filter(v => v !== '' && v != null).length
  const lowCount = items.filter(i => i.is_low).length
  const byCat = {}
  filtered.forEach(i => { const c = i.category || '未分類'; if (!byCat[c]) byCat[c] = []; byCat[c].push(i) })

  if (loading) return <div className="page-container">{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 80, marginBottom: 8 }} />)}</div>

  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Package size={20} color="var(--gold)" />
        <span className="section-title" style={{ marginBottom: 0 }}>庫存盤點</span>
      </div>

      {error && <div className="card" style={{ padding: 14, marginBottom: 12, borderColor: 'rgba(196,77,77,.3)', color: 'var(--red)' }}>錯誤：{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div className="card" style={{ padding: 10, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>我的品項</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)' }}>{items.length}</div></div>
        <div className="card" style={{ padding: 10, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>已填寫</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 600, color: filledCount > 0 ? 'var(--green)' : 'var(--text-muted)' }}>{filledCount}</div></div>
        <div className="card" style={{ padding: 10, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>低庫存</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 600, color: lowCount > 0 ? 'var(--red)' : 'var(--green)' }}>{lowCount}</div></div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto' }}>
        {[['all', '全部'], ['low', '低庫存'], ['mon', '週一'], ['tue', '週二']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: filter === v ? 'var(--gold-glow)' : 'transparent', color: filter === v ? 'var(--gold)' : 'var(--text-dim)', border: filter === v ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{l}</button>
        ))}
      </div>
      <input placeholder="🔍 搜尋品項" value={keyword} onChange={e => setKeyword(e.target.value)} style={{ marginBottom: 14, fontSize: 13, padding: 10 }} />

      {Object.entries(byCat).map(([cat, catItems]) => (
        <div key={cat}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', padding: '10px 0 6px', borderBottom: '1px solid var(--border)' }}>{cat} ({catItems.length})</div>
          {catItems.map(item => {
            const filled = counts[item.id] !== '' && counts[item.id] != null
            const diff = getDiff(item.id)
            const showReason = needsReason(item.id)
            return (
              <div key={item.id} className="card" style={{ padding: 12, marginBottom: 6, borderColor: item.is_low ? 'rgba(196,77,77,.3)' : filled ? 'rgba(77,168,108,.3)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {item.sub_category} · {item.unit} · {item.count_day}
                      {item.is_low && <span style={{ color: 'var(--red)', marginLeft: 6, fontWeight: 700 }}>⚠低庫存</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: item.is_low ? 'var(--red)' : 'var(--text)' }}>{item.current_stock}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>安全:{item.safe_stock}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="tel" inputMode="numeric" pattern="[0-9]*" min="0" placeholder="盤點數量"
                    value={counts[item.id] ?? ''} onChange={e => setCounts(p => ({ ...p, [item.id]: e.target.value }))}
                    style={{ flex: 1, fontSize: 16, padding: '8px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                    onKeyDown={e => { if (e.key === 'Enter') { const inputs = [...document.querySelectorAll('input[type=number]')]; const idx = inputs.indexOf(e.target); if (idx < inputs.length - 1) inputs[idx + 1].focus() } }}
                  />
                  <input placeholder="備註" value={notes[item.id] || ''} onChange={e => setNotes(p => ({ ...p, [item.id]: e.target.value }))} style={{ flex: 1, fontSize: 12, padding: '8px 10px' }} />
                </div>

                {/* Diff display + reason code */}
                {diff !== null && diff !== 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: diff > 0 ? 'var(--green)' : 'var(--red)', marginBottom: 6 }}>
                      差異: {diff > 0 ? '+' : ''}{diff} {item.unit}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>請選擇原因：</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {REASON_CODES.map(r => (
                        <button key={r.id} onClick={() => setReasons(p => ({ ...p, [item.id]: r.id }))}
                          style={{
                            padding: '5px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                            background: reasons[item.id] === r.id ? r.color + '20' : 'transparent',
                            color: reasons[item.id] === r.id ? r.color : 'var(--text-dim)',
                            border: reasons[item.id] === r.id ? '1px solid ' + r.color : '1px solid var(--border)',
                          }}>{r.label}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}

      <button className="btn-gold" style={{ width: '100%', fontSize: 18, marginTop: 16, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting || !filledCount ? .5 : 1 }}
        onClick={handleSubmit} disabled={submitting || !filledCount}>
        <Send size={18} /> {submitting ? '上傳中...' : '批次上傳 ' + filledCount + ' 筆'}
      </button>

      {items.length === 0 && !error && <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)', marginTop: 12 }}>你沒有負責的盤點品項</div>}
      {filtered.length === 0 && items.length > 0 && <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)', marginTop: 12 }}>沒有符合條件的品項</div>}
    </div>
  )
}
