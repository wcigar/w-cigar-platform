import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Search, ShoppingCart, X, Plus, Minus, Trash2, CreditCard, DollarSign, ChevronDown, CheckCircle2, LogIn, LogOut as LogOutIcon, Clock, Receipt, LayoutGrid, List, Filter } from 'lucide-react'

// ── Constants ───────────────────────────────────────────────────────────────
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
const QTY_PRESETS = [1, 2, 3, 4, 5]

const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: '古巴雪茄', label: '古巴雪茄' },
  { key: 'Capadura', label: 'Capadura' },
  { key: '配件', label: '配件' },
  { key: '吧台飲品', label: '飲品' },
  { key: '餐飲', label: '餐點' },
  { key: '酒類', label: '酒類' },
]

const SORTS = [
  { key: 'name', label: '名稱' },
  { key: 'price_desc', label: '價格高→低' },
  { key: 'price_asc', label: '價格低→高' },
]

function deriveStock(current, safe) {
  if (current <= 0) return '缺貨'
  if (current <= (safe || 0)) return '少量'
  return '現貨'
}

// ═════════════════════════════════════════════════════════════════════════════
export default function StaffPOS() {
  const { user } = useAuth()
  const searchRef = useRef(null)

  // ── Data ──
  const [products, setProducts] = useState([])
  const [brands, setBrands] = useState([])
  const [summary, setSummary] = useState(null)
  const [shift, setShift] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(true)

  // ── Cart ──
  const [cart, setCart] = useState([])
  const [qtyMultiplier, setQtyMultiplier] = useState(1)

  // ── Left panel ──
  const [tableNo, setTableNo] = useState('')
  const [guestCount, setGuestCount] = useState(1)
  const [customerMode, setCustomerMode] = useState('walk_in')
  const [vipName, setVipName] = useState('')
  const [vipId, setVipId] = useState(null)
  const [orderNote, setOrderNote] = useState('')
  const [discountPct, setDiscountPct] = useState(0)
  const [serviceFeePct, setServiceFeePct] = useState(0)
  const [invoiceEnabled, setInvoiceEnabled] = useState(false)
  const [taxId, setTaxId] = useState('')
  const [carrier, setCarrier] = useState('')

  // ── Right panel ──
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [activeBrand, setActiveBrand] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [viewMode, setViewMode] = useState('grid')

  // ── Modals ──
  const [showCheckout, setShowCheckout] = useState(false)
  const [showShift, setShowShift] = useState(false)
  const [showMobileCart, setShowMobileCart] = useState(false)
  const [lastOrder, setLastOrder] = useState(null)

  // ── Payment ──
  const [payMethod, setPayMethod] = useState('cash')
  const [payAmount, setPayAmount] = useState('')
  const [payComposite, setPayComposite] = useState({}) // for multi-method
  const [compositeMode, setCompositeMode] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // ── Shift ──
  const [shiftCash, setShiftCash] = useState('10000')
  const [closingCash, setClosingCash] = useState('')

  // ── Load ──
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [prodR, sumR, shiftR, ordR] = await Promise.all([
        supabase.rpc('pos_get_products'),
        supabase.rpc('pos_today_summary'),
        supabase.from('pos_shifts').select('*').eq('work_date', new Date().toISOString().slice(0, 10)).eq('status', 'open').order('opened_at', { ascending: false }).limit(1),
        supabase.from('unified_orders').select('*').eq('channel', 'store').gte('created_at', new Date().toISOString().slice(0, 10)).order('created_at', { ascending: false }).limit(20),
      ])

      // Debug: inspect RPC response shape
      console.log('[POS] pos_get_products raw:', JSON.stringify(prodR.data).slice(0, 500))
      console.log('[POS] prodR.error:', prodR.error)

      // Try RPC first; if it returns products in an unexpected shape, fallback to direct query
      let cigarProducts = []
      let rpcBrands = []

      const rpcProducts = prodR.data?.products
      if (Array.isArray(rpcProducts) && rpcProducts.length > 0 && rpcProducts[0].name) {
        // RPC returned expected shape: { products: [...], brands: [...] }
        console.log('[POS] Using RPC data, sample:', rpcProducts[0])
        cigarProducts = rpcProducts.map(p => ({
          ...p,
          _source: 'products',
          _category: p.brand?.toLowerCase().includes('capadura') ? 'Capadura' : '古巴雪茄',
          _price: p.suggest_price || p.price_a || 0,
          _stock: p.stock_status || '現貨',
        }))
        rpcBrands = prodR.data?.brands || []
      } else {
        // RPC shape unexpected — fallback to direct query
        console.warn('[POS] RPC shape unexpected, falling back to direct products query. prodR.data sample:', JSON.stringify(prodR.data).slice(0, 300))
        const { data: directProducts, error: directErr } = await supabase
          .from('products')
          .select('id, brand, name, spec, pack, price_a, price_b, price_vip, suggest_price, image_url, stock_status, is_active, inv_master_id, sections')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
        if (directErr) console.error('[POS] direct query error:', directErr)
        console.log('[POS] direct query got', directProducts?.length, 'products, sample:', directProducts?.[0])
        cigarProducts = (directProducts || []).map(p => ({
          ...p,
          _source: 'products',
          _category: p.brand?.toLowerCase().includes('capadura') ? 'Capadura' : '古巴雪茄',
          _price: p.suggest_price || p.price_a || 0,
          _stock: p.stock_status || '現貨',
        }))
        // Derive brands from products
        const brandSet = new Set()
        cigarProducts.forEach(p => { if (p.brand) brandSet.add(p.brand) })
        rpcBrands = Array.from(brandSet).sort()
      }
      setBrands(rpcBrands)

      // Bar / food / drink items from inventory_master
      const { data: invItems } = await supabase
        .from('inventory_master')
        .select('id, name, category, current_stock, safe_stock, retail_price, unit')
        .eq('enabled', true)
        .in('category', ['吧台飲品', '餐飲', '酒類', '配件'])
      const otherProducts = (invItems || []).map(p => ({
        id: p.id,
        name: p.name,
        brand: p.category,
        image_url: null,
        inv_master_id: p.id,
        _source: 'inventory',
        _category: p.category,
        _price: p.retail_price || 0,
        _stock: deriveStock(p.current_stock, p.safe_stock),
      }))

      setProducts([...cigarProducts, ...otherProducts])
      if (sumR.data) setSummary(sumR.data)
      if (shiftR.data?.[0]) setShift(shiftR.data[0])
      setRecentOrders(ordR.data || [])
    } catch (e) {
      console.error('POS load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Filtered & sorted ──
  const filtered = useMemo(() => {
    let list = products
    if (activeCategory !== 'all') list = list.filter(p => p._category === activeCategory)
    if (activeBrand !== 'all') list = list.filter(p => p.brand === activeBrand)
    if (search) {
      const kw = search.toLowerCase()
      list = list.filter(p => [p.brand, p.name, p._category].filter(Boolean).join(' ').toLowerCase().includes(kw))
    }
    if (sortBy === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else if (sortBy === 'price_desc') list = [...list].sort((a, b) => b._price - a._price)
    else if (sortBy === 'price_asc') list = [...list].sort((a, b) => a._price - b._price)
    return list
  }, [products, activeCategory, activeBrand, search, sortBy])

  // ── Cart logic ──
  function addToCart(product) {
    if (product._stock === '缺貨') return
    const qty = qtyMultiplier
    setCart(prev => {
      const idx = prev.findIndex(c => c.id === product.id)
      if (idx >= 0) { const a = [...prev]; a[idx] = { ...a[idx], qty: a[idx].qty + qty }; return a }
      return [...prev, { id: product.id, name: product.name, brand: product.brand, price: product._price, qty, inv_master_id: product.inv_master_id || null }]
    })
    setQtyMultiplier(1)
  }

  function updateQty(id, delta) {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c))
  }

  function removeItem(id) { setCart(prev => prev.filter(c => c.id !== id)) }

  function clearAll() {
    setCart([]); setDiscountPct(0); setServiceFeePct(0); setInvoiceEnabled(false)
    setTaxId(''); setCarrier(''); setOrderNote(''); setVipName(''); setVipId(null); setCustomerMode('walk_in')
  }

  // ── Totals ──
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)
  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const discountAmt = Math.round(subtotal * (discountPct / 100))
  const afterDiscount = subtotal - discountAmt
  const serviceFeeAmt = Math.round(afterDiscount * (serviceFeePct / 100))
  const total = afterDiscount + serviceFeeAmt
  const cashPaid = payMethod === 'cash' ? (+payAmount || 0) : 0
  const change = payMethod === 'cash' ? Math.max(0, cashPaid - total) : 0

  // ── Checkout ──
  async function doCheckout() {
    if (cart.length === 0) return
    if (payMethod === 'cash' && cashPaid < total) return alert('現金不足')
    setSubmitting(true)
    try {
      const items = cart.map(c => ({ product_id: c.id, product_name: c.brand + ' ' + c.name, qty: c.qty, unit_price: c.price }))
      const { data, error } = await supabase.rpc('pos_checkout', {
        p_employee_id: user.employee_id || user.id,
        p_employee_name: user.name,
        p_items: items,
        p_payment_method: payMethod,
        p_payment_amount: payMethod === 'cash' ? +payAmount : total,
        p_discount: discountAmt,
        p_table_no: tableNo || null,
        p_vip_id: vipId || vipName || null,
        p_notes: [
          customerMode === 'vip' && vipName ? `VIP: ${vipName}` : '',
          guestCount > 1 ? `人數: ${guestCount}` : '',
          serviceFeePct > 0 ? `服務費: ${serviceFeePct}%` : '',
          invoiceEnabled ? `統編: ${taxId} 載具: ${carrier}` : '',
          orderNote,
        ].filter(Boolean).join(' | ') || null,
      })
      if (error || !data?.success) throw new Error(error?.message || data?.error || '結帳失敗')
      setLastOrder({ ...data, items: cart, payMethod, total, change: data.change ?? change })
      clearAll(); setPayAmount(''); setShowCheckout(false); setShowMobileCart(false)
      loadAll()
    } catch (e) {
      alert('結帳失敗: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Shift ──
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

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════
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
        {/* Mobile cart fab */}
        <button className="pos-cart-fab" onClick={() => setShowMobileCart(true)}
          style={{ display: 'none', position: 'relative', background: 'var(--gold)', border: 'none', borderRadius: 10, padding: '6px 12px', cursor: 'pointer', color: '#000', fontWeight: 700, fontSize: 13 }}>
          <ShoppingCart size={16} />
          {cartCount > 0 && <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cartCount}</span>}
        </button>
      </div>

      {/* ── MAIN SPLIT ── */}
      <div className="pos-main" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ═══ LEFT: Products ═══ */}
        <div className="pos-products" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--border)' }}>
          {/* Search + sort + view toggle */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input ref={searchRef} placeholder="搜尋商品 / 品牌…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 30, fontSize: 13, padding: '8px 8px 8px 32px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }} />
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ fontSize: 11, padding: '6px 8px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}>
              {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 2 }}>
              <button onClick={() => setViewMode('grid')} style={{ background: viewMode === 'grid' ? 'var(--gold-glow)' : 'transparent', border: viewMode === 'grid' ? '1px solid var(--border-gold)' : '1px solid var(--border)', borderRadius: 6, padding: 5, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <LayoutGrid size={14} color={viewMode === 'grid' ? 'var(--gold)' : 'var(--text-dim)'} />
              </button>
              <button onClick={() => setViewMode('list')} style={{ background: viewMode === 'list' ? 'var(--gold-glow)' : 'transparent', border: viewMode === 'list' ? '1px solid var(--border-gold)' : '1px solid var(--border)', borderRadius: 6, padding: 5, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <List size={14} color={viewMode === 'list' ? 'var(--gold)' : 'var(--text-dim)'} />
              </button>
            </div>
          </div>

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 4, padding: '6px 12px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
            {CATEGORIES.map(cat => (
              <button key={cat.key} onClick={() => { setActiveCategory(cat.key); setActiveBrand('all') }}
                style={{ padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: activeCategory === cat.key ? 'var(--gold-glow)' : 'transparent', color: activeCategory === cat.key ? 'var(--gold)' : 'var(--text-dim)', border: activeCategory === cat.key ? '1px solid var(--border-gold)' : '1px solid transparent' }}>
                {cat.label}
              </button>
            ))}
          </div>

          {/* Brand sub-filter for cigars */}
          {(activeCategory === '古巴雪茄' || activeCategory === 'Capadura' || activeCategory === 'all') && brands.length > 0 && (
            <div style={{ display: 'flex', gap: 3, padding: '4px 12px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => setActiveBrand('all')} style={{ padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: activeBrand === 'all' ? 'rgba(201,168,76,.12)' : 'transparent', color: activeBrand === 'all' ? 'var(--gold)' : 'var(--text-muted)', border: activeBrand === 'all' ? '1px solid var(--border-gold)' : '1px solid transparent' }}>
                全部品牌
              </button>
              {brands.map(b => (
                <button key={b} onClick={() => setActiveBrand(b)} style={{ padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: activeBrand === b ? 'rgba(201,168,76,.12)' : 'transparent', color: activeBrand === b ? 'var(--gold)' : 'var(--text-muted)', border: activeBrand === b ? '1px solid var(--border-gold)' : '1px solid transparent' }}>
                  {b}
                </button>
              ))}
            </div>
          )}

          {/* Product grid / list */}
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            {viewMode === 'grid' ? (
              <div className="pos-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
                {filtered.map(p => {
                  const inCart = cart.find(c => c.id === p.id)
                  const isLow = p._stock === '少量'
                  const isOut = p._stock === '缺貨'
                  return (
                    <button key={p.id} onClick={() => !isOut && addToCart(p)} disabled={isOut}
                      style={{ background: inCart ? 'rgba(201,168,76,.08)' : 'var(--black-card)', border: inCart ? '1.5px solid var(--border-gold)' : '1px solid var(--border)', borderRadius: 10, padding: 0, cursor: isOut ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: isOut ? .4 : 1, position: 'relative', transition: 'all .15s', overflow: 'hidden' }}>
                      {inCart && <span style={{ position: 'absolute', top: 4, right: 4, zIndex: 2, background: 'var(--gold)', color: '#000', borderRadius: '50%', width: 22, height: 22, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inCart.qty}</span>}
                      {/* Image */}
                      {p.image_url ? (
                        <div style={{ aspectRatio: '1', background: '#0f0d0a', overflow: 'hidden' }}>
                          <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                        </div>
                      ) : (
                        <div style={{ aspectRatio: '1', background: '#0f0d0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: 'var(--border)' }}>
                          {(p.brand || p.name || '?')[0]}
                        </div>
                      )}
                      <div style={{ padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: isLow ? '#f59e0b' : 'var(--text-muted)', marginBottom: 2 }}>{p.brand}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 15, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>${p._price.toLocaleString()}</span>
                          {isLow && <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>庫存少</span>}
                          {isOut && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 600 }}>缺貨</span>}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filtered.map(p => {
                  const inCart = cart.find(c => c.id === p.id)
                  const isOut = p._stock === '缺貨'
                  return (
                    <button key={p.id} onClick={() => !isOut && addToCart(p)} disabled={isOut}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: inCart ? 'rgba(201,168,76,.08)' : 'var(--black-card)', border: inCart ? '1.5px solid var(--border-gold)' : '1px solid var(--border)', borderRadius: 10, cursor: isOut ? 'not-allowed' : 'pointer', opacity: isOut ? .4 : 1, textAlign: 'left', width: '100%', position: 'relative' }}>
                      {inCart && <span style={{ position: 'absolute', top: 4, right: 8, background: 'var(--gold)', color: '#000', borderRadius: '50%', width: 20, height: 20, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inCart.qty}</span>}
                      <div style={{ width: 42, height: 42, borderRadius: 8, background: '#0f0d0a', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {p.image_url ? <img src={p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} /> : <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--border)' }}>{(p.brand || '?')[0]}</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.brand}</div>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)', fontSize: 14, flexShrink: 0 }}>${p._price.toLocaleString()}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>無符合商品</div>}
          </div>

          {/* Quantity presets bar */}
          <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 4, justifyContent: 'center', flexShrink: 0 }}>
            {QTY_PRESETS.map(n => (
              <button key={n} onClick={() => setQtyMultiplier(n)}
                style={{ padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: qtyMultiplier === n ? 'var(--gold-glow)' : 'var(--black)', color: qtyMultiplier === n ? 'var(--gold)' : 'var(--text-dim)', border: qtyMultiplier === n ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>
                ×{n}
              </button>
            ))}
          </div>
        </div>

        {/* ═══ RIGHT: Cart Panel ═══ */}
        <div className="pos-cart-panel" style={{ width: 340, display: 'flex', flexDirection: 'column', background: 'var(--black-card)', overflow: 'hidden' }}>
          {/* Cart header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}><ShoppingCart size={16} /> 購物車 ({cartCount})</span>
            {cart.length > 0 && <button onClick={clearAll} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 11, cursor: 'pointer' }}>清空</button>}
          </div>

          {/* Table + guest + customer */}
          <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={tableNo} onChange={e => setTableNo(e.target.value)} style={{ flex: 1, fontSize: 11, padding: '5px 6px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}>
                <option value="">桌位</option>
                {TABLES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input type="number" min={1} value={guestCount} onChange={e => setGuestCount(Math.max(1, +e.target.value || 1))} placeholder="人數" style={{ width: 56, fontSize: 11, padding: '5px 6px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', textAlign: 'center' }} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['walk_in', '散客'], ['vip', 'VIP']].map(([k, l]) => (
                <button key={k} onClick={() => setCustomerMode(k)}
                  style={{ flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: customerMode === k ? 'var(--gold-glow)' : 'var(--black)', color: customerMode === k ? 'var(--gold)' : 'var(--text-dim)', border: customerMode === k ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>
                  {l}
                </button>
              ))}
            </div>
            {customerMode === 'vip' && (
              <input placeholder="VIP 姓名" value={vipName} onChange={e => setVipName(e.target.value)} style={{ fontSize: 11, padding: '5px 6px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
            )}
          </div>

          {/* Cart items */}
          <div style={{ flex: 1, overflow: 'auto', padding: '6px 14px' }}>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>點選左側商品加入購物車</div>
            ) : cart.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
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

          {/* Bottom: discount, service fee, invoice, totals, checkout */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-gold)', background: 'rgba(201,168,76,.04)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Discount + service fee + note */}
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>折扣 %</div>
                <input type="number" min={0} max={100} value={discountPct || ''} onChange={e => setDiscountPct(Math.min(100, Math.max(0, +e.target.value || 0)))} placeholder="0"
                  style={{ width: '100%', fontSize: 12, padding: '5px 6px', fontFamily: 'var(--font-mono)', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>服務費 %</div>
                <input type="number" min={0} max={100} value={serviceFeePct || ''} onChange={e => setServiceFeePct(Math.min(100, Math.max(0, +e.target.value || 0)))} placeholder="0"
                  style={{ width: '100%', fontSize: 12, padding: '5px 6px', fontFamily: 'var(--font-mono)', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>備註</div>
                <input value={orderNote} onChange={e => setOrderNote(e.target.value)} placeholder="備註"
                  style={{ width: '100%', fontSize: 11, padding: '5px 6px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
              </div>
            </div>

            {/* Invoice */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
                <input type="checkbox" checked={invoiceEnabled} onChange={e => setInvoiceEnabled(e.target.checked)} /> 發票
              </label>
              {invoiceEnabled && (
                <>
                  <input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="統編" style={{ flex: 1, fontSize: 11, padding: '4px 6px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                  <input value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="載具" style={{ flex: 1, fontSize: 11, padding: '4px 6px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                </>
              )}
            </div>

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)' }}>
              <span>小計 ({cartCount} 件)</span><span style={{ fontFamily: 'var(--font-mono)' }}>${subtotal.toLocaleString()}</span>
            </div>
            {discountAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#f59e0b' }}>
              <span>折扣 {discountPct}%</span><span style={{ fontFamily: 'var(--font-mono)' }}>-${discountAmt.toLocaleString()}</span>
            </div>}
            {serviceFeeAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)' }}>
              <span>服務費 {serviceFeePct}%</span><span style={{ fontFamily: 'var(--font-mono)' }}>+${serviceFeeAmt.toLocaleString()}</span>
            </div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, color: 'var(--gold)' }}>
              <span>應收</span><span style={{ fontFamily: 'var(--font-mono)' }}>${total.toLocaleString()}</span>
            </div>

            {/* Action buttons */}
            <button onClick={() => cart.length > 0 && setShowCheckout(true)} disabled={cart.length === 0}
              style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: cart.length > 0 ? 'pointer' : 'not-allowed', background: cart.length > 0 ? 'linear-gradient(135deg, #c9a84c, #b8943f)' : 'var(--border)', border: 'none', borderRadius: 12, color: cart.length > 0 ? '#000' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <CreditCard size={18} /> 結帳 ${total.toLocaleString()}
            </button>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={clearAll} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--black)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>清除</button>
              <button onClick={clearAll} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--black)', color: 'var(--red)', border: '1px solid rgba(231,76,60,.3)' }}>取消</button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ CHECKOUT MODAL ═══ */}
      {showCheckout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowCheckout(false)}>
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--border-gold)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>💰 結帳</span>
              <button onClick={() => setShowCheckout(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            {/* Order summary */}
            <div style={{ background: 'var(--black)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
              {cart.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--text)' }}>
                  <span>{c.brand} {c.name} ×{c.qty}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${(c.price * c.qty).toLocaleString()}</span>
                </div>
              ))}
              {discountAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#f59e0b' }}><span>折扣 {discountPct}%</span><span>-${discountAmt.toLocaleString()}</span></div>}
              {serviceFeeAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--text-dim)' }}><span>服務費 {serviceFeePct}%</span><span>+${serviceFeeAmt.toLocaleString()}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: 'var(--gold)', borderTop: '1px solid var(--border-gold)', marginTop: 6, paddingTop: 8 }}>
                <span>應收</span><span style={{ fontFamily: 'var(--font-mono)' }}>${total.toLocaleString()}</span>
              </div>
            </div>
            {/* Payment methods */}
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>支付方式</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
              {PAY_METHODS.map(m => (
                <button key={m.key} onClick={() => { setPayMethod(m.key); if (m.key !== 'cash') setPayAmount('') }}
                  style={{ padding: '10px 6px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center', background: payMethod === m.key ? m.color + '18' : 'var(--black)', color: payMethod === m.key ? m.color : 'var(--text-dim)', border: payMethod === m.key ? '2px solid ' + m.color : '1px solid var(--border)' }}>
                  <div style={{ fontSize: 20 }}>{m.icon}</div>{m.label}
                </button>
              ))}
            </div>
            {/* Cash input + quick buttons */}
            {payMethod === 'cash' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>收取金額</div>
                <input type="number" inputMode="numeric" placeholder="輸入收取金額" value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus
                  style={{ width: '100%', fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: 'var(--black)', border: '2px solid var(--border-gold)', borderRadius: 12, color: 'var(--gold)', marginBottom: 8, boxSizing: 'border-box' }} />
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

      {/* ═══ LAST ORDER SUCCESS ═══ */}
      {lastOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setLastOrder(null)}>
          <div style={{ background: 'var(--black-card)', border: '2px solid rgba(77,168,108,.5)', borderRadius: 20, padding: 30, width: '100%', maxWidth: 380, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <CheckCircle2 size={48} color="var(--green)" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', marginBottom: 4 }}>結帳成功！</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>{lastOrder.order_no}</div>
            <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 20 }}>
              <div><div style={{ fontSize: 11, color: 'var(--text-dim)' }}>合計</div><div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>${lastOrder.total?.toLocaleString()}</div></div>
              {(lastOrder.change > 0) && <div><div style={{ fontSize: 11, color: 'var(--text-dim)' }}>找零</div><div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>${lastOrder.change?.toLocaleString()}</div></div>}
            </div>
            <button onClick={() => setLastOrder(null)} style={{ padding: '12px 40px', fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'var(--gold)', border: 'none', borderRadius: 12, color: '#000' }}>繼續收銀</button>
          </div>
        </div>
      )}

      {/* ═══ SHIFT MODAL ═══ */}
      {showShift && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowShift(false)}>
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--border-gold)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            {!shift ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><LogIn size={20} /> 開班</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 6 }}>備用金金額</div>
                <input type="number" inputMode="numeric" value={shiftCash} onChange={e => setShiftCash(e.target.value)}
                  style={{ width: '100%', fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: 'var(--black)', border: '2px solid var(--border-gold)', borderRadius: 12, color: 'var(--gold)', marginBottom: 16, boxSizing: 'border-box' }} />
                <button onClick={openShift} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #4da86c, #2d8a4e)', border: 'none', borderRadius: 12, color: '#fff' }}>確認開班</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><LogOutIcon size={20} /> 關班</div>
                <div style={{ background: 'var(--black)', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13, lineHeight: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-dim)' }}>開班人員</span><span>{shift.employee_name}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-dim)' }}>備用金</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>${(shift.opening_cash || 0).toLocaleString()}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-dim)' }}>今日營收</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>${(summary?.revenue?.total || 0).toLocaleString()}</span></div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 6 }}>現金盤點金額</div>
                <input type="number" inputMode="numeric" placeholder="盤點現金" value={closingCash} onChange={e => setClosingCash(e.target.value)}
                  style={{ width: '100%', fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: 'var(--black)', border: '2px solid rgba(245,158,11,.4)', borderRadius: 12, color: '#f59e0b', marginBottom: 16, boxSizing: 'border-box' }} />
                <button onClick={closeShift} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: 12, color: '#000' }}>確認關班</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ MOBILE CART DRAWER ═══ */}
      {showMobileCart && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={() => setShowMobileCart(false)}>
          <div style={{ background: 'var(--black-card)', borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflow: 'auto', border: '1px solid var(--border-gold)', borderBottom: 'none' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--black-card)', zIndex: 1 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold)' }}>購物車 ({cartCount})</span>
              <button onClick={() => setShowMobileCart(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '8px 16px' }}>
              {/* Table + guest */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <select value={tableNo} onChange={e => setTableNo(e.target.value)} style={{ flex: 1, fontSize: 12, padding: '6px 8px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}>
                  <option value="">桌位</option>
                  {TABLES.map(t => <option key={t}>{t}</option>)}
                </select>
                <input type="number" min={1} value={guestCount} onChange={e => setGuestCount(Math.max(1, +e.target.value || 1))} placeholder="人數" style={{ width: 56, fontSize: 12, padding: '6px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', textAlign: 'center' }} />
              </div>
              {/* Cart items */}
              {cart.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>${c.price.toLocaleString()} × {c.qty}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button onClick={() => updateQty(c.id, -1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--black)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={12} /></button>
                    <span style={{ width: 26, textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{c.qty}</span>
                    <button onClick={() => updateQty(c.id, 1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-gold)', background: 'var(--gold-glow)', color: 'var(--gold)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>
                  </div>
                  <span style={{ width: 60, textAlign: 'right', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>${(c.price * c.qty).toLocaleString()}</span>
                  <button onClick={() => removeItem(c.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 2 }}><Trash2 size={14} /></button>
                </div>
              ))}
              {cart.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>購物車是空的</div>}
              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, color: 'var(--gold)', padding: '12px 0' }}>
                <span>應收</span><span style={{ fontFamily: 'var(--font-mono)' }}>${total.toLocaleString()}</span>
              </div>
              {/* Checkout button */}
              <button onClick={() => { setShowMobileCart(false); cart.length > 0 && setShowCheckout(true) }} disabled={cart.length === 0}
                style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: cart.length > 0 ? 'pointer' : 'not-allowed', background: cart.length > 0 ? 'linear-gradient(135deg, #c9a84c, #b8943f)' : 'var(--border)', border: 'none', borderRadius: 12, color: cart.length > 0 ? '#000' : 'var(--text-dim)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <CreditCard size={18} /> 結帳 ${total.toLocaleString()}
              </button>
            </div>
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
