import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Search, ShoppingCart, X, Plus, Minus, Trash2, CreditCard, DollarSign, ChevronLeft, CheckCircle2, LogIn, LogOut as LogOutIcon, Clock, LayoutGrid, List, User } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */
const PAY_METHODS = [
  { key: 'cash', label: '現金', icon: '💵', color: '#4da86c' },
  { key: 'card_acpay', label: 'ACPAY刷卡', icon: '💳', color: '#4d8ac4' },
  { key: 'card_teb', label: '臺企銀刷卡', icon: '🏦', color: '#8b6cc4' },
  { key: 'transfer', label: '銀行轉帳', icon: '🔄', color: '#c4a84d' },
  { key: 'wechat', label: '微信支付', icon: '💚', color: '#07c160' },
  { key: 'alipay', label: '支付寶', icon: '🔵', color: '#1677ff' },
]
const TABLES = ['1F四人位','1F六人位','B1包廂四人位','B1包廂大圓桌','B1沙發區','戶外區','外帶']
const QUICK_CASH = [100, 500, 1000, 2000, 3000, 5000]
const QTY_PRESETS = [1, 2, 3, 4, 5]

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

const TIER_STYLES = {
  '尊榮會員': { bg: 'rgba(155,89,182,.15)', color: '#9b59b6', border: '#9b59b6', label: '👑 尊榮', short: '尊榮' },
  '進階會員': { bg: 'rgba(201,168,76,.15)', color: '#c9a84c', border: '#c9a84c', label: '⭐ 進階', short: '進階' },
  '紳士俱樂部': { bg: 'rgba(149,165,166,.15)', color: '#95a5a6', border: '#95a5a6', label: '🎩 紳士', short: '紳士' },
  '非會員': { bg: 'transparent', color: '#666', border: '#333', label: '散客', short: '' },
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function deriveStock(cur, safe) { return cur <= 0 ? '缺貨' : cur <= (safe || 0) ? '少量' : '現貨' }

function classifyItem(name, category) {
  const n = (name || '').toLowerCase()
  if (category === '配件' || category === '營運耗材') return '雪茄配件'
  if (/奶茶|咖啡|拿鐵|espresso|latte|americano|濃縮咖啡/.test(n)) return '奶茶咖啡'
  if (/氣泡|可樂|雪碧|蘋果汁|可爾必思|礦泉水|coke|sprite|zero|蘇打/.test(n)) return '氣泡飲品'
  if (/茶/.test(n) && category === '吧台飲品') return '莊園品茗'
  if (/布朗|蒙布朗|佛卡夏|可頌|mont|brownie|focaccia|croissant|甜點|蛋糕/.test(n)) return '甜點'
  if (/滷味|炸物|水餃|雞湯|拼盤|鬆餅|薯條|三明治/.test(n) || category === '餐飲') return '餐食'
  if (category === '酒類') return '酒類'
  if (category === '吧台飲品') return '奶茶咖啡'
  return '餐食'
}

function isSoftDrink(name) {
  return /可樂|雪碧|蘋果汁|礦泉水|可爾必思|zero|coke|sprite/i.test(name || '')
}

function calcMemberDiscount(tier, cartItems) {
  if (!tier || tier.id === '非會員') return { discount: 0, details: [] }
  let totalDiscount = 0; const details = []
  cartItems.forEach(item => {
    let rate = 1.0
    if (tier.all_items_discount && tier.all_items_discount < 1) rate = tier.all_items_discount
    else if (item._cat === 'Capadura' && tier.capadura_discount < 1) rate = tier.capadura_discount
    else if (item._cat === '雪茄配件' && tier.accessory_discount < 1) rate = tier.accessory_discount
    else if (item._cat === '酒類' && tier.whisky_discount < 1) rate = tier.whisky_discount
    else if (tier.free_soft_drink && isSoftDrink(item.name)) rate = 0
    if (rate < 1) {
      const saved = Math.round(item.price * item.qty * (1 - rate))
      totalDiscount += saved
      details.push({ name: item.name, rate, saved })
    }
  })
  return { discount: totalDiscount, details }
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function StaffPOS() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // Data
  const [products, setProducts] = useState([])
  const [tiers, setTiers] = useState([])
  const [summary, setSummary] = useState(null)
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)

  // Cart
  const [cart, setCart] = useState([])

  // Checkout panel
  const [tableNo, setTableNo] = useState('')
  const [guestCount, setGuestCount] = useState(1)
  const [orderNote, setOrderNote] = useState('')
  const [discountPct, setDiscountPct] = useState(0)
  const [serviceFeePct, setServiceFeePct] = useState(0)
  const [invoiceEnabled, setInvoiceEnabled] = useState(false)
  const [taxId, setTaxId] = useState('')
  const [carrier, setCarrier] = useState('')

  // Customer / membership / attribution
  const [customer, setCustomer] = useState(null)
  const [customerTier, setCustomerTier] = useState(null)
  const [attributedTo, setAttributedTo] = useState('店內') // 老闆 / 老闆娘 / 店內
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [customerFilter, setCustomerFilter] = useState('all')
  const [customerSearching, setCustomerSearching] = useState(false)

  // Product panel
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [sortBy, setSortBy] = useState('menu')
  const [viewMode, setViewMode] = useState('grid')

  // Modals
  const [showCheckout, setShowCheckout] = useState(false)
  const [showShift, setShowShift] = useState(false)
  const [showMobileCart, setShowMobileCart] = useState(false)
  const [lastOrder, setLastOrder] = useState(null)
  const [upgradeInfo, setUpgradeInfo] = useState(null)
  const [detailProduct, setDetailProduct] = useState(null)
  const [detailQty, setDetailQty] = useState(1)
  const [detailNote, setDetailNote] = useState('')

  // Payment
  const [payMethod, setPayMethod] = useState('cash')
  const [payAmount, setPayAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Shift
  const [shiftCash, setShiftCash] = useState('10000')
  const [closingCash, setClosingCash] = useState('')

  /* ── Load ──────────────────────────────────────────────────────────────── */
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [prodR, sumR, shiftR, tiersR] = await Promise.all([
        supabase.rpc('pos_get_products'),
        supabase.rpc('pos_today_summary'),
        supabase.from('pos_shifts').select('*').eq('work_date', new Date().toISOString().slice(0, 10)).eq('status', 'open').order('opened_at', { ascending: false }).limit(1),
        supabase.from('membership_tiers').select('*').order('sort_order'),
      ])

      // Cigars
      let cigars = []
      const rpc = prodR.data?.products
      if (Array.isArray(rpc) && rpc.length > 0 && rpc[0].name) {
        cigars = rpc.map(p => ({ ...p, _src: 'cigar', _cat: p.brand === 'Capadura' ? 'Capadura' : '古巴雪茄', _price: p.suggest_price || p.price_a || 0, _stock: p.stock_status || '現貨' }))
      } else {
        const { data: dp } = await supabase.from('products').select('id, brand, name, spec, pack, price_a, suggest_price, image_url, stock_status, inv_master_id, sections').eq('is_active', true).order('sort_order', { ascending: true })
        cigars = (dp || []).map(p => ({ ...p, _src: 'cigar', _cat: p.brand === 'Capadura' ? 'Capadura' : '古巴雪茄', _price: p.suggest_price || p.price_a || 0, _stock: p.stock_status || '現貨' }))
      }

      // Bar / food / alcohol
      const { data: inv } = await supabase.from('inventory_master').select('id, name, category, current_stock, safe_stock, retail_price, image_url, unit').eq('enabled', true).in('category', ['吧台飲品', '餐飲', '酒類', '配件', '營運耗材']).gt('retail_price', 0)
      const bar = (inv || []).map(p => ({ id: p.id, name: p.name, brand: p.category, image_url: p.image_url || null, inv_master_id: p.id, _src: 'bar', _cat: classifyItem(p.name, p.category), _price: p.retail_price, _stock: deriveStock(p.current_stock, p.safe_stock) }))

      setProducts([...cigars, ...bar])
      if (tiersR.data) setTiers(tiersR.data)
      if (sumR.data) setSummary(sumR.data)
      if (shiftR.data?.[0]) setShift(shiftR.data[0])
    } catch (e) { console.error('POS load:', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  /* ── Customer search ──────────────────────────────────────────────────── */
  async function searchCustomers(q) {
    setCustomerSearching(true)
    let query = supabase.from('customers').select('id, name, phone, customer_type, membership_tier, total_spent').eq('enabled', true).order('total_spent', { ascending: false }).limit(50)
    if (q && q.trim()) query = query.or(`name.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%`)
    const { data } = await query
    setCustomerResults(data || [])
    setCustomerSearching(false)
  }

  useEffect(() => { if (showCustomerSearch) searchCustomers(customerQuery) }, [showCustomerSearch])

  function selectCustomer(c) {
    setCustomer(c)
    const t = tiers.find(t => t.id === c.membership_tier) || null
    setCustomerTier(t)
    setAttributedTo(c.belongs_to || '店內')
    setShowCustomerSearch(false)
  }

  function clearCustomer() { setCustomer(null); setCustomerTier(null); setAttributedTo('店內') }

  /* ── Filtered products ────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = products
    if (activeCategory !== 'all') list = list.filter(p => p._cat === activeCategory)
    if (search) { const kw = search.toLowerCase(); list = list.filter(p => [p.brand, p.name, p._cat].filter(Boolean).join(' ').toLowerCase().includes(kw)) }
    if (sortBy === 'menu') list = [...list].sort((a, b) => (CAT_ORDER[a._cat] ?? 99) - (CAT_ORDER[b._cat] ?? 99) || (a.name || '').localeCompare(b.name || ''))
    else if (sortBy === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else if (sortBy === 'price_desc') list = [...list].sort((a, b) => b._price - a._price)
    else if (sortBy === 'price_asc') list = [...list].sort((a, b) => a._price - b._price)
    return list
  }, [products, activeCategory, search, sortBy])

  /* ── Cart ──────────────────────────────────────────────────────────────── */
  function addToCart(product, qty, note) {
    if (product._stock === '缺貨' || product._price <= 0) return
    setCart(prev => {
      const idx = prev.findIndex(c => c.id === product.id)
      if (idx >= 0) { const a = [...prev]; a[idx] = { ...a[idx], qty: a[idx].qty + qty, note: note || a[idx].note }; return a }
      return [...prev, { id: product.id, name: product.name, brand: product.brand || '', price: product._price, qty, _cat: product._cat, inv_master_id: product.inv_master_id || null, note: note || '' }]
    })
  }
  function openDetail(p) { if (p._stock === '缺貨' || p._price <= 0) return; setDetailProduct(p); setDetailQty(1); setDetailNote('') }
  function updateQty(id, d) { setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + d) } : c)) }
  function removeItem(id) { setCart(prev => prev.filter(c => c.id !== id)) }
  function clearAll() { setCart([]); setDiscountPct(0); setServiceFeePct(0); setInvoiceEnabled(false); setTaxId(''); setCarrier(''); setOrderNote(''); clearCustomer(); setAttributedTo('店內') }

  /* ── Totals with member discount ──────────────────────────────────────── */
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)
  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const memberDiscount = useMemo(() => calcMemberDiscount(customerTier, cart), [customerTier, cart])
  const manualDiscountAmt = Math.round(subtotal * (discountPct / 100))
  const afterDiscount = subtotal - memberDiscount.discount - manualDiscountAmt
  const serviceFeeAmt = Math.round(afterDiscount * (serviceFeePct / 100))
  const total = Math.max(0, afterDiscount + serviceFeeAmt)
  const cashPaid = payMethod === 'cash' ? (+payAmount || 0) : 0
  const change = payMethod === 'cash' ? Math.max(0, cashPaid - total) : 0

  /* ── Checkout ─────────────────────────────────────────────────────────── */
  async function doCheckout() {
    if (!cart.length) return
    if (payMethod === 'cash' && cashPaid < total) return alert('現金不足')
    setSubmitting(true)
    try {
      const items = cart.map(c => ({ product_id: c.id, product_name: (c.brand ? c.brand + ' ' : '') + c.name, qty: c.qty, unit_price: c.price }))
      const { data, error } = await supabase.rpc('pos_checkout', {
        p_employee_id: user.employee_id || user.id, p_employee_name: user.name,
        p_items: items, p_payment_method: payMethod,
        p_payment_amount: payMethod === 'cash' ? +payAmount : total,
        p_discount: memberDiscount.discount + manualDiscountAmt,
        p_table_no: tableNo || null,
        p_vip_id: customer?.id || null,
        p_notes: [customer ? `客戶: ${customer.name}` : '', guestCount > 1 ? `人數: ${guestCount}` : '', serviceFeePct > 0 ? `服務費: ${serviceFeePct}%` : '', invoiceEnabled ? `統編: ${taxId} 載具: ${carrier}` : '', orderNote, ...cart.filter(c => c.note).map(c => `[${c.name}] ${c.note}`)].filter(Boolean).join(' | ') || null,
      })
      if (error || !data?.success) throw new Error(error?.message || data?.error || '結帳失敗')

      // Check member upgrade
      let upg = null
      if (customer) {
        try {
          await supabase.from('customers').update({ total_spent: (customer.total_spent || 0) + total }).eq('id', customer.id)
          const { data: upgData } = await supabase.rpc('pos_check_member_upgrade', { p_customer_id: customer.id })
          if (upgData?.upgraded) upg = upgData
        } catch (e) { console.warn('upgrade check failed:', e) }
      }

      // Update attribution
      try {
        await supabase.from('unified_orders').update({ attributed_to: customer ? (customer.belongs_to || '店內') : attributedTo }).eq('order_no', data.order_no)
      } catch (e) { console.warn('attribution update failed:', e) }

      setUpgradeInfo(upg)
      setLastOrder({ ...data, items: cart, payMethod, total, memberDiscount: memberDiscount.discount, paid: payMethod === 'cash' ? +payAmount : total, change: data.change ?? change, customerName: customer?.name })
      clearAll(); setPayAmount(''); setShowCheckout(false); setShowMobileCart(false); loadAll()
    } catch (e) { alert('結帳失敗: ' + e.message) }
    finally { setSubmitting(false) }
  }

  /* ── Shift ─────────────────────────────────────────────────────────────── */
  async function openShiftFn() {
    const { data } = await supabase.rpc('pos_open_shift', { p_employee_id: user.employee_id || user.id, p_employee_name: user.name, p_opening_cash: +(shiftCash || 0) })
    if (data?.success) { alert('開班成功！'); setShowShift(false); loadAll() } else alert('開班失敗: ' + (data?.error || ''))
  }
  async function closeShiftFn() {
    if (!shift) return
    const { data } = await supabase.rpc('pos_close_shift', { p_shift_id: shift.id, p_closing_cash: +(closingCash || 0) })
    if (data?.success) { alert('關班完成！差額: $' + (data.variance ?? 0)); setShowShift(false); setClosingCash(''); loadAll() } else alert('關班失敗: ' + (data?.error || ''))
  }

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0b09' }}><div className="loading-shimmer" style={{ width: 80, height: 80, borderRadius: '50%' }} /></div>

  const ts = customer ? (TIER_STYLES[customer.membership_tier] || TIER_STYLES['非會員']) : null

  /* ═══════════════════════════════════════════════════════════════════════
     PRODUCT CARD
     ═══════════════════════════════════════════════════════════════════════ */
  function PCard({ p }) {
    const inCart = cart.find(c => c.id === p.id)
    const isOut = p._stock === '缺貨'
    const isLow = p._stock === '少量'
    return (
      <button onClick={() => openDetail(p)} disabled={isOut}
        style={{ background: '#1a1714', border: inCart ? '1.5px solid rgba(201,168,76,.4)' : '1px solid #2a2520', borderRadius: 10, padding: 0, cursor: isOut ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: isOut ? .35 : 1, position: 'relative', overflow: 'hidden', pointerEvents: isOut ? 'none' : 'auto' }}>
        {inCart && <span style={{ position: 'absolute', top: 4, left: 4, zIndex: 2, background: '#c9a84c', color: '#000', borderRadius: '50%', width: 22, height: 22, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inCart.qty}</span>}
        {isOut && <span style={{ position: 'absolute', top: 4, right: 4, zIndex: 2, background: 'rgba(0,0,0,.75)', color: '#e74c3c', borderRadius: 6, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>售罄</span>}
        <div style={{ position: 'relative' }}>
          {p.image_url ? (
            <div style={{ aspectRatio: '4/3', background: '#0f0d0a', overflow: 'hidden' }}>
              <img src={p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
            </div>
          ) : (
            <div style={{ aspectRatio: '4/3', background: '#1a1714', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: '#2a2520' }}>{(p.brand || p.name || '?')[0]}</div>
          )}
          <span style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.7)', borderRadius: 6, padding: '2px 8px', fontSize: 13, fontWeight: 700, color: '#c9a84c', fontFamily: 'var(--font-mono)' }}>${p._price.toLocaleString()}</span>
        </div>
        <div style={{ padding: '6px 8px' }}>
          <div style={{ fontSize: 10, color: '#8a7e6e', marginBottom: 2 }}>{p.brand}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e8dcc8', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 28 }}>{p.name}</div>
          {isLow && !isOut && <div style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600, marginTop: 2 }}>庫存少</div>}
        </div>
      </button>
    )
  }

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0d0b09', color: '#e8dcc8' }}>
      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 50, minHeight: 50, borderBottom: '1px solid #2a2520', flexShrink: 0, background: '#1a1714' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2, padding: '4px 6px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}><ChevronLeft size={16} /> 返回</button>
        <div style={{ width: 1, height: 20, background: '#2a2520' }} />
        <DollarSign size={16} color="#c9a84c" />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#c9a84c' }}>POS 收銀</span>
        {shift && <span style={{ fontSize: 9, background: 'rgba(77,168,108,.15)', color: '#4da86c', padding: '2px 6px', borderRadius: 10 }}>營業中</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#8a7e6e' }}>{user?.name}</span>
        <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#8a7e6e' }}>
          <span>今日 <b style={{ color: '#c9a84c' }}>${(summary?.revenue?.total || 0).toLocaleString()}</b></span>
          <span><b style={{ color: '#4d8ac4' }}>{summary?.orders || 0}</b>單</span>
        </div>
        <button onClick={() => setShowShift(true)} style={{ background: 'none', border: '1px solid #2a2520', borderRadius: 6, padding: '3px 8px', fontSize: 10, color: '#8a7e6e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={11} /> {shift ? '關班' : '開班'}</button>
        <button className="pos-cart-fab" onClick={() => setShowMobileCart(true)} style={{ display: 'none', position: 'relative', background: '#c9a84c', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: '#000', fontWeight: 700, fontSize: 12 }}>
          <ShoppingCart size={14} />{cartCount > 0 && <span style={{ position: 'absolute', top: -5, right: -5, background: '#e74c3c', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cartCount}</span>}
        </button>
      </div>

      {/* MAIN SPLIT */}
      <div className="pos-main" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ═══ LEFT: PRODUCTS (60%) ═══ */}
        <div className="pos-products" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #2a2520' }}>
          <div style={{ padding: '5px 8px', borderBottom: '1px solid #2a2520', display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 100 }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#8a7e6e' }} />
              <input placeholder="搜尋…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', fontSize: 12, padding: '5px 6px 5px 28px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8' }} />
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ fontSize: 10, padding: '5px 4px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8' }}>
              {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} style={{ background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.3)', borderRadius: 6, padding: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {viewMode === 'grid' ? <List size={13} color="#c9a84c" /> : <LayoutGrid size={13} color="#c9a84c" />}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 2, padding: '3px 8px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid #2a2520' }}>
            {CATEGORIES.map(cat => (
              <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                style={{ padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: activeCategory === cat.key ? 'rgba(201,168,76,.15)' : 'transparent', color: activeCategory === cat.key ? '#c9a84c' : '#8a7e6e', border: activeCategory === cat.key ? '1px solid rgba(201,168,76,.3)' : '1px solid transparent' }}>{cat.label}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            {viewMode === 'grid' ? (
              <div className="pos-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
                {filtered.map(p => <PCard key={p.id} p={p} />)}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filtered.map(p => { const isOut = p._stock === '缺貨'; const inCart = cart.find(c => c.id === p.id); return (
                  <button key={p.id} onClick={() => openDetail(p)} disabled={isOut} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: inCart ? 'rgba(201,168,76,.08)' : '#1a1714', border: inCart ? '1.5px solid rgba(201,168,76,.3)' : '1px solid #2a2520', borderRadius: 10, cursor: isOut ? 'not-allowed' : 'pointer', opacity: isOut ? .35 : 1, textAlign: 'left', width: '100%', pointerEvents: isOut ? 'none' : 'auto', position: 'relative' }}>
                    {inCart && <span style={{ position: 'absolute', top: 4, right: 8, background: '#c9a84c', color: '#000', borderRadius: '50%', width: 20, height: 20, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inCart.qty}</span>}
                    <div style={{ width: 42, height: 42, borderRadius: 8, background: '#0f0d0a', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{p.image_url ? <img src={p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} /> : <span style={{ fontSize: 16, fontWeight: 900, color: '#2a2520' }}>{(p.brand || '?')[0]}</span>}</div>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, color: '#e8dcc8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div><div style={{ fontSize: 10, color: '#8a7e6e' }}>{p.brand}</div></div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#c9a84c', fontSize: 14, flexShrink: 0 }}>${p._price.toLocaleString()}</span>
                  </button>
                ) })}
              </div>
            )}
            {!filtered.length && <div style={{ textAlign: 'center', padding: 40, color: '#8a7e6e' }}>無符合商品</div>}
          </div>
          <div style={{ padding: '4px 8px', borderTop: '1px solid #2a2520', display: 'flex', gap: 3, justifyContent: 'center', flexShrink: 0 }}>
            {QTY_PRESETS.map(n => <button key={n} onClick={() => setDetailQty(n)} style={{ padding: '3px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: detailQty === n ? 'rgba(201,168,76,.15)' : '#0d0b09', color: detailQty === n ? '#c9a84c' : '#8a7e6e', border: detailQty === n ? '1px solid rgba(201,168,76,.3)' : '1px solid #2a2520' }}>×{n}</button>)}
          </div>
        </div>

        {/* ═══ RIGHT: CHECKOUT PANEL (40%) ═══ */}
        <div className="pos-cart-panel" style={{ width: 340, display: 'flex', flexDirection: 'column', background: '#1a1714', height: 'calc(100vh - 50px)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #2a2520', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#c9a84c', display: 'flex', alignItems: 'center', gap: 6 }}><ShoppingCart size={16} /> 購物車 ({cartCount})</span>
            {cart.length > 0 && <button onClick={clearAll} style={{ background: 'none', border: 'none', color: '#e74c3c', fontSize: 11, cursor: 'pointer' }}>清空</button>}
          </div>
          {/* Table + Customer */}
          <div style={{ padding: '6px 12px', borderBottom: '1px solid #2a2520', display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select value={tableNo} onChange={e => setTableNo(e.target.value)} style={{ flex: 1, fontSize: 11, padding: '5px 4px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8' }}>
                <option value="">桌位</option>{TABLES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input type="number" min={1} value={guestCount} onChange={e => setGuestCount(Math.max(1, +e.target.value || 1))} style={{ width: 40, fontSize: 11, padding: '5px 3px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', textAlign: 'center' }} />
            </div>
            {/* Customer selection */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {!customer ? (<>
                <button onClick={() => { setCustomer(null); setCustomerTier(null) }} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: !customer ? 'rgba(201,168,76,.15)' : '#0d0b09', color: !customer ? '#c9a84c' : '#8a7e6e', border: !customer ? '1px solid rgba(201,168,76,.3)' : '1px solid #2a2520' }}>散客</button>
                <button onClick={() => { setShowCustomerSearch(true); setCustomerQuery('') }} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: '#0d0b09', color: '#8a7e6e', border: '1px solid #2a2520', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><User size={12} /> 選取會員</button>
              </>) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: ts?.bg, border: `1px solid ${ts?.border}`, borderRadius: 8, padding: '4px 8px' }}>
                  <User size={14} color={ts?.color} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#e8dcc8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.name}</div>
                    <div style={{ fontSize: 9, color: ts?.color }}>{ts?.label} · 累計${(customer.total_spent || 0).toLocaleString()}</div>
                  </div>
                  <button onClick={clearCustomer} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer', padding: 2 }}><X size={14} /></button>
                </div>
              )}
            </div>
            {/* Attribution — only show for walk-in (customer auto-fills from belongs_to) */}
            {!customer && (
              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: '#8a7e6e', whiteSpace: 'nowrap' }}>業績歸屬</span>
                {['老闆', '老闆娘', '店內'].map(a => (
                  <button key={a} onClick={() => setAttributedTo(a)} style={{ flex: 1, padding: '3px 0', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: attributedTo === a ? 'rgba(201,168,76,.15)' : '#0d0b09', color: attributedTo === a ? '#c9a84c' : '#8a7e6e', border: attributedTo === a ? '1px solid rgba(201,168,76,.3)' : '1px solid #2a2520' }}>{a}</button>
                ))}
              </div>
            )}
            {customer && customer.belongs_to && (
              <div style={{ fontSize: 9, color: '#8a7e6e' }}>業績歸屬：<span style={{ color: '#c9a84c' }}>{customer.belongs_to}</span></div>
            )}
          </div>
          {/* Cart items + settings — scrollable middle area */}
          <div style={{ flex: '1 1 0', overflowY: 'scroll', padding: '4px 12px', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
            {!cart.length ? <div style={{ textAlign: 'center', padding: 40, color: '#8a7e6e', fontSize: 13 }}>點選商品加入購物車</div> : cart.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #2a2520' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#e8dcc8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: '#8a7e6e', fontFamily: 'var(--font-mono)' }}>${c.price.toLocaleString()} × {c.qty}{c.note ? ` · ${c.note}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button onClick={() => updateQty(c.id, -1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #2a2520', background: '#0d0b09', color: '#e8dcc8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={11} /></button>
                  <span style={{ width: 22, textAlign: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#e8dcc8' }}>{c.qty}</span>
                  <button onClick={() => updateQty(c.id, 1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(201,168,76,.3)', background: 'rgba(201,168,76,.1)', color: '#c9a84c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={11} /></button>
                </div>
                <span style={{ width: 54, textAlign: 'right', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#c9a84c' }}>${(c.price * c.qty).toLocaleString()}</span>
                <button onClick={() => removeItem(c.id)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: 2 }}><Trash2 size={13} /></button>
              </div>
            ))}
            {/* Member discount detail lines */}
            {memberDiscount.details.length > 0 && <div style={{ padding: '6px 0', borderBottom: '1px solid #2a2520' }}>
              {memberDiscount.details.map((d, i) => <div key={i} style={{ fontSize: 10, color: '#9b59b6', display: 'flex', justifyContent: 'space-between' }}><span>{d.name} · {d.rate === 0 ? '免費' : `${Math.round(d.rate * 100) / 10}折`}</span><span>-${d.saved.toLocaleString()}</span></div>)}
            </div>}
            {/* Discount / invoice / note — inside scroll area so they don't eat bottom space */}
            {cart.length > 0 && <div style={{ padding: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid #2a2520', marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 8, color: '#8a7e6e' }}>折扣%</div><input type="number" min={0} max={100} value={discountPct || ''} onChange={e => setDiscountPct(Math.min(100, Math.max(0, +e.target.value || 0)))} placeholder="0" style={{ width: '100%', fontSize: 11, padding: '3px 4px', fontFamily: 'var(--font-mono)', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8' }} /></div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 8, color: '#8a7e6e' }}>服務費%</div><input type="number" min={0} max={100} value={serviceFeePct || ''} onChange={e => setServiceFeePct(Math.min(100, Math.max(0, +e.target.value || 0)))} placeholder="0" style={{ width: '100%', fontSize: 11, padding: '3px 4px', fontFamily: 'var(--font-mono)', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8' }} /></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#8a7e6e', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}><input type="checkbox" checked={invoiceEnabled} onChange={e => setInvoiceEnabled(e.target.checked)} /> 開發票</label>
              </div>
              {invoiceEnabled && <div style={{ display: 'flex', gap: 4 }}><input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="統一編號" style={{ flex: 1, fontSize: 10, padding: '3px 4px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8' }} /><input value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="載具" style={{ flex: 1, fontSize: 10, padding: '3px 4px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8' }} /></div>}
              <input value={orderNote} onChange={e => setOrderNote(e.target.value)} placeholder="備註…" style={{ width: '100%', fontSize: 10, padding: '3px 4px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8' }} />
            </div>}
          </div>
          {/* FIXED BOTTOM — totals + buttons, never scrolls */}
          <div style={{ flexShrink: 0, flexGrow: 0, borderTop: '2px solid rgba(201,168,76,.4)', background: '#0d0b09', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8a7e6e' }}><span>共 {cartCount} 件</span><span style={{ fontFamily: 'var(--font-mono)' }}>${subtotal.toLocaleString()}</span></div>
            {memberDiscount.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9b59b6' }}><span>會員折扣</span><span>-${memberDiscount.discount.toLocaleString()}</span></div>}
            {manualDiscountAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#f59e0b' }}><span>折扣 {discountPct}%</span><span>-${manualDiscountAmt.toLocaleString()}</span></div>}
            {serviceFeeAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8a7e6e' }}><span>服務費</span><span>+${serviceFeeAmt.toLocaleString()}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, color: '#c9a84c', padding: '2px 0' }}><span>應收</span><span style={{ fontFamily: 'var(--font-mono)' }}>${total.toLocaleString()}</span></div>
            <button onClick={() => { if (cart.length) setShowCheckout(true) }} disabled={!cart.length} style={{ width: '100%', padding: 12, fontSize: 15, fontWeight: 700, cursor: cart.length ? 'pointer' : 'not-allowed', background: cart.length ? 'linear-gradient(135deg, #c9a84c, #b8943f)' : '#2a2520', border: 'none', borderRadius: 10, color: cart.length ? '#000' : '#8a7e6e', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CreditCard size={16} /> 結帳 ${total.toLocaleString()}</button>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => alert('暫存功能開發中')} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: 'rgba(37,99,235,.1)', color: '#60a5fa', border: '1px solid rgba(37,99,235,.3)' }}>暫存</button>
              <button onClick={() => alert('空訂單功能開發中')} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: 'rgba(161,98,7,.1)', color: '#fbbf24', border: '1px solid rgba(161,98,7,.3)' }}>空訂單</button>
              <button onClick={clearAll} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: '#0d0b09', color: '#e74c3c', border: '1px solid rgba(231,76,60,.3)' }}>清除</button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ CUSTOMER SEARCH MODAL ═══ */}
      {showCustomerSearch && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowCustomerSearch(false)}>
        <div style={{ background: '#1a1714', border: '1px solid rgba(201,168,76,.3)', borderRadius: 20, padding: 20, width: '100%', maxWidth: 440, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#c9a84c', display: 'flex', alignItems: 'center', gap: 6 }}><User size={18} /> 選取客戶</span>
            <button onClick={() => setShowCustomerSearch(false)} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer' }}><X size={20} /></button>
          </div>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8a7e6e' }} />
            <input placeholder="搜尋姓名 / 電話…" value={customerQuery} onChange={e => { setCustomerQuery(e.target.value); searchCustomers(e.target.value) }} autoFocus style={{ width: '100%', fontSize: 13, padding: '8px 10px 8px 32px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 10, color: '#e8dcc8', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {['all', '尊榮會員', '進階會員', '紳士俱樂部'].map(f => (
              <button key={f} onClick={() => setCustomerFilter(f)} style={{ padding: '3px 10px', borderRadius: 10, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: customerFilter === f ? 'rgba(201,168,76,.15)' : 'transparent', color: customerFilter === f ? '#c9a84c' : '#8a7e6e', border: customerFilter === f ? '1px solid rgba(201,168,76,.3)' : '1px solid transparent' }}>
                {f === 'all' ? '全部' : TIER_STYLES[f]?.short || f}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {customerSearching ? <div style={{ textAlign: 'center', padding: 20, color: '#8a7e6e' }}>搜尋中…</div> :
              customerResults.filter(c => customerFilter === 'all' || c.membership_tier === customerFilter).map(c => {
                const s = TIER_STYLES[c.membership_tier] || TIER_STYLES['非會員']
                return (
                  <button key={c.id} onClick={() => selectCustomer(c)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#0d0b09', border: `1px solid ${s.border}40`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', marginBottom: 6 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: s.bg, border: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={16} color={s.color} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#e8dcc8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: '#8a7e6e' }}>{c.phone || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: '2px 6px' }}>{s.label}</span>
                      <div style={{ fontSize: 10, color: '#8a7e6e', marginTop: 2, fontFamily: 'var(--font-mono)' }}>${(c.total_spent || 0).toLocaleString()}</div>
                    </div>
                  </button>
                )
              })
            }
          </div>
        </div>
      </div>}

      {/* ═══ PRODUCT DETAIL MODAL ═══ */}
      {detailProduct && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setDetailProduct(null)}>
        <div style={{ background: '#1a1714', border: '1px solid rgba(201,168,76,.3)', borderRadius: 20, width: '100%', maxWidth: 400, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
          {detailProduct.image_url ? <div style={{ height: 200, background: '#0f0d0a', overflow: 'hidden' }}><img src={detailProduct.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
          : <div style={{ height: 120, background: '#0f0d0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, fontWeight: 900, color: '#2a2520' }}>{(detailProduct.brand || detailProduct.name || '?')[0]}</div>}
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: '#8a7e6e', marginBottom: 4 }}>{detailProduct.brand}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e8dcc8', marginBottom: 4, lineHeight: 1.3 }}>{detailProduct.name}</div>
            <div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#c9a84c', marginBottom: 4 }}>${detailProduct._price.toLocaleString()}</div>
            {detailProduct._stock === '少量' && <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8 }}>庫存少</div>}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '12px 0' }}>
              <button onClick={() => setDetailQty(q => Math.max(1, q - 1))} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a2520', background: '#0d0b09', color: '#e8dcc8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={18} /></button>
              <span style={{ fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#e8dcc8', width: 50, textAlign: 'center' }}>{detailQty}</span>
              <button onClick={() => setDetailQty(q => q + 1)} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid rgba(201,168,76,.3)', background: 'rgba(201,168,76,.1)', color: '#c9a84c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={18} /></button>
            </div>
            <input value={detailNote} onChange={e => setDetailNote(e.target.value)} placeholder="備註（去冰、少糖...）" style={{ width: '100%', fontSize: 12, padding: '8px 10px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', marginBottom: 14, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDetailProduct(null)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #2a2520', background: '#0d0b09', color: '#8a7e6e', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>取消</button>
              <button onClick={() => { addToCart(detailProduct, detailQty, detailNote); setDetailProduct(null) }} style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #c9a84c, #b8943f)', color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ShoppingCart size={16} /> 加入 · ${(detailProduct._price * detailQty).toLocaleString()}</button>
            </div>
          </div>
        </div>
      </div>}

      {/* ═══ CHECKOUT MODAL ═══ */}
      {showCheckout && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowCheckout(false)}>
        <div style={{ background: '#1a1714', border: '1px solid rgba(201,168,76,.3)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><span style={{ fontSize: 18, fontWeight: 700, color: '#c9a84c' }}>💰 結帳</span><button onClick={() => setShowCheckout(false)} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer' }}><X size={20} /></button></div>
          <div style={{ background: '#0d0b09', borderRadius: 12, padding: 12, marginBottom: 14 }}>
            {cart.map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#e8dcc8' }}><span>{c.name} ×{c.qty}</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${(c.price * c.qty).toLocaleString()}</span></div>)}
            {memberDiscount.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#9b59b6' }}><span>會員折扣</span><span>-${memberDiscount.discount.toLocaleString()}</span></div>}
            {manualDiscountAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#f59e0b' }}><span>手動折扣</span><span>-${manualDiscountAmt.toLocaleString()}</span></div>}
            {serviceFeeAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#8a7e6e' }}><span>服務費</span><span>+${serviceFeeAmt.toLocaleString()}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: '#c9a84c', borderTop: '1px solid rgba(201,168,76,.3)', marginTop: 6, paddingTop: 8 }}><span>應收</span><span style={{ fontFamily: 'var(--font-mono)' }}>${total.toLocaleString()}</span></div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8a7e6e', marginBottom: 6 }}>支付方式</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
            {PAY_METHODS.map(m => <button key={m.key} onClick={() => { setPayMethod(m.key); if (m.key !== 'cash') setPayAmount('') }} style={{ padding: '10px 6px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center', background: payMethod === m.key ? m.color + '18' : '#0d0b09', color: payMethod === m.key ? m.color : '#8a7e6e', border: payMethod === m.key ? '2px solid ' + m.color : '1px solid #2a2520' }}><div style={{ fontSize: 20 }}>{m.icon}</div>{m.label}</button>)}
          </div>
          {payMethod === 'cash' && <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#8a7e6e', marginBottom: 6 }}>收取金額</div>
            <input type="number" inputMode="numeric" placeholder="輸入金額" value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus style={{ width: '100%', fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: '#0d0b09', border: '2px solid rgba(201,168,76,.3)', borderRadius: 12, color: '#c9a84c', marginBottom: 8, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {QUICK_CASH.map(v => <button key={v} onClick={() => setPayAmount(String(v))} style={{ flex: 1, minWidth: 50, padding: '8px 4px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: +payAmount === v ? 'rgba(201,168,76,.15)' : '#0d0b09', color: +payAmount === v ? '#c9a84c' : '#8a7e6e', border: +payAmount === v ? '1px solid rgba(201,168,76,.3)' : '1px solid #2a2520' }}>${v.toLocaleString()}</button>)}
              <button onClick={() => setPayAmount(String(total))} style={{ flex: 1, minWidth: 50, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(77,168,108,.1)', color: '#4da86c', border: '1px solid rgba(77,168,108,.3)' }}>剛好</button>
            </div>
            {+payAmount >= total && <div style={{ marginTop: 10, textAlign: 'center', padding: 12, background: 'rgba(77,168,108,.08)', borderRadius: 12, border: '1px solid rgba(77,168,108,.3)' }}><div style={{ fontSize: 12, color: '#8a7e6e' }}>找零</div><div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#4da86c' }}>${change.toLocaleString()}</div></div>}
          </div>}
          <button onClick={doCheckout} disabled={submitting || (payMethod === 'cash' && cashPaid < total)} style={{ width: '100%', padding: 16, fontSize: 18, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #4da86c, #2d8a4e)', border: 'none', borderRadius: 14, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? .5 : 1 }}><CheckCircle2 size={20} /> {submitting ? '處理中...' : '確認結帳'}</button>
        </div>
      </div>}

      {/* ═══ SUCCESS MODAL ═══ */}
      {lastOrder && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => { setLastOrder(null); setUpgradeInfo(null) }}>
        <div style={{ background: '#1a1714', border: '2px solid rgba(77,168,108,.5)', borderRadius: 20, padding: 30, width: '100%', maxWidth: 400, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <CheckCircle2 size={48} color="#4da86c" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: '#4da86c', marginBottom: 4 }}>結帳成功！</div>
          <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: '#c9a84c', fontWeight: 700, marginBottom: 12 }}>{lastOrder.order_no}</div>
          {lastOrder.customerName && <div style={{ fontSize: 12, color: '#8a7e6e', marginBottom: 4 }}>客戶：{lastOrder.customerName}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: lastOrder.change > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8, marginBottom: 12, background: '#0d0b09', borderRadius: 12, padding: 12 }}>
            <div><div style={{ fontSize: 10, color: '#8a7e6e' }}>應收</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#c9a84c' }}>${lastOrder.total?.toLocaleString()}</div></div>
            <div><div style={{ fontSize: 10, color: '#8a7e6e' }}>實收</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#e8dcc8' }}>${lastOrder.paid?.toLocaleString()}</div></div>
            {lastOrder.change > 0 && <div><div style={{ fontSize: 10, color: '#8a7e6e' }}>找零</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#4da86c' }}>${lastOrder.change?.toLocaleString()}</div></div>}
          </div>
          {lastOrder.memberDiscount > 0 && <div style={{ fontSize: 12, color: '#9b59b6', marginBottom: 8 }}>會員折扣 -${lastOrder.memberDiscount.toLocaleString()}</div>}
          {upgradeInfo && <div style={{ background: 'rgba(155,89,182,.1)', border: '1px solid rgba(155,89,182,.3)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#9b59b6' }}>🎉 恭喜升級！</div>
            <div style={{ fontSize: 13, color: '#e8dcc8', marginTop: 4 }}>{lastOrder.customerName} 已升級為</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#c9a84c', marginTop: 2 }}>「{upgradeInfo.new_tier}」</div>
          </div>}
          <button onClick={() => { setLastOrder(null); setUpgradeInfo(null) }} style={{ padding: '12px 40px', fontSize: 16, fontWeight: 700, cursor: 'pointer', background: '#c9a84c', border: 'none', borderRadius: 12, color: '#000' }}>完成</button>
        </div>
      </div>}

      {/* ═══ SHIFT MODAL ═══ */}
      {showShift && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowShift(false)}>
        <div style={{ background: '#1a1714', border: '1px solid rgba(201,168,76,.3)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
          {!shift ? (<>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#c9a84c', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><LogIn size={20} /> 開班</div>
            <div style={{ fontSize: 13, color: '#8a7e6e', marginBottom: 6 }}>備用金金額</div>
            <input type="number" inputMode="numeric" value={shiftCash} onChange={e => setShiftCash(e.target.value)} style={{ width: '100%', fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: '#0d0b09', border: '2px solid rgba(201,168,76,.3)', borderRadius: 12, color: '#c9a84c', marginBottom: 16, boxSizing: 'border-box' }} />
            <button onClick={openShiftFn} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #4da86c, #2d8a4e)', border: 'none', borderRadius: 12, color: '#fff' }}>確認開班</button>
          </>) : (<>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><LogOutIcon size={20} /> 關班</div>
            <div style={{ background: '#0d0b09', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13, lineHeight: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#8a7e6e' }}>開班人員</span><span>{shift.employee_name}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#8a7e6e' }}>備用金</span><span style={{ fontFamily: 'var(--font-mono)', color: '#c9a84c' }}>${(shift.opening_cash || 0).toLocaleString()}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#8a7e6e' }}>今日營收</span><span style={{ fontFamily: 'var(--font-mono)', color: '#4da86c' }}>${(summary?.revenue?.total || 0).toLocaleString()}</span></div>
            </div>
            <div style={{ fontSize: 13, color: '#8a7e6e', marginBottom: 6 }}>現金盤點金額</div>
            <input type="number" inputMode="numeric" placeholder="盤點現金" value={closingCash} onChange={e => setClosingCash(e.target.value)} style={{ width: '100%', fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: '#0d0b09', border: '2px solid rgba(245,158,11,.4)', borderRadius: 12, color: '#f59e0b', marginBottom: 16, boxSizing: 'border-box' }} />
            <button onClick={closeShiftFn} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: 12, color: '#000' }}>確認關班</button>
          </>)}
        </div>
      </div>}

      {/* ═══ MOBILE CART DRAWER ═══ */}
      {showMobileCart && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={() => setShowMobileCart(false)}>
        <div style={{ background: '#1a1714', borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflow: 'auto', border: '1px solid rgba(201,168,76,.3)', borderBottom: 'none' }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a2520', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#1a1714', zIndex: 1 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#c9a84c' }}>購物車 ({cartCount})</span>
            <button onClick={() => setShowMobileCart(false)} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer' }}><X size={20} /></button>
          </div>
          <div style={{ padding: '8px 16px' }}>
            {cart.map(c => <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #2a2520' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: '#e8dcc8' }}>{c.name}</div><div style={{ fontSize: 11, color: '#8a7e6e', fontFamily: 'var(--font-mono)' }}>${c.price.toLocaleString()} × {c.qty}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button onClick={() => updateQty(c.id, -1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #2a2520', background: '#0d0b09', color: '#e8dcc8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={12} /></button>
                <span style={{ width: 26, textAlign: 'center', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#e8dcc8' }}>{c.qty}</span>
                <button onClick={() => updateQty(c.id, 1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(201,168,76,.3)', background: 'rgba(201,168,76,.1)', color: '#c9a84c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>
              </div>
              <span style={{ width: 60, textAlign: 'right', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#c9a84c' }}>${(c.price * c.qty).toLocaleString()}</span>
              <button onClick={() => removeItem(c.id)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer' }}><Trash2 size={14} /></button>
            </div>)}
            {!cart.length && <div style={{ textAlign: 'center', padding: 24, color: '#8a7e6e', fontSize: 13 }}>購物車是空的</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, color: '#c9a84c', padding: '12px 0' }}><span>應收</span><span style={{ fontFamily: 'var(--font-mono)' }}>${total.toLocaleString()}</span></div>
            <button onClick={() => { if (!cart.length) return; setShowMobileCart(false); setTimeout(() => setShowCheckout(true), 100) }} disabled={!cart.length} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: cart.length ? 'pointer' : 'not-allowed', background: cart.length ? 'linear-gradient(135deg, #c9a84c, #b8943f)' : '#2a2520', border: 'none', borderRadius: 12, color: cart.length ? '#000' : '#8a7e6e', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><CreditCard size={18} /> 結帳</button>
          </div>
        </div>
      </div>}

      <style>{`
        @media (max-width: 768px) { .pos-cart-panel { display: none !important; } .pos-cart-fab { display: flex !important; } .pos-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (min-width: 1024px) { .pos-cart-panel { width: 380px !important; } .pos-grid { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)) !important; } }
      `}</style>
    </div>
  )
}
