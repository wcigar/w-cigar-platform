/**
 * POS Checkout — 主結帳頁面
 * - 從 StaffPOS 抽取核心邏輯
 * - 使用 pos_checkout_v2 RPC（含改價驗證）
 * - Fallback 到 pos_checkout（v2 尚未建立時）
 * - iPad 橫屏優化
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { printReceipt, printKitchen, openDrawer } from '../../utils/printer'
import VipCheckoutBridge from '../../components/VipCheckoutBridge'
import {
  Search, ShoppingCart, X, Plus, Minus, Trash2, CreditCard, DollarSign,
  ChevronUp, ChevronDown, CheckCircle2, LogIn, LogOut as LogOutIcon,
  Clock, User, Edit2,
} from 'lucide-react'
import {
  PAY_METHODS, TABLES, QUICK_CASH, QTY_PRESETS, CATEGORIES, CAT_ORDER,
  SORTS, TIER_STYLES, deriveStock, classifyItem, isSoftDrink, isDrink,
  DRINK_CATS, calcMemberDiscount, scoreSearch, sortProducts, todayTaipei,
} from './posUtils'

const STORE_ID = import.meta.env.VITE_STORE_ID || 'DA_AN'

const SECTION_CATEGORY_MAP = {
  cuban:      '古巴雪茄',
  exclusive:  '獨家雪茄',
  capadura:   'Capadura',
  monthly:    '月推薦',
  hot:        '熱賣',
  '熱賣專區': '熱賣',
  mini:       '迷你雪茄',
  preorder:   '預購',
}

export default function PosCheckout({ session, shift, onShiftChange, onCartCountChange, onHeldCountChange, showHeldFromLayout, onHeldFromLayoutDone, showOrdersFromLayout, onOrdersFromLayoutDone }) {
  // Responsive
  const [winW, setWinW] = useState(window.innerWidth)
  useEffect(() => {
    const h = () => setWinW(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  const isMobile = winW < 768
  const isTablet = winW >= 768 && winW < 1280

  // Data
  const [products, setProducts] = useState([])
  const [tiers, setTiers] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  // Cart
  const [cart, setCart] = useState([])
  const [tableNo, setTableNo] = useState('')
  const [guestCount, setGuestCount] = useState(1)
  const [orderNote, setOrderNote] = useState('')
  const [discountPct, setDiscountPct] = useState(0)
  const [serviceFeePct, setServiceFeePct] = useState(0)
  const [invoiceEnabled, setInvoiceEnabled] = useState(false)
  const [taxId, setTaxId] = useState('')
  const [carrier, setCarrier] = useState('')

  // Customer
  const [customer, setCustomer] = useState(null)
  const [customerTier, setCustomerTier] = useState(null)
  const [attributedTo, setAttributedTo] = useState('店內')
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [customerFilter, setCustomerFilter] = useState('all')
  const [customerSearching, setCustomerSearching] = useState(false)

  // UI
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [sortBy, setSortBy] = useState('menu')
  const [showCheckout, setShowCheckout] = useState(false)
  const [showMobileCart, setShowMobileCart] = useState(false)
  const [lastOrder, setLastOrder] = useState(null)
  const [upgradeInfo, setUpgradeInfo] = useState(null)
  const [detailProduct, setDetailProduct] = useState(null)
  const [detailQty, setDetailQty] = useState(1)
  const [detailNote, setDetailNote] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payAmount, setPayAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showShift, setShowShift] = useState(false)
  const [shiftCash, setShiftCash] = useState('10000')
  const [closingCash, setClosingCash] = useState('')

  // Quick add customer
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [newCust, setNewCust] = useState({ name: '', phone: '', belongs_to: '店內', notes: '' })

  // Price override
  const [editPriceId, setEditPriceId] = useState(null)
  const [editPriceVal, setEditPriceVal] = useState('')
  const [editPriceReason, setEditPriceReason] = useState('')
  const [showVipBridge, setShowVipBridge] = useState(false)
  const [isBirthday, setIsBirthday] = useState(false)
  const canOverridePrice = session?.is_admin === true

  // Hold orders
  const [heldOrders, setHeldOrders] = useState([])
  const [showHeldModal, setShowHeldModal] = useState(false)
  // Today orders
  const [todayOrders, setTodayOrders] = useState([])
  const [showOrdersModal, setShowOrdersModal] = useState(false)
  // Void
  const [voidingOrder, setVoidingOrder] = useState(null)
  const [voidReason, setVoidReason] = useState('')

  // ── Load data ──
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const today = todayTaipei()
      const [prodR, sumR, shiftR, tiersR] = await Promise.all([
        supabase.rpc('pos_get_products'),
        supabase.rpc('pos_today_summary'),
        supabase.from('pos_shifts').select('*').eq('work_date', today).eq('status', 'open').order('opened_at', { ascending: false }).limit(1),
        supabase.from('membership_tiers').select('*').order('sort_order'),
      ])
      let cigars = []
      const rpc = prodR.data?.products
      if (Array.isArray(rpc) && rpc.length > 0 && rpc[0].name) {
        cigars = rpc.map(p => ({ ...p, _src: 'cigar', _cat: p.brand === 'Capadura' ? 'Capadura' : (SECTION_CATEGORY_MAP[p.sections?.[0]] || classifyItem(p.name, p.category) || '古巴雪茄'), _price: p.suggest_price || p.price_a || 0, _stock: p.stock_status || '現貨' }))
      } else {
        const { data: dp } = await supabase.from('products').select('id, brand, name, spec, price_a, suggest_price, image_url, stock_status, inv_master_id').eq('is_active', true).order('sort_order', { ascending: true })
        cigars = (dp || []).map(p => ({ ...p, _src: 'cigar', _cat: p.brand === 'Capadura' ? 'Capadura' : (SECTION_CATEGORY_MAP[p.sections?.[0]] || classifyItem(p.name, p.category) || '古巴雪茄'), _price: p.suggest_price || p.price_a || 0, _stock: p.stock_status || '現貨' }))
      }
      const { data: inv } = await supabase.from('inventory_master').select('id, name, category, current_stock, safe_stock, retail_price, image_url').eq('enabled', true).in('category', ['吧台飲品', '餐飲', '酒類', '配件', '營運耗材']).gt('retail_price', 0)
      const bar = (inv || []).map(p => ({ id: p.id, name: p.name, brand: p.category, image_url: p.image_url, inv_master_id: p.id, _src: 'bar', _cat: classifyItem(p.name, p.category), _price: p.retail_price, _stock: deriveStock(p.current_stock, p.safe_stock) }))
      setProducts([...cigars, ...bar])
      if (tiersR.data) setTiers(tiersR.data)
      if (sumR.data) setSummary(sumR.data)
      if (shiftR.data?.[0]) onShiftChange(shiftR.data[0])
    } catch (e) { console.error('POS load:', e) }
    finally { setLoading(false) }
  }, [onShiftChange])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { onCartCountChange?.(cart.reduce((s, c) => s + c.qty, 0)) }, [cart, onCartCountChange])

  // ── Hold Orders ──
  async function loadHeldOrders() {
    const { data } = await supabase.from('pos_held_orders').select('*').eq('status', 'held').order('created_at', { ascending: false })
    setHeldOrders(data || []); onHeldCountChange?.(data?.length || 0)
  }
  useEffect(() => { loadHeldOrders() }, [])
  useEffect(() => { if (showHeldFromLayout) { loadHeldOrders(); setShowHeldModal(true); onHeldFromLayoutDone?.() } }, [showHeldFromLayout])
  useEffect(() => { if (showOrdersFromLayout) { loadTodayOrders(); setShowOrdersModal(true); onOrdersFromLayoutDone?.() } }, [showOrdersFromLayout])

  async function holdCurrentOrder() {
    if (!cart.length) return alert('購物車是空的')
    const { error } = await supabase.from('pos_held_orders').insert({ table_no: tableNo || null, customer_id: customer?.id || null, customer_name: customer?.name || null, customer_tier: customer?.membership_tier || null, attributed_to: customer?.belongs_to || attributedTo, items_json: cart.map(c => ({ id: c.id, name: c.name, brand: c.brand, price: c.price, _originalPrice: c._originalPrice, qty: c.qty, _cat: c._cat, inv_master_id: c.inv_master_id, note: c.note, _overridden: c._overridden })), cart_count: cartCount, subtotal, discount_pct: discountPct, service_fee_pct: serviceFeePct, notes: orderNote || null, held_by: session?.operator_id || 'UNKNOWN', held_by_name: session?.name || 'UNKNOWN' })
    if (error) return alert('暫存失敗: ' + error.message)
    clearAll(); loadHeldOrders(); alert('✅ 已掛單暫存')
  }

  async function resumeHeldOrder(held) {
    setCart((held.items_json || []).map(c => ({ ...c, price: c.price || 0, qty: c.qty || 1 })))
    setTableNo(held.table_no || '')
    if (held.customer_id && held.customer_name) { setCustomer({ id: held.customer_id, name: held.customer_name, membership_tier: held.customer_tier, belongs_to: held.attributed_to }); setCustomerTier(tiers.find(t => t.id === held.customer_tier) || null) }
    setAttributedTo(held.attributed_to || '店內'); setDiscountPct(held.discount_pct || 0); setServiceFeePct(held.service_fee_pct || 0); setOrderNote(held.notes || '')
    await supabase.from('pos_held_orders').update({ status: 'resumed', resumed_by: session?.operator_id, resumed_at: new Date().toISOString() }).eq('id', held.id)
    loadHeldOrders(); setShowHeldModal(false); setShowMobileCart(false)
  }

  async function cancelHeldOrder(held) { if (!confirm('確定取消此掛單？')) return; await supabase.from('pos_held_orders').update({ status: 'cancelled' }).eq('id', held.id); loadHeldOrders() }

  // ── Today Orders ──
  async function loadTodayOrders() {
    const td = todayTaipei()
    const { data } = await supabase.from('unified_orders').select('*').in('channel', ['store', 'pos-v2']).gte('created_at', td + 'T00:00:00').lte('created_at', td + 'T23:59:59').order('created_at', { ascending: false })
    setTodayOrders(data || [])
  }

  // ── Void ──
  async function doVoidOrder() {
    if (!voidingOrder || !voidReason.trim()) return alert('請輸入作廢原因')
    const { data, error } = await supabase.rpc('pos_void_order', { p_order_no: voidingOrder.order_no, p_admin_id: session?.operator_id, p_admin_name: session?.name, p_reason: voidReason.trim() })
    if (error || !data?.success) return alert('作廢失敗: ' + (data?.error || error?.message))
    alert('✅ ' + data.message); setVoidingOrder(null); setVoidReason(''); loadTodayOrders(); loadAll()
  }

  // ── Customer search ──
  async function searchCustomers(q) {
    setCustomerSearching(true)
    let query = supabase.from('customers').select('id, name, phone, customer_type, membership_tier, total_spent, belongs_to').eq('enabled', true).order('total_spent', { ascending: false }).limit(50)
    if (q?.trim()) query = query.or(`name.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%`)
    const { data } = await query
    setCustomerResults(data || [])
    setCustomerSearching(false)
  }
  useEffect(() => { if (showCustomerSearch) searchCustomers(customerQuery) }, [showCustomerSearch])
  function selectCustomer(c) {
    setCustomer(c); setCustomerTier(tiers.find(t => t.id === c.membership_tier) || null); setAttributedTo(c.belongs_to || '店內'); setShowCustomerSearch(false)
    // Birthday detection
    if (c.birthday) {
      const today = new Date()
      const bd = new Date(c.birthday)
      setIsBirthday(bd.getMonth() === today.getMonth() && bd.getDate() === today.getDate())
    } else { setIsBirthday(false) }
  }
  function clearCustomer() { setCustomer(null); setCustomerTier(null); setAttributedTo('店內'); setIsBirthday(false) }

  // ── Filter & sort ──
  const filtered = useMemo(() => {
    let list = products
    if (activeCategory !== 'all') list = list.filter(p => p._cat === activeCategory)
    if (search) return scoreSearch(list, search)
    return sortProducts(list, sortBy)
  }, [products, activeCategory, search, sortBy])

  // ── Cart ops ──
  function addToCart(p, qty, note) {
    if (p._stock === '缺貨' || p._price <= 0) return
    setCart(prev => {
      const i = prev.findIndex(c => c.id === p.id)
      if (i >= 0) { const a = [...prev]; a[i] = { ...a[i], qty: a[i].qty + qty, note: note || a[i].note }; return a }
      return [...prev, { id: p.id, name: p.name, brand: p.brand || '', price: p._price, _originalPrice: p._price, qty, _cat: p._cat, inv_master_id: p.inv_master_id, note: note || '' }]
    })
  }
  function openDetail(p) { if (p._stock === '缺貨' || p._price <= 0) return; setDetailProduct(p); setDetailQty(1); setDetailNote('') }
  function updateQty(id, d) { setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + d) } : c)) }
  function removeItem(id) { setCart(prev => prev.filter(c => c.id !== id)) }

  function applyPriceOverride(id) {
    const newPrice = Math.max(0, Math.round(+editPriceVal || 0))
    const item = cart.find(c => c.id === id)
    if (!item || newPrice === item.price) { setEditPriceId(null); return }
    setCart(prev => prev.map(c => c.id === id ? { ...c, price: newPrice, _overridden: true, _overrideReason: editPriceReason } : c))
    logAudit('price_override', `[POS-APP] ${item.name}: $${item._originalPrice || item.price} → $${newPrice}${editPriceReason ? ' 原因: ' + editPriceReason : ''}`, session?.name || 'UNKNOWN')
    setEditPriceId(null); setEditPriceVal(''); setEditPriceReason('')
  }

  function clearAll() {
    setCart([]); setDiscountPct(0); setServiceFeePct(0); setInvoiceEnabled(false)
    setTaxId(''); setCarrier(''); setOrderNote(''); clearCustomer(); setAttributedTo('店內')
  }

  // ── Calculations ──
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)
  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0)
  const memberDiscount = useMemo(() => calcMemberDiscount(customerTier, cart), [customerTier, cart])
  const manualDiscountAmt = Math.round(subtotal * (discountPct / 100))
  const afterDiscount = subtotal - memberDiscount.discount - manualDiscountAmt
  const serviceFeeAmt = Math.round(afterDiscount * (serviceFeePct / 100))
  const total = Math.max(0, afterDiscount + serviceFeeAmt)
  const cashPaid = payMethod === 'cash' ? (+payAmount || 0) : 0
  const change = payMethod === 'cash' ? Math.max(0, cashPaid - total) : 0

  // ── Checkout (try v2, fallback to v1) ──
  async function doCheckout() {
    if (!cart.length) return
    if (payMethod === 'cash' && cashPaid < total) return alert('現金不足')
    setSubmitting(true)
    try {
      const overriddenItems = cart.filter(c => c._overridden).map(c => ({
        product_id: c.id, product_name: c.name,
        original_price: c._originalPrice, override_price: c.price,
        reason: c._overrideReason || '', operator: session?.name,
      }))

      const checkoutParams = {
        p_employee_id: session?.operator_id,
        p_employee_name: session?.name,
        p_items: cart.map(c => ({
          product_id: c.id,
          product_name: (c.brand ? c.brand + ' ' : '') + c.name,
          qty: c.qty,
          unit_price: c.price,
          brand: c.brand || '',
          category: c.category ||
            (c.sections?.[0] ? (SECTION_CATEGORY_MAP[c.sections[0]] || c.sections[0]) : '其他'),
          original_price: c.originalPrice ?? c._originalPrice ?? c.price,
        })),
        p_payment_method: payMethod,
        p_payment_amount: payMethod === 'cash' ? +payAmount : total,
        p_discount: memberDiscount.discount + manualDiscountAmt,
        p_table_no: tableNo || null,
        p_vip_id: customer?.id || null,
        p_guest_count: guestCount || 1,
        p_service_fee_amount: serviceFeeAmt || 0,
        p_store_id: STORE_ID,
        p_notes: [
          customer ? `客戶: ${customer.name}` : '',
          guestCount > 1 ? `人數: ${guestCount}` : '',
          serviceFeePct > 0 ? `服務費: ${serviceFeePct}%` : '',
          invoiceEnabled ? `統編: ${taxId} 載具: ${carrier}` : '',
          orderNote,
          ...cart.filter(c => c._overridden).map(c => `[改價] ${c.name}: $${c._originalPrice}→$${c.price}`),
          ...cart.filter(c => c.note).map(c => `[${c.name}] ${c.note}`),
        ].filter(Boolean).join(' | ') || null,
      }

      console.log('[POS] p_items sample:', checkoutParams.p_items?.slice(0,2))
      const missingInv = (checkoutParams.p_items || []).filter(i => ['CU004','CU013'].includes(i.product_id))
      if (missingInv.length) console.log('[POS] CU004/CU013 items in cart:', missingInv)

      // Try v3 → v2 → v1 fallback chain
      let data, error
      try {
        const v3 = await supabase.rpc('pos_checkout_v3', {
          ...checkoutParams,
          p_store_id: STORE_ID,
          p_use_points: customer?.use_points || false,
          p_price_overrides: overriddenItems.length > 0 ? overriddenItems : null,
          p_operator_is_admin: session?.is_admin || false,
        })
        data = v3.data; error = v3.error
        if (error?.code === '42883') throw new Error('v3_not_found')
      } catch (e) {
        if (e.message === 'v3_not_found' || e.message?.includes('42883')) {
          try {
            const v2 = await supabase.rpc('pos_checkout_v2', {
              ...checkoutParams,
              p_price_overrides: overriddenItems.length > 0 ? overriddenItems : null,
              p_operator_is_admin: session?.is_admin || false,
            })
            data = v2.data; error = v2.error
            if (error?.code === '42883') throw new Error('v2_not_found')
          } catch (e2) {
            if (e2.message === 'v2_not_found' || e2.message?.includes('42883')) {
              const v1 = await supabase.rpc('pos_checkout', checkoutParams)
              data = v1.data; error = v1.error
            } else throw e2
          }
        } else throw e
      }

      if (error || !data?.success) throw new Error(error?.message || data?.error || '結帳失敗')

      try { await supabase.from('unified_orders').update({ attributed_to: customer ? (customer.belongs_to || '店內') : attributedTo }).eq('order_no', data.order_no) } catch {}

      let upg = null
      if (customer) {
        try {
          await supabase.from('customers').update({ total_spent: (customer.total_spent || 0) + total }).eq('id', customer.id)
          const { data: u } = await supabase.rpc('pos_check_member_upgrade', { p_customer_id: customer.id })
          if (u?.upgraded) upg = u
        } catch {}
      }

      setUpgradeInfo(upg)
      setLastOrder({ ...data, items: cart, payMethod, total, memberDiscount: memberDiscount.discount, paid: payMethod === 'cash' ? +payAmount : total, change: data.change ?? change, customerName: customer?.name })
      // Auto-print receipt + kitchen ticket
      printReceipt({ id: data?.order_id || '---', items: cart.map(c => ({ name: c.name, qty: c.qty, price: c.price })), subtotal: Math.round(subtotal), tax: 0, total: Math.round(total), payment: payMethod, cashier: session?.name || '', createdAt: new Date().toLocaleString('zh-TW') }).catch(e => console.warn('[print receipt]', e))
      printKitchen({ id: data?.order_id || '---', items: cart.filter(c => !['cigar','accessory'].includes(c._cat)).map(c => ({ name: c.name, qty: c.qty, note: c.note })), table: '-', createdAt: new Date().toLocaleString('zh-TW') }).catch(e => console.warn('[print kitchen]', e))
      clearAll(); setPayAmount(''); setShowCheckout(false)
        if (customer?.is_vip) setShowVipBridge(true); setShowMobileCart(false); loadAll(); loadHeldOrders()
    } catch (e) { alert('結帳失敗: ' + e.message) } finally { setSubmitting(false) }
  }

  // ── Shift ──
  async function openShiftFn() {
    const { data } = await supabase.rpc('pos_open_shift', {
      p_employee_id: session?.operator_id,
      p_employee_name: session?.name,
      p_opening_cash: +(shiftCash || 0),
    })
    if (data?.success) { setShowShift(false); loadAll() }
    else alert('開班失敗: ' + (data?.error || ''))
  }
  async function closeShiftFn() {
    if (!shift) return
    const { data } = await supabase.rpc('pos_close_shift', {
      p_shift_id: shift.id,
      p_closing_cash: +(closingCash || 0),
    })
    if (data?.success) { alert('關班完成！差額: $' + (data.variance ?? 0)); setShowShift(false); setClosingCash(''); onShiftChange(null); loadAll() }
    else alert('關班失敗: ' + (data?.error || ''))
  }

  // ── Print ──
  function printReceipt() {
    if (!lastOrder) return
    const el = document.getElementById('receipt-print')
    if (el) {
      el.style.display = 'block'
      setTimeout(() => {
        window.print()
        setTimeout(() => { el.style.display = 'none' }, 800)
      }, 100)
    }
  }
  function printVipLabel(item) {
    const now = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
    const orderNo = lastOrder?.order_no || ''
    const qrData = encodeURIComponent(JSON.stringify({
      customer: customer?.name || '',
      phone: customer?.phone || '',
      order: orderNo,
      cigar: item.name,
      date: now,
    }))
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrData}`
    const win = window.open('', '_blank', 'width=220,height=160')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { margin:0; size:50mm 30mm; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { width:50mm; height:30mm; padding:1.5mm; font-family:sans-serif; overflow:hidden; }
  .wrap { display:flex; height:100%; gap:1.5mm; }
  .left { flex:1; display:flex; flex-direction:column; justify-content:space-between; }
  .right { width:10mm; display:flex; align-items:center; }
  .brand { font-size:5.5pt; font-weight:bold; border-bottom:0.3pt solid #000; padding-bottom:0.5mm; letter-spacing:0.5pt; }
  .customer { font-size:7pt; font-weight:bold; margin-top:0.5mm; }
  .cigar { font-size:5pt; color:#333; margin-top:0.3mm; }
  .cabinet { font-size:5.5pt; font-weight:bold; margin-top:0.5mm; }
  .date { font-size:4.5pt; color:#666; margin-top:0.3mm; }
  img { width:10mm; height:10mm; }
</style>
</head><body>
  <div class="wrap">
    <div class="left">
      <div>
        <div class="brand">W CIGAR BAR 紳士雪茄館</div>
        <div class="customer">${customer?.name || '訪客'}</div>
        <div class="cigar">${item.name}</div>
      </div>
      <div>
        <div class="cabinet">窖位：${customer?.cabinet_no || '—'}</div>
        <div class="date">入庫：${now} ｜ ${orderNo.slice(-8)}</div>
      </div>
    </div>
    <div class="right"><img src="${qrUrl}" alt="QR"/></div>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();window.close();},500);}<\/script>
</body></html>`)
    win.document.close()
  }

  function printBarcodeLabel(item) {
    const code = item.id || item.barcode || ''
    const win = window.open('', '_blank', 'width=220,height=160')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
<style>
  @page { margin:0; size:50mm 30mm; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { width:50mm; height:30mm; padding:1.5mm; font-family:sans-serif; text-align:center; }
  .brand { font-size:6pt; font-weight:bold; letter-spacing:0.5pt; }
  .name { font-size:7pt; font-weight:bold; margin:0.5mm 0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .price { font-size:6pt; font-weight:bold; margin-top:0.5mm; }
  svg { width:100%; height:10mm; }
</style>
</head><body>
    <div class="brand">W CIGAR BAR</div>
    <div class="name">${item.name}</div>
    <svg id="barcode"></svg>
    <div class="price">NT$ ${(item.price || item._price || 0).toLocaleString()}</div>
    <script>
      JsBarcode('#barcode','${code}',{format:'CODE128',width:1.5,height:30,displayValue:true,fontSize:8,margin:2,textMargin:1});
      window.onload=function(){setTimeout(function(){window.print();window.close();},600);}
    <\/script>
    </body></html>`)
    win.document.close()
  }

  // ── Loading ──
  if (loading) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="loading-shimmer" style={{ width: 80, height: 80, borderRadius: '50%' }} />
    </div>
  )

  const ts = customer ? (TIER_STYLES[customer.membership_tier] || TIER_STYLES['非會員']) : null
  const gridCols = isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'

  // ── Checkout bottom panel ──
  function CheckoutBottom() {
    const is = { w: '100%', fontSize: 10, padding: '2px 4px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8', boxSizing: 'border-box' }
    return <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
        <div style={{ flex: 1 }}><span style={{ fontSize: 8, color: '#8a7e6e' }}>折扣%</span><input type="number" min={0} max={100} value={discountPct || ''} onChange={e => setDiscountPct(Math.min(100, Math.max(0, +e.target.value || 0)))} placeholder="0" style={{ ...is, height: 28, fontFamily: 'var(--font-mono)' }} /></div>
        <div style={{ flex: 1 }}><span style={{ fontSize: 8, color: '#8a7e6e' }}>服務費%</span><input type="number" min={0} max={100} value={serviceFeePct || ''} onChange={e => setServiceFeePct(Math.min(100, Math.max(0, +e.target.value || 0)))} placeholder="0" style={{ ...is, height: 28, fontFamily: 'var(--font-mono)' }} /></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#8a7e6e', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}><input type="checkbox" checked={invoiceEnabled} onChange={e => setInvoiceEnabled(e.target.checked)} /> 開發票</label>
      </div>
      {invoiceEnabled && <div style={{ display: 'flex', gap: 4, marginBottom: 3 }}><input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="統一編號" style={{ ...is, flex: 1, height: 28 }} /><input value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="載具" style={{ ...is, flex: 1, height: 28 }} /></div>}
      <input value={orderNote} onChange={e => setOrderNote(e.target.value)} placeholder="備註…" style={{ ...is, width: '100%', height: 28, marginBottom: 3 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8a7e6e' }}><span>共 {cartCount} 件</span><span>${subtotal.toLocaleString()}</span></div>
      {memberDiscount.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9b59b6' }}><span>會員折扣</span><span>-${memberDiscount.discount.toLocaleString()}</span></div>}
      {manualDiscountAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#f59e0b' }}><span>折扣 {discountPct}%</span><span>-${manualDiscountAmt.toLocaleString()}</span></div>}
      {serviceFeeAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8a7e6e' }}><span>服務費</span><span>+${serviceFeeAmt.toLocaleString()}</span></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '2px 0' }}><span style={{ fontSize: 16, fontWeight: 800, color: '#c9a84c' }}>應收</span><span style={{ fontSize: 24, fontWeight: 800, color: '#c9a84c', fontFamily: 'var(--font-mono)' }}>${total.toLocaleString()}</span></div>
      <button onClick={() => { if (cart.length) setShowCheckout(true) }} disabled={!cart.length} style={{ width: '100%', padding: isTablet ? '14px 0' : '10px 0', fontSize: isTablet ? 18 : 16, fontWeight: 700, cursor: cart.length ? 'pointer' : 'not-allowed', background: cart.length ? '#c9a84c' : '#2a2520', border: 'none', borderRadius: 8, color: cart.length ? '#0d0b09' : '#8a7e6e', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}><CreditCard size={16} /> 結帳 ${total.toLocaleString()}</button>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={holdCurrentOrder} style={{ flex: 1, padding: '6px 0', fontSize: 11, background: '#1a1714', color: '#c9a84c', border: '1px solid #2a2520', borderRadius: 6, cursor: 'pointer' }}>暫存</button>
        <button onClick={() => { loadHeldOrders(); setShowHeldModal(true) }} style={{ flex: 1, padding: '6px 0', fontSize: 11, background: '#1a1714', color: heldOrders.length ? '#f59e0b' : '#c9a84c', border: '1px solid #2a2520', borderRadius: 6, cursor: 'pointer', position: 'relative' }}>掛單{heldOrders.length > 0 && <span style={{ position: 'absolute', top: -6, right: -4, background: '#e74c3c', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{heldOrders.length}</span>}</button>
        <button onClick={clearAll} style={{ flex: 1, padding: '6px 0', fontSize: 11, background: '#1a1714', color: '#e74c3c', border: '1px solid #2a2520', borderRadius: 6, cursor: 'pointer' }}>清除</button>
      </div>
    </>
  }

  // ── Cart items ──
  function CartItems() {
    return <>
      {cart.map(c => (
        <div key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid #2a2520' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#e8dcc8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
              <div style={{ fontSize: 10, color: '#8a7e6e', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 3 }}>
                {editPriceId === c.id ? null : <>
                  <span onClick={canOverridePrice ? () => { setEditPriceId(c.id); setEditPriceVal(String(c.price)); setEditPriceReason('') } : undefined}
                    style={{ cursor: canOverridePrice ? 'pointer' : 'default', borderBottom: canOverridePrice ? '1px dashed #8a7e6e' : 'none' }}>
                    ${c.price.toLocaleString()}
                  </span>
                  {c._overridden && <span style={{ fontSize: 8, color: '#f59e0b', fontWeight: 600 }}>改</span>}
                  <span> × {c.qty}{c.note ? ` · ${c.note}` : ''}</span>
                </>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button onClick={() => updateQty(c.id, -1)} style={{ width: isTablet ? 32 : 24, height: isTablet ? 32 : 24, borderRadius: 6, border: '1px solid #2a2520', background: '#0d0b09', color: '#e8dcc8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={11} /></button>
              <span style={{ width: 22, textAlign: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#e8dcc8' }}>{c.qty}</span>
              <button onClick={() => updateQty(c.id, 1)} style={{ width: isTablet ? 32 : 24, height: isTablet ? 32 : 24, borderRadius: 6, border: '1px solid rgba(201,168,76,.3)', background: 'rgba(201,168,76,.1)', color: '#c9a84c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={11} /></button>
            </div>
            <span style={{ width: 54, textAlign: 'right', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#c9a84c' }}>${(c.price * c.qty).toLocaleString()}</span>
            {!['奶茶咖啡','氣泡飲品','酒類','餐食','甜點'].includes(c._cat) && (
              <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                {customer?.is_vip && (
                  <button onClick={() => printVipLabel(c)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, border: '1px solid rgba(201,168,76,.5)', background: 'rgba(201,168,76,.1)', color: '#c9a84c', cursor: 'pointer' }}>
                    🔑 VIP
                  </button>
                )}
                <button onClick={() => printBarcodeLabel(c)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.05)', color: '#aaa', cursor: 'pointer' }}>
                  📦 條碼
                </button>
              </div>
            )}
            <button onClick={() => removeItem(c.id)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: 2 }}><Trash2 size={13} /></button>
          </div>
          {editPriceId === c.id && (
            <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#f59e0b', flexShrink: 0 }}>$</span>
              <input type="number" inputMode="numeric" value={editPriceVal} onChange={e => setEditPriceVal(e.target.value)} autoFocus
                style={{ width: 90, fontSize: 12, padding: '3px 4px', background: '#0d0b09', border: '1px solid #f59e0b', borderRadius: 4, color: '#f59e0b', fontFamily: 'var(--font-mono)', textAlign: 'center' }}
                onKeyDown={e => { if (e.key === 'Enter') applyPriceOverride(c.id); if (e.key === 'Escape') setEditPriceId(null) }} />
              <input placeholder="原因" value={editPriceReason} onChange={e => setEditPriceReason(e.target.value)}
                style={{ flex: 1, fontSize: 10, padding: '3px 4px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 4, color: '#e8dcc8', minWidth: 0 }}
                onKeyDown={e => { if (e.key === 'Enter') applyPriceOverride(c.id) }} />
              <button onClick={() => applyPriceOverride(c.id)} style={{ fontSize: 10, padding: '3px 8px', background: '#f59e0b', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>✓</button>
              <button onClick={() => setEditPriceId(null)} style={{ fontSize: 10, padding: '3px 6px', background: 'none', color: '#8a7e6e', border: '1px solid #2a2520', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}>✕</button>
            </div>
          )}
        </div>
      ))}
      {memberDiscount.details.length > 0 && <div style={{ padding: '6px 0', borderBottom: '1px solid #2a2520' }}>
        {memberDiscount.details.map((d, i) => <div key={i} style={{ fontSize: 10, color: '#9b59b6', display: 'flex', justifyContent: 'space-between' }}><span>{d.name} · {d.rate === 0 ? '免費' : `${Math.round(d.rate * 10)}折`}</span><span>-${d.saved.toLocaleString()}</span></div>)}
      </div>}
    </>
  }

  // ── Product card ──
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

  /* ════════ RENDER ════════ */
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0d0b09', color: '#e8dcc8' }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #receipt-print, #receipt-print * { visibility: visible !important; }
          #receipt-print {
            position: fixed; top: 0; left: 0;
            width: 76mm; padding: 3mm 4mm;
            font-family: monospace; font-size: 11px;
            color: #000; background: #fff;
            line-height: 1.5;
          }
          @page { margin: 0; size: 80mm auto; }
        }
      `}</style>
      {/* Shift + Search bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #2a2520', flexShrink: 0, background: 'linear-gradient(180deg, #1a1714 0%, #12100d 100%)' }}>
        <button onClick={() => setShowShift(true)} style={{ background: 'linear-gradient(135deg, #2a2520, #1a1714)', border: '1px solid #3d3530', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#c9a84c', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontWeight: 600, letterSpacing: 0.5, transition: 'all .2s' }}>
          <Clock size={14} /> {shift ? '關班' : '開班'}
        </button>
        <div style={{ position: 'relative', flex: 1, minWidth: 100 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b5f52' }} />
          <input placeholder="搜尋品牌 / 品名 / SKU…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', fontSize: 13, padding: isTablet ? '10px 12px 10px 34px' : '7px 10px 7px 32px', height: isTablet ? 44 : undefined, background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', outline: 'none', letterSpacing: 0.3, transition: 'border-color .2s' }}
            onFocus={e => e.target.style.borderColor = '#c9a84c'}
            onBlur={e => e.target.style.borderColor = '#2a2520'} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, padding: '2px', flexShrink: 0 }}>
          {SORTS.map(s => (
            <button key={s.key} onClick={() => setSortBy(s.key)}
              style={{ padding: '5px 10px', fontSize: 11, fontWeight: sortBy === s.key ? 700 : 400, color: sortBy === s.key ? '#c9a84c' : '#6b5f52', background: sortBy === s.key ? '#2a2520' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', transition: 'all .2s', whiteSpace: 'nowrap', letterSpacing: 0.3 }}>
              {s.label}
            </button>
          ))}
        </div>
        {isMobile && (
          <button onClick={() => setShowMobileCart(true)} style={{ position: 'relative', background: '#c9a84c', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: '#000', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center' }}>
            <ShoppingCart size={14} />
            {cart.length > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: '#e74c3c', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cart.length}</span>}
          </button>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT: Products */}
        <div style={{ flex: isMobile ? 1 : isTablet ? '0 0 55%' : '0 0 65%', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: isMobile ? 'none' : '1px solid #2a2520' }}>
          <div style={{ display: 'flex', gap: 2, padding: '3px 8px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid #2a2520' }}>
            {CATEGORIES.map(cat => (
              <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                style={{ padding: isTablet ? '6px 14px' : '2px 10px', borderRadius: 12, fontSize: isTablet ? 13 : (isMobile ? 10 : 11), fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: activeCategory === cat.key ? 'rgba(201,168,76,.15)' : 'transparent', color: activeCategory === cat.key ? '#c9a84c' : '#8a7e6e', border: activeCategory === cat.key ? '1px solid rgba(201,168,76,.3)' : '1px solid transparent' }}>
                {cat.label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: isTablet ? 10 : 6 }}>
              {filtered.map(p => <PCard key={p.id} p={p} />)}
            </div>
            {!filtered.length && <div style={{ textAlign: 'center', padding: 40, color: '#8a7e6e' }}>無符合商品</div>}
          </div>
          <div style={{ padding: '4px 8px', borderTop: '1px solid #2a2520', display: 'flex', gap: 3, justifyContent: 'center', flexShrink: 0 }}>
            {QTY_PRESETS.map(n => <button key={n} onClick={() => setDetailQty(n)} style={{ padding: isTablet ? '8px 16px' : '3px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: detailQty === n ? 'rgba(201,168,76,.15)' : '#0d0b09', color: detailQty === n ? '#c9a84c' : '#8a7e6e', border: detailQty === n ? '1px solid rgba(201,168,76,.3)' : '1px solid #2a2520' }}>×{n}</button>)}
          </div>
        </div>

        {/* RIGHT: Cart panel (desktop/tablet) */}
        {!isMobile && (
          <div style={{ flex: isTablet ? '0 0 45%' : '0 0 35%', display: 'flex', flexDirection: 'column', background: '#0d0b09', height: '100%', overflow: 'hidden' }}>
            {/* Top: table + customer */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #2a2520', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', display: 'flex', alignItems: 'center', gap: 4 }}><ShoppingCart size={14} /> {cartCount}</span>
                <div style={{ flex: 1 }} />
                <select value={tableNo} onChange={e => setTableNo(e.target.value)} style={{ fontSize: 11, padding: '4px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8' }}>
                  <option value="">桌位</option>{TABLES.map(t => <option key={t}>{t}</option>)}
                </select>
                <input type="number" min={1} value={guestCount} onChange={e => setGuestCount(Math.max(1, +e.target.value || 1))} style={{ width: 36, fontSize: 11, padding: '4px 2px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8', textAlign: 'center' }} />
                {cart.length > 0 && <button onClick={clearAll} style={{ background: 'none', border: 'none', color: '#e74c3c', fontSize: 10, cursor: 'pointer' }}>清空</button>}
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {!customer ? <>
                  <button style={{ flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 10, fontWeight: 700, background: 'rgba(201,168,76,.15)', color: '#c9a84c', border: '1px solid rgba(201,168,76,.3)', cursor: 'default' }}>散客</button>
                  <button onClick={() => { setShowCustomerSearch(true); setCustomerQuery('') }} style={{ flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: '#1a1714', color: '#8a7e6e', border: '1px solid #2a2520', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}><User size={11} /> 選取會員</button>
                </> : <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: ts?.bg, border: `1px solid ${ts?.border}`, borderRadius: 8, padding: '3px 8px' }}>
                  <User size={13} color={ts?.color} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#e8dcc8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.name}</div>
                    <div style={{ fontSize: 9, color: ts?.color }}>{ts?.label}</div>
                  </div>
                  <button onClick={clearCustomer} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer', padding: 2 }}><X size={13} /></button>
                </div>}
              </div>
              {isBirthday && customer && <div style={{ background: 'linear-gradient(90deg, rgba(255,105,180,.15), rgba(255,215,0,.15))', border: '1px solid rgba(255,105,180,.4)', borderRadius: 8, padding: '4px 8px', marginTop: 4, fontSize: 11, color: '#ff69b4', textAlign: 'center', fontWeight: 700 }}>🎂 今天是 {customer.name} 的生日！</div>}
              {!customer && <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: '#8a7e6e', whiteSpace: 'nowrap' }}>歸屬</span>
                {['老闆', '老闆娘', '店內'].map(a => <button key={a} onClick={() => setAttributedTo(a)} style={{ flex: 1, padding: '2px 0', borderRadius: 6, fontSize: 9, fontWeight: 600, cursor: 'pointer', background: attributedTo === a ? 'rgba(201,168,76,.15)' : '#1a1714', color: attributedTo === a ? '#c9a84c' : '#8a7e6e', border: attributedTo === a ? '1px solid rgba(201,168,76,.3)' : '1px solid #2a2520' }}>{a}</button>)}
              </div>}
            </div>
            {/* Cart items (scrollable) */}
            <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '4px 12px', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
              {!cart.length ? <div style={{ textAlign: 'center', padding: 40, color: '#8a7e6e', fontSize: 13 }}>點選商品加入購物車</div> : <CartItems />}
            </div>
            {/* Bottom: totals + buttons */}
            <div style={{ flexShrink: 0, borderTop: '2px solid rgba(201,168,76,.4)', background: '#0d0b09', padding: '8px 12px' }}>
              <CheckoutBottom />
            </div>
          </div>
        )}
      </div>

      {/* Mobile cart bar */}
      {isMobile && !showMobileCart && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', borderTop: '2px solid rgba(201,168,76,.4)', background: '#1a1714' }} onClick={() => setShowMobileCart(true)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShoppingCart size={16} color="#c9a84c" /><span style={{ fontWeight: 700 }}>{cartCount} 件</span><span style={{ color: '#c9a84c', fontWeight: 800, fontSize: 18 }}>${total.toLocaleString()}</span></div>
          <ChevronUp size={18} color="#8a7e6e" />
        </div>
      )}

      {/* Mobile cart drawer */}
      {showMobileCart && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={() => setShowMobileCart(false)}>
          <div style={{ background: '#1a1714', borderRadius: '16px 16px 0 0', maxHeight: '85vh', display: 'flex', flexDirection: 'column', border: '1px solid rgba(201,168,76,.3)', borderBottom: 'none' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a2520', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#c9a84c' }}>購物車 ({cartCount})</span>
              <button onClick={() => setShowMobileCart(false)} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><ChevronDown size={18} /> 收起</button>
            </div>
            <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '4px 16px', minHeight: 0 }}>
              {!cart.length ? <div style={{ textAlign: 'center', padding: 24, color: '#8a7e6e' }}>購物車是空的</div> : <CartItems />}
            </div>
            <div style={{ flexShrink: 0, borderTop: '2px solid rgba(201,168,76,.4)', background: '#0d0b09', padding: '8px 16px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
              <CheckoutBottom />
            </div>
          </div>
        </div>
      )}

      {/* Product detail modal */}
      {detailProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setDetailProduct(null)}>
          <div style={{ background: '#1a1714', border: '1px solid rgba(201,168,76,.3)', borderRadius: 20, width: '100%', maxWidth: 400, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            {detailProduct.image_url ? <div style={{ height: 200, background: '#0f0d0a', overflow: 'hidden' }}><img src={detailProduct.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div> : <div style={{ height: 120, background: '#0f0d0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, fontWeight: 900, color: '#2a2520' }}>{(detailProduct.brand || '?')[0]}</div>}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: '#8a7e6e', marginBottom: 4 }}>{detailProduct.brand}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#e8dcc8', marginBottom: 4, lineHeight: 1.3 }}>{detailProduct.name}</div>
              <div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#c9a84c', marginBottom: 12 }}>${detailProduct._price.toLocaleString()}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
                <button onClick={() => setDetailQty(q => Math.max(1, q - 1))} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid #2a2520', background: '#0d0b09', color: '#e8dcc8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={18} /></button>
                <input type="number" inputMode="numeric" value={detailQty} onChange={e => { const v = Math.max(1, Math.round(+e.target.value || 1)); setDetailQty(v) }}
                  style={{ fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 800, width: 60, textAlign: 'center', background: 'transparent', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', padding: '4px 0' }} />
                <button onClick={() => setDetailQty(q => q + 1)} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid rgba(201,168,76,.3)', background: 'rgba(201,168,76,.1)', color: '#c9a84c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={18} /></button>
              </div>
              <input value={detailNote} onChange={e => setDetailNote(e.target.value)} placeholder="備註（去冰、少糖...）" style={{ width: '100%', fontSize: 12, padding: '8px 10px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', marginBottom: 14, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setDetailProduct(null)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #2a2520', background: '#0d0b09', color: '#8a7e6e', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>取消</button>
                <button onClick={() => { addToCart(detailProduct, detailQty, detailNote); setDetailProduct(null) }} style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #c9a84c, #b8943f)', color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ShoppingCart size={16} /> 加入 · ${(detailProduct._price * detailQty).toLocaleString()}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Checkout modal */}
      {showCheckout && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowCheckout(false)}>
          <div style={{ background: '#1a1714', border: '1px solid rgba(201,168,76,.3)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><span style={{ fontSize: 18, fontWeight: 700, color: '#c9a84c' }}>💰 結帳</span><button onClick={() => setShowCheckout(false)} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer' }}><X size={20} /></button></div>
            <div style={{ background: '#0d0b09', borderRadius: 12, padding: 12, marginBottom: 14 }}>
              {cart.map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#e8dcc8' }}><span>{c.name} ×{c.qty}{c._overridden ? ' ⚡' : ''}</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${(c.price * c.qty).toLocaleString()}</span></div>)}
              {memberDiscount.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#9b59b6' }}><span>會員折扣</span><span>-${memberDiscount.discount.toLocaleString()}</span></div>}
              {manualDiscountAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#f59e0b' }}><span>手動折扣</span><span>-${manualDiscountAmt.toLocaleString()}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: '#c9a84c', borderTop: '1px solid rgba(201,168,76,.3)', marginTop: 6, paddingTop: 8 }}><span>應收</span><span>${total.toLocaleString()}</span></div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#8a7e6e', marginBottom: 6 }}>支付方式</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
              {PAY_METHODS.map(m => <button key={m.key} onClick={() => { setPayMethod(m.key); if (m.key !== 'cash') setPayAmount('') }} style={{ padding: '10px 6px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center', background: payMethod === m.key ? m.color + '18' : '#0d0b09', color: payMethod === m.key ? m.color : '#8a7e6e', border: payMethod === m.key ? '2px solid ' + m.color : '1px solid #2a2520' }}><div style={{ fontSize: 20 }}>{m.icon}</div>{m.label}</button>)}
            </div>
            {payMethod === 'cash' && <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#8a7e6e', marginBottom: 6 }}>收取金額</div>
              <input type="number" inputMode="numeric" value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus style={{ width: '100%', fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: '#0d0b09', border: '2px solid rgba(201,168,76,.3)', borderRadius: 12, color: '#c9a84c', marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {QUICK_CASH.map(v => <button key={v} onClick={() => setPayAmount(String(v))} style={{ flex: 1, minWidth: 50, padding: '8px 4px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: +payAmount === v ? 'rgba(201,168,76,.15)' : '#0d0b09', color: +payAmount === v ? '#c9a84c' : '#8a7e6e', border: +payAmount === v ? '1px solid rgba(201,168,76,.3)' : '1px solid #2a2520' }}>${v.toLocaleString()}</button>)}
                <button onClick={() => setPayAmount(String(total))} style={{ flex: 1, minWidth: 50, padding: '8px 4px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(77,168,108,.1)', color: '#4da86c', border: '1px solid rgba(77,168,108,.3)' }}>剛好</button>
              </div>
              {+payAmount >= total && <div style={{ marginTop: 10, textAlign: 'center', padding: 12, background: 'rgba(77,168,108,.08)', borderRadius: 12, border: '1px solid rgba(77,168,108,.3)' }}><div style={{ fontSize: 12, color: '#8a7e6e' }}>找零</div><div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#4da86c' }}>${change.toLocaleString()}</div></div>}
            </div>}
            <button onClick={doCheckout} disabled={submitting || (payMethod === 'cash' && cashPaid < total)} style={{ width: '100%', padding: 16, fontSize: 18, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #4da86c, #2d8a4e)', border: 'none', borderRadius: 14, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? .5 : 1 }}><CheckCircle2 size={20} /> {submitting ? '處理中...' : '確認結帳'}</button>
          </div>
        </div>
      )}

      {/* Hidden receipt for print */}
        {showVipBridge && customer?.is_vip && (
          <VipCheckoutBridge
            customer={customer}
            cartItems={lastOrder?.items || cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty, inv_master_id: c.inv_master_id }))}
            staff={{ id: session?.employee_id, name: session?.employee_name }}
            paymentMethod={payMethod}
            totalAmount={lastOrder?.total || 0}
            onDone={() => setShowVipBridge(false)}
            onCancel={() => setShowVipBridge(false)}
          />
        )}

      {lastOrder && (
        <div id="receipt-print" style={{ display: 'none' }}>
          <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 'bold', letterSpacing: 2 }}>W CIGAR BAR</div>
            <div style={{ fontSize: 10 }}>紳士雪茄館 ｜ 台北市大安區</div>
          </div>
          <div style={{ marginBottom: 6, fontSize: 11 }}>
            <div>{new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</div>
            <div>單號：{lastOrder.order_no}</div>
            <div>收銀：{session?.name}</div>
            {customer && <div>客戶：{customer.name}</div>}
          </div>
          <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', marginBottom: 6 }}>
            {cart.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ flex: 1 }}>{item.name} ×{item.qty}</span>
                <span>${(item.price * item.qty).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>小計</span><span>${subtotal.toLocaleString()}</span></div>
            {memberDiscount.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>會員折扣</span><span>-${memberDiscount.discount.toLocaleString()}</span></div>}
            {manualDiscountAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>折扣 {discountPct}%</span><span>-${manualDiscountAmt.toLocaleString()}</span></div>}
            {serviceFeeAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>服務費</span><span>+${serviceFeeAmt.toLocaleString()}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 13, marginTop: 2 }}><span>總計</span><span>${lastOrder.total?.toLocaleString()}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>實收</span><span>${lastOrder.paid?.toLocaleString()}</span></div>
            {lastOrder.change > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>找零</span><span>${lastOrder.change?.toLocaleString()}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>付款</span><span>{payMethod}</span></div>
          </div>
          <div style={{ textAlign: 'center', borderTop: '1px dashed #000', paddingTop: 6, fontSize: 10 }}>
            <div>感謝您蒞臨 W Cigar Bar</div>
            <div>請保留本收據以供查詢</div>
          </div>
        </div>
      )}

      {/* Success modal */}
      {lastOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => { setLastOrder(null); setUpgradeInfo(null) }}>
          <div style={{ background: '#1a1714', border: '2px solid rgba(77,168,108,.5)', borderRadius: 20, padding: 30, width: '100%', maxWidth: 400, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <CheckCircle2 size={48} color="#4da86c" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 22, fontWeight: 800, color: '#4da86c', marginBottom: 4 }}>結帳成功！</div>
            <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: '#c9a84c', fontWeight: 700, marginBottom: 12 }}>{lastOrder.order_no}</div>
            <div style={{ display: 'grid', gridTemplateColumns: lastOrder.change > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8, marginBottom: 12, background: '#0d0b09', borderRadius: 12, padding: 12 }}>
              <div><div style={{ fontSize: 10, color: '#8a7e6e' }}>應收</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#c9a84c' }}>${lastOrder.total?.toLocaleString()}</div></div>
              <div><div style={{ fontSize: 10, color: '#8a7e6e' }}>實收</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#e8dcc8' }}>${lastOrder.paid?.toLocaleString()}</div></div>
              {lastOrder.change > 0 && <div><div style={{ fontSize: 10, color: '#8a7e6e' }}>找零</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#4da86c' }}>${lastOrder.change?.toLocaleString()}</div></div>}
            </div>
            {upgradeInfo && <div style={{ background: 'rgba(155,89,182,.1)', border: '1px solid rgba(155,89,182,.3)', borderRadius: 12, padding: 12, marginBottom: 12 }}><div style={{ fontSize: 16, fontWeight: 700, color: '#9b59b6' }}>🎉 升級！</div><div style={{ fontSize: 13, color: '#e8dcc8', marginTop: 4 }}>{lastOrder.customerName} → <b style={{ color: '#c9a84c' }}>「{upgradeInfo.new_tier}」</b></div></div>}
            <button onClick={printReceipt} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#c9a84c', color: '#1a1410', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8, width: '100%' }}>🖨️ 列印收據</button>
            <button onClick={() => { setLastOrder(null); setUpgradeInfo(null) }} style={{ padding: '12px 40px', fontSize: 16, fontWeight: 700, cursor: 'pointer', background: '#c9a84c', border: 'none', borderRadius: 12, color: '#000' }}>完成</button>
          </div>
        </div>
      )}

      {/* Customer search modal */}
      {showCustomerSearch && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowCustomerSearch(false)}>
          <div style={{ background: '#1a1714', border: '1px solid rgba(201,168,76,.3)', borderRadius: 20, padding: 20, width: '100%', maxWidth: 440, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><span style={{ fontSize: 16, fontWeight: 700, color: '#c9a84c', display: 'flex', alignItems: 'center', gap: 6 }}><User size={18} /> 選取客戶</span><button onClick={() => setShowCustomerSearch(false)} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer' }}><X size={20} /></button></div>
            <div style={{ position: 'relative', marginBottom: 10 }}><Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8a7e6e' }} /><input placeholder="搜尋姓名 / 電話…" value={customerQuery} onChange={e => { setCustomerQuery(e.target.value); searchCustomers(e.target.value) }} autoFocus style={{ width: '100%', fontSize: 13, padding: '8px 10px 8px 32px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 10, color: '#e8dcc8', boxSizing: 'border-box' }} /></div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>{['all', '尊榮會員', '進階會員', '紳士俱樂部'].map(f => <button key={f} onClick={() => setCustomerFilter(f)} style={{ padding: '3px 10px', borderRadius: 10, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: customerFilter === f ? 'rgba(201,168,76,.15)' : 'transparent', color: customerFilter === f ? '#c9a84c' : '#8a7e6e', border: customerFilter === f ? '1px solid rgba(201,168,76,.3)' : '1px solid transparent' }}>{f === 'all' ? '全部' : (TIER_STYLES[f]?.label || f).slice(0, 4)}</button>)}</div>
            {/* Quick add */}
            <button onClick={() => setShowQuickAdd(!showQuickAdd)} style={{ width: '100%', padding: 8, marginBottom: 8, background: showQuickAdd ? '#2a2520' : 'transparent', color: '#c9a84c', border: '1px dashed #c9a84c', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>{showQuickAdd ? '▼ 收起' : '+ 快速新增客戶'}</button>
            {showQuickAdd && <div style={{ background: '#1a1714', borderRadius: 8, padding: 12, marginBottom: 12, border: '1px solid #2a2520' }}>
              <input placeholder="姓名 *" value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} style={{ width: '100%', marginBottom: 8, padding: 8, background: '#0d0b09', color: '#e8dcc8', border: '1px solid #2a2520', borderRadius: 6, boxSizing: 'border-box' }} />
              <input placeholder="電話" value={newCust.phone} onChange={e => setNewCust({ ...newCust, phone: e.target.value })} style={{ width: '100%', marginBottom: 8, padding: 8, background: '#0d0b09', color: '#e8dcc8', border: '1px solid #2a2520', borderRadius: 6, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <span style={{ color: '#8a7e6e', fontSize: 12, lineHeight: '32px' }}>歸屬：</span>
                {['老闆', '老闆娘', '店內'].map(v => <button key={v} onClick={() => setNewCust({ ...newCust, belongs_to: v })} style={{ flex: 1, padding: '6px 0', fontSize: 12, borderRadius: 6, background: newCust.belongs_to === v ? '#c9a84c' : '#0d0b09', color: newCust.belongs_to === v ? '#0d0b09' : '#e8dcc8', border: '1px solid #2a2520', cursor: 'pointer' }}>{v}</button>)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowQuickAdd(false)} style={{ flex: 1, padding: 8, background: '#0d0b09', color: '#8a7e6e', border: '1px solid #2a2520', borderRadius: 6, cursor: 'pointer' }}>取消</button>
                <button onClick={async () => {
                  if (!newCust.name.trim()) return alert('請輸入姓名')
                  const { data, error } = await supabase.from('customers').insert({ name: newCust.name.trim(), phone: newCust.phone.trim() || null, belongs_to: newCust.belongs_to, notes: newCust.notes?.trim() || null, customer_type: '會員', membership_tier: '非會員', total_spent: 0, enabled: true }).select().single()
                  if (error) return alert('新增失敗：' + error.message)
                  selectCustomer(data); setShowQuickAdd(false); setNewCust({ name: '', phone: '', belongs_to: '店內', notes: '' })
                }} style={{ flex: 1, padding: 8, background: '#c9a84c', color: '#0d0b09', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>儲存並選取</button>
              </div>
            </div>}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {customerSearching ? <div style={{ textAlign: 'center', padding: 20, color: '#8a7e6e' }}>搜尋中…</div> : customerResults.filter(c => customerFilter === 'all' || c.membership_tier === customerFilter).map(c => {
                const s = TIER_STYLES[c.membership_tier] || TIER_STYLES['非會員']
                return <button key={c.id} onClick={() => selectCustomer(c)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#0d0b09', border: `1px solid ${s.border}40`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', marginBottom: 6 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: s.bg, border: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={16} color={s.color} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: '#e8dcc8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div><div style={{ fontSize: 10, color: '#8a7e6e' }}>{c.phone || '—'}</div></div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}><span style={{ fontSize: 10, fontWeight: 600, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: '2px 6px' }}>{s.label}</span></div>
                </button>
              })}
            </div>
          </div>
        </div>
      )}

      {/* Shift modal */}
      {/* ══ HELD ORDERS MODAL ══ */}
      {showHeldModal && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowHeldModal(false)}>
        <div style={{ background: '#1a1714', border: '1px solid rgba(201,168,76,.3)', borderRadius: 20, padding: 20, width: '100%', maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}><span style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>⏸ 掛單列表 ({heldOrders.length})</span><button onClick={() => setShowHeldModal(false)} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer' }}><X size={20} /></button></div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!heldOrders.length ? <div style={{ textAlign: 'center', padding: 40, color: '#8a7e6e' }}>目前沒有掛單</div> : heldOrders.map(h => (
              <div key={h.id} style={{ background: '#0d0b09', borderRadius: 12, padding: 12, marginBottom: 8, border: '1px solid #2a2520' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ fontSize: 13, fontWeight: 600, color: '#e8dcc8' }}>{h.table_no || '無桌位'} {h.customer_name ? `· ${h.customer_name}` : ''}</span><span style={{ fontSize: 11, color: '#8a7e6e' }}>{new Date(h.created_at).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })}</span></div>
                <div style={{ fontSize: 11, color: '#8a7e6e', marginBottom: 6 }}>{(h.items_json || []).map(i => `${i.name}×${i.qty}`).join('、')}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#c9a84c', fontFamily: 'var(--font-mono)' }}>${(h.subtotal || 0).toLocaleString()}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => cancelHeldOrder(h)} style={{ padding: isTablet ? '8px 14px' : '6px 12px', fontSize: 11, background: 'rgba(231,76,60,.1)', color: '#e74c3c', border: '1px solid rgba(231,76,60,.3)', borderRadius: 8, cursor: 'pointer' }}>取消</button>
                    <button onClick={() => resumeHeldOrder(h)} style={{ padding: isTablet ? '8px 18px' : '6px 16px', fontSize: 12, fontWeight: 700, background: '#c9a84c', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer' }}>恢復結帳</button>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: '#8a7e6e', marginTop: 4 }}>暫存：{h.held_by_name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {/* ══ TODAY ORDERS MODAL ══ */}
      {showOrdersModal && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => { setShowOrdersModal(false); setVoidingOrder(null) }}>
        <div style={{ background: '#1a1714', border: '1px solid rgba(201,168,76,.3)', borderRadius: 20, padding: 20, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}><span style={{ fontSize: 16, fontWeight: 700, color: '#c9a84c' }}>📋 今日訂單 ({todayOrders.filter(o => o.status === 'completed').length}筆)</span><button onClick={() => { setShowOrdersModal(false); setVoidingOrder(null) }} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer' }}><X size={20} /></button></div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!todayOrders.length ? <div style={{ textAlign: 'center', padding: 40, color: '#8a7e6e' }}>今日尚無訂單</div> : todayOrders.map(o => (
              <div key={o.id} style={{ background: '#0d0b09', borderRadius: 12, padding: 12, marginBottom: 8, border: `1px solid ${o.status === 'voided' ? 'rgba(231,76,60,.3)' : '#2a2520'}`, opacity: o.status === 'voided' ? 0.5 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}><span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#c9a84c' }}>{o.order_no}</span><span style={{ fontSize: 10, color: '#8a7e6e' }}>{new Date(o.created_at).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })}</span></div>
                <div style={{ fontSize: 12, color: '#e8dcc8', marginBottom: 4 }}>{o.items_text || '—'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: o.status === 'voided' ? '#e74c3c' : '#c9a84c', fontFamily: 'var(--font-mono)', textDecoration: o.status === 'voided' ? 'line-through' : 'none' }}>${(o.order_total || 0).toLocaleString()}</span>
                    <span style={{ fontSize: 10, color: '#8a7e6e' }}>{PAY_METHODS.find(m => m.key === o.payment_method)?.label || o.payment_method}</span>
                    {o.status === 'voided' && <span style={{ fontSize: 10, color: '#e74c3c', fontWeight: 600 }}>已作廢</span>}
                  </div>
                  {o.status === 'completed' && session?.is_admin && (
                    voidingOrder?.id === o.id ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input placeholder="作廢原因" value={voidReason} onChange={e => setVoidReason(e.target.value)} autoFocus style={{ width: 120, fontSize: 11, padding: '4px 6px', background: '#0d0b09', border: '1px solid #e74c3c', borderRadius: 6, color: '#e8dcc8' }} onKeyDown={e => { if (e.key === 'Enter') doVoidOrder() }} />
                        <button onClick={doVoidOrder} style={{ padding: '4px 10px', fontSize: 10, background: '#e74c3c', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>確認作廢</button>
                        <button onClick={() => { setVoidingOrder(null); setVoidReason('') }} style={{ padding: '4px 6px', fontSize: 10, background: 'none', color: '#8a7e6e', border: '1px solid #2a2520', borderRadius: 6, cursor: 'pointer' }}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setVoidingOrder(o)} style={{ padding: isTablet ? '6px 14px' : '4px 10px', fontSize: 10, background: 'rgba(231,76,60,.1)', color: '#e74c3c', border: '1px solid rgba(231,76,60,.3)', borderRadius: 6, cursor: 'pointer' }}>作廢</button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {showShift && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowShift(false)}>
          <div style={{ background: '#1a1714', border: '1px solid rgba(201,168,76,.3)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            {!shift ? <>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#c9a84c', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><LogIn size={20} /> 開班</div>
              <div style={{ fontSize: 13, color: '#8a7e6e', marginBottom: 6 }}>操作員：<strong style={{ color: '#e8dcc8' }}>{session?.name}</strong></div>
              <div style={{ fontSize: 13, color: '#8a7e6e', marginBottom: 6 }}>備用金金額</div>
              <input type="number" inputMode="numeric" value={shiftCash} onChange={e => setShiftCash(e.target.value)} style={{ width: '100%', fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: '#0d0b09', border: '2px solid rgba(201,168,76,.3)', borderRadius: 12, color: '#c9a84c', marginBottom: 16, boxSizing: 'border-box' }} />
              <button onClick={openShiftFn} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #4da86c, #2d8a4e)', border: 'none', borderRadius: 12, color: '#fff' }}>確認開班</button>
            </> : <>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><LogOutIcon size={20} /> 關班</div>
              <div style={{ background: '#0d0b09', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13, lineHeight: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#8a7e6e' }}>開班人員</span><span>{shift.employee_name}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#8a7e6e' }}>備用金</span><span style={{ color: '#c9a84c' }}>${(shift.opening_cash || 0).toLocaleString()}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#8a7e6e' }}>今日營收</span><span style={{ color: '#4da86c' }}>${(summary?.revenue?.total || 0).toLocaleString()}</span></div>
              </div>
              <div style={{ fontSize: 13, color: '#8a7e6e', marginBottom: 6 }}>現金盤點金額</div>
              <input type="number" inputMode="numeric" placeholder="盤點現金" value={closingCash} onChange={e => setClosingCash(e.target.value)} style={{ width: '100%', fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 16px', textAlign: 'center', background: '#0d0b09', border: '2px solid rgba(245,158,11,.4)', borderRadius: 12, color: '#f59e0b', marginBottom: 16, boxSizing: 'border-box' }} />
              <button onClick={closeShiftFn} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: 12, color: '#000' }}>確認關班</button>
            </>}
          </div>
        </div>
      )}
    </div>
  )
}
