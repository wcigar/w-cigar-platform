import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const C = { bg: '#0a0a0a', card: '#151311', border: '#2a2520', gold: '#d0a54f', text: '#e8dcc8', muted: '#8a7e6e', green: '#4da86c', red: '#e74c3c', blue: '#4d8ac4' }
const fmt = n => `$${Number(n || 0).toLocaleString()}`
const fmtDate = d => d ? new Date(d).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : ''
const fmtTime = d => d ? new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

function agingLabel(dateStr) {
  if (!dateStr) return null
  const months = Math.floor((Date.now() - new Date(dateStr).getTime()) / (30.44 * 86400000))
  if (months < 3) return { label: '🌱 醇化中', color: '#4da86c' }
  if (months < 12) return { label: '✅ 適飲', color: '#d0a54f' }
  return { label: '⭐ 完美熟成', color: '#9b59b6' }
}

// Shared: load 3 tables for a VIP member
async function loadVipTables(memberId) {
  const [cabRes, ordRes, withdRes] = await Promise.all([
    supabase.from('vip_cabinets').select('*').eq('vip_id', memberId).gt('quantity', 0).order('cabinet_no'),
    supabase.from('vip_orders').select('*').eq('vip_id', memberId).order('created_at', { ascending: false }),
    supabase.from('vip_withdrawals').select('*').eq('vip_id', memberId).order('withdrawn_at', { ascending: false }),
  ])
  const cabinets = cabRes.data || [], orders = ordRes.data || [], withdrawals = withdRes.data || []
  return {
    cellar_count: cabinets.reduce((s, c) => s + (c.quantity || 0), 0),
    cellar_value: cabinets.reduce((s, c) => s + (c.market_value || (c.quantity || 0) * (c.unit_price || 0)), 0),
    unpaid: orders.filter(o => !o.is_voided).reduce((s, o) => s + (o.balance || 0), 0),
    total_spent: orders.filter(o => !o.is_voided).reduce((s, o) => s + (o.order_total || 0), 0),
    inventory: cabinets.map(c => ({ id: c.id, cabinet_no: c.cabinet_no, product_name: c.product_name || c.cigar_name || '—', brand: c.brand || '', qty: c.quantity, unit_price: c.unit_price || 0, stored_at: c.stored_at || c.created_at })),
    orders: orders.map(o => ({ id: o.id, order_no: o.order_no, total: o.order_total || 0, paid: (o.order_total || 0) - (o.balance || 0), created_at: o.created_at, status: o.status })),
    pickups: withdrawals.map(w => ({ id: w.id, product_name: w.product_name || w.cigar_name || '—', qty_withdrawn: w.qty_withdrawn || w.quantity || 0, qty_remaining: w.qty_remaining ?? null, destination: w.destination || w.purpose || '—', cabinet_no: w.cabinet_no || '—', staff_name: w.staff_name || w.handled_by_name || '—', notes: w.notes || '', signature_url: w.signature_url, withdrawn_at: w.withdrawn_at || w.created_at })),
  }
}

export default function VipCellar() {
  const path = window.location.pathname
  if (path.startsWith('/vip-cellar/portal')) return <Portal />
  if (path.startsWith('/vip-cellar/staff')) return <Staff />
  if (path.startsWith('/vip-cellar/admin')) return <Admin />
  return <Login />
}

/* ═══ LOGIN ═══ */
function Login() {
  const [vipId, setVipId] = useState(''); const [pwd, setPwd] = useState(''); const [needPwd, setNeedPwd] = useState(false); const [staffCode, setStaffCode] = useState(''); const [err, setErr] = useState('')
  async function handleVipLogin() {
    if (!vipId.trim()) return setErr('請輸入 VIP 編號'); setErr('')
    const { data, error } = await supabase.rpc('vip_login', { p_vip_id: vipId.trim(), p_password: pwd || null })
    if (error) return setErr(error.message)
    if (!data?.success) { if (data?.need_password) { setNeedPwd(true); return setErr('請輸入密碼') } return setErr(data?.error || '登入失敗') }
    sessionStorage.setItem('vip_session', JSON.stringify({ id: data.id, name: data.name, vip_id: vipId.trim() }))
    window.location.href = '/vip-cellar/portal'
  }
  async function handleStaffLogin() {
    if (!staffCode.trim()) return setErr('請輸入員工代碼'); setErr('')
    const { data } = await supabase.from('employees').select('id, name, is_admin, login_code').eq('login_code', String(staffCode).trim()).eq('enabled', true).maybeSingle()
    if (!data) return setErr('查無此員工')
    sessionStorage.setItem('vip_staff', JSON.stringify(data))
    window.location.href = data.is_admin ? '/vip-cellar/admin' : '/vip-cellar/staff'
  }
  return <div style={{ height: '100vh', overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, padding: 20 }}>
    <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>💎</div>
      <div style={{ fontSize: 11, letterSpacing: 4, color: C.gold, fontWeight: 700, marginBottom: 4 }}>W CIGAR BAR</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 24 }}>VIP 窖藏系統</div>
      <input value={vipId} onChange={e => setVipId(e.target.value)} placeholder="請輸入 VIP 編號" onKeyDown={e => e.key === 'Enter' && handleVipLogin()} style={{ width: '100%', fontSize: 16, padding: '14px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, marginBottom: 10, boxSizing: 'border-box', textAlign: 'center' }} />
      {needPwd && <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="密碼" onKeyDown={e => e.key === 'Enter' && handleVipLogin()} style={{ width: '100%', fontSize: 16, padding: '14px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, marginBottom: 10, boxSizing: 'border-box', textAlign: 'center' }} />}
      <button onClick={handleVipLogin} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, background: C.gold, color: '#000', border: 'none', borderRadius: 12, cursor: 'pointer', marginBottom: 20 }}>探索我的窖藏</button>
      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div style={{ height: 1, background: C.border, margin: '16px 0' }} />
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>員工入口</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={staffCode} onChange={e => setStaffCode(e.target.value)} placeholder="員工代碼" onKeyDown={e => e.key === 'Enter' && handleStaffLogin()} style={{ flex: 1, fontSize: 13, padding: '10px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, textAlign: 'center' }} />
        <button onClick={handleStaffLogin} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 600, background: C.card, color: C.gold, border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer' }}>進入</button>
      </div>
    </div>
  </div>
}

/* ═══ VIP PORTAL ═══ */
function Portal({ staffMode, vipOverride } = {}) {
  const [vip, setVip] = useState(null); const [tab, setTab] = useState('cellar'); const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (vipOverride) { loadVip(vipOverride.id, vipOverride); return }
    const s = JSON.parse(sessionStorage.getItem('vip_session') || sessionStorage.getItem('vipMember') || 'null')
    if (!s) return void (window.location.href = '/vip-cellar')
    loadVip(s.id || s.vip_id, s)
  }, [vipOverride])

  async function loadVip(memberId, session) {
    setLoading(true)
    try {
      const d = await loadVipTables(memberId)
      setVip({ name: session?.name || '—', vip_id: session?.vip_id || memberId, tier: session?.tier || 'VIP', ...d })
    } catch (e) { console.error('loadVip:', e) }
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>載入中…</div>
  if (!vip) return <div style={{ padding: 40, textAlign: 'center', color: C.red }}>無法載入資料</div>

  const statCards = [
    { label: '歷史總消費', value: fmt(vip.total_spent), color: C.gold },
    { label: '窖藏總值', value: fmt(vip.cellar_value), color: C.green },
    { label: '未付款項', value: fmt(vip.unpaid), color: vip.unpaid > 0 ? C.red : C.muted },
    { label: '窖藏總支', value: `${vip.cellar_count || 0} 支`, color: C.text },
  ]
  const tabs = [{ key: 'cellar', label: '📦 窖藏' }, { key: 'billing', label: '🧾 帳務' }, { key: 'pickups', label: '📜 領取紀錄' }]
  const byCabinet = {}; (vip.inventory || []).forEach(i => { const k = i.cabinet_no || '未指定'; if (!byCabinet[k]) byCabinet[k] = []; byCabinet[k].push(i) })
  const totalUnpaid = (vip.orders || []).filter(o => o.paid < o.total).reduce((s, o) => s + (o.total - o.paid), 0)

  return <>
    {/* Print style for PDF */}
    <style>{`@media print { body * { visibility: hidden; } #vip-finance-print, #vip-finance-print * { visibility: visible; } #vip-finance-print { position: absolute; left: 0; top: 0; width: 100%; color: #000; background: #fff; } }`}</style>
    {/* Hero */}
    {!staffMode && <div style={{ padding: '24px 20px 16px', background: 'linear-gradient(180deg, rgba(208,165,79,.08), transparent)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div><div style={{ fontSize: 20, fontWeight: 800 }}>{vip.name}</div><div style={{ fontSize: 11, color: C.gold }}>{vip.vip_id} · {vip.tier || 'VIP'}</div></div>
        <button onClick={() => { sessionStorage.removeItem('vip_session'); window.location.href = '/vip-cellar' }} style={{ fontSize: 11, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>登出</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {statCards.map(s => <div key={s.label} style={{ background: C.card, borderRadius: 10, padding: 12, border: `1px solid ${C.border}` }}><div style={{ fontSize: 10, color: C.muted }}>{s.label}</div><div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.value}</div></div>)}
      </div>
    </div>}
    {/* Tabs */}
    <div style={{ display: 'flex', gap: 4, padding: '0 20px', marginBottom: 16, marginTop: staffMode ? 0 : undefined }}>
      {tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: tab === t.key ? 'rgba(208,165,79,.15)' : 'transparent', color: tab === t.key ? C.gold : C.muted, border: tab === t.key ? '1px solid rgba(208,165,79,.3)' : `1px solid ${C.border}` }}>{t.label}</button>)}
    </div>
    <div style={{ padding: '0 20px 40px' }}>
      {/* CELLAR TAB */}
      {tab === 'cellar' && Object.entries(byCabinet).map(([cab, items]) => <div key={cab} style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, marginBottom: 6 }}>🗄️ 櫃位 {cab}</div>
        {items.map(i => { const age = agingLabel(i.stored_at); return <div key={i.id} style={{ background: C.card, borderRadius: 10, padding: 12, marginBottom: 6, border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{i.product_name}</div><div style={{ fontSize: 10, color: C.muted }}>{i.brand} · {i.qty}支 · {fmt(i.unit_price)}/支{age ? ' · ' : ''}{age && <span style={{ color: age.color }}>{age.label}</span>}</div></div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.gold, fontFamily: 'var(--font-mono)' }}>{fmt((i.unit_price || 0) * (i.qty || 0))}</div>
        </div> })}
      </div>)}
      {tab === 'cellar' && !Object.keys(byCabinet).length && <div style={{ textAlign: 'center', padding: 30, color: C.muted }}>目前無窖藏品項</div>}

      {/* BILLING TAB */}
      {tab === 'billing' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: C.muted }}>{(vip.orders || []).length} 筆訂單</span>
          <button onClick={() => window.print()} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, background: C.card, color: C.gold, border: `1px solid ${C.border}`, cursor: 'pointer' }}>📄 匯出</button>
        </div>
        <div id="vip-finance-print">
          <div style={{ display: 'none' }}><div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{vip.name} ({vip.vip_id}) — 帳務報表</div><div style={{ fontSize: 11, marginBottom: 12 }}>列印日期：{fmtDate(new Date())}</div></div>
          {(vip.orders || []).map(o => <div key={o.id} style={{ background: C.card, borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 11, color: C.gold, fontFamily: 'var(--font-mono)' }}>{o.order_no}</span><span style={{ fontSize: 10, color: C.muted }}>{fmtDate(o.created_at)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{fmt(o.total)}</span>
              <span style={{ fontSize: 11, color: o.paid >= o.total ? C.green : C.red }}>{o.paid >= o.total ? '已付清' : `已付 ${fmt(o.paid)} / 欠 ${fmt(o.total - o.paid)}`}</span>
            </div>
            {o.total > 0 && <div style={{ height: 4, background: C.border, borderRadius: 2, marginTop: 6, overflow: 'hidden' }}><div style={{ height: '100%', background: o.paid >= o.total ? C.green : C.gold, borderRadius: 2, width: `${Math.min(100, (o.paid / o.total) * 100)}%` }} /></div>}
          </div>)}
          {totalUnpaid > 0 && <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: C.red, marginTop: 8 }}>合計欠款：{fmt(totalUnpaid)}</div>}
        </div>
      </>}

      {/* PICKUPS TAB */}
      {tab === 'pickups' && (vip.pickups || []).map(p => <div key={p.id} style={{ background: C.card, borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.product_name}</span>
          <span style={{ fontSize: 10, color: C.muted }}>{fmtTime(p.withdrawn_at)}</span>
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>櫃位 {p.cabinet_no}</div>
        <div style={{ fontSize: 12, color: C.text, marginTop: 2 }}>領取 <b style={{ color: C.gold }}>{p.qty_withdrawn}</b> 支{p.qty_remaining != null ? ` → 剩餘 ${p.qty_remaining} 支` : ''}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>去向：{p.destination}　操作：{p.staff_name}</div>
        {p.notes && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>備註：{p.notes}</div>}
        {p.signature_url && <img src={p.signature_url} alt="簽名" style={{ maxWidth: 200, width: '100%', marginTop: 6, borderRadius: 6, border: `1px solid ${C.border}` }} />}
      </div>)}
      {tab === 'pickups' && !(vip.pickups || []).length && <div style={{ textAlign: 'center', padding: 30, color: C.muted }}>無領取紀錄</div>}
    </div>
  </>
}

/* ═══ STAFF ═══ */
function Staff() {
  const [staff, setStaff] = useState(null)
  const [memberList, setMemberList] = useState([])
  const [searchText, setSearchText] = useState('')
  const [selectedVip, setSelectedVip] = useState(null)
  const [vipData, setVipData] = useState(null)
  const [modal, setModal] = useState(null)
  const [orderType, setOrderType] = useState('現貨購買')
  const [orderItems, setOrderItems] = useState([{ name: '', price: '', qtyCabinet: 0, qtyTakeout: 0, qtyOnsite: 0, qtyPending: 0, cabinet: '' }])
  const [orderPay, setOrderPay] = useState('現金')
  const [orderAmount, setOrderAmount] = useState('')
  const [orderNote, setOrderNote] = useState('')
  const [pickupItem, setPickupItem] = useState(null)
  const [pickupQty, setPickupQty] = useState(1)
  const [pickupDest, setPickupDest] = useState('現場享用')
  const [pickupNote, setPickupNote] = useState('')
  const [payOrder, setPayOrder] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('現金')
  const [payNote, setPayNote] = useState('')
  const sigRef = useRef(null)
  const [sigData, setSigData] = useState(null)

  useEffect(() => {
    const s = JSON.parse(sessionStorage.getItem('vip_staff') || 'null')
    if (!s) return void (window.location.href = '/vip-cellar')
    setStaff(s); loadMembers()
  }, [])

  async function loadMembers() {
    const { data } = await supabase.from('vip_members').select('id, name, phone, cabinet_opened, is_active').eq('is_active', true).order('name')
    setMemberList(data || [])
  }

  const filtered = memberList.filter(m => !searchText || (m.name || '').includes(searchText) || (m.id || '').includes(searchText))

  async function loadVipData(vip) {
    setSelectedVip(vip)
    try { const d = await loadVipTables(vip.id); setVipData({ name: vip.name, vip_id: vip.id, tier: vip.tier, ...d }) } catch { setVipData(null) }
  }

  async function submitOrder() {
    const items = orderItems.filter(i => i.name.trim()); if (!items.length) return alert('請填寫至少一個品項')
    const orderNo = 'ORD-' + new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 15)
    const isStore = orderType === '客戶寄存'
    const orderTotal = isStore ? 0 : items.reduce((s, i) => s + (+i.price || 0) * ((+i.qtyCabinet || 0) + (+i.qtyTakeout || 0) + (+i.qtyOnsite || 0) + (+i.qtyPending || 0)), 0)
    const paidAmt = +orderAmount || 0
    const status = paidAmt >= orderTotal && orderTotal > 0 ? '已沖平結清' : paidAmt > 0 ? '部分沖銷' : '未付款'
    const { data: ordData, error: ordErr } = await supabase.from('vip_orders').insert({ order_no: orderNo, vip_id: selectedVip.id, vip_name: selectedVip.name, order_type: orderType, order_total: orderTotal, paid_amount: paidAmt, balance: Math.max(0, orderTotal - paidAmt), status, notes: orderNote || null, staff_name: staff.name }).select().single()
    if (ordErr) return alert('建立失敗: ' + ordErr.message)
    for (const item of items) { const tq = (+item.qtyCabinet || 0) + (+item.qtyTakeout || 0) + (+item.qtyOnsite || 0) + (+item.qtyPending || 0); await supabase.from('vip_order_items').insert({ order_id: ordData.id, order_no: orderNo, product_name: item.name, qty_ordered: tq, qty_delivered: tq - (+item.qtyPending || 0), qty_pending: +item.qtyPending || 0, unit_price: +item.price || 0, cabinet_no: item.cabinet || null, status: (+item.qtyPending || 0) > 0 ? '部分到貨' : '已到齊' }) }
    for (const item of items) { if ((+item.qtyCabinet || 0) > 0 && item.cabinet) await supabase.from('vip_cabinets').insert({ vip_id: selectedVip.id, cabinet_no: item.cabinet, product_name: item.name, quantity: +item.qtyCabinet, unit_price: +item.price || 0, stored_date: new Date().toISOString().slice(0, 10) }) }
    if (paidAmt > 0) await supabase.from('vip_payments').insert({ order_id: ordData.id, order_no: orderNo, vip_id: selectedVip.id, amount: paidAmt, payment_method: orderPay, staff_name: staff.name })
    alert('✅ 訂單已建立'); setModal(null); setOrderItems([{ name: '', price: '', qtyCabinet: 0, qtyTakeout: 0, qtyOnsite: 0, qtyPending: 0, cabinet: '' }]); setOrderAmount(''); setOrderNote(''); loadVipData(selectedVip)
  }

  async function submitPickup() {
    if (!pickupItem) return alert('請選擇品項')
    if (pickupQty > pickupItem.qty) return alert(`最多 ${pickupItem.qty} 支`)
    const { error: upErr } = await supabase.from('vip_cabinets').update({ quantity: pickupItem.qty - pickupQty }).eq('id', pickupItem.id)
    if (upErr) return alert('更新失敗: ' + upErr.message)
    await supabase.from('vip_withdrawals').insert({ vip_id: selectedVip.id, vip_name: selectedVip.name, cabinet_no: pickupItem.cabinet_no, product_name: pickupItem.product_name, cigar_name: pickupItem.product_name, qty_withdrawn: pickupQty, qty_remaining: pickupItem.qty - pickupQty, destination: pickupDest, purpose: pickupDest, staff_name: staff.name, handled_by_name: staff.name, notes: pickupNote || null, signature_url: sigData || null, withdrawn_at: new Date().toISOString() })
    alert('✅ 領取已記錄'); setModal(null); setPickupItem(null); setPickupQty(1); setPickupNote(''); setSigData(null); loadVipData(selectedVip)
  }

  async function submitPayment() {
    if (!payOrder) return alert('請選擇訂單'); const amt = +payAmount || 0; if (amt <= 0) return alert('請填寫金額')
    await supabase.from('vip_payments').insert({ order_id: payOrder.id, order_no: payOrder.order_no, vip_id: selectedVip.id, amount: amt, payment_method: payMethod, staff_name: staff.name, notes: payNote || null })
    const newPaid = payOrder.paid + amt; await supabase.from('vip_orders').update({ paid_amount: newPaid, balance: Math.max(0, payOrder.total - newPaid), status: newPaid >= payOrder.total ? '已沖平結清' : '部分沖銷', updated_at: new Date().toISOString() }).eq('id', payOrder.id)
    alert('✅ 已收款'); setModal(null); setPayAmount(''); setPayNote(''); setPayOrder(null); loadVipData(selectedVip)
  }

  if (!staff) return null
  const is = { width: '100%', fontSize: 13, padding: '10px 12px', background: '#2a2520', border: `1px solid ${C.gold}30`, borderRadius: 10, color: C.text, boxSizing: 'border-box', marginBottom: 8 }

  return <div style={{ minHeight: '100vh', paddingBottom: 80, background: C.bg, color: C.text, overflowY: 'auto' }}>
    <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#151311' }}>
      <div><span style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>💎 VIP 窖藏</span><span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>{staff.name}</span></div>
      <button onClick={() => { sessionStorage.removeItem('vip_staff'); window.location.href = '/vip-cellar' }} style={{ fontSize: 11, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>登出</button>
    </div>

    {!selectedVip ? <div style={{ padding: 20 }}>
      <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="🔍 搜尋 VIP 姓名或 ID" style={{ width: '100%', fontSize: 14, padding: '12px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, marginBottom: 12, boxSizing: 'border-box' }} />
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{filtered.length} 位會員</div>
      {filtered.map(v => <div key={v.id} onClick={() => loadVipData(v)} style={{ background: C.card, borderRadius: 12, padding: 14, marginBottom: 8, border: `1px solid ${C.border}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div style={{ fontSize: 14, fontWeight: 600 }}>{v.name}</div><div style={{ fontSize: 11, color: C.muted }}>{v.id}{v.phone ? ` · ${v.phone}` : ''}</div></div>
      </div>)}
    </div> : <div style={{ padding: 20 }}>
      <button onClick={() => { setSelectedVip(null); setVipData(null) }} style={{ fontSize: 12, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', marginBottom: 12 }}>← 返回列表</button>
      {vipData && <>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{vipData.name}</div>
        <div style={{ fontSize: 11, color: C.gold, marginBottom: 12 }}>窖藏 {vipData.cellar_count}支 · 未付 {fmt(vipData.unpaid)}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setModal('order')} style={{ flex: 1, padding: 10, fontSize: 13, fontWeight: 600, background: C.gold, color: '#000', border: 'none', borderRadius: 10, cursor: 'pointer' }}>＋ 新增訂單</button>
          <button onClick={() => setModal('pickup')} style={{ flex: 1, padding: 10, fontSize: 13, fontWeight: 600, background: C.card, color: C.gold, border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer' }}>📤 記錄領取</button>
          <button onClick={() => setModal('payment')} style={{ flex: 1, padding: 10, fontSize: 13, fontWeight: 600, background: C.card, color: C.green, border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer' }}>💰 收款</button>
        </div>
        <Portal staffMode vipOverride={vipData} />
      </>}
    </div>}

    {/* ORDER MODAL */}
    {modal === 'order' && <Overlay onClose={() => setModal(null)} title="新增訂單">
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>{['現貨購買', '預購訂貨', '客戶寄存'].map(t => <button key={t} onClick={() => setOrderType(t)} style={{ flex: 1, padding: 8, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: orderType === t ? C.gold : C.card, color: orderType === t ? '#000' : C.text, border: `1px solid ${C.border}` }}>{t}</button>)}</div>
      {orderItems.map((item, idx) => { const upd = (k, v) => { const a = [...orderItems]; a[idx][k] = v; setOrderItems(a) }; return <div key={idx} style={{ background: '#0d0b09', borderRadius: 10, padding: 10, marginBottom: 8, border: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}><input placeholder="品名 *" value={item.name} onChange={e => upd('name', e.target.value)} style={{ flex: 2, ...is, marginBottom: 0 }} /><input type="number" placeholder="單價" value={item.price} onChange={e => upd('price', e.target.value)} style={{ flex: 1, ...is, marginBottom: 0 }} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 6 }}>{[['qtyCabinet', '入櫃'], ['qtyTakeout', '外帶'], ['qtyOnsite', '現場'], ['qtyPending', '未到貨']].map(([k, l]) => <div key={k}><div style={{ fontSize: 9, color: C.muted }}>{l}</div><input type="number" min={0} value={item[k]} onChange={e => upd(k, +e.target.value || 0)} style={{ width: '100%', fontSize: 12, padding: '6px 4px', background: '#2a2520', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, textAlign: 'center' }} /></div>)}</div>
        {(+item.qtyCabinet || 0) > 0 && <input placeholder="櫃位號碼" value={item.cabinet} onChange={e => upd('cabinet', e.target.value)} style={{ width: '100%', fontSize: 12, padding: '6px 8px', background: '#2a2520', border: `1px solid ${C.gold}50`, borderRadius: 6, color: C.gold, marginBottom: 4 }} />}
        {orderItems.length > 1 && <button onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))} style={{ fontSize: 10, color: C.red, background: 'none', border: 'none', cursor: 'pointer' }}>✕ 移除</button>}
      </div> })}
      <button onClick={() => setOrderItems([...orderItems, { name: '', price: '', qtyCabinet: 0, qtyTakeout: 0, qtyOnsite: 0, qtyPending: 0, cabinet: '' }])} style={{ fontSize: 11, color: C.gold, background: 'none', border: `1px dashed ${C.border}`, borderRadius: 8, padding: 8, width: '100%', cursor: 'pointer', marginBottom: 12 }}>+ 增加品項</button>
      <select value={orderPay} onChange={e => setOrderPay(e.target.value)} style={is}><option>ACPAY刷卡機</option><option>臺灣企銀刷卡機</option><option>現金</option><option>銀行匯款</option><option>微信支付</option><option>支付寶</option></select>
      <input type="number" placeholder="本次收款金額" value={orderAmount} onChange={e => setOrderAmount(e.target.value)} style={is} />
      <input placeholder="備註" value={orderNote} onChange={e => setOrderNote(e.target.value)} style={is} />
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, textAlign: 'right' }}>訂單總額：<span style={{ color: C.gold, fontWeight: 700 }}>{fmt(orderType === '客戶寄存' ? 0 : orderItems.reduce((s, i) => s + (+i.price || 0) * ((+i.qtyCabinet || 0) + (+i.qtyTakeout || 0) + (+i.qtyOnsite || 0) + (+i.qtyPending || 0)), 0))}</span></div>
      <button onClick={submitOrder} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, background: C.gold, color: '#000', border: 'none', borderRadius: 12, cursor: 'pointer' }}>確認建立</button>
    </Overlay>}

    {/* PICKUP MODAL */}
    {modal === 'pickup' && <Overlay onClose={() => setModal(null)} title="📤 記錄領取">
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>選擇庫存品項</div>
      {(vipData?.inventory || []).filter(i => i.qty > 0).map(i => <button key={i.id} onClick={() => { setPickupItem(i); setPickupQty(1) }} style={{ width: '100%', textAlign: 'left', padding: 10, marginBottom: 4, background: pickupItem?.id === i.id ? 'rgba(208,165,79,.1)' : C.card, border: `1px solid ${pickupItem?.id === i.id ? C.gold : C.border}`, borderRadius: 8, color: C.text, cursor: 'pointer' }}>{i.product_name} ({i.qty}支) — 櫃位 {i.cabinet_no || '—'}</button>)}
      <input type="number" min={1} max={pickupItem?.qty || 999} value={pickupQty} onChange={e => setPickupQty(Math.max(1, Math.min(pickupItem?.qty || 999, +e.target.value || 1)))} placeholder="數量" style={{ ...is, marginTop: 8 }} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>{['現場享用', '外帶離店', '轉贈他人'].map(d => <button key={d} onClick={() => setPickupDest(d)} style={{ flex: 1, padding: 8, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: pickupDest === d ? C.gold : C.card, color: pickupDest === d ? '#000' : C.text, border: `1px solid ${C.border}` }}>{d}</button>)}</div>
      <input placeholder="備註" value={pickupNote} onChange={e => setPickupNote(e.target.value)} style={is} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}><span style={{ fontSize: 11, color: C.muted }}>客戶簽名</span><button onClick={() => { const c = sigRef.current; if (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); setSigData(null) } }} style={{ fontSize: 10, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>清除</button></div>
      <canvas ref={sigRef} width={300} height={100} style={{ width: '100%', height: 100, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 8, touchAction: 'none' }}
        onPointerDown={e => { const c = sigRef.current; if (!c) return; const ctx = c.getContext('2d'); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); const r = c.getBoundingClientRect(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top); c.onpointermove = ev => { ctx.lineTo(ev.clientX - r.left, ev.clientY - r.top); ctx.stroke() }; c.onpointerup = () => { c.onpointermove = null; setSigData(c.toDataURL()) } }} />
      <button onClick={submitPickup} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, background: C.gold, color: '#000', border: 'none', borderRadius: 12, cursor: 'pointer' }}>確認領取</button>
    </Overlay>}

    {/* PAYMENT MODAL */}
    {modal === 'payment' && <Overlay onClose={() => setModal(null)} title="💰 收款">
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>選擇未付清訂單</div>
      {(vipData?.orders || []).filter(o => o.paid < o.total).map(o => <button key={o.id} onClick={() => { setPayOrder(o); setPayAmount(String(o.total - o.paid)) }} style={{ width: '100%', textAlign: 'left', padding: 10, marginBottom: 4, background: payOrder?.id === o.id ? 'rgba(208,165,79,.1)' : C.card, border: `1px solid ${payOrder?.id === o.id ? C.gold : C.border}`, borderRadius: 8, color: C.text, cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: C.gold }}>{o.order_no}</span><span style={{ color: C.red, fontWeight: 600 }}>欠 {fmt(o.total - o.paid)}</span></div>
      </button>)}
      {payOrder && <div style={{ background: '#0d0b09', borderRadius: 8, padding: 10, marginBottom: 8, border: `1px solid ${C.gold}30` }}><div style={{ fontSize: 11, color: C.muted }}>訂單 {payOrder.order_no}</div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>總額 {fmt(payOrder.total)}</span><span>已付 {fmt(payOrder.paid)}</span><span style={{ color: C.red, fontWeight: 700 }}>待付 {fmt(payOrder.total - payOrder.paid)}</span></div></div>}
      <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={is}><option>ACPAY刷卡機</option><option>臺灣企銀刷卡機</option><option>現金</option><option>銀行匯款</option><option>微信支付</option><option>支付寶</option></select>
      <input type="number" placeholder="收款金額" value={payAmount} onChange={e => setPayAmount(e.target.value)} style={is} />
      <input placeholder="備註" value={payNote} onChange={e => setPayNote(e.target.value)} style={is} />
      <button onClick={submitPayment} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700, background: C.green, color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer' }}>確認收款</button>
    </Overlay>}
  </div>
}

/* ═══ ADMIN ═══ */
function Admin() {
  const [staff, setStaff] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const s = JSON.parse(sessionStorage.getItem('vip_staff') || 'null')
    if (!s?.is_admin) return void (window.location.href = '/vip-cellar')
    setStaff(s); loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const { data: mList } = await supabase.from('vip_members').select('id, name, phone, cabinet_opened, is_active').eq('is_active', true).order('name')
    const memberData = []
    for (const m of (mList || [])) {
      const [cabRes, ordRes] = await Promise.all([
        supabase.from('vip_cabinets').select('quantity').eq('vip_id', m.id).gt('quantity', 0),
        supabase.from('vip_orders').select('order_total, balance, is_voided').eq('vip_id', m.id),
      ])
      const cellar = (cabRes.data || []).reduce((s, c) => s + (c.quantity || 0), 0)
      const orders = (ordRes.data || []).filter(o => !o.is_voided)
      const spent = orders.reduce((s, o) => s + (o.order_total || 0), 0)
      const unpaid = orders.reduce((s, o) => s + (o.balance || 0), 0)
      memberData.push({ ...m, cellar_count: cellar, total_spent: spent, unpaid })
    }
    setMembers(memberData)
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.muted, background: C.bg, minHeight: '100vh' }}>載入中…</div>

  const totalVips = members.length
  const totalSpent = members.reduce((s, m) => s + m.total_spent, 0)
  const totalUnpaid = members.reduce((s, m) => s + m.unpaid, 0)
  const unpaidRanking = members.filter(m => m.unpaid > 0).sort((a, b) => b.unpaid - a.unpaid)
  const stats = [
    { label: 'VIP 人數', value: totalVips, color: C.gold },
    { label: '總消費', value: fmt(totalSpent), color: C.gold },
    { label: '待收款', value: fmt(totalUnpaid), color: totalUnpaid > 0 ? C.red : C.muted },
  ]

  return <div style={{ minHeight: '100vh', paddingBottom: 80, background: C.bg, color: C.text, overflowY: 'auto' }}>
    <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#151311' }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>💎 VIP 窖藏管理</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => window.location.href = '/vip-cellar/staff'} style={{ fontSize: 11, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>員工模式</button>
        <button onClick={() => { sessionStorage.removeItem('vip_staff'); window.location.href = '/vip-cellar' }} style={{ fontSize: 11, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>登出</button>
      </div>
    </div>
    <div style={{ padding: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {stats.map(s => <div key={s.label} style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}><div style={{ fontSize: 11, color: C.muted }}>{s.label}</div><div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.value}</div></div>)}
      </div>
      {unpaidRanking.length > 0 && <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 8 }}>💰 欠款排行</div>
        {unpaidRanking.map(v => <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: C.card, borderRadius: 8, marginBottom: 4, border: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{v.name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.red, fontFamily: 'var(--font-mono)' }}>{fmt(v.unpaid)}</span>
        </div>)}
      </div>}
      <div style={{ fontSize: 14, fontWeight: 700, color: C.gold, marginBottom: 8 }}>全部會員 ({totalVips})</div>
      {members.map(v => <div key={v.id} style={{ background: C.card, borderRadius: 10, padding: 12, marginBottom: 6, border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div style={{ fontSize: 13, fontWeight: 600 }}>{v.name}</div><div style={{ fontSize: 10, color: C.muted }}>{v.id}{v.phone ? ` · ${v.phone}` : ''} · {v.cellar_count}支</div></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>{fmt(v.total_spent)}</div>{v.unpaid > 0 && <div style={{ fontSize: 10, color: C.red }}>欠 {fmt(v.unpaid)}</div>}</div>
      </div>)}
    </div>
  </div>
}

/* ═══ OVERLAY ═══ */
function Overlay({ onClose, title, children }) {
  return <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
    <div style={{ background: '#1a1714', border: '1px solid rgba(208,165,79,.3)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><span style={{ fontSize: 16, fontWeight: 700, color: '#d0a54f' }}>{title}</span><button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer', fontSize: 18 }}>✕</button></div>
      {children}
    </div>
  </div>
}
