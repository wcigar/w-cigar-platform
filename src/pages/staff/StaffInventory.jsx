import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Package, Search, Send, AlertTriangle, ChevronDown, ChevronUp, Filter } from 'lucide-react'

export default function StaffInventory() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [counts, setCounts] = useState({})
  const [notes, setNotes] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('inventory_master').select('*')
      .eq('enabled', true)
      .or(`owner.eq.${user.employee_id},owner.eq.ALL`)
      .order('is_low', { ascending: false })
      .order('name')
    setItems(data || [])
    setLoading(false)
  }

  async function handleSubmit() {
    const filled = Object.entries(counts).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
    if (!filled.length) return alert('請先至少輸入 1 筆盤點數量')
    if (filled.some(([_, v]) => +v < 0)) return alert('數量不能為負數')
    if (!confirm(`確定上傳 ${filled.length} 筆盤點？`)) return

    setSubmitting(true)
    let success = 0

    for (const [itemId, qty] of filled) {
      const item = items.find(i => i.id === itemId)
      if (!item) continue
      const beforeStock = item.current_stock || 0
      const newQty = +qty
      const safeStock = item.safe_stock || 0

      // Update master
      await supabase.from('inventory_master').update({
        current_stock: newQty,
        is_low: safeStock > 0 && newQty < safeStock,
        last_count_date: new Date().toISOString(),
        last_update: new Date().toISOString()
      }).eq('id', itemId)

      // Insert record
      await supabase.from('inventory_records').insert({
        staff_code: user.employee_id,
        item_id: itemId,
        item_name: item.name,
        before_stock: beforeStock,
        after_stock: newQty,
        diff: newQty - beforeStock,
        is_low: safeStock > 0 && newQty < safeStock,
        note: notes[itemId] || '',
        source: '員工盤點'
      })

      success++
    }

    setSubmitting(false)
    alert(`成功上傳 ${success} 筆盤點！`)
    setCounts({}); setNotes({})
    load()
  }

  const filtered = items.filter(i => {
    if (filter === 'low' && !i.is_low) return false
    if (filter === 'mon' && i.count_day !== '週一') return false
    if (filter === 'tue' && i.count_day !== '週二') return false
    if (keyword) {
      const kw = keyword.toLowerCase()
      if (!i.name?.toLowerCase().includes(kw) && !i.id?.toLowerCase().includes(kw) && !i.category?.toLowerCase().includes(kw)) return false
    }
    return true
  })

  const filledCount = Object.values(counts).filter(v => v !== '' && v != null).length
  const lowCount = items.filter(i => i.is_low).length

  // Group by category
  const byCat = {}
  filtered.forEach(i => { const c = i.category || '未分類'; if (!byCat[c]) byCat[c] = []; byCat[c].push(i) })

  if (loading) return <div className="page-container">{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 80, marginBottom: 8 }} />)}</div>

  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Package size={20} color="var(--gold)" />
        <span className="section-title" style={{ marginBottom: 0 }}>庫存盤點</span>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div className="card" style={{ padding: 10, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>我的品項</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)' }}>{items.length}</div></div>
        <div className="card" style={{ padding: 10, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>已填寫</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 600, color: filledCount > 0 ? 'var(--green)' : 'var(--text-muted)' }}>{filledCount}</div></div>
        <div className="card" style={{ padding: 10, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>低庫存</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 600, color: lowCount > 0 ? 'var(--red)' : 'var(--green)' }}>{lowCount}</div></div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto' }}>
        {[['all', '全部'], ['low', '低庫存'], ['mon', '週一'], ['tue', '週二']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: filter === v ? 'var(--gold-glow)' : 'transparent', color: filter === v ? 'var(--gold)' : 'var(--text-dim)', border: filter === v ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{l}</button>
        ))}
      </div>
      <input placeholder="🔍 搜尋品項名稱" value={keyword} onChange={e => setKeyword(e.target.value)} style={{ marginBottom: 14, fontSize: 13, padding: 10 }} />

      {/* Items by category */}
      {Object.entries(byCat).map(([cat, catItems]) => (
        <div key={cat}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', padding: '10px 0 6px', borderBottom: '1px solid var(--border)', letterSpacing: 1 }}>{cat} ({catItems.length})</div>
          {catItems.map(item => {
            const filled = counts[item.id] !== '' && counts[item.id] != null
            return (
              <div key={item.id} className="card" style={{ padding: 12, marginBottom: 6, borderColor: item.is_low ? 'rgba(196,77,77,.3)' : filled ? 'rgba(77,168,108,.3)' : undefined, background: item.is_low ? 'rgba(196,77,77,.03)' : filled ? 'rgba(77,168,108,.03)' : undefined }}>
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
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="number" inputMode="numeric" min="0" placeholder="盤點數量"
                    value={counts[item.id] ?? ''} onChange={e => setCounts(p => ({ ...p, [item.id]: e.target.value }))}
                    style={{ flex: 1, fontSize: 16, padding: '8px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600, background: filled ? 'rgba(77,168,108,.08)' : undefined, borderColor: filled ? 'rgba(77,168,108,.3)' : undefined }}
                    onKeyDown={e => { if (e.key === 'Enter') { const inputs = [...document.querySelectorAll('input[type=number]')]; const idx = inputs.indexOf(e.target); if (idx < inputs.length - 1) inputs[idx + 1].focus() } }}
                  />
                  <input placeholder="備註" value={notes[item.id] || ''} onChange={e => setNotes(p => ({ ...p, [item.id]: e.target.value }))} style={{ flex: 1, fontSize: 12, padding: '8px 10px' }} />
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* Submit */}
      <button className="btn-gold" style={{ width: '100%', fontSize: 18, marginTop: 16, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting || !filledCount ? .5 : 1 }}
        onClick={handleSubmit} disabled={submitting || !filledCount}>
        <Send size={18} /> {submitting ? '上傳中...' : `批次上傳 ${filledCount} 筆盤點`}
      </button>

      {filtered.length === 0 && <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)', marginTop: 12 }}>沒有符合條件的品項</div>}
    </div>
  )
}
