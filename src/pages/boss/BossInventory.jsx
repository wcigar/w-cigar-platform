import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Package, Search, AlertTriangle, X } from 'lucide-react'

export default function BossInventory() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [adjQty, setAdjQty] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [adjType, setAdjType] = useState('in')
  const [saving, setSaving] = useState(false)

  const lowCount = items.filter(i => Number(i.current_stock) < Number(i.safe_stock)).length
  useEffect(() => { loadInventory() }, [])

  async function loadInventory() {
    setLoading(true)
    const { data } = await supabase.from('inventory_master').select('*').eq('enabled', true).order('category').order('name')
    if (data) setItems(data)
    setLoading(false)
  }

  async function handleAdjust() {
    if (!selected || !adjQty || !adjReason.trim()) return
    setSaving(true)
    const qty = parseInt(adjQty)
    const delta = adjType === 'in' ? qty : -qty
    const newStock = Math.max(0, Number(selected.current_stock) + delta)
    const { error: txErr } = await supabase.from('stock_transactions').insert({
      inv_master_id: selected.id, product_id: selected.product_id || selected.id,
      channel: 'boss_adjust', direction: adjType === 'in' ? 'in' : 'out',
      quantity: qty, unit: selected.unit || '', notes: adjReason.trim(),
      handled_by: 'ADMIN', created_at: new Date().toISOString()
    })
    if (!txErr) {
      await supabase.from('inventory_master').update({
        current_stock: newStock, is_low: newStock < Number(selected.safe_stock),
        last_update: new Date().toISOString()
      }).eq('id', selected.id)
    }
    setSaving(false); setSelected(null); setAdjQty(''); setAdjReason(''); loadInventory()
  }

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    return (i.name || '').toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q)
  })
  const grouped = filtered.reduce((acc, item) => {
    const cat = item.category || '其他'
    if (!acc[cat]) acc[cat] = []; acc[cat].push(item); return acc
  }, {})

  const s = {
    page: { padding: 20, color: '#e8dcc8', maxWidth: 900, margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
    title: { fontSize: 22, fontWeight: 700, color: '#c9a84c', display: 'flex', alignItems: 'center', gap: 10 },
    badge: { background: '#e74c3c', color: '#fff', borderRadius: 12, padding: '2px 8px', fontSize: 12, fontWeight: 600 },
    searchBox: { display: 'flex', alignItems: 'center', gap: 8, background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, padding: '8px 12px', marginBottom: 16 },
    input: { background: 'transparent', border: 'none', color: '#e8dcc8', outline: 'none', flex: 1, fontSize: 14 },
    catHeader: { fontSize: 14, fontWeight: 600, color: '#8a8278', padding: '12px 0 6px', borderBottom: '1px solid #2a2520', marginTop: 16 },
    row: { display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1a1714', gap: 10 },
    btn: { padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: '#c9a84c', color: '#0a0a0a' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    modal: { background: '#1a1714', border: '1px solid #2a2520', borderRadius: 12, padding: 24, width: 360, maxWidth: '90vw' },
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}><Package size={22} /> 庫存管理{lowCount > 0 && <span style={s.badge}>{lowCount} 低庫存</span>}</div>
        <div style={{ fontSize: 12, color: '#8a8278' }}>共 {items.length} 項商品</div>
      </div>
      <div style={s.searchBox}>
        <Search size={16} color="#8a8278" />
        <input style={s.input} placeholder="搜尋商品名稱/分類..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#8a8278' }}>載入中...</div> : (
        Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat}>
            <div style={s.catHeader}>{cat} ({catItems.length})</div>
            {catItems.map(item => {
              const stock = Number(item.current_stock), safe = Number(item.safe_stock), isLow = stock < safe
              return (
                <div key={item.id} style={{ ...s.row, background: isLow ? 'rgba(231,76,60,.06)' : 'transparent' }}>
                  <div style={{ flex: 1, fontSize: 14 }}>{item.name}</div>
                  <div style={{ width: 60, textAlign: 'center', fontWeight: 700, fontSize: 15, color: isLow ? '#e74c3c' : '#c9a84c' }}>{stock}</div>
                  <div style={{ width: 30, fontSize: 12, color: '#8a8278' }}>{item.unit}</div>
                  {isLow ? <div style={{ color: '#e74c3c', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, width: 70 }}><AlertTriangle size={12} /> 低庫存</div>
                    : <div style={{ color: '#4caf50', fontSize: 11, width: 70, textAlign: 'center' }}>正常</div>}
                  <button style={s.btn} onClick={() => { setSelected(item); setAdjType('in'); setAdjQty(''); setAdjReason('') }}>調整</button>
                </div>)
            })}
          </div>))
      )}
      {selected && (
        <div style={s.overlay} onClick={() => setSelected(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: '#c9a84c', margin: 0, fontSize: 18 }}>調整庫存</h3>
              <X size={20} style={{ cursor: 'pointer', color: '#8a8278' }} onClick={() => setSelected(null)} />
            </div>
            <div style={{ marginBottom: 8, color: '#e8dcc8', fontWeight: 600 }}>{selected.name}</div>
            <div style={{ marginBottom: 12, color: '#8a8278', fontSize: 13 }}>
              目前: <span style={{ color: '#c9a84c', fontWeight: 700 }}>{Number(selected.current_stock)} {selected.unit}</span>
              {' / '}安全: <span style={{ fontWeight: 600 }}>{Number(selected.safe_stock)} {selected.unit}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => setAdjType('in')} style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid #2a2520', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: adjType === 'in' ? '#4caf50' : '#1a1714', color: adjType === 'in' ? '#fff' : '#8a8278' }}>+ 進貨</button>
              <button onClick={() => setAdjType('out')} style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid #2a2520', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: adjType === 'out' ? '#e74c3c' : '#1a1714', color: adjType === 'out' ? '#fff' : '#8a8278' }}>- 盤損</button>
            </div>
            <input type="number" min="1" placeholder="數量" value={adjQty} onChange={e => setAdjQty(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: '#0a0a0a', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', marginBottom: 10, fontSize: 14, boxSizing: 'border-box' }} />
            <input placeholder="原因（如：進貨補充 / 盤點短缺）" value={adjReason} onChange={e => setAdjReason(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: '#0a0a0a', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', marginBottom: 16, fontSize: 14, boxSizing: 'border-box' }} />
            <button disabled={saving || !adjQty || !adjReason.trim()} onClick={handleAdjust} style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, background: (!adjQty || !adjReason.trim()) ? '#333' : '#c9a84c', color: (!adjQty || !adjReason.trim()) ? '#666' : '#0a0a0a' }}>{saving ? '儲存中...' : '確認調整'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
