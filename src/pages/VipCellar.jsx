import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const C = { bg: '#0a0a0a', card: '#1e1a16', border: '#2d2720', gold: '#c9a84c', lgold: '#e8dcc8', text: '#e8dcc8', muted: '#8a7e6e', green: '#4da86c', red: '#e74c3c', blue: '#4d8ac4', purple: '#9b59b6' }
const fmt = n => `$${Number(n || 0).toLocaleString()}`
const fmtD = d => d ? new Date(d).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : ''
const fmtDT = d => d ? new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
const DEST_COLOR = { '現場享用': C.green, '外帶離店': C.blue, '轉贈他人': C.purple }
const PAY_OPTS = ['ACPAY刷卡機', '臺灣企銀刷卡機(美國運通/銀聯)', '現金', '銀行匯款', '微信支付', '支付寶']
const SRC_TAGS = ['老闆客戶', '老闆娘客戶', '店內新客戶', '友人介紹', 'LINE訂購']

function agingLabel(ds) { if (!ds) return null; const m = Math.floor((Date.now() - new Date(ds).getTime()) / (30.44 * 86400000)); return m < 3 ? { l: '🌱 醇化中', c: C.green } : m < 12 ? { l: '✅ 適飲', c: C.gold } : { l: '⭐ 完美熟成', c: C.purple } }

async function loadVipTables(mid) {
  const [cabR, ordR, wR] = await Promise.all([
    supabase.from('vip_cabinets').select('*').eq('vip_id', mid).gt('quantity', 0).order('cabinet_no'),
    supabase.from('vip_orders').select('*').eq('vip_id', mid).order('created_at', { ascending: false }),
    supabase.from('vip_withdrawals').select('*').eq('vip_id', mid).order('withdrawn_at', { ascending: false }),
  ])
  const cab = cabR.data || [], ord = ordR.data || [], wd = wR.data || []
  const validOrd = ord.filter(o => !o.is_voided)
  return {
    cellar_count: cab.reduce((s, c) => s + (c.quantity || 0), 0),
    cellar_value: cab.reduce((s, c) => s + (c.market_value || (c.quantity || 0) * (c.unit_price || 0)), 0),
    unpaid: validOrd.reduce((s, o) => s + (o.balance || 0), 0),
    total_spent: validOrd.reduce((s, o) => s + (o.order_total || 0), 0),
    total_paid: validOrd.reduce((s, o) => s + ((o.order_total || 0) - (o.balance || 0)), 0),
    inventory: cab.map(c => ({ id: c.id, cabinet_no: c.cabinet_no, product_name: c.product_name || c.cigar_name || '—', brand: c.brand || '', qty: c.quantity, unit_price: c.unit_price || 0, stored_at: c.stored_at || c.created_at })),
    orders: ord.map(o => ({ id: o.id, order_no: o.order_no, total: o.order_total || 0, paid: (o.order_total || 0) - (o.balance || 0), balance: o.balance || 0, created_at: o.created_at, status: o.status, is_voided: o.is_voided })),
    pickups: wd.map(w => ({ id: w.id, product_name: w.product_name || w.cigar_name || '—', qty_withdrawn: w.qty_withdrawn || w.quantity || 0, qty_remaining: w.qty_remaining, destination: w.destination || w.purpose || '—', cabinet_no: w.cabinet_no || '—', staff_name: w.staff_name || w.handled_by_name || '—', notes: w.notes || '', signature_url: w.signature_url, withdrawn_at: w.withdrawn_at || w.created_at })),
  }
}

// ── Shared UI ──
const Btn = ({ children, gold, red, green, small, ...p }) => <button {...p} style={{ padding: small ? '6px 12px' : '10px 16px', fontSize: small ? 11 : 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: gold ? C.gold : red ? C.red : green ? C.green : C.card, color: gold ? '#000' : '#fff', ...p.style }}>{children}</button>
const Inp = (p) => <input {...p} style={{ width: '100%', fontSize: 13, padding: '10px 12px', background: '#2a2520', border: `1px solid ${C.gold}30`, borderRadius: 10, color: C.text, boxSizing: 'border-box', marginBottom: 8, ...p.style }} />
const Stat = ({ label, value, color }) => <div style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}><div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{label}</div><div style={{ fontSize: 20, fontWeight: 700, color: color || C.text, fontFamily: 'var(--font-mono)' }}>{value}</div></div>
function Overlay({ onClose, title, children }) { return <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.9)', zIndex: 300, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }} onClick={onClose}><div style={{ maxWidth: 520, margin: '20px auto', background: '#1a1714', border: `1px solid ${C.gold}40`, borderRadius: 20, padding: 24 }} onClick={e => e.stopPropagation()}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><span style={{ fontSize: 18, fontWeight: 700, color: C.gold }}>{title}</span><button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20 }}>✕</button></div>{children}</div></div> }
function Header({ left, right }) { return <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1714', flexShrink: 0 }}>{left}{right}</div> }

export default function VipCellar() {
  const p = window.location.pathname
  if (p.startsWith('/vip-cellar/portal')) return <Portal />
  if (p.startsWith('/vip-cellar/staff')) return <Staff />
  if (p.startsWith('/vip-cellar/admin')) return <Admin />
  return <Login />
}

/* ═══ LOGIN ═══ */
function Login() {
  const [vid, setVid] = useState(''); const [pwd, setPwd] = useState(''); const [needPwd, setNeedPwd] = useState(false); const [sc, setSc] = useState(''); const [err, setErr] = useState('')
  async function vipLogin() { if (!vid.trim()) return setErr('請輸入 VIP 編號'); setErr(''); const { data, error } = await supabase.rpc('vip_login', { p_vip_id: vid.trim(), p_password: pwd || null }); if (error) return setErr(error.message); if (!data?.success) { if (data?.need_password) { setNeedPwd(true); return setErr('請輸入密碼') } return setErr(data?.error || '登入失敗') }; sessionStorage.setItem('vip_session', JSON.stringify({ id: data.id, name: data.name, vip_id: vid.trim() })); window.location.href = '/vip-cellar/portal' }
  async function staffLogin() { if (!sc.trim()) return setErr('請輸入員工代碼'); setErr(''); const { data } = await supabase.from('employees').select('id, name, is_admin, login_code').eq('login_code', String(sc).trim()).eq('enabled', true).maybeSingle(); if (!data) return setErr('查無此員工'); sessionStorage.setItem('vip_staff', JSON.stringify(data)); window.location.href = data.is_admin ? '/vip-cellar/admin' : '/vip-cellar/staff' }
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, padding: 20 }}><div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
    <div style={{ fontSize: 40, marginBottom: 8 }}>💎</div>
    <div style={{ fontSize: 11, letterSpacing: 4, color: C.gold, fontWeight: 700 }}>W CIGAR BAR</div>
    <div style={{ fontSize: 10, color: C.muted, marginBottom: 20 }}>VIP Concierge & Assets</div>
    <Inp value={vid} onChange={e => setVid(e.target.value)} placeholder="請輸入 VIP 編號" onKeyDown={e => e.key === 'Enter' && vipLogin()} style={{ textAlign: 'center', fontSize: 16 }} />
    {needPwd && <Inp type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="密碼" onKeyDown={e => e.key === 'Enter' && vipLogin()} style={{ textAlign: 'center' }} />}
    <Btn gold onClick={vipLogin} style={{ width: '100%', marginBottom: 16 }}>探索我的窖藏</Btn>
    {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
    <div style={{ height: 1, background: C.border, margin: '16px 0' }} />
    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>員工入口</div>
    <div style={{ display: 'flex', gap: 8 }}><Inp value={sc} onChange={e => setSc(e.target.value)} placeholder="員工代碼" onKeyDown={e => e.key === 'Enter' && staffLogin()} style={{ flex: 1, textAlign: 'center', marginBottom: 0 }} /><Btn onClick={staffLogin} style={{ background: C.card, color: C.gold, border: `1px solid ${C.border}` }}>進入</Btn></div>
  </div></div>
}

/* ═══ VIP PORTAL ═══ */
function Portal({ staffMode, vipOverride, onPickup, onPay } = {}) {
  const [vip, setVip] = useState(null); const [tab, setTab] = useState('cellar'); const [loading, setLoading] = useState(true); const [hideAmt, setHideAmt] = useState(false); const [cellarView, setCellarView] = useState('cabinet'); const [showPrint, setShowPrint] = useState(false)
  useEffect(() => { if (vipOverride) { setVip(vipOverride); setLoading(false); return } const s = JSON.parse(sessionStorage.getItem('vip_session') || 'null'); if (!s) return void (window.location.href = '/vip-cellar'); load(s.id || s.vip_id, s) }, [vipOverride])
  async function load(mid, sess) { setLoading(true); try { const d = await loadVipTables(mid); setVip({ name: sess?.name || '—', vip_id: sess?.vip_id || mid, tier: sess?.tier || 'VIP', cabinet_opened: sess?.cabinet_opened, ...d }) } catch (e) { console.error(e) } setLoading(false) }
  function reload() { const s = vipOverride || JSON.parse(sessionStorage.getItem('vip_session') || 'null'); if (s) load(s.id || s.vip_id, s) }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>載入中…</div>
  if (!vip) return <div style={{ padding: 40, textAlign: 'center', color: C.red }}>無法載入</div>

  const $$ = v => hideAmt ? '***' : fmt(v)
  const inv = vip.inventory || []; const ords = (vip.orders || []).filter(o => !o.is_voided); const picks = vip.pickups || []
  const byCab = {}; inv.forEach(i => { const k = i.cabinet_no || '未指定'; if (!byCab[k]) byCab[k] = []; byCab[k].push(i) })
  const byBrand = {}; inv.forEach(i => { const b = (i.product_name || '').split(' ')[0] || '其他'; if (!byBrand[b]) byBrand[b] = []; byBrand[b].push(i) })
  const totalItems = inv.length; const totalQty = inv.reduce((s, i) => s + i.qty, 0); const totalVal = inv.reduce((s, i) => s + i.qty * i.unit_price, 0)
  const totalPaid = ords.reduce((s, o) => s + o.paid, 0); const paidPct = vip.total_spent > 0 ? Math.round(totalPaid / vip.total_spent * 100) : 100

  const tabs = [{ key: 'cellar', label: '📦 專屬窖藏' }, { key: 'pickups', label: '📜 領取軌跡' }, { key: 'finance', label: '📊 財務總帳' }]

  return <div style={{ minHeight: '100vh', paddingBottom: 80, background: C.bg, color: C.text, overflowY: 'auto' }}>
    <style>{`@media print { body * { visibility: hidden; } #vip-print-area, #vip-print-area * { visibility: visible; } #vip-print-area { position: absolute; left: 0; top: 0; width: 100%; color: #000; background: #fff; padding: 20px; } }`}</style>
    {/* Header */}
    {!staffMode && <Header left={<div><div style={{ fontSize: 16, fontWeight: 700, color: C.gold }}>W CIGAR BAR</div><div style={{ fontSize: 9, color: C.muted }}>VIP Concierge & Assets</div></div>} right={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button onClick={() => setHideAmt(!hideAmt)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16 }}>{hideAmt ? '🙈' : '👁'}</button>
      <button onClick={() => { sessionStorage.removeItem('vip_session'); window.location.href = '/vip-cellar' }} style={{ fontSize: 11, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>登出</button>
    </div>} />}
    <div style={{ padding: '16px 20px' }}>
      {/* Unpaid warning */}
      {vip.unpaid > 0 && <div style={{ background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: C.red }}>⚠ 待結尾款提醒　您目前尚有 <b>{fmt(vip.unpaid)}</b> 未結清款項。</div>}
      {/* Name */}
      <div style={{ fontSize: 22, fontWeight: 800, color: C.gold, marginBottom: 2 }}>{vip.name}</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>VIP ID: {vip.vip_id}</div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
        <Stat label="歷史購買總額" value={$$(vip.total_spent)} />
        <Stat label="目前窖內總值" value={$$(vip.cellar_value)} color={C.gold} />
        <Stat label="期末應收（待結帳）" value={$$(vip.unpaid)} color={vip.unpaid > 0 ? C.red : C.muted} />
        <Stat label="目前窖內總數" value={`${vip.cellar_count} 支`} />
      </div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: tab === t.key ? `${C.gold}20` : 'transparent', color: tab === t.key ? C.gold : C.muted, border: tab === t.key ? `1px solid ${C.gold}40` : `1px solid ${C.border}` }}>{t.label}</button>)}
      </div>

      {/* ── CELLAR ── */}
      {tab === 'cellar' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setCellarView('cabinet')} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', background: cellarView === 'cabinet' ? `${C.gold}20` : 'transparent', color: cellarView === 'cabinet' ? C.gold : C.muted, border: `1px solid ${cellarView === 'cabinet' ? C.gold + '40' : C.border}` }}>📦 依櫃位</button>
            <button onClick={() => setCellarView('brand')} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', background: cellarView === 'brand' ? `${C.gold}20` : 'transparent', color: cellarView === 'brand' ? C.gold : C.muted, border: `1px solid ${cellarView === 'brand' ? C.gold + '40' : C.border}` }}>🏷 依品牌</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={reload} style={{ fontSize: 10, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>🔄</button>
            <Btn gold small onClick={() => setShowPrint(true)}>🖨 列印窖藏</Btn>
          </div>
        </div>
        {Object.entries(cellarView === 'cabinet' ? byCab : byBrand).map(([grp, items]) => <div key={grp} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, marginBottom: 6 }}>{cellarView === 'cabinet' ? `🗄️ NO.${grp} 號櫃` : `🏷 ${grp}`}</div>
          {items.map(i => { const age = agingLabel(i.stored_at); return <div key={i.id} style={{ background: C.card, borderRadius: 10, padding: 12, marginBottom: 6, border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{i.product_name}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{i.qty}支 · {fmt(i.unit_price)}/支{age ? ' · ' : ''}{age && <span style={{ color: age.c }}>{age.l}</span>}</div>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.gold, fontFamily: 'var(--font-mono)' }}>{$$(i.unit_price * i.qty)}</span>
              {staffMode && onPickup && <button onClick={() => onPickup(i)} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, background: `${C.gold}15`, color: C.gold, border: `1px solid ${C.gold}30`, cursor: 'pointer' }}>📤 領取</button>}
            </div>
          </div> })}
        </div>)}
        {!inv.length && <div style={{ textAlign: 'center', padding: 30, color: C.muted }}>目前無窖藏品項</div>}
        {inv.length > 0 && <div style={{ background: C.card, borderRadius: 10, padding: 12, border: `1px solid ${C.gold}30`, display: 'flex', justifyContent: 'space-around', fontSize: 11, color: C.muted }}>
          <span>總庫存 <b style={{ color: C.text }}>{totalQty}</b> 支</span>
          <span>總市值 <b style={{ color: C.gold }}>{$$(totalVal)}</b></span>
          <span>共 <b style={{ color: C.text }}>{totalItems}</b> 品項</span>
        </div>}
      </>}

      {/* ── PICKUPS ── */}
      {tab === 'pickups' && <>
        {!picks.length ? <div style={{ textAlign: 'center', padding: 30, color: C.muted }}>無領取紀錄</div> : picks.map(p => <div key={p.id} style={{ background: C.card, borderRadius: 12, padding: 14, marginBottom: 10, border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: C.muted }}>{fmtDT(p.withdrawn_at)}</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: (DEST_COLOR[p.destination] || C.muted) + '20', color: DEST_COLOR[p.destination] || C.muted }}>{p.destination}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{p.product_name}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, fontSize: 10 }}>
            <div><div style={{ color: C.muted }}>出庫櫃位</div><div style={{ fontWeight: 600 }}>{p.cabinet_no}</div></div>
            <div><div style={{ color: C.muted }}>領取數量</div><div style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>{p.qty_withdrawn}</div></div>
            <div><div style={{ color: C.muted }}>去向</div><div style={{ fontWeight: 600 }}>{p.destination}</div></div>
            <div><div style={{ color: C.muted }}>服務管家</div><div style={{ fontWeight: 600 }}>{p.staff_name}</div></div>
            <div><div style={{ color: C.muted }}>領後剩餘</div><div style={{ fontWeight: 600 }}>{p.qty_remaining ?? '—'}</div></div>
          </div>
          {p.notes && <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>備註：{p.notes}</div>}
          {p.signature_url && <div style={{ marginTop: 8 }}><div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>客戶親筆畫押</div><img src={p.signature_url} alt="簽名" style={{ maxWidth: 200, width: '100%', borderRadius: 8, border: `1px solid ${C.border}` }} /></div>}
        </div>)}
      </>}

      {/* ── FINANCE ── */}
      {tab === 'finance' && <div id="vip-print-area">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>帳戶總覽</span>
          <button onClick={() => window.print()} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, background: C.card, color: C.gold, border: `1px solid ${C.border}`, cursor: 'pointer' }}>📄 PDF 對帳單</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
          <Stat label="累計消費" value={$$(vip.total_spent)} color={C.text} />
          <Stat label="累計已付" value={$$(vip.total_paid)} color={C.green} />
          <Stat label="待結帳額" value={$$(vip.unpaid)} color={vip.unpaid > 0 ? C.red : C.muted} />
          <Stat label="訂單筆數" value={ords.length + ' 筆'} />
        </div>
        <div style={{ background: C.card, borderRadius: 10, padding: '10px 14px', marginBottom: 16, border: `1px solid ${C.border}` }}>
          <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}><div style={{ height: '100%', background: C.green, borderRadius: 3, width: `${paidPct}%` }} /></div>
          <div style={{ fontSize: 10, color: C.muted }}>付款進度 {paidPct}%</div>
        </div>
        {/* Orders */}
        {ords.map(o => <div key={o.id} style={{ background: C.card, borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: C.gold, fontFamily: 'var(--font-mono)' }}>{o.order_no}</div>
            <div style={{ fontSize: 10, color: C.muted }}>{fmtD(o.created_at)} · {o.status || '—'}</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{fmt(o.total)} <span style={{ fontSize: 10, color: o.paid >= o.total ? C.green : C.red }}>{o.paid >= o.total ? '已付清' : `欠 ${fmt(o.balance)}`}</span></div>
          </div>
          {staffMode && onPay && o.paid < o.total && <button onClick={() => onPay(o)} style={{ fontSize: 10, padding: '6px 10px', borderRadius: 8, background: `${C.green}15`, color: C.green, border: `1px solid ${C.green}40`, cursor: 'pointer' }}>💰 收款</button>}
        </div>)}
        {/* Recent pickups in finance */}
        {picks.length > 0 && <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.gold, marginBottom: 8 }}>最近領取紀錄（共{picks.length}筆）</div>
          {picks.slice(0, 10).map(p => <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ color: C.muted }}>{fmtD(p.withdrawn_at)}</span><span>{p.product_name}</span><span style={{ color: C.gold }}>{p.qty_withdrawn}支</span><span style={{ color: C.muted }}>{p.destination}</span><span style={{ color: C.muted }}>{p.staff_name}</span>
          </div>)}
          {picks.length > 10 && <div style={{ fontSize: 10, color: C.muted, marginTop: 6, textAlign: 'center' }}>…還有{picks.length - 10}筆，前往「領取軌跡」查看完整紀錄</div>}
        </div>}
      </div>}
    </div>

    {/* PRINT MODAL */}
    {showPrint && <Overlay onClose={() => setShowPrint(false)} title="🖨 列印窖藏清單">
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}><b style={{ color: C.gold, fontSize: 16 }}>W CIGAR BAR</b><br /><span style={{ fontSize: 10 }}>VIP 窖藏庫存清單 | 列印日期：{fmtD(new Date())}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}><span>會員姓名：<b style={{ color: C.text }}>{vip.name}</b></span><span>會員編號：<b style={{ color: C.text }}>{vip.vip_id}</b></span></div>
      </div>
      {Object.entries(byCab).map(([cab, items]) => <div key={cab} style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, marginBottom: 4 }}>NO.{cab} 號櫃</div>
        {items.map(i => <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', borderBottom: `1px solid ${C.border}20` }}><span style={{ flex: 2 }}>{i.product_name}</span><span style={{ width: 40, textAlign: 'center' }}>{i.qty}支</span><span style={{ width: 70, textAlign: 'right' }}>{fmt(i.unit_price)}</span><span style={{ width: 80, textAlign: 'right', color: C.gold }}>{fmt(i.qty * i.unit_price)}</span><span style={{ width: 70, textAlign: 'right', color: C.muted }}>{fmtD(i.stored_at)}</span></div>)}
        <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 11, fontWeight: 700, padding: '4px 0', color: C.gold }}>小計：{items.reduce((s, i) => s + i.qty, 0)}支 / {fmt(items.reduce((s, i) => s + i.qty * i.unit_price, 0))}</div>
      </div>)}
      <div style={{ background: `${C.gold}15`, borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-around', fontSize: 12, fontWeight: 700, color: C.gold, border: `1px solid ${C.gold}30` }}>
        <span>總庫存 {totalQty} 支</span><span>總市值 {fmt(totalVal)}</span><span>{Object.keys(byCab).length} 個櫃位</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Btn onClick={() => setShowPrint(false)} style={{ flex: 1, background: C.card, color: C.muted, border: `1px solid ${C.border}` }}>✕ 關閉</Btn>
        <Btn gold onClick={() => window.print()} style={{ flex: 1 }}>🖨 列印/儲存 PDF</Btn>
      </div>
    </Overlay>}
  </div>
}

/* ═══ STAFF ═══ */
function Staff() {
  const [staff, setStaff] = useState(null); const [members, setMembers] = useState([]); const [search, setSearch] = useState(''); const [sel, setSel] = useState(null); const [vd, setVd] = useState(null)
  const [modal, setModal] = useState(null); const [orderType, setOrderType] = useState('現貨購買')
  const [orderItems, setOrderItems] = useState([{ name: '', price: '', qtyCabinet: 0, qtyTakeout: 0, qtyOnsite: 0, qtyPending: 0, cabinet: '' }])
  const [orderPay, setOrderPay] = useState('現金'); const [orderAmount, setOrderAmount] = useState(''); const [orderNote, setOrderNote] = useState(''); const [orderSrcTags, setOrderSrcTags] = useState([])
  const [pickupItem, setPickupItem] = useState(null); const [pickupQty, setPickupQty] = useState(1); const [pickupDest, setPickupDest] = useState('現場享用'); const [pickupNote, setPickupNote] = useState('')
  const [payOrder, setPayOrder] = useState(null); const [payAmount, setPayAmount] = useState(''); const [payMethod, setPayMethod] = useState('現金'); const [payNote, setPayNote] = useState('')
  const sigRef = useRef(null); const [sigData, setSigData] = useState(null); const receiptRef = useRef(null); const [receiptPreview, setReceiptPreview] = useState(null)

  useEffect(() => { const s = JSON.parse(sessionStorage.getItem('vip_staff') || 'null'); if (!s) return void (window.location.href = '/vip-cellar'); setStaff(s); loadMembers() }, [])
  async function loadMembers() { const { data } = await supabase.from('vip_members').select('id, name, phone, cabinet_opened, is_active').eq('is_active', true).order('name'); setMembers(data || []) }
  const filtered = members.filter(m => !search || (m.name || '').includes(search) || (m.id || '').includes(search))

  async function loadVD(v) { setSel(v); try { const d = await loadVipTables(v.id); setVd({ name: v.name, vip_id: v.id, tier: v.tier, cabinet_opened: v.cabinet_opened, ...d }) } catch { setVd(null) } }

  async function submitOrder() {
    const items = orderItems.filter(i => i.name.trim()); if (!items.length) return alert('請填寫品項')
    const orderNo = 'ORD-' + new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 15)
    const isStore = orderType === '客戶寄存'
    const total = isStore ? 0 : items.reduce((s, i) => s + (+i.price || 0) * ((+i.qtyCabinet || 0) + (+i.qtyTakeout || 0) + (+i.qtyOnsite || 0) + (+i.qtyPending || 0)), 0)
    const paid = +orderAmount || 0; const status = paid >= total && total > 0 ? '已沖平結清' : paid > 0 ? '部分沖銷' : '未付款'
    const notes = [orderNote, orderSrcTags.length ? '來源: ' + orderSrcTags.join(', ') : ''].filter(Boolean).join(' | ')
    const { data: ord, error } = await supabase.from('vip_orders').insert({ order_no: orderNo, vip_id: sel.id, vip_name: sel.name, order_type: orderType, order_total: total, paid_amount: paid, balance: Math.max(0, total - paid), status, notes, staff_name: staff.name }).select().single()
    if (error) return alert('建立失敗: ' + error.message)
    for (const i of items) { const tq = (+i.qtyCabinet || 0) + (+i.qtyTakeout || 0) + (+i.qtyOnsite || 0) + (+i.qtyPending || 0); await supabase.from('vip_order_items').insert({ order_id: ord.id, order_no: orderNo, product_name: i.name, qty_ordered: tq, qty_delivered: tq - (+i.qtyPending || 0), qty_pending: +i.qtyPending || 0, unit_price: +i.price || 0, cabinet_no: i.cabinet || null }) }
    for (const i of items) { if ((+i.qtyCabinet || 0) > 0 && i.cabinet) await supabase.from('vip_cabinets').insert({ vip_id: sel.id, cabinet_no: i.cabinet, product_name: i.name, quantity: +i.qtyCabinet, unit_price: +i.price || 0, stored_date: new Date().toISOString().slice(0, 10) }) }
    if (paid > 0) await supabase.from('vip_payments').insert({ order_id: ord.id, order_no: orderNo, vip_id: sel.id, amount: paid, payment_method: orderPay, staff_name: staff.name })
    alert('✅ 訂單已建立'); setModal(null); setOrderItems([{ name: '', price: '', qtyCabinet: 0, qtyTakeout: 0, qtyOnsite: 0, qtyPending: 0, cabinet: '' }]); setOrderAmount(''); setOrderNote(''); setOrderSrcTags([]); loadVD(sel)
  }

  async function submitPickup() {
    if (!pickupItem) return alert('請選擇品項'); if (pickupQty > pickupItem.qty) return alert(`最多 ${pickupItem.qty} 支`)
    await supabase.from('vip_cabinets').update({ quantity: pickupItem.qty - pickupQty }).eq('id', pickupItem.id)
    await supabase.from('vip_withdrawals').insert({ vip_id: sel.id, vip_name: sel.name, cabinet_no: pickupItem.cabinet_no, product_name: pickupItem.product_name, cigar_name: pickupItem.product_name, qty_withdrawn: pickupQty, qty_remaining: pickupItem.qty - pickupQty, destination: pickupDest, purpose: pickupDest, staff_name: staff.name, handled_by_name: staff.name, notes: pickupNote || null, signature_url: sigData || null, withdrawn_at: new Date().toISOString() })
    alert('✅ 領取已記錄'); setModal(null); setPickupItem(null); setPickupQty(1); setPickupNote(''); setSigData(null); loadVD(sel)
  }

  async function submitPayment() {
    if (!payOrder) return alert('請選擇訂單'); const amt = +payAmount || 0; if (amt <= 0) return alert('請填寫金額')
    await supabase.from('vip_payments').insert({ order_id: payOrder.id, order_no: payOrder.order_no, vip_id: sel.id, amount: amt, payment_method: payMethod, staff_name: staff.name, notes: payNote || null })
    const np = payOrder.paid + amt; await supabase.from('vip_orders').update({ paid_amount: np, balance: Math.max(0, payOrder.total - np), status: np >= payOrder.total ? '已沖平結清' : '部分沖銷', updated_at: new Date().toISOString() }).eq('id', payOrder.id)
    alert('✅ 已收款'); setModal(null); setPayAmount(''); setPayNote(''); setPayOrder(null); loadVD(sel)
  }

  function clearSig() { const c = sigRef.current; if (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); setSigData(null) } }
  function SigCanvas() { return <><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}><span style={{ fontSize: 11, color: C.muted }}>客戶簽名確認</span><button onClick={clearSig} style={{ fontSize: 10, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>清除</button></div>
    <canvas ref={sigRef} width={400} height={120} style={{ width: '100%', height: 120, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 12, touchAction: 'none' }} onPointerDown={e => { const c = sigRef.current; if (!c) return; const ctx = c.getContext('2d'); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); const r = c.getBoundingClientRect(); ctx.moveTo((e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)); c.onpointermove = ev => { ctx.lineTo((ev.clientX - r.left) * (c.width / r.width), (ev.clientY - r.top) * (c.height / r.height)); ctx.stroke() }; c.onpointerup = () => { c.onpointermove = null; setSigData(c.toDataURL()) } }} /></>
  }

  if (!staff) return null

  return <div style={{ minHeight: '100vh', paddingBottom: 80, background: C.bg, color: C.text, overflowY: 'auto' }}>
    <Header left={<div><div style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>💎 管家作業模式</div></div>} right={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: `${C.gold}15`, color: C.gold, fontWeight: 600 }}>{staff.name}</span>
      {!sel && <Btn gold small onClick={() => setModal('order')}>＋ 新增訂單</Btn>}
      <button onClick={() => { sessionStorage.removeItem('vip_staff'); window.location.href = '/vip-cellar' }} style={{ fontSize: 11, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>登出</button>
    </div>} />

    {!sel ? <div style={{ padding: 20 }}>
      <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 搜尋客戶姓名或會員編號..." style={{ fontSize: 14, marginBottom: 12 }} />
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{filtered.length} 位會員</div>
      {filtered.map(m => <div key={m.id} onClick={() => loadVD(m)} style={{ background: C.card, borderRadius: 12, padding: 14, marginBottom: 8, border: `1px solid ${C.border}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div style={{ fontSize: 15, fontWeight: 600 }}>{m.name}</div><div style={{ fontSize: 11, color: C.muted }}>ID: {m.id}{m.phone ? ` | ${m.phone}` : ''}</div></div>
        <span style={{ color: C.muted, fontSize: 18 }}>›</span>
      </div>)}
    </div> : <div style={{ padding: 20 }}>
      <button onClick={() => { setSel(null); setVd(null) }} style={{ fontSize: 12, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', marginBottom: 12 }}>← 返回會員列表</button>
      {vd && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div><div style={{ fontSize: 20, fontWeight: 800, color: C.gold }}>{vd.name}</div><div style={{ fontSize: 11, color: C.muted }}>{vd.vip_id} · 窖藏 {vd.cellar_count}支 · 未付 {fmt(vd.unpaid)}</div></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Btn gold onClick={() => setModal('order')} style={{ flex: 1 }}>＋ 新增訂單</Btn>
          <Btn onClick={() => setModal('pickup')} style={{ flex: 1, background: C.card, color: C.gold, border: `1px solid ${C.border}` }}>📤 記錄領取</Btn>
          <Btn onClick={() => setModal('payment')} style={{ flex: 1, background: C.card, color: C.green, border: `1px solid ${C.border}` }}>💰 收款</Btn>
        </div>
        <Portal staffMode vipOverride={vd} onPickup={i => { setPickupItem(i); setPickupQty(1); setPickupNote(''); setSigData(null); setModal('pickup') }} onPay={o => { setPayOrder(o); setPayAmount(String(o.balance || 0)); setPayNote(''); setModal('payment') }} />
      </>}
    </div>}

    {/* ORDER MODAL */}
    {modal === 'order' && <Overlay onClose={() => setModal(null)} title="＋ 新增訂單 / 開櫃">
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>{['現貨購買', '預購訂貨', '客戶寄存'].map(t => <button key={t} onClick={() => setOrderType(t)} style={{ flex: 1, padding: 8, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: orderType === t ? C.gold : C.card, color: orderType === t ? '#000' : C.text, border: `1px solid ${C.border}` }}>{t}</button>)}</div>
      {orderItems.map((item, idx) => { const upd = (k, v) => { const a = [...orderItems]; a[idx][k] = v; setOrderItems(a) }; return <div key={idx} style={{ background: '#0d0b09', borderRadius: 10, padding: 10, marginBottom: 8, border: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}><Inp placeholder="品名 *" value={item.name} onChange={e => upd('name', e.target.value)} style={{ flex: 2, marginBottom: 0 }} /><Inp type="number" placeholder="單價 $" value={item.price} onChange={e => upd('price', e.target.value)} style={{ flex: 1, marginBottom: 0 }} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 6 }}>{[['qtyCabinet', '🏠 入櫃'], ['qtyTakeout', '🚗 外帶'], ['qtyOnsite', '🪑 現場'], ['qtyPending', '✈ 未到貨']].map(([k, l]) => <div key={k}><div style={{ fontSize: 9, color: C.muted }}>{l}</div><input type="number" min={0} value={item[k]} onChange={e => upd(k, +e.target.value || 0)} style={{ width: '100%', fontSize: 12, padding: '6px 4px', background: '#2a2520', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, textAlign: 'center' }} /></div>)}</div>
        {(+item.qtyCabinet || 0) > 0 && <Inp placeholder="櫃位號碼" value={item.cabinet} onChange={e => upd('cabinet', e.target.value)} style={{ marginBottom: 4, borderColor: `${C.gold}50`, color: C.gold }} />}
        <div style={{ fontSize: 10, color: C.muted, textAlign: 'right' }}>合計 {(+item.qtyCabinet || 0) + (+item.qtyTakeout || 0) + (+item.qtyOnsite || 0) + (+item.qtyPending || 0)} 支 · 小計 {fmt((+item.price || 0) * ((+item.qtyCabinet || 0) + (+item.qtyTakeout || 0) + (+item.qtyOnsite || 0) + (+item.qtyPending || 0)))}</div>
        {orderItems.length > 1 && <button onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))} style={{ fontSize: 10, color: C.red, background: 'none', border: 'none', cursor: 'pointer' }}>✕ 移除</button>}
      </div> })}
      <button onClick={() => setOrderItems([...orderItems, { name: '', price: '', qtyCabinet: 0, qtyTakeout: 0, qtyOnsite: 0, qtyPending: 0, cabinet: '' }])} style={{ fontSize: 11, color: C.gold, background: 'none', border: `1px dashed ${C.border}`, borderRadius: 8, padding: 8, width: '100%', cursor: 'pointer', marginBottom: 12 }}>+ 新增品項</button>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.gold, textAlign: 'right', marginBottom: 12 }}>訂單總額：{fmt(orderType === '客戶寄存' ? 0 : orderItems.reduce((s, i) => s + (+i.price || 0) * ((+i.qtyCabinet || 0) + (+i.qtyTakeout || 0) + (+i.qtyOnsite || 0) + (+i.qtyPending || 0)), 0))}</div>
      <select value={orderPay} onChange={e => setOrderPay(e.target.value)} style={{ width: '100%', fontSize: 13, padding: '10px 12px', background: '#2a2520', border: `1px solid ${C.gold}30`, borderRadius: 10, color: C.text, marginBottom: 8 }}>{PAY_OPTS.map(p => <option key={p}>{p}</option>)}</select>
      <Inp type="number" placeholder="本次收款金額 $" value={orderAmount} onChange={e => setOrderAmount(e.target.value)} />
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>客戶來源標籤</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>{SRC_TAGS.map(t => <button key={t} onClick={() => setOrderSrcTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: orderSrcTags.includes(t) ? C.gold : C.card, color: orderSrcTags.includes(t) ? '#000' : C.muted, border: `1px solid ${C.border}` }}>{t}</button>)}</div>
      <textarea placeholder="指定年份、禮盒包裝、特殊需求..." value={orderNote} onChange={e => setOrderNote(e.target.value)} rows={2} style={{ width: '100%', fontSize: 12, padding: '8px 12px', background: '#2a2520', border: `1px solid ${C.gold}30`, borderRadius: 10, color: C.text, resize: 'vertical', marginBottom: 12, boxSizing: 'border-box' }} />
      <SigCanvas />
      <Btn gold onClick={submitOrder} style={{ width: '100%' }}>確認建立訂單</Btn>
    </Overlay>}

    {/* PICKUP MODAL */}
    {modal === 'pickup' && <Overlay onClose={() => setModal(null)} title="📤 記錄客戶領取">
      {pickupItem ? <div style={{ background: C.card, borderRadius: 10, padding: 12, marginBottom: 12, border: `1px solid ${C.gold}30` }}><div style={{ fontSize: 14, fontWeight: 600 }}>{pickupItem.product_name}</div><div style={{ fontSize: 11, color: C.muted }}>櫃位 {pickupItem.cabinet_no} · 目前 {pickupItem.qty} 支</div></div>
      : <>{(vd?.inventory || []).filter(i => i.qty > 0).map(i => <button key={i.id} onClick={() => { setPickupItem(i); setPickupQty(1) }} style={{ width: '100%', textAlign: 'left', padding: 10, marginBottom: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, cursor: 'pointer' }}>{i.product_name} ({i.qty}支) — 櫃位 {i.cabinet_no || '—'}</button>)}</>}
      <Inp type="number" min={1} max={pickupItem?.qty || 999} value={pickupQty} onChange={e => setPickupQty(Math.max(1, Math.min(pickupItem?.qty || 999, +e.target.value || 1)))} placeholder="領取數量" />
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>{['現場享用', '外帶離店', '轉贈他人'].map(d => <button key={d} onClick={() => setPickupDest(d)} style={{ flex: 1, padding: 8, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: pickupDest === d ? (DEST_COLOR[d] || C.gold) : C.card, color: pickupDest === d ? '#fff' : C.text, border: `1px solid ${C.border}` }}>{d}</button>)}</div>
      <Inp placeholder="備註" value={pickupNote} onChange={e => setPickupNote(e.target.value)} />
      <SigCanvas />
      <Btn gold onClick={submitPickup} style={{ width: '100%' }}>確認領取</Btn>
    </Overlay>}

    {/* PAYMENT MODAL */}
    {modal === 'payment' && <Overlay onClose={() => setModal(null)} title="💰 補充收款">
      {!payOrder ? (vd?.orders || []).filter(o => o.paid < o.total).map(o => <button key={o.id} onClick={() => { setPayOrder(o); setPayAmount(String(o.balance || 0)) }} style={{ width: '100%', textAlign: 'left', padding: 12, marginBottom: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontFamily: 'var(--font-mono)', color: C.gold }}>{o.order_no}</span><span style={{ color: C.red, fontWeight: 700 }}>欠 {fmt(o.balance)}</span></div>
        <div style={{ fontSize: 10, color: C.muted }}>總額 {fmt(o.total)} · 已付 {fmt(o.paid)} · {fmtD(o.created_at)}</div>
      </button>) : <>
        <div style={{ background: '#0d0b09', borderRadius: 10, padding: 12, marginBottom: 12, border: `1px solid ${C.gold}30` }}>
          <div style={{ fontSize: 11, color: C.muted }}>{payOrder.order_no} · {fmtD(payOrder.created_at)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 14 }}><span>總額 {fmt(payOrder.total)}</span><span style={{ color: C.green }}>已付 {fmt(payOrder.paid)}</span><span style={{ color: C.red, fontWeight: 800, fontSize: 18 }}>欠 {fmt(payOrder.balance)}</span></div>
        </div>
        <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width: '100%', fontSize: 13, padding: '10px 12px', background: '#2a2520', border: `1px solid ${C.gold}30`, borderRadius: 10, color: C.text, marginBottom: 8 }}>{PAY_OPTS.map(p => <option key={p}>{p}</option>)}</select>
        <Inp type="number" placeholder="收款金額 $" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
        <Inp placeholder="備註" value={payNote} onChange={e => setPayNote(e.target.value)} />
        <Btn green onClick={submitPayment} style={{ width: '100%' }}>確認收款</Btn>
      </>}
    </Overlay>}
  </div>
}

/* ═══ ADMIN ═══ */
function Admin() {
  const [staff, setStaff] = useState(null); const [members, setMembers] = useState([]); const [loading, setLoading] = useState(true); const [search, setSearch] = useState('')
  useEffect(() => { const s = JSON.parse(sessionStorage.getItem('vip_staff') || 'null'); if (!s?.is_admin) return void (window.location.href = '/vip-cellar'); setStaff(s); loadAll() }, [])
  async function loadAll() {
    setLoading(true)
    const { data: ml } = await supabase.from('vip_members').select('id, name, phone, cabinet_opened, is_active').eq('is_active', true).order('name')
    const md = []; for (const m of (ml || [])) { const [cR, oR] = await Promise.all([supabase.from('vip_cabinets').select('quantity, unit_price').eq('vip_id', m.id).gt('quantity', 0), supabase.from('vip_orders').select('order_total, balance, is_voided').eq('vip_id', m.id)]); const cab = cR.data || []; const ord = (oR.data || []).filter(o => !o.is_voided); md.push({ ...m, cellar_count: cab.reduce((s, c) => s + (c.quantity || 0), 0), cellar_value: cab.reduce((s, c) => s + (c.quantity || 0) * (c.unit_price || 0), 0), total_spent: ord.reduce((s, o) => s + (o.order_total || 0), 0), unpaid: ord.reduce((s, o) => s + (o.balance || 0), 0) }) }
    setMembers(md); setLoading(false)
  }
  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.muted }}>載入中…</div>
  const tv = members.length; const ts = members.reduce((s, m) => s + m.total_spent, 0); const tp = members.reduce((s, m) => s + (m.total_spent - m.unpaid), 0); const tu = members.reduce((s, m) => s + m.unpaid, 0)
  const ur = members.filter(m => m.unpaid > 0).sort((a, b) => b.unpaid - a.unpaid)
  const fil = members.filter(m => !search || (m.name || '').includes(search) || (m.id || '').includes(search))

  return <div style={{ minHeight: '100vh', paddingBottom: 80, background: C.bg, color: C.text, overflowY: 'auto' }}>
    <Header left={<span style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>💎 VIP 窖藏管理後台</span>} right={<div style={{ display: 'flex', gap: 8 }}>
      <button onClick={() => window.location.href = '/vip-cellar/staff'} style={{ fontSize: 11, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>員工模式</button>
      <button onClick={() => { sessionStorage.removeItem('vip_staff'); window.location.href = '/vip-cellar' }} style={{ fontSize: 11, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>登出</button>
    </div>} />
    <div style={{ padding: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        <Stat label="VIP 人數" value={tv} color={C.gold} />
        <Stat label="歷史總消費" value={fmt(ts)} color={C.gold} />
        <Stat label="累計已收" value={fmt(tp)} color={C.green} />
        <Stat label="待收款總額" value={fmt(tu)} color={tu > 0 ? C.red : C.muted} />
      </div>
      {ur.length > 0 && <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 8 }}>💰 欠款排行榜</div>
        {ur.map(v => <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: C.card, borderRadius: 10, marginBottom: 4, border: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{v.name}</span>
          <div style={{ textAlign: 'right' }}><span style={{ fontSize: 16, fontWeight: 700, color: C.red, fontFamily: 'var(--font-mono)' }}>{fmt(v.unpaid)}</span><span style={{ fontSize: 10, color: C.muted, marginLeft: 8 }}>窖藏 {v.cellar_count}支</span></div>
        </div>)}
      </div>}
      <div style={{ fontSize: 14, fontWeight: 700, color: C.gold, marginBottom: 8 }}>全部會員 ({tv})</div>
      <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 搜尋" style={{ marginBottom: 12 }} />
      {fil.map(v => <div key={v.id} style={{ background: C.card, borderRadius: 12, padding: 14, marginBottom: 6, border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div style={{ fontSize: 14, fontWeight: 600 }}>{v.name}</div><div style={{ fontSize: 10, color: C.muted }}>{v.id}{v.phone ? ` · ${v.phone}` : ''} · {v.cellar_count}支 · {fmt(v.cellar_value)}</div></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>{fmt(v.total_spent)}</div>{v.unpaid > 0 && <div style={{ fontSize: 10, color: C.red }}>欠 {fmt(v.unpaid)}</div>}</div>
      </div>)}
    </div>
  </div>
}
