import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Search, ShoppingCart, X, Plus, Minus, Trash2, CreditCard, DollarSign, ChevronDown, AlertTriangle, CheckCircle2, LogIn, LogOut as LogOutIcon, Clock, Receipt } from 'lucide-react'

const PAY_METHODS = [
  { key: 'cash', label: '現金', icon: '💵', color: '#4da86c' },
  { key: 'card_acpay', label: 'ACPAY刷卡', icon: '💳', color: '#4d8ac4' },
  { key: 'card_teb', label: '臺企銀刷卡', icon: '🏦', color: '#8b6cc4' },
  { key: 'transfer', label: '銀行轉帳', icon: '🔄', color: '#c4a84d' },
  { key: 'wechat', label: '微信支付', icon: '💚', color: '#07c160' },
  { key: 'alipay', label: '支付寶', icon: '🔵', color: '#1677ff' },
]

const TABLES = ['1F四人位','1F六人位','B1包廂四人','B1大圓桌','B1沙發區','戶外區','外帶']
const QUICK_CASH = [100, 500, 1000, 2000, 3000, 5000]

export default function StaffPOS() {
  const { user } = useAuth()
  const [products, setProducts] = useState([])
  const [brands, setBrands] = useState([])
  const [brand, setBrand] = useState('全部')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [showCart, setShowCart] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [showShift, setShowShift] = useState(false)
  const [payMethod, setPayMethod] = useState('cash')
  const [payAmount, setPayAmount] = useState('')
  const [discount, setDiscount] = useState('')
  const [tableNo, setTableNo] = useState('')
  const [vipName, setVipName] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [shift, setShift] = useState(null)
  const [shiftCash, setShiftCash] = useState('10000')
  const [closingCash, setClosingCash] = useState('')
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [lastOrder, setLastOrder] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const searchRef = useRef(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [prodR, sumR, shiftR, ordR] = await Promise.all([
      supabase.rpc('pos_get_products'),
      supabase.rpc('pos_today_summary'),
      supabase.from('pos_shifts').select('*').eq('work_date', new Date().toISOString().slice(0,10)).eq('status','open').order('opened_at',{ascending:false}).limit(1),
      supabase.from('unified_orders').select('*').eq('channel','store').gte('created_at', new Date().toISOString().slice(0,10)).order('created_at',{ascending:false}).limit(20),
    ])
    if (prodR.data?.products) { setProducts(prodR.data.products); setBrands(['全部', ...(prodR.data.brands || [])]) }
    if (sumR.data) setSummary(sumR.data)
    if (shiftR.data?.[0]) setShift(shiftR.data[0])
    setRecentOrders(ordR.data || [])
    setLoading(false)
  }

  const filtered = products.filter(p => {
    if (brand !== '全部' && p.brand !== brand) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.brand.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function addToCart(product) {
    setCart(prev => {
      const idx = prev.findIndex(c => c.id === product.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { ...next[idx], qty: next[idx].qty + 1 }; return next
      }
      return [...prev, { id: product.id, name: product.name, brand: product.brand, price: product.suggest_price || product.price_a || 0, qty: 1, stock: product.current_stock }]
    })
  }

  function updateQty(id, delta) {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c))
  }

  function removeItem(id) { setCart(prev => prev.filter(c => c.id !== id)) }

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const discountAmt = +discount || 0
  const total = Math.max(0, subtotal - discountAmt)
  const change = payMethod === 'cash' ? Math.max(0, (+payAmount || 0) - total) : 0
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)

  async function doCheckout() {
    if (cart.length === 0) return alert('購物車是空的')
    if (payMethod === 'cash' && (+payAmount || 0) < total) return alert('現金不足')
    setSubmitting(true)
    const items = cart.map(c => ({ product_id: c.id, product_name: c.brand + ' ' + c.name, qty: c.qty, unit_price: c.price }))
    const { data, error } = await supabase.rpc('pos_checkout', {
      p_employee_id: user.employee_id || user.id,
      p_employee_name: user.name,
      p_items: items,
      p_payment_method: payMethod,
      p_payment_amount: payMethod === 'cash' ? +payAmount : total,
      p_discount: discountAmt,
      p_table_no: tableNo || null,
      p_vip_id: vipName || null,
      p_notes: orderNote || null,
    })
    setSubmitting(false)
    if (error || !data?.success) { alert('結帳失敗: ' + (error?.message || data?.error || '未知錯誤')); return }
    setLastOrder({ ...data, items: cart, payMethod, total, change: data.change })
    setCart([]); setDiscount(''); setPayAmount(''); setTableNo(''); setVipName(''); setOrderNote('')
    setShowCheckout(false)
    loadAll()
  }

  async function openShift() {
    const { data } = await supabase.rpc('pos_open_shift', { p_employee_id: user.employee_id || user.id, p_employee_name: user.name, p_opening_cash: +(shiftCash || 0) })
    if (data?.success) { alert('開班成功！'); setShowShift(false); loadAll() }
    else alert('開班失敗: ' + (data?.error || ''))
  }

  async function closeShift() {
    if (!shift) return
    const { data } = await supabase.rpc('pos_close_shift', { p_shift_id: shift.id, p_closing_cash: +(closingCash || 0) })
    if (data?.success) { alert('關班完成！差額: $' + (data.variance ?? 0)); setShowShift(false); setClosingCash(''); loadAll() }
    else alert('關班失敗: ' + (data?.error || ''))
  }

  if (loading) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading-shimmer" style={{ width: 80, height: 80, borderRadius: '50%' }} /></div>

  // ─── RENDER ───
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── TOP BAR ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--black-card)' }}>
        <DollarSign size={18} color="var(--gold)" />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--gold)' }}>POS 收銀</span>
        {shift && <span style={{ fontSize: 10, background: 'rgba(77,168,108,.15)', color: 'var(--green)', padding: '2px 8px', borderRadius: 10 }}>營業中 · {shift.employee_name}</span>}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-dim)' }}>
          <span>今日 <b style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>${(summary?.revenue?.total || 0).toLocaleString()}</b></span>
          <span>單數 <b style={{ color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{summary?.orders || 0}</b></span>
        </div>
        <button onClick={() => setShowShift(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={12} /> {shift ? '關班' : '開班'}
        </button>
        <button className="pos-cart-fab" onClick={() => setShowCart(true)} style={{ display: 'none', position: 'relative', background: 'var(--gold)', border: 'none', borderRadius: 10, padding: '6px 12px', cursor: 'pointer', color: '#000', fontWeight: 700, fontSize: 13 }}>
          <ShoppingCart size={16} />
          {cartCount > 0 && <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cartCount}</span>}
        </button>
      </div>

      {/* ── MAIN SPLIT ── */}
      <div className="pos-main" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── LEFT: Products ── */}
        <div className="pos-products" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--border)' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input ref={searchRef} placeholder="搜尋雪茄 / 品牌..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 30, fontSize: 13, padding: '8px 8px 8px 32px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, padding: '6px 12px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
            {brands.map(b => (
              <button key={b} onClick={() => setBrand(b)} style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: brand === b ? 'var(--gold-glow)' : 'transparent', color: brand === b ? 'var(--gold)' : 'var(--text-dim)', border: brand === b ? '1px solid var(--border-gold)' : '1px solid transparent' }}>
                {b === '全部' ? `全部(${products.length})` : b}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            <div className="pos-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
              {filtered.map(p => {
                const inCart = cart.find(c => c.id === p.id)
                const isLow = p.is_low || p.stock_status === '少量'
                const isOut = p.current_stock <= 0 && p.stock_status === '無庫存'
                return (
                  <button key={p.id} onClick={() => !isOut && addToCart(p)} disabled={isOut}
                    style={{ background: inCart ? 'rgba(201,168,76,.08)' : 'var(--black-card)', border: inCart ? '1.5px solid var(--border-gold)' : '1px solid var(--border)', borderRadius: 10, padding: 10, cursor: isOut ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: isOut ? .4 : 1, position: 'relative', transition: 'all .15s' }}>
                    {inCart && <span style={{ position: 'absolute', top: 4, right: 4, background: 'var(--gold)', color: '#000', borderRadius: '50%', width: 20, height: 20, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inCart.qty}</span>}
                    <div style={{ fontSize: 10, color: isLow ? '#f59e0b' : 'var(--text-muted)', marginBottom: 2 }}>{p.brand}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name.replace(p.brand, '').replace(/^s+/, '')}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <span style={{ fontSize: 15, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>${(p.suggest_price || p.price_a || 0).toLocaleString()}</span>
                      {isLow && <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>庫存少</span>}
                    </div>
                    {p.spec && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{p.spec}</div>}
                  </button>
                )
              })}
            </div>
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>無符合商品</div>}
          </div>
        </div>

        {/* ── RIGHT: Cart Panel ── */}
        <div className="pos-cart-panel" style={{ width: 340, display: 'flex', flexDirection: 'column', background: 'var(--black-card)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}><ShoppingCart size={16} /> 購物車 ({cartCount})</span>
            {cart.length > 0 && <button onClick={() => setCart([])} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 11, cursor: 'pointer' }}>清空</button>}
          </div>
          <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
            <select value={tableNo} onChange={e => setTableNo(e.target.value)} style={{ flex: 1, fontSize: 11, padding: '5px 6px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}>
              <option value="">桌位</option>
              {TABLES.map(t => <option key={t}>{t}</option>)}
            </select>
            <input placeholder="VIP姓名" value={vipName} onChange={e => setVipName(e.target.value)} style={{ flex: 1, fontSize: 11, padding: '5px 6px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '6px 14px' }}>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>點選左側商品加入購物車</div>
            ) : cart.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.brand} {c.name.replace(c.brand, '').trim()}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>${c.price.toLocaleString()} × {c.qty}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button onClick={() => updateQty(c.id, -1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--black)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={12} /></button>
                  <span style={{ width: 24, textAlign: 'center', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{c.qty}</span>
                  <button onClick={() => updateQty(c.id, 1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border-gold)', background: 'var(--gold-glow)', color: 'var(--gold)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>
                </div>
                <span style={{ width: 60, textAlign: 'right', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>${(c.price * c.qty).toLocaleString()}</span>
                <button onClick={() => removeItem(c.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 2 }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-gold)', background: 'rgba(201,168,76,.04)' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input type="number" inputMode="numeric" placeholder="折扣" value={discount} onChange={e => setDiscount(e.target.value)} style={{ flex: 1, fontSize: 13, padding: '6px 8px', fontFamily: 'var(--font-mono)', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
              <input placeholder="備註" value={orderNote} onChange={e => setOrderNote(e.target.value)} style={{ flex: 1, fontSize: 11, padding: '6px 8px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)', marginBottom: 2 }}>
              <span>小計 ({cartCount} 件)</span><span style={{ fontFamily: 'var(--font-mono)' }}>${subtotal.toLocaleString()}</span>
            </div>
            {discountAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#f59e0b', marginBottom: 2 }}>
              <span>折扣</span><span style={{ fontFamily: 'var(--font-mono)' }}>-${discountAmt.toLocaleString()}</span>
            </div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, color: 'var(--gold)', marginBottom: 8 }}>
              <span>合計</span><span style={{ fontFamily: 'var(--font-mono)' }}>${total.toLocaleString()}</span>
            </div>
            <button onClick={() => cart.length > 0 && setShowCheckout(true)} disabled={cart.length === 0}
              style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: cart.length > 0 ? 'pointer' : 'not-allowed', background: cart.length > 0 ? 'linear-gradient(135deg, #c9a84c, #b8943f)' : 'var(--border)', border: 'none', borderRadius: 12, color: cart.length > 0 ? '#000' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <CreditCard size={18} /> 結帳 ${total.toLocaleString()}
            </button>
          </div>
        </div>
      </div>

      {/* ── CHECKOUT MODAL ── */}
      {showCheckout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowCheckout(false)}>
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--border-gold)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>💰 結帳</span>
              <button onClick={() => setShowCheckout(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ background: 'var(--black)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
              {cart.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--text)' }}>
                  <span>{c.brand} {c.name.replace(c.brand,'').trim()} ×{c.qty}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${(c.price * c.qty).toLocaleString()}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: 'var(--gold)', borderTop: '1px solid var(--border-gold)', marginTop: 6, paddingTop: 8 }}>
                <span>應收</span><span style={{ fontFamily: 'var(--font-mono)' }}>${total.toLocaleString()}</span>
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>支付方式</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
              {PAY_METHODS.map(m => (
                <button key={m.key} onClick={() => { setPayMethod(m.key); if (m.key !== 'cash') setPayAmount('') }}
                  style={{ padding: '10px 6px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center', background: payMethod === m.key ? m.color + '18' : 'var(--black)', color: payMethod === m.key ? m.color : 'var(--text-dim)', border: payMethod === m.key ? '2px solid ' + m.color : '1px solid var(--border)' }}>
                  <div style={{ fontSize: 20 }}>{m.icon}</div>{m.label}
                </button>
              ))}
            </div>
            {payMethod === 'cash' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>收取金額</div>
                <input type="number" inputMode="numeric" placeholder="輸入收取金額" value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus
                  style={{ width: '100%', fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: 'var(--black)', border: '2px solid var(--border-gold)', borderRadius: 12, color: 'var(--gold)', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {QUICK_CASH.map(v => (
                    <button key={v} onClick={() => setPayAmount(String(v))}
                      style={{ flex: 1, minWidth: 50, padding: '8px 4px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: +payAmount === v ? 'var(--gold-glow)' : 'var(--black)', color: +payAmount === v ? 'var(--gold)' : 'var(--text-dim)', border: +payAmount === v ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>
                      ${v.toLocaleString()}
                    </button>
                  ))}
                  <button onClick={() => setPayAmount(String(total))}
                    style={{ flex: 1, minWidth: 50, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(77,168,108,.1)', color: 'var(--green)', border: '1px solid rgba(77,168,108,.3)' }}>剛好</button>
                </div>
                {+payAmount >= total && (
                  <div style={{ marginTop: 10, textAlign: 'center', padding: 12, background: 'rgba(77,168,108,.08)', borderRadius: 12, border: '1px solid rgba(77,168,108,.3)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>找零</div>
                    <div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--green)' }}>${change.toLocaleString()}</div>
                  </div>
                )}
              </div>
            )}
            <button onClick={doCheckout} disabled={submitting || (payMethod === 'cash' && (+payAmount || 0) < total)}
              style={{ width: '100%', padding: 16, fontSize: 18, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #4da86c, #2d8a4e)', border: 'none', borderRadius: 14, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? .5 : 1 }}>
              <CheckCircle2 size={20} /> {submitting ? '處理中...' : '確認結帳'}
            </button>
          </div>
        </div>
      )}

      {/* ── LAST ORDER SUCCESS ── */}
      {lastOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setLastOrder(null)}>
          <div style={{ background: 'var(--black-card)', border: '2px solid rgba(77,168,108,.5)', borderRadius: 20, padding: 30, width: '100%', maxWidth: 380, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <CheckCircle2 size={48} color="var(--green)" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', marginBottom: 4 }}>結帳成功！</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>{lastOrder.order_no}</div>
            <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 20 }}>
              <div><div style={{ fontSize: 11, color: 'var(--text-dim)' }}>合計</div><div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>${lastOrder.total?.toLocaleString()}</div></div>
              {lastOrder.change > 0 && <div><div style={{ fontSize: 11, color: 'var(--text-dim)' }}>找零</div><div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>${lastOrder.change?.toLocaleString()}</div></div>}
            </div>
            <button onClick={() => setLastOrder(null)} style={{ padding: '12px 40px', fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'var(--gold)', border: 'none', borderRadius: 12, color: '#000' }}>繼續收銀</button>
          </div>
        </div>
      )}

      {/* ── SHIFT MODAL ── */}
      {showShift && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowShift(false)}>
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--border-gold)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            {!shift ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><LogIn size={20} /> 開班</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 6 }}>備用金金額</div>
                <input type="number" inputMode="numeric" value={shiftCash} onChange={e => setShiftCash(e.target.value)}
                  style={{ width: '100%', fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: 'var(--black)', border: '2px solid var(--border-gold)', borderRadius: 12, color: 'var(--gold)', marginBottom: 16 }} />
                <button onClick={openShift} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #4da86c, #2d8a4e)', border: 'none', borderRadius: 12, color: '#fff' }}>確認開班</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><LogOutIcon size={20} /> 關班</div>
                <div style={{ background: 'var(--black)', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13, lineHeight: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-dim)' }}>開班人員</span><span>{shift.employee_name}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-dim)' }}>備用金</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>${(shift.opening_cash||0).toLocaleString()}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-dim)' }}>今日營收</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>${(summary?.revenue?.total||0).toLocaleString()}</span></div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 6 }}>現金盤點金額</div>
                <input type="number" inputMode="numeric" placeholder="盤點現金" value={closingCash} onChange={e => setClosingCash(e.target.value)}
                  style={{ width: '100%', fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: 'var(--black)', border: '2px solid rgba(245,158,11,.4)', borderRadius: 12, color: '#f59e0b', marginBottom: 16 }} />
                <button onClick={closeShift} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: 12, color: '#000' }}>確認關班</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── RESPONSIVE CSS ── */}
      <style>{`
        @media (max-width: 768px) {
          .pos-cart-panel { display: none !important; }
          .pos-cart-fab { display: flex !important; }
          .pos-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)) !important; }
        }
        @media (min-width: 1024px) {
          .pos-cart-panel { width: 380px !important; }
          .pos-grid { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)) !important; }
        }
      `}</style>
    </div>
  )
}
