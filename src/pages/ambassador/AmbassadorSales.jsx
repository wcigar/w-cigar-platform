import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { BarChart3, Plus, Minus, Send, CheckCircle2 } from 'lucide-react'

export default function AmbassadorSales({ user }) {
  const [venues, setVenues] = useState([])
  const [selectedVenue, setSelectedVenue] = useState(null)
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [homeRes, prodRes] = await Promise.all([
      supabase.rpc('ambassador_get_home', { p_ambassador_id: user.id }),
      supabase.from('products').select('id, brand, name, spec, price_a, is_active').eq('is_active', true).order('brand').order('name')
    ])
    if (homeRes.data?.venues) {
      setVenues(homeRes.data.venues)
      if (homeRes.data.venues.length === 1) setSelectedVenue(homeRes.data.venues[0])
    }
    if (prodRes.data) setProducts(prodRes.data)
    setLoading(false)
  }

  function updateQty(productId, delta) {
    setCart(prev => {
      const cur = prev[productId] || 0
      const next = Math.max(0, cur + delta)
      if (next === 0) { const { [productId]: _, ...rest } = prev; return rest }
      return { ...prev, [productId]: next }
    })
  }

  async function handleSubmit() {
    if (!selectedVenue) { setMsg('請選擇駐點'); return }
    const items = Object.entries(cart).map(([product_id, qty]) => ({ product_id, qty }))
    if (items.length === 0) { setMsg('請至少選擇一項商品'); return }
    setSubmitting(true)
    setMsg('')
    const { data, error } = await supabase.rpc('ambassador_submit_sales', {
      p_ambassador_id: user.id,
      p_venue_id: selectedVenue.id,
      p_sale_date: saleDate,
      p_items: items
    })
    setSubmitting(false)
    if (error) { setMsg('提交失敗: ' + error.message); return }
    if (data?.success === false) { setMsg(data.error || '提交失敗'); return }
    setMsg('銷量提交成功！')
    setCart({})
  }

  const totalQty = Object.values(cart).reduce((s, q) => s + q, 0)
  const totalAmount = Object.entries(cart).reduce((s, [id, qty]) => {
    const p = products.find(p => p.id === id)
    return s + (p?.price_a || 0) * qty
  }, 0)

  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    return (p.name || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q)
  })

  const grouped = filtered.reduce((acc, p) => {
    const brand = p.brand || '其他'
    if (!acc[brand]) acc[brand] = []
    acc[brand].push(p)
    return acc
  }, {})

  const cardStyle = { background: '#1a1714', border: '1px solid #2a2520', borderRadius: 10, padding: 14, marginBottom: 10 }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8278' }}>載入中...</div>

  return (
    <div style={{ padding: 20, color: '#e8dcc8', maxWidth: 500, margin: '0 auto', paddingBottom: totalQty > 0 ? 140 : 20 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#c9a84c', marginTop: 0, marginBottom: 16 }}>每日銷量</h2>

      {/* 日期 + 駐點 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)}
          style={{ flex: 1, padding: '10px 12px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', fontSize: 14 }} />
        {venues.length > 1 && (
          <select value={selectedVenue?.id || ''} onChange={e => setSelectedVenue(venues.find(v => v.id === e.target.value))}
            style={{ flex: 1, padding: '10px 12px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', fontSize: 14 }}>
            <option value="">選擇駐點</option>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
      </div>

      {selectedVenue && venues.length <= 1 && (
        <div style={{ fontSize: 12, color: '#8a8278', marginBottom: 12 }}>駐點: {selectedVenue.name}</div>
      )}

      {/* 搜尋 */}
      <input placeholder="搜尋品牌 / 商品..." value={search} onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '10px 12px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13,
          background: msg.includes('成功') ? '#4caf5022' : '#e74c3c22',
          color: msg.includes('成功') ? '#4caf50' : '#e74c3c',
          border: '1px solid ' + (msg.includes('成功') ? '#4caf5044' : '#e74c3c44') }}>
          {msg.includes('成功') && <CheckCircle2 size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />}{msg}
        </div>
      )}

      {/* 商品列表 */}
      {Object.entries(grouped).map(([brand, items]) => (
        <div key={brand}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8a8278', padding: '10px 0 6px', borderBottom: '1px solid #2a2520', marginTop: 8 }}>
            {brand} ({items.length})
          </div>
          {items.map(p => {
            const qty = cart[p.id] || 0
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1a1714', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#e8dcc8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#5a554e' }}>{p.spec || ''} · ${(p.price_a || 0).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {qty > 0 && (
                    <button onClick={() => updateQty(p.id, -1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #2a2520', background: '#0a0a0a', color: '#e74c3c', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                      <Minus size={14} />
                    </button>
                  )}
                  {qty > 0 && <span style={{ width: 24, textAlign: 'center', fontSize: 15, fontWeight: 700, color: '#c9a84c' }}>{qty}</span>}
                  <button onClick={() => updateQty(p.id, 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #2a2520', background: qty > 0 ? '#c9a84c22' : '#0a0a0a', color: '#4caf50', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* 底部提交欄 */}
      {totalQty > 0 && (
        <div style={{ position: 'fixed', bottom: 60, left: 0, right: 0, padding: '12px 20px', background: 'rgba(17,17,17,.98)', borderTop: '1px solid #2a2520', zIndex: 20 }}>
          <div style={{ maxWidth: 500, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: '#8a8278' }}>共 {totalQty} 支</span>
              <span style={{ color: '#c9a84c', fontWeight: 700 }}>${totalAmount.toLocaleString()}</span>
            </div>
            <button onClick={handleSubmit} disabled={submitting}
              style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: '#c9a84c', color: '#0a0a0a', fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Send size={18} /> {submitting ? '提交中...' : '提交銷量'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
