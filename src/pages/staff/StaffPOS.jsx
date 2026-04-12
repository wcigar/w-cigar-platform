import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Search, ShoppingCart, X, Plus, Minus, Trash2, CreditCard, DollarSign, ChevronLeft, CheckCircle2, LogIn, LogOut as LogOutIcon, Clock, LayoutGrid, List } from 'lucide-react'

// ── Constants ───────────────────────────────────────────────────────────────
const PAY_METHODS = [
  { key: 'cash', label: '現金', icon: '💵', color: '#4da86c' },
  { key: 'card_acpay', label: 'ACPAY刷卡', icon: '💳', color: '#4d8ac4' },
  { key: 'card_teb', label: '臺企銀刷卡', icon: '🏦', color: '#8b6cc4' },
  { key: 'transfer', label: '銀行轉帳', icon: '🔄', color: '#c4a84d' },
  { key: 'wechat', label: '微信支付', icon: '💚', color: '#07c160' },
  { key: 'alipay', label: '支付寶', icon: '🔵', color: '#1677ff' },
]

const TABLES = [
  '1F-A1 四人座','1F-A2 四人座','1F-A3 四人座',
  '1F-B1 六人座','1F-B2 六人座',
  'B1-VIP1 包廂四人','B1-VIP2 包廂四人','B1-VIP3 大圓桌',
  'B1-沙發A','B1-沙發B','B1-沙發C',
  '戶外-1','戶外-2','戶外-3',
  '外帶',
]
const QUICK_CASH = [100, 500, 1000, 2000, 3000, 5000]
const QTY_PRESETS = [1, 2, 3, 4, 5]

// Categories: cigars first, then food/drink
const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: '古巴雪茄', label: '古巴雪茄' },
  { key: 'Capadura', label: 'Capadura' },
  { key: '雪茄配件', label: '雪茄配件' },
  { key: '莊園品茗', label: '莊園品茗' },
  { key: '奶茶咖啡', label: '奶茶咖啡' },
  { key: '氣泡飲品', label: '氣泡飲品' },
  { key: '餐食', label: '餐食' },
  { key: '甜點', label: '甜點' },
  { key: '酒類', label: '酒類' },
]

const CAT_ORDER = {}; CATEGORIES.forEach((c, i) => { CAT_ORDER[c.key] = i })

const SORTS = [
  { key: 'menu', label: '菜單順序' },
  { key: 'price_desc', label: '價格高→低' },
  { key: 'price_asc', label: '價格低→高' },
  { key: 'name', label: '名稱' },
]

function deriveStock(current, safe) {
  if (current <= 0) return '缺貨'
  if (current <= (safe || 0)) return '少量'
  return '現貨'
}

function classifyItem(name, category) {
  const n = (name || '').toLowerCase()
  if (category === '配件') return '雪茄配件'
  if (/奶茶|咖啡|拿鐵|espresso|latte|americano/.test(n)) return '奶茶咖啡'
  if (/氣泡|可樂|雪碧|蘋果汁|可爾必思|礦泉水|蘇打/.test(n)) return '氣泡飲品'
  if (/茶/.test(n) && category === '吧台飲品') return '莊園品茗'
  if (/布朗|蒙布朗|佛卡夏|可頌|甜點|蛋糕/.test(n)) return '甜點'
  if (/滷味|炸物|水餃|雞湯|拼盤|鬆餅|薯條|三明治/.test(n) || category === '餐飲') return '餐食'
  if (category === '酒類') return '酒類'
  if (category === '吧台飲品') return '奶茶咖啡'
  return '餐食'
}

// ═════════════════════════════════════════════════════════════════════════════
export default function StaffPOS() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const searchRef = useRef(null)

  const [products, setProducts] = useState([])
  const [summary, setSummary] = useState(null)
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)

  const [cart, setCart] = useState([])
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

  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [sortBy, setSortBy] = useState('menu')
  const [viewMode, setViewMode] = useState('grid')

  const [showCheckout, setShowCheckout] = useState(false)
  const [showShift, setShowShift] = useState(false)
  const [showMobileCart, setShowMobileCart] = useState(false)
  const [lastOrder, setLastOrder] = useState(null)
  const [detailProduct, setDetailProduct] = useState(null)
  const [detailQty, setDetailQty] = useState(1)
  const [detailNote, setDetailNote] = useState('')

  const [payMethod, setPayMethod] = useState('cash')
  const [payAmount, setPayAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [shiftCash, setShiftCash] = useState('10000')
  const [closingCash, setClosingCash] = useState('')

  // ── Load ──
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [prodR, sumR, shiftR] = await Promise.all([
        supabase.rpc('pos_get_products'),
        supabase.rpc('pos_today_summary'),
        supabase.from('pos_shifts').select('*').eq('work_date', new Date().toISOString().slice(0, 10)).eq('status', 'open').order('opened_at', { ascending: false }).limit(1),
      ])

      let cigarProducts = []
      const rpcProducts = prodR.data?.products
      if (Array.isArray(rpcProducts) && rpcProducts.length > 0 && rpcProducts[0].name) {
        cigarProducts = rpcProducts.map(p => ({
          ...p, _source: 'products',
          _cat: p.brand === 'Capadura' ? 'Capadura' : '古巴雪茄',
          _price: p.suggest_price || p.price_a || 0,
          _stock: p.stock_status || '現貨',
        }))
      } else {
        const { data: dp } = await supabase.from('products')
          .select('id, brand, name, spec, pack, price_a, suggest_price, image_url, stock_status, inv_master_id, sections')
          .eq('is_active', true).order('sort_order', { ascending: true })
        cigarProducts = (dp || []).map(p => ({
          ...p, _source: 'products',
          _cat: p.brand === 'Capadura' ? 'Capadura'
            : ((p.sections || []).includes('配件') || (p.name || '').match(/打火機|剪刀|保濕|雪茄盒|煙灰缸/)) ? '雪茄配件'
            : '古巴雪茄',
          _price: p.suggest_price || p.price_a || 0,
          _stock: p.stock_status || '現貨',
        }))
      }

      const { data: invItems } = await supabase.from('inventory_master')
        .select('id, name, category, current_stock, safe_stock, retail_price, unit, image_url')
        .eq('enabled', true).in('category', ['吧台飲品', '餐飲', '酒類', '配件']).gt('retail_price', 0)

      const otherProducts = (invItems || []).map(p => ({
        id: p.id, name: p.name, brand: p.category, image_url: p.image_url || null,
        inv_master_id: p.id, _source: 'inventory',
        _cat: classifyItem(p.name, p.category),
        _price: p.retail_price, _stock: deriveStock(p.current_stock, p.safe_stock),
      }))

      setProducts([...cigarProducts, ...otherProducts])
      if (sumR.data) setSummary(sumR.data)
      if (shiftR.data?.[0]) setShift(shiftR.data[0])
    } catch (e) { console.error('POS load error:', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const filtered = useMemo(() => {
    let list = products
    if (activeCategory !== 'all') list = list.filter(p => p._cat === activeCategory)
    if (search) {
      const kw = search.toLowerCase()
      list = list.filter(p => [p.brand, p.name, p._cat].filter(Boolean).join(' ').toLowerCase().includes(kw))
    }
    if (sortBy === 'menu') list = [...list].sort((a, b) => (CAT_ORDER[a._cat] ?? 99) - (CAT_ORDER[b._cat] ?? 99) || (a.name || '').localeCompare(b.name || ''))
    else if (sortBy === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else if (sortBy === 'price_desc') list = [...list].sort((a, b) => b._price - a._price)
    else if (sortBy === 'price_asc') list = [...list].sort((a, b) => a._price - b._price)
    return list
  }, [products, activeCategory, search, sortBy])

  // ── Cart ──
  function addToCart(product, qty, note) {
    if (product._stock === '缺貨' || product._price <= 0) return
    setCart(prev => {
      const idx = prev.findIndex(c => c.id === product.id)
      if (idx >= 0) { const a = [...prev]; a[idx] = { ...a[idx], qty: a[idx].qty + qty, note: note || a[idx].note }; return a }
      return [...prev, { id: product.id, name: product.name, brand: product.brand, price: product._price, qty, inv_master_id: product.inv_master_id || null, note: note || '' }]
    })
  }
  function openDetail(p) {
    if (p._stock === '缺貨' || p._price <= 0) return
    setDetailProduct(p); setDetailQty(1); setDetailNote('')
  }
  function updateQty(id, d) { setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + d) } : c)) }
  function removeItem(id) { setCart(prev => prev.filter(c => c.id !== id)) }
  function clearAll() {
    setCart([]); setDiscountPct(0); setServiceFeePct(0); setInvoiceEnabled(false)
    setTaxId(''); setCarrier(''); setOrderNote(''); setVipName(''); setVipId(null); setCustomerMode('walk_in')
  }

  const cartCount = cart.reduce((s, c) => s + c.qty, 0)
  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const discountAmt = Math.round(subtotal * (discountPct / 100))
  const afterDiscount = subtotal - discountAmt
  const serviceFeeAmt = Math.round(afterDiscount * (serviceFeePct / 100))
  const total = afterDiscount + serviceFeeAmt
  const cashPaid = payMethod === 'cash' ? (+payAmount || 0) : 0
  const change = payMethod === 'cash' ? Math.max(0, cashPaid - total) : 0

  async function doCheckout() {
    if (!cart.length) return
    if (payMethod === 'cash' && cashPaid < total) return alert('現金不足')
    setSubmitting(true)
    try {
      const items = cart.map(c => ({ product_id: c.id, product_name: (c.brand || '') + ' ' + c.name, qty: c.qty, unit_price: c.price }))
      const { data, error } = await supabase.rpc('pos_checkout', {
        p_employee_id: user.employee_id || user.id, p_employee_name: user.name,
        p_items: items, p_payment_method: payMethod,
        p_payment_amount: payMethod === 'cash' ? +payAmount : total,
        p_discount: discountAmt, p_table_no: tableNo || null,
        p_vip_id: vipId || vipName || null,
        p_notes: [customerMode === 'vip' && vipName ? `VIP: ${vipName}` : '', guestCount > 1 ? `人數: ${guestCount}` : '', serviceFeePct > 0 ? `服務費: ${serviceFeePct}%` : '', invoiceEnabled ? `統編: ${taxId} 載具: ${carrier}` : '', orderNote, ...cart.filter(c => c.note).map(c => `[${c.name}] ${c.note}`)].filter(Boolean).join(' | ') || null,
      })
      if (error || !data?.success) throw new Error(error?.message || data?.error || '結帳失敗')
      setLastOrder({ ...data, items: cart, payMethod, total, paid: payMethod === 'cash' ? +payAmount : total, change: data.change ?? change })
      clearAll(); setPayAmount(''); setShowCheckout(false); setShowMobileCart(false); loadAll()
    } catch (e) { alert('結帳失敗: ' + e.message) }
    finally { setSubmitting(false) }
  }

  async function openShiftFn() {
    const { data } = await supabase.rpc('pos_open_shift', { p_employee_id: user.employee_id || user.id, p_employee_name: user.name, p_opening_cash: +(shiftCash || 0) })
    if (data?.success) { alert('開班成功！'); setShowShift(false); loadAll() } else alert('開班失敗: ' + (data?.error || ''))
  }
  async function closeShiftFn() {
    if (!shift) return
    const { data } = await supabase.rpc('pos_close_shift', { p_shift_id: shift.id, p_closing_cash: +(closingCash || 0) })
    if (data?.success) { alert('關班完成！差額: $' + (data.variance ?? 0)); setShowShift(false); setClosingCash(''); loadAll() } else alert('關班失敗: ' + (data?.error || ''))
  }

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}><div className="loading-shimmer" style={{ width: 80, height: 80, borderRadius: '50%' }} /></div>

  // ── Product Card ──
  function PCard({ p }) {
    const inCart = cart.find(c => c.id === p.id)
    const isOut = p._stock === '缺貨'
    const isLow = p._stock === '少量'
    return (
      <button onClick={() => openDetail(p)} disabled={isOut}
        style={{ background: inCart ? 'rgba(201,168,76,.08)' : 'var(--black-card)', border: inCart ? '1.5px solid var(--border-gold)' : '1px solid var(--border)', borderRadius: 10, padding: 0, cursor: isOut ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: isOut ? .35 : 1, position: 'relative', overflow: 'hidden', pointerEvents: isOut ? 'none' : 'auto' }}>
        {inCart && <span style={{ position: 'absolute', top: 4, right: 4, zIndex: 2, background: 'var(--gold)', color: '#000', borderRadius: '50%', width: 22, height: 22, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inCart.qty}</span>}
        {isOut && <span style={{ position: 'absolute', top: 4, left: 4, zIndex: 2, background: 'rgba(0,0,0,.7)', color: '#e74c3c', borderRadius: 6, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>售罄</span>}
        {isLow && !isOut && <span style={{ position: 'absolute', top: 4, left: 4, zIndex: 2, background: 'rgba(0,0,0,.7)', color: '#f59e0b', borderRadius: 6, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>少量</span>}
        {p.image_url ? (
          <div style={{ aspectRatio: '4/3', background: '#0f0d0a', overflow: 'hidden' }}>
            <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
          </div>
        ) : (
          <div style={{ aspectRatio: '4/3', background: '#0f0d0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: '#2a2520' }}>
            {(p.brand || p.name || '?')[0]}
          </div>
        )}
        <div style={{ padding: '6px 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 28 }}>{p.name}</div>
          <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>${p._price.toLocaleString()}</div>
        </div>
      </button>
    )
  }

  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0a0a0a' }}>
      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 50, minHeight: 50, borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--black-card)' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2, padding: '4px 6px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}><ChevronLeft size={16} /> 返回</button>
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <DollarSign size={16} color="var(--gold)" />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>POS</span>
        {shift && <span style={{ fontSize: 9, background: 'rgba(77,168,108,.15)', color: 'var(--green)', padding: '2px 6px', borderRadius: 10 }}>營業中</span>}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-dim)' }}>
          <span>${(summary?.revenue?.total || 0).toLocaleString()}</span>
          <span>{summary?.orders || 0}單</span>
        </div>
        <button onClick={() => setShowShift(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 10, color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={11} /> {shift ? '關班' : '開班'}</button>
        <button className="pos-cart-fab" onClick={() => setShowMobileCart(true)} style={{ display: 'none', position: 'relative', background: 'var(--gold)', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: '#000', fontWeight: 700, fontSize: 12 }}>
          <ShoppingCart size={14} />
          {cartCount > 0 && <span style={{ position: 'absolute', top: -5, right: -5, background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cartCount}</span>}
        </button>
      </div>

      {/* MAIN */}
      <div className="pos-main" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── PRODUCTS ── */}
        <div className="pos-products" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--border)' }}>
          {/* Search */}
          <div style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 100 }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input ref={searchRef} placeholder="搜尋…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', fontSize: 12, padding: '5px 6px 5px 28px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ fontSize: 10, padding: '5px 4px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}>
              {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} style={{ background: 'var(--gold-glow)', border: '1px solid var(--border-gold)', borderRadius: 6, padding: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {viewMode === 'grid' ? <List size={13} color="var(--gold)" /> : <LayoutGrid size={13} color="var(--gold)" />}
            </button>
          </div>
          {/* Category tabs — no brand sub-pills */}
          <div style={{ display: 'flex', gap: 2, padding: '3px 8px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
            {CATEGORIES.map(cat => (
              <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                style={{ padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: activeCategory === cat.key ? 'var(--gold-glow)' : 'transparent', color: activeCategory === cat.key ? 'var(--gold)' : 'var(--text-dim)', border: activeCategory === cat.key ? '1px solid var(--border-gold)' : '1px solid transparent' }}>
                {cat.label}
              </button>
            ))}
          </div>
          {/* Grid / List */}
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            {viewMode === 'grid' ? (
              <div className="pos-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
                {filtered.map(p => <PCard key={p.id} p={p} />)}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filtered.map(p => {
                  const inCart = cart.find(c => c.id === p.id)
                  const isOut = p._stock === '缺貨'
                  return (
                    <button key={p.id} onClick={() => openDetail(p)} disabled={isOut}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: inCart ? 'rgba(201,168,76,.08)' : 'var(--black-card)', border: inCart ? '1.5px solid var(--border-gold)' : '1px solid var(--border)', borderRadius: 10, cursor: isOut ? 'not-allowed' : 'pointer', opacity: isOut ? .35 : 1, textAlign: 'left', width: '100%', pointerEvents: isOut ? 'none' : 'auto' }}>
                      {inCart && <span style={{ position: 'absolute', top: 4, right: 8, background: 'var(--gold)', color: '#000', borderRadius: '50%', width: 20, height: 20, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inCart.qty}</span>}
                      <div style={{ width: 42, height: 42, borderRadius: 8, background: '#0f0d0a', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {p.image_url ? <img src={p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} /> : <span style={{ fontSize: 16, fontWeight: 900, color: '#2a2520' }}>{(p.brand || '?')[0]}</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.brand}{p._stock === '少量' ? ' · 少量' : ''}{isOut ? ' · 售罄' : ''}</div>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)', fontSize: 14, flexShrink: 0 }}>${p._price.toLocaleString()}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>無符合商品</div>}
          </div>
          {/* Qty presets */}
          <div style={{ padding: '4px 8px', borderTop: '1px solid var(--border)', display: 'flex', gap: 3, justifyContent: 'center', flexShrink: 0 }}>
            {QTY_PRESETS.map(n => (
              <button key={n} onClick={() => setDetailQty(n)} style={{ padding: '3px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: detailQty === n ? 'var(--gold-glow)' : 'var(--black)', color: detailQty === n ? 'var(--gold)' : 'var(--text-dim)', border: detailQty === n ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>×{n}</button>
            ))}
          </div>
        </div>

        {/* ── CART PANEL ── */}
        <div className="pos-cart-panel" style={{ width: 340, display: 'flex', flexDirection: 'column', background: 'var(--black-card)', overflow: 'hidden', height: 'calc(100vh - 50px)' }}>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}><ShoppingCart size={16} /> 購物車 ({cartCount})</span>
            {cart.length > 0 && <button onClick={clearAll} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 11, cursor: 'pointer' }}>清空</button>}
          </div>
          <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
            <select value={tableNo} onChange={e => setTableNo(e.target.value)} style={{ flex: 1, minWidth: 80, fontSize: 11, padding: '5px 4px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}>
              <option value="">桌位</option>
              {TABLES.map(t => <option key={t}>{t}</option>)}
            </select>
            <input type="number" min={1} value={guestCount} onChange={e => setGuestCount(Math.max(1, +e.target.value || 1))} style={{ width: 42, fontSize: 11, padding: '5px 3px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', textAlign: 'center' }} />
            {[['walk_in', '散客'], ['vip', 'VIP']].map(([k, l]) => (
              <button key={k} onClick={() => setCustomerMode(k)} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: customerMode === k ? 'var(--gold-glow)' : 'var(--black)', color: customerMode === k ? 'var(--gold)' : 'var(--text-dim)', border: customerMode === k ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{l}</button>
            ))}
          </div>
          {/* Scrollable cart items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px' }}>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>點選商品加入購物車</div>
            ) : cart.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>${c.price.toLocaleString()} × {c.qty}{c.note ? ` · ${c.note}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button onClick={() => updateQty(c.id, -1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--black)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={11} /></button>
                  <span style={{ width: 22, textAlign: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{c.qty}</span>
                  <button onClick={() => updateQty(c.id, 1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border-gold)', background: 'var(--gold-glow)', color: 'var(--gold)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={11} /></button>
                </div>
                <span style={{ width: 54, textAlign: 'right', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>${(c.price * c.qty).toLocaleString()}</span>
                <button onClick={() => removeItem(c.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 2 }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          {/* STICKY BOTTOM */}
          <div style={{ flexShrink: 0, borderTop: '1px solid var(--border-gold)', background: 'rgba(201,168,76,.04)', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 8, color: 'var(--text-muted)' }}>折扣%</div><input type="number" min={0} max={100} value={discountPct || ''} onChange={e => setDiscountPct(Math.min(100, Math.max(0, +e.target.value || 0)))} placeholder="0" style={{ width: '100%', fontSize: 11, padding: '3px 4px', fontFamily: 'var(--font-mono)', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} /></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 8, color: 'var(--text-muted)' }}>服務費%</div><input type="number" min={0} max={100} value={serviceFeePct || ''} onChange={e => setServiceFeePct(Math.min(100, Math.max(0, +e.target.value || 0)))} placeholder="0" style={{ width: '100%', fontSize: 11, padding: '3px 4px', fontFamily: 'var(--font-mono)', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-dim)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}><input type="checkbox" checked={invoiceEnabled} onChange={e => setInvoiceEnabled(e.target.checked)} /> 開發票</label>
            </div>
            {invoiceEnabled && <div style={{ display: 'flex', gap: 4 }}><input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="統一編號" style={{ flex: 1, fontSize: 10, padding: '3px 4px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} /><input value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="載具" style={{ flex: 1, fontSize: 10, padding: '3px 4px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} /></div>}
            <input value={orderNote} onChange={e => setOrderNote(e.target.value)} placeholder="備註…" style={{ width: '100%', fontSize: 10, padding: '3px 4px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)' }}><span>共 {cartCount} 件</span><span style={{ fontFamily: 'var(--font-mono)' }}>${subtotal.toLocaleString()}</span></div>
            {discountAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#f59e0b' }}><span>折扣 {discountPct}%</span><span>-${discountAmt.toLocaleString()}</span></div>}
            {serviceFeeAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)' }}><span>服務費</span><span>+${serviceFeeAmt.toLocaleString()}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: 'var(--gold)' }}><span>應收</span><span style={{ fontFamily: 'var(--font-mono)' }}>${total.toLocaleString()}</span></div>
            <button onClick={() => cart.length > 0 && setShowCheckout(true)} disabled={!cart.length} style={{ width: '100%', padding: 12, fontSize: 15, fontWeight: 700, cursor: cart.length ? 'pointer' : 'not-allowed', background: cart.length ? 'linear-gradient(135deg, #c9a84c, #b8943f)' : 'var(--border)', border: 'none', borderRadius: 10, color: cart.length ? '#000' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CreditCard size={16} /> 結帳 ${total.toLocaleString()}</button>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => alert('暫存訂單功能開發中')} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: 'rgba(37,99,235,.1)', color: '#60a5fa', border: '1px solid rgba(37,99,235,.3)' }}>暫存</button>
              <button onClick={() => alert('空訂單功能開發中')} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: 'rgba(161,98,7,.1)', color: '#fbbf24', border: '1px solid rgba(161,98,7,.3)' }}>空訂單</button>
              <button onClick={clearAll} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: 'var(--black)', color: 'var(--red)', border: '1px solid rgba(231,76,60,.3)' }}>清除</button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ PRODUCT DETAIL MODAL ═══ */}
      {detailProduct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setDetailProduct(null)}>
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--border-gold)', borderRadius: 20, width: '100%', maxWidth: 400, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            {detailProduct.image_url ? (
              <div style={{ height: 200, background: '#0f0d0a', overflow: 'hidden' }}>
                <img src={detailProduct.image_url} alt={detailProduct.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ) : (
              <div style={{ height: 120, background: '#0f0d0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, fontWeight: 900, color: '#2a2520' }}>{(detailProduct.brand || detailProduct.name || '?')[0]}</div>
            )}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{detailProduct.brand}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8, lineHeight: 1.3 }}>{detailProduct.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--gold)' }}>${detailProduct._price.toLocaleString()}</span>
                {detailProduct._stock === '少量' && <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>少量</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
                <button onClick={() => setDetailQty(q => Math.max(1, q - 1))} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--black)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={18} /></button>
                <span style={{ fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--text)', width: 50, textAlign: 'center' }}>{detailQty}</span>
                <button onClick={() => setDetailQty(q => q + 1)} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border-gold)', background: 'var(--gold-glow)', color: 'var(--gold)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={18} /></button>
              </div>
              <input value={detailNote} onChange={e => setDetailNote(e.target.value)} placeholder="備註（去冰、少糖...）" style={{ width: '100%', fontSize: 12, padding: '8px 10px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', marginBottom: 14, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setDetailProduct(null)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--black)', color: 'var(--text-dim)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>取消</button>
                <button onClick={() => { addToCart(detailProduct, detailQty, detailNote); setDetailProduct(null) }}
                  style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #c9a84c, #b8943f)', color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <ShoppingCart size={16} /> 加入 · ${(detailProduct._price * detailQty).toLocaleString()}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CHECKOUT MODAL ═══ */}
      {showCheckout && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowCheckout(false)}>
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--border-gold)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)' }}>💰 結帳</span>
              <button onClick={() => setShowCheckout(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ background: 'var(--black)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
              {cart.map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--text)' }}><span>{c.name} ×{c.qty}</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${(c.price * c.qty).toLocaleString()}</span></div>)}
              {discountAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#f59e0b' }}><span>折扣</span><span>-${discountAmt.toLocaleString()}</span></div>}
              {serviceFeeAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: 'var(--text-dim)' }}><span>服務費</span><span>+${serviceFeeAmt.toLocaleString()}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: 'var(--gold)', borderTop: '1px solid var(--border-gold)', marginTop: 6, paddingTop: 8 }}><span>應收</span><span style={{ fontFamily: 'var(--font-mono)' }}>${total.toLocaleString()}</span></div>
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
                <input type="number" inputMode="numeric" placeholder="輸入金額" value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus style={{ width: '100%', fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: 'var(--black)', border: '2px solid var(--border-gold)', borderRadius: 12, color: 'var(--gold)', marginBottom: 8, boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {QUICK_CASH.map(v => <button key={v} onClick={() => setPayAmount(String(v))} style={{ flex: 1, minWidth: 50, padding: '8px 4px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: +payAmount === v ? 'var(--gold-glow)' : 'var(--black)', color: +payAmount === v ? 'var(--gold)' : 'var(--text-dim)', border: +payAmount === v ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>${v.toLocaleString()}</button>)}
                  <button onClick={() => setPayAmount(String(total))} style={{ flex: 1, minWidth: 50, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(77,168,108,.1)', color: 'var(--green)', border: '1px solid rgba(77,168,108,.3)' }}>剛好</button>
                </div>
                {+payAmount >= total && <div style={{ marginTop: 10, textAlign: 'center', padding: 12, background: 'rgba(77,168,108,.08)', borderRadius: 12, border: '1px solid rgba(77,168,108,.3)' }}><div style={{ fontSize: 12, color: 'var(--text-dim)' }}>找零</div><div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--green)' }}>${change.toLocaleString()}</div></div>}
              </div>
            )}
            <button onClick={doCheckout} disabled={submitting || (payMethod === 'cash' && cashPaid < total)} style={{ width: '100%', padding: 16, fontSize: 18, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #4da86c, #2d8a4e)', border: 'none', borderRadius: 14, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? .5 : 1 }}><CheckCircle2 size={20} /> {submitting ? '處理中...' : '確認結帳'}</button>
          </div>
        </div>
      )}

      {/* ═══ SUCCESS MODAL ═══ */}
      {lastOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setLastOrder(null)}>
          <div style={{ background: 'var(--black-card)', border: '2px solid rgba(77,168,108,.5)', borderRadius: 20, padding: 30, width: '100%', maxWidth: 380, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <CheckCircle2 size={48} color="var(--green)" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', marginBottom: 4 }}>結帳成功！</div>
            <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontWeight: 700, marginBottom: 16 }}>{lastOrder.order_no}</div>
            <div style={{ display: 'grid', gridTemplateColumns: lastOrder.change > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8, marginBottom: 20 }}>
              <div><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>應收</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>${lastOrder.total?.toLocaleString()}</div></div>
              <div><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>實收</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>${lastOrder.paid?.toLocaleString()}</div></div>
              {lastOrder.change > 0 && <div><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>找零</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>${lastOrder.change?.toLocaleString()}</div></div>}
            </div>
            <button onClick={() => setLastOrder(null)} style={{ padding: '12px 40px', fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'var(--gold)', border: 'none', borderRadius: 12, color: '#000' }}>完成</button>
          </div>
        </div>
      )}

      {/* ═══ SHIFT MODAL ═══ */}
      {showShift && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowShift(false)}>
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--border-gold)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            {!shift ? (<>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><LogIn size={20} /> 開班</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 6 }}>備用金金額</div>
              <input type="number" inputMode="numeric" value={shiftCash} onChange={e => setShiftCash(e.target.value)} style={{ width: '100%', fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: 'var(--black)', border: '2px solid var(--border-gold)', borderRadius: 12, color: 'var(--gold)', marginBottom: 16, boxSizing: 'border-box' }} />
              <button onClick={openShiftFn} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #4da86c, #2d8a4e)', border: 'none', borderRadius: 12, color: '#fff' }}>確認開班</button>
            </>) : (<>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><LogOutIcon size={20} /> 關班</div>
              <div style={{ background: 'var(--black)', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13, lineHeight: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-dim)' }}>開班人員</span><span>{shift.employee_name}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-dim)' }}>備用金</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>${(shift.opening_cash || 0).toLocaleString()}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-dim)' }}>今日營收</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>${(summary?.revenue?.total || 0).toLocaleString()}</span></div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 6 }}>現金盤點金額</div>
              <input type="number" inputMode="numeric" placeholder="盤點現金" value={closingCash} onChange={e => setClosingCash(e.target.value)} style={{ width: '100%', fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: 'var(--black)', border: '2px solid rgba(245,158,11,.4)', borderRadius: 12, color: '#f59e0b', marginBottom: 16, boxSizing: 'border-box' }} />
              <button onClick={closeShiftFn} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: 12, color: '#000' }}>確認關班</button>
            </>)}
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
              {cart.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.name}</div><div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>${c.price.toLocaleString()} × {c.qty}</div></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button onClick={() => updateQty(c.id, -1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--black)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={12} /></button>
                    <span style={{ width: 26, textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{c.qty}</span>
                    <button onClick={() => updateQty(c.id, 1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-gold)', background: 'var(--gold-glow)', color: 'var(--gold)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>
                  </div>
                  <span style={{ width: 60, textAlign: 'right', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>${(c.price * c.qty).toLocaleString()}</span>
                  <button onClick={() => removeItem(c.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                </div>
              ))}
              {!cart.length && <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontSize: 13 }}>購物車是空的</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, color: 'var(--gold)', padding: '12px 0' }}><span>應收</span><span style={{ fontFamily: 'var(--font-mono)' }}>${total.toLocaleString()}</span></div>
              <button onClick={() => { setShowMobileCart(false); cart.length > 0 && setShowCheckout(true) }} disabled={!cart.length} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: cart.length ? 'pointer' : 'not-allowed', background: cart.length ? 'linear-gradient(135deg, #c9a84c, #b8943f)' : 'var(--border)', border: 'none', borderRadius: 12, color: cart.length ? '#000' : 'var(--text-dim)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><CreditCard size={18} /> 結帳</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) { .pos-cart-panel { display: none !important; } .pos-cart-fab { display: flex !important; } .pos-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)) !important; } }
        @media (min-width: 1024px) { .pos-cart-panel { width: 380px !important; } .pos-grid { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)) !important; } }
      `}</style>
    </div>
  )
}
