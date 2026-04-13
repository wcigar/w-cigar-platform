import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/* ═══ CONSTANTS ═══ */
const C = { bg:'#0a0a0a', panel:'#111111', card:'#1e1a16', border:'#2d2720', gold:'#d0a54f', text:'#e8e5df', muted:'#a39d91', danger:'#e45d5d', success:'#3db27d', warning:'#f0b14a', blue:'#4d8ac4', purple:'#9b59b6' }
const PAY_OPTS = ['ACPAY刷卡機','臺灣企銀刷卡機(美國運通/銀聯)','現金','銀行匯款','微信支付','支付寶']
const SRC_TAGS = ['老闆客戶','老闆娘客戶','店內新客戶','友人介紹','LINE訂購']
const DEST_OPTS = [{ k:'現場享用', icon:'🚬', c:C.success }, { k:'外帶離店', icon:'🛍️', c:C.gold }, { k:'轉贈招待', icon:'🎁', c:C.danger }]
const fc = n => new Intl.NumberFormat('zh-TW', { style:'currency', currency:'TWD', minimumFractionDigits:0 }).format(n || 0)
const fd = d => { if(!d) return '—'; const x=new Date(d); return isNaN(x.getTime()) ? '—' : x.toLocaleDateString('zh-TW', { timeZone:'Asia/Taipei' }) }
const fdt = d => { if(!d) return '—'; const x=new Date(d); return isNaN(x.getTime()) ? '—' : x.toLocaleString('zh-TW', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) }

function getAging(ds) { if (!ds) return null; const m = Math.floor((Date.now() - new Date(ds).getTime()) / (30.44*86400000)); return m < 3 ? { l:'🟡 醇化中', c:C.warning } : m < 12 ? { l:'🟢 適飲期', c:C.success } : { l:'👑 完美熟成', c:C.purple } }
function extractBrand(n) { const brands = ['COHIBA','MONTECRISTO','ROMEO Y JULIETA','PARTAGAS','H. UPMANN','HOYO DE MONTERREY','BOLIVAR','TRINIDAD','PUNCH','QUAI D\'ORSAY','DIPLOMATICOS','SAINT LUIS REY','RAMON ALLONES','CAPADURA','VEGUEROS','SAN CRISTOBAL']; const up = (n||'').toUpperCase(); return brands.find(b => up.startsWith(b)) || (n||'').split(' ')[0] || '其他' }
function daysUntilExpiry(cabinetOpened, cabinetExpires) { if (cabinetExpires) return Math.floor((new Date(cabinetExpires) - Date.now()) / 86400000); if (!cabinetOpened) return null; const exp = new Date(cabinetOpened); exp.setFullYear(exp.getFullYear() + 1); return Math.floor((exp - Date.now()) / 86400000) }

/* ═══ DATA LOADING ═══ */
async function loadVipFull(mid) {
  const [cabR, ordR, wR, payR] = await Promise.all([
    supabase.from('vip_cabinets').select('*').eq('vip_id', mid).gt('quantity', 0).order('cabinet_no'),
    supabase.from('vip_orders').select('*').eq('vip_id', mid).order('created_at', { ascending:false }),
    supabase.from('vip_withdrawals').select('*').eq('vip_id', mid).order('withdrawn_at', { ascending:false }),
    supabase.from('vip_payments').select('*').eq('vip_id', mid).order('created_at', { ascending:false }),
  ])
  const cab = cabR.data || [], ord = ordR.data || [], wd = wR.data || [], pay = payR.data || []
  const valid = ord.filter(o => !o.is_voided)
  const totalSpent = valid.reduce((s,o) => s + (o.order_total||0), 0)
  const totalPaid = valid.reduce((s,o) => s + ((o.order_total||0) - (o.balance||0)), 0)
  const totalUnpaid = valid.reduce((s,o) => s + (o.balance||0), 0)
  const cellarQty = cab.reduce((s,c) => s + (c.quantity||0), 0)
  const cellarVal = cab.reduce((s,c) => s + (c.quantity||0) * (c.unit_price||0), 0)

  // Build order map with items + payments
  const orderMap = {}
  for (const o of ord) {
    const { data: items } = await supabase.from('vip_order_items').select('*').eq('order_id', o.id)
    const oPay = pay.filter(p => p.order_id === o.id)
    orderMap[o.order_no] = {
      ...o, paid: (o.order_total||0) - (o.balance||0),
      items: (items || []).map(i => ({ name:i.product_name, orderQty:i.qty_ordered, price:i.unit_price, status:i.status })),
      payments: oPay.map(p => ({ date:fd(p.created_at), staff:p.staff_name, amt:p.amount, method:p.payment_method, url:p.receipt_url, note:p.notes, remit:p.remit_code })),
    }
  }

  return {
    summary: { totalSpent, totalPaid, totalUnpaid, cellarQty, cellarVal, orderCount:valid.length },
    cabinets: cab.map(c => ({ id:c.id, cabinet_no:c.cabinet_no, product_name:c.product_name||c.cigar_name||'—', brand:extractBrand(c.product_name||c.cigar_name), qty:c.quantity, unit_price:c.unit_price||0, stored_at:c.stored_date||c.stored_at||c.created_at })),
    orders: ord,
    orderMap,
    retrievals: wd.map(w => ({ id:w.id, time:fdt(w.withdrawn_at||w.created_at), product_name:w.product_name||w.cigar_name||'—', qty:w.qty_withdrawn||w.quantity||0, remaining:w.qty_remaining, cabinet_no:w.cabinet_no||'—', destination:w.destination||w.purpose||'—', staff:w.staff_name||w.handled_by_name||'—', notes:w.notes||'', sig:w.signature_url })),
  }
}

/* ═══ SHARED UI ═══ */
const GoldBtn = ({children,...p}) => <button {...p} style={{ padding:'10px 20px', fontSize:14, fontWeight:700, borderRadius:12, border:'none', cursor:'pointer', background:C.gold, color:'#000', display:'flex', alignItems:'center', justifyContent:'center', gap:6, ...p.style }}>{children}</button>
const Inp = p => <input {...p} style={{ width:'100%', fontSize:14, padding:'12px 14px', background:'#1a1714', border:`1px solid ${C.border}`, borderRadius:12, color:C.text, boxSizing:'border-box', marginBottom:8, ...p.style }} />
const MetricBox = ({label,value,color,blur}) => <div style={{ background:C.card, borderRadius:16, padding:14, border:`1px solid ${C.border}` }}><div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>{label}</div><div style={{ fontSize:20, fontWeight:700, color:color||C.text, fontFamily:'var(--font-mono)', filter:blur?'blur(6px)':'none' }}>{value}</div></div>
function Modal({onClose,title,children,wide}) { return <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,.92)', zIndex:400, overflowY:'auto', WebkitOverflowScrolling:'touch' }} onClick={onClose}><div style={{ maxWidth:wide?700:520, margin:'20px auto', background:'#1a1714', border:`1px solid ${C.gold}40`, borderRadius:24, padding:24, boxShadow:'0 18px 40px rgba(0,0,0,.45)', maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}><span style={{ fontSize:18, fontWeight:700, color:C.gold }}>{title}</span><button onClick={onClose} style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:22 }}>✕</button></div>{children}</div></div> }
function SigCanvas({sigRef,sigData,setSigData}) {
  function clear() { const c = sigRef.current; if(c) { const ctx=c.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,c.width,c.height); setSigData(null) } }
  function initCanvas(c) { if(!c) return; const ctx=c.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,c.width,c.height) }
  useEffect(() => { if(sigRef.current) initCanvas(sigRef.current) }, [])
  return <><div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}><span style={{ fontSize:12, color:C.muted }}>客戶簽名確認</span><button onClick={clear} style={{ fontSize:10, color:C.muted, background:'none', border:`1px solid ${C.border}`, borderRadius:6, padding:'2px 10px', cursor:'pointer' }}>清除</button></div>
    <canvas ref={el => { sigRef.current = el; if(el) initCanvas(el) }} width={400} height={120} style={{ width:'100%', height:120, background:'#fff', border:`1px solid ${C.border}`, borderRadius:12, marginBottom:12, touchAction:'none' }}
      onPointerDown={e => { const c=sigRef.current; if(!c) return; const ctx=c.getContext('2d'); ctx.strokeStyle='#000'; ctx.lineWidth=2; ctx.beginPath(); const r=c.getBoundingClientRect(); ctx.moveTo((e.clientX-r.left)*(c.width/r.width),(e.clientY-r.top)*(c.height/r.height)); c.onpointermove=ev=>{ ctx.lineTo((ev.clientX-r.left)*(c.width/r.width),(ev.clientY-r.top)*(c.height/r.height)); ctx.stroke() }; c.onpointerup=()=>{ c.onpointermove=null; setSigData(c.toDataURL('image/jpeg',0.6)) } }} /></>
}

/* ═══ ROUTER ═══ */
export default function VipCellar() {
  const [view, setView] = useState(() => {
    const p = window.location.pathname
    if (p.includes('/portal')) return 'app'
    if (p.includes('/staff')) return 'staff'
    if (p.includes('/admin')) return 'admin'
    // Restore session
    if (sessionStorage.getItem('vipMember')) return 'app'
    if (sessionStorage.getItem('employee')) { const e = JSON.parse(sessionStorage.getItem('employee')); return e.is_admin ? 'admin' : 'staff' }
    return 'login'
  })
  const [vipId, setVipId] = useState(null)
  const [employee, setEmployee] = useState(() => JSON.parse(sessionStorage.getItem('employee') || 'null'))
  const [member, setMember] = useState(() => JSON.parse(sessionStorage.getItem('vipMember') || 'null'))
  const [privacy, setPrivacy] = useState(false)
  const [productCatalog, setProductCatalog] = useState([])
  useEffect(() => { supabase.from('products').select('id,name,brand,price_a,price_vip').eq('is_active',true).order('brand').order('name').then(({data}) => setProductCatalog(data||[])) }, [])

  function loginAsVip(m) { setMember(m); setVipId(m.id); sessionStorage.setItem('vipMember', JSON.stringify(m)); setView('app') }
  function loginAsStaff(e) { setEmployee(e); sessionStorage.setItem('employee', JSON.stringify(e)); setView(e.is_admin ? 'admin' : 'staff') }
  function logout() { sessionStorage.removeItem('vipMember'); sessionStorage.removeItem('employee'); setMember(null); setEmployee(null); setVipId(null); setView('login') }
  function staffViewVip(m) { setMember(m); setVipId(m.id); sessionStorage.setItem('vipMember', JSON.stringify(m)); setView('app') }
  function backToStaff() { sessionStorage.removeItem('vipMember'); setMember(null); setVipId(null); setView('staff') }

  return <div style={{ minHeight:'100vh', background:C.bg, color:C.text, overflowY:'auto' }}>
    {/* TOPBAR */}
    <header style={{ padding:'10px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', background:'#1a1714' }}>
      <div><div style={{ fontSize:15, fontWeight:700, color:C.gold, letterSpacing:1 }}>W CIGAR BAR</div><div style={{ fontSize:9, color:C.muted }}>VIP Concierge & Assets</div></div>
      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
        {view === 'app' && <button onClick={() => setPrivacy(!privacy)} style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:16 }}>{privacy ? '🙈' : '👁'}</button>}
        {employee && <span style={{ fontSize:10, padding:'3px 10px', borderRadius:10, background:`${C.gold}15`, color:C.gold, fontWeight:600 }}>{employee.name}</span>}
        {(view !== 'login') && <button onClick={() => view === 'app' && employee ? backToStaff() : setView('login')} style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:14 }}>🏠</button>}
        {(view !== 'login') && <button onClick={logout} style={{ fontSize:10, color:C.muted, background:'none', border:`1px solid ${C.border}`, borderRadius:6, padding:'3px 8px', cursor:'pointer' }}>🔒</button>}
      </div>
    </header>

    <main style={{ padding:0 }}>
      {view === 'login' && <LoginView onVipLogin={loginAsVip} onStaffLogin={loginAsStaff} />}
      {view === 'staff' && <StaffView employee={employee} onViewVip={staffViewVip} productCatalog={productCatalog} />}
      {view === 'admin' && <AdminView employee={employee} onViewVip={staffViewVip} />}
      {view === 'app' && <AppView member={member} employee={employee} privacy={privacy} onBack={employee ? backToStaff : null} />}
    </main>
  </div>
}

/* ═══ LOGIN ═══ */
function LoginView({ onVipLogin, onStaffLogin }) {
  const [vid, setVid] = useState(''); const [pwd, setPwd] = useState(''); const [needPwd, setNeedPwd] = useState(false)
  const [sc, setSc] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)

  async function doVip() {
    if (!vid.trim()) return setErr('請輸入 VIP 編號'); setErr(''); setBusy(true)
    try {
      // Try direct lookup first
      const { data: m } = await supabase.from('vip_members').select('*').eq('id', vid.trim()).eq('is_active', true).maybeSingle()
      if (!m) { setBusy(false); return setErr('查無此 VIP 編號') }
      if (m.password_hash) {
        const { data } = await supabase.rpc('vip_login', { p_vip_id: vid.trim(), p_password: pwd || null })
        if (!data?.success) { setBusy(false); if (data?.need_password) { setNeedPwd(true); return setErr('請輸入密碼') } return setErr(data?.error || '登入失敗') }
      }
      onVipLogin({ id: m.id, name: m.name, vip_id: m.id, cabinet_opened: m.cabinet_opened, tier: m.tier || 'VIP' })
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  async function doStaff() {
    if (!sc.trim()) return setErr('請輸入員工代碼'); setErr(''); setBusy(true)
    const { data } = await supabase.from('employees').select('id, name, is_admin, login_code').eq('login_code', String(sc).trim()).eq('enabled', true).maybeSingle()
    setBusy(false)
    if (!data) return setErr('查無此員工')
    onStaffLogin(data)
  }

  return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'calc(100vh - 60px)', padding:20 }}>
    <div style={{ width:'100%', maxWidth:420, textAlign:'center' }}>
      <div style={{ fontSize:48, marginBottom:8 }}>⚜️</div>
      <div style={{ fontSize:22, fontWeight:800, color:C.gold, marginBottom:4 }}>VIP 尊榮登入</div>
      <div style={{ fontSize:12, color:C.muted, marginBottom:24 }}>請輸入專屬編號，探索您的珍藏世界</div>
      <Inp value={vid} onChange={e => setVid(e.target.value)} type="tel" placeholder="VIP 編號" onKeyDown={e => e.key === 'Enter' && doVip()} style={{ textAlign:'center', fontSize:20, letterSpacing:4, padding:'16px' }} />
      {needPwd && <Inp type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="請輸入密碼" onKeyDown={e => e.key === 'Enter' && doVip()} style={{ textAlign:'center' }} />}
      <GoldBtn onClick={doVip} disabled={busy} style={{ width:'100%', marginBottom:16, opacity:busy?.5:1 }}>{busy ? '驗證中...' : '探索我的窖藏'}</GoldBtn>
      {err && <div style={{ color:C.danger, fontSize:13, marginBottom:12 }}>{err}</div>}
      <div style={{ display:'flex', alignItems:'center', gap:12, margin:'20px 0' }}><div style={{ flex:1, height:1, background:C.border }} /><span style={{ fontSize:10, color:C.muted }}>現場管家登入通道</span><div style={{ flex:1, height:1, background:C.border }} /></div>
      <div style={{ display:'flex', gap:8 }}>
        <Inp value={sc} onChange={e => setSc(e.target.value)} type="password" placeholder="員工密碼" onKeyDown={e => e.key === 'Enter' && doStaff()} style={{ flex:1, textAlign:'center', marginBottom:0 }} />
        <GoldBtn onClick={doStaff} disabled={busy} style={{ background:C.card, color:C.gold, border:`1px solid ${C.border}` }}>登入內部系統</GoldBtn>
      </div>
      <div style={{ fontSize:9, color:C.muted, marginTop:30 }}>© 2025-2026 W Cigar Bar · Powered by CigarPrince™</div>
    </div>
  </div>
}

/* ═══ STAFF ═══ */
function StaffView({ employee, onViewVip, productCatalog }) {
  const [members, setMembers] = useState([]); const [search, setSearch] = useState(''); const [loading, setLoading] = useState(true)
  const [showNewOrder, setShowNewOrder] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [mR, cR, oR] = await Promise.all([
      supabase.from('vip_members').select('id, name, cabinet_opened, cabinet_expires, is_active').eq('is_active', true).order('name'),
      supabase.from('vip_cabinets').select('vip_id, quantity, unit_price').gt('quantity', 0),
      supabase.from('vip_orders').select('vip_id, balance, is_voided').eq('is_voided', false),
    ])
    const ml = mR.data || []; const cab = cR.data || []; const ord = oR.data || []
    setMembers(ml.map(m => {
      const myCab = cab.filter(c => c.vip_id === m.id)
      const myOrd = ord.filter(o => o.vip_id === m.id)
      const stockQty = myCab.reduce((s,c) => s + (c.quantity||0), 0)
      const stockVal = myCab.reduce((s,c) => s + (c.quantity||0) * (c.unit_price||0), 0)
      const lowCount = myCab.filter(c => (c.quantity||0) <= 5).length
      const unpaid = myOrd.reduce((s,o) => s + (o.balance||0), 0)
      const expDays = daysUntilExpiry(m.cabinet_opened, m.cabinet_expires)
      return { ...m, stockQty, stockVal, lowCount, unpaid, expDays }
    }))
    setLoading(false)
  }
  const filtered = members.filter(m => !search || (m.name||'').includes(search) || (m.id||'').includes(search))

  return <div style={{ padding:20, paddingBottom:80 }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
      <div style={{ fontSize:18, fontWeight:700, color:C.gold }}>管家作業模式</div>
      <GoldBtn onClick={() => setShowNewOrder(true)} style={{ fontSize:12, padding:'8px 14px' }}>＋ 新增訂單/開櫃</GoldBtn>
    </div>
    <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 搜尋客戶姓名或會員編號..." style={{ fontSize:15, marginBottom:16 }} />
    {loading ? <div style={{ textAlign:'center', padding:40, color:C.muted }}>載入中…</div> :
    <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>{filtered.length} 位會員</div>}
    {filtered.map(m => <div key={m.id} onClick={() => onViewVip(m)} style={{ background:C.card, borderRadius:16, padding:16, marginBottom:10, border:`1px solid ${C.border}`, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <div>
        <div style={{ fontSize:16, fontWeight:700, color:C.gold }}>{m.name}</div>
        <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>ID: {m.id} | 窖藏 {m.stockQty} 支 | {fc(m.stockVal)}</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
          {m.expDays !== null && m.expDays <= 30 && <span style={{ fontSize:9, padding:'2px 8px', borderRadius:10, background:m.expDays <= 0 ? `${C.danger}20` : `${C.warning}20`, color:m.expDays <= 0 ? C.danger : C.warning, fontWeight:600 }}>{m.expDays <= 0 ? '🚨 已到期' : `⏰ ${m.expDays}天到期`}</span>}
          {m.lowCount > 0 && <span style={{ fontSize:9, padding:'2px 8px', borderRadius:10, background:`${C.warning}20`, color:C.warning, fontWeight:600 }}>⚠️ {m.lowCount}品項低庫存</span>}
          {m.unpaid > 0 && <span style={{ fontSize:9, padding:'2px 8px', borderRadius:10, background:`${C.danger}20`, color:C.danger, fontWeight:600 }}>💳 欠款 {fc(m.unpaid)}</span>}
        </div>
      </div>
      <span style={{ color:C.muted, fontSize:22 }}>›</span>
    </div>)}

    {showNewOrder && <NewOrderModal employee={employee} productCatalog={productCatalog} onClose={() => setShowNewOrder(false)} onDone={() => { setShowNewOrder(false); load() }} />}
  </div>
}

/* ═══ APP VIEW ═══ */
function AppView({ member, employee, privacy, onBack }) {
  const [data, setData] = useState(null); const [tab, setTab] = useState('cellar'); const [loading, setLoading] = useState(true)
  const [cellarView, setCellarView] = useState('cabinet')
  const [consumeItem, setConsumeItem] = useState(null); const [payingOrder, setPayingOrder] = useState(null); const [showPrint, setShowPrint] = useState(false)

  const load = useCallback(async () => { setLoading(true); try { const d = await loadVipFull(member.id); setData(d) } catch(e) { console.error(e) } setLoading(false) }, [member?.id])
  useEffect(() => { if (member?.id) load() }, [load])

  if (loading) return <div style={{ padding:40, textAlign:'center', color:C.muted }}>載入中…</div>
  if (!data) return <div style={{ padding:40, textAlign:'center', color:C.danger }}>無法載入</div>

  const { summary:sm, cabinets:inv, retrievals:picks, orders, orderMap } = data
  const $$ = v => privacy ? '***' : fc(v)
  const byCab = {}; inv.forEach(i => { const k=i.cabinet_no||'未指定'; if(!byCab[k]) byCab[k]=[]; byCab[k].push(i) })
  const byBrand = {}; inv.forEach(i => { const b=i.brand||'其他'; if(!byBrand[b]) byBrand[b]=[]; byBrand[b].push(i) })
  const cabGroups = cellarView === 'cabinet' ? byCab : byBrand
  const paidPct = sm.totalSpent > 0 ? Math.round(sm.totalPaid / sm.totalSpent * 100) : 100
  const expDays = daysUntilExpiry(member.cabinet_opened)
  const lowItems = inv.filter(i => i.qty <= 5)
  const validOrds = orders.filter(o => !o.is_voided)

  const tabs = [{ k:'cellar', l:'📦 專屬窖藏' }, { k:'history', l:'📜 領取軌跡' }, { k:'finance', l:'🧾 財務總帳' }]

  return <div style={{ padding:'16px 20px', paddingBottom:80 }}>
    <style>{`@media print { body * { visibility:hidden; } #vip-print, #vip-print * { visibility:visible; } #vip-print { position:absolute; left:0; top:0; width:100%; color:#000; background:#fff; padding:20px; font-size:12px; } } @media (max-width:768px) { .vip-metric-val { font-size:24px !important; } .vip-tab-btn { font-size:16px !important; padding:12px 16px !important; } .vip-cigar-name { font-size:18px !important; } .vip-qty-num { font-size:34px !important; } .vip-history-card { font-size:15px !important; } }`}</style>
    {onBack && <button onClick={onBack} style={{ fontSize:12, color:C.muted, background:'none', border:`1px solid ${C.border}`, borderRadius:10, padding:'6px 14px', cursor:'pointer', marginBottom:12 }}>← 返回會員列表</button>}

    {/* Alert banners */}
    {lowItems.length > 0 && <div style={{ background:`${C.warning}10`, border:`1px solid ${C.warning}30`, borderRadius:12, padding:'10px 14px', marginBottom:8, fontSize:12, color:C.warning }}>⚠️ {lowItems.length} 品項庫存偏低，建議補貨</div>}
    {expDays !== null && expDays <= 30 && <div style={{ background:`${expDays<=0?C.danger:C.warning}10`, border:`1px solid ${expDays<=0?C.danger:C.warning}30`, borderRadius:12, padding:'10px 14px', marginBottom:8, fontSize:12, color:expDays<=0?C.danger:C.warning }}>{expDays<=0?'🚨 您的櫃位已到期，請盡快續約':'⏰ 櫃位將於 '+expDays+' 天後到期'}</div>}
    {sm.totalUnpaid > 0 && <div style={{ background:`${C.danger}10`, border:`1px solid ${C.danger}30`, borderRadius:12, padding:'10px 14px', marginBottom:8, fontSize:12, color:C.danger }}>⚠ 待結尾款提醒　您目前尚有 <b>{fc(sm.totalUnpaid)}</b> 未結清款項。</div>}

    {/* Hero */}
    <div style={{ fontSize:24, fontWeight:800, color:C.gold, marginBottom:2 }}>{member.name}</div>
    <div style={{ fontSize:11, color:C.muted, marginBottom:16 }}>VIP ID: {member.id}</div>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:16 }}>
      <MetricBox label="歷史購買總額" value={$$(sm.totalSpent)} color={C.gold} blur={privacy} />
      <MetricBox label="目前房內總值" value={$$(sm.cellarVal)} color={C.gold} blur={privacy} />
      <MetricBox label={sm.totalUnpaid > 0 ? '期末應收（待結帳）' : sm.totalUnpaid < 0 ? '帳戶餘額' : '帳款狀態'} value={sm.totalUnpaid === 0 ? '已結清' : $$(Math.abs(sm.totalUnpaid))} color={sm.totalUnpaid > 0 ? C.danger : sm.totalUnpaid < 0 ? C.success : C.muted} blur={privacy} />
      <MetricBox label="目前房內總數" value={`${sm.cellarQty} 支`} />
    </div>

    {/* Tabs */}
    <div style={{ display:'flex', gap:4, marginBottom:16 }}>
      {tabs.map(t => <button key={t.k} onClick={() => setTab(t.k)} style={{ flex:1, padding:'10px 0', borderRadius:12, fontSize:13, fontWeight:600, cursor:'pointer', background:tab===t.k?`${C.gold}20`:'transparent', color:tab===t.k?C.gold:C.muted, border:tab===t.k?`1px solid ${C.gold}40`:`1px solid ${C.border}` }}>{t.l}</button>)}
    </div>
    <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}><button onClick={load} style={{ fontSize:10, color:C.muted, background:'none', border:`1px solid ${C.border}`, borderRadius:8, padding:'3px 10px', cursor:'pointer' }}>🔄 重新整理</button></div>

    {/* ── CELLAR ── */}
    {tab === 'cellar' && <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={() => setCellarView('cabinet')} style={{ fontSize:11, padding:'5px 12px', borderRadius:10, cursor:'pointer', background:cellarView==='cabinet'?`${C.gold}20`:'transparent', color:cellarView==='cabinet'?C.gold:C.muted, border:`1px solid ${cellarView==='cabinet'?C.gold+'40':C.border}` }}>🗄️ 依實體櫃位檢視</button>
          <button onClick={() => setCellarView('brand')} style={{ fontSize:11, padding:'5px 12px', borderRadius:10, cursor:'pointer', background:cellarView==='brand'?`${C.gold}20`:'transparent', color:cellarView==='brand'?C.gold:C.muted, border:`1px solid ${cellarView==='brand'?C.gold+'40':C.border}` }}>🏷️ 依品牌系列檢視</button>
        </div>
        <GoldBtn onClick={() => setShowPrint(true)} style={{ fontSize:11, padding:'6px 14px' }}>🖨️ 列印窖藏清單</GoldBtn>
      </div>
      {Object.entries(cabGroups).sort(([a],[b]) => a==='未指定'?1:b==='未指定'?-1:a.localeCompare(b)).map(([grp,items]) => <div key={grp} style={{ marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:`${C.gold}08`, borderRadius:12, marginBottom:8 }}>
          <span style={{ fontSize:13, fontWeight:700, color:C.gold }}>{cellarView==='cabinet'?`📦 NO.${grp} 櫃位`:`🏷️ ${grp}`}</span>
          <span style={{ fontSize:10, color:C.muted }}>共 {items.reduce((s,i)=>s+i.qty,0)} 支 · {$$(items.reduce((s,i)=>s+i.qty*i.unit_price,0))}</span>
        </div>
        {items.map(i => { const age = getAging(i.stored_at); const isLow = i.qty <= 5; return <div key={i.id} style={{ background:C.card, borderRadius:14, padding:14, marginBottom:8, border:`1px solid ${isLow?C.danger+'30':C.border}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15, fontWeight:600 }}>{i.product_name} {age && <span style={{ fontSize:10, color:age.c }}>{age.l}</span>}</div>
              <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>存放於：NO.{i.cabinet_no} 櫃位 ｜ 單價：{fc(i.unit_price)} ｜ <span style={{ color:C.gold }}>總值：{$$(i.qty*i.unit_price)}</span></div>
              {isLow && <div style={{ fontSize:11, color:C.danger, marginTop:4 }}>⚠️ 庫存偏低，建議補貨 <button onClick={() => window.open('https://line.me/R/ti/p/@374lpmfi','_blank')} style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:`${C.danger}15`, color:C.danger, border:`1px solid ${C.danger}30`, cursor:'pointer', marginLeft:4 }}>🛎️ 聯絡管家補貨</button></div>}
              {employee && <button onClick={() => setConsumeItem(i)} style={{ marginTop:6, fontSize:11, padding:'5px 14px', borderRadius:8, background:`${C.gold}15`, color:C.gold, border:`1px solid ${C.gold}30`, cursor:'pointer' }}>✍️ 現場領取</button>}
              {!isLow && !employee && <button onClick={() => window.open('https://line.me/R/ti/p/@374lpmfi','_blank')} style={{ marginTop:6, fontSize:11, padding:'5px 14px', borderRadius:8, background:`${C.success}15`, color:C.success, border:`1px solid ${C.success}30`, cursor:'pointer' }}>🛎️ 預約管家準備</button>}
            </div>
            <div style={{ textAlign:'center', minWidth:60 }}><div style={{ fontSize:28, fontWeight:800, color:C.text }}>{i.qty}</div><div style={{ fontSize:9, color:C.muted }}>剩餘庫存</div></div>
          </div>
        </div> })}
      </div>)}
      {!inv.length && <div style={{ textAlign:'center', padding:40, color:C.muted }}>目前無窖藏品項</div>}
      {inv.length > 0 && <div style={{ background:C.card, borderRadius:12, padding:14, border:`1px solid ${C.gold}30`, display:'flex', justifyContent:'space-around', fontSize:12, color:C.muted, marginTop:8 }}><span>總庫存 <b style={{ color:C.text }}>{sm.cellarQty}</b> 支</span><span>總市值 <b style={{ color:C.gold }}>{$$(sm.cellarVal)}</b></span><span>共 <b style={{ color:C.text }}>{inv.length}</b> 品項</span></div>}
    </>}

    {/* ── HISTORY ── */}
    {tab === 'history' && <>
      {!picks.length ? <div style={{ textAlign:'center', padding:40, color:C.muted }}>尚無領取紀錄</div> :
      picks.slice(0,30).map(p => { const dc = DEST_OPTS.find(d => d.k === p.destination); return <div key={p.id} style={{ background:C.card, borderRadius:16, padding:16, marginBottom:12, border:`1px solid ${C.border}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ fontSize:11, color:C.gold }}>{p.time}</span>
          <span style={{ fontSize:10, padding:'2px 10px', borderRadius:10, fontWeight:600, background:(dc?.c||C.muted)+'20', color:dc?.c||C.muted }}>{dc?.icon||''} {p.destination}</span>
        </div>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:10 }}>{p.product_name}</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6, fontSize:11 }}>
          <div><div style={{ color:C.muted, fontSize:9 }}>出庫櫃位</div><div style={{ fontWeight:600 }}>NO.{p.cabinet_no}</div></div>
          <div><div style={{ color:C.muted, fontSize:9 }}>領取數量</div><div style={{ fontWeight:700, color:C.gold, fontSize:18 }}>{p.qty}</div></div>
          <div><div style={{ color:C.muted, fontSize:9 }}>去向</div><div style={{ fontWeight:600 }}>{p.destination}</div></div>
          <div><div style={{ color:C.muted, fontSize:9 }}>服務管家</div><div style={{ fontWeight:600 }}>{p.staff}</div></div>
          <div><div style={{ color:C.muted, fontSize:9 }}>領後剩餘</div><div style={{ fontWeight:600 }}>{p.remaining ?? '—'}</div></div>
        </div>
        <div style={{ borderTop:`1px solid ${C.border}`, marginTop:10, paddingTop:8 }}>
          <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>客戶親筆畫押</div>
          {p.sig ? <img src={p.sig} alt="簽名" style={{ maxWidth:200, width:'100%', borderRadius:8, border:`1px solid ${C.border}`, background:'#fff', padding:4 }} /> : <span style={{ fontSize:10, color:C.muted }}>(無簽名紀錄)</span>}
        </div>
        {p.notes && <div style={{ fontSize:10, color:C.muted, marginTop:6 }}>備註：{p.notes}</div>}
      </div> })}
    </>}

    {/* ── FINANCE ── */}
    {tab === 'finance' && <div id="vip-print">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontSize:15, fontWeight:700, color:C.gold }}>📊 帳戶總覽</span>
        <button onClick={() => window.print()} style={{ fontSize:11, padding:'5px 14px', borderRadius:10, background:C.card, color:C.gold, border:`1px solid ${C.border}`, cursor:'pointer' }}>🖨️ PDF 對帳單</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:12 }}>
        <MetricBox label="累計消費" value={$$(sm.totalSpent)} blur={privacy} />
        <MetricBox label="累計已付" value={$$(sm.totalPaid)} color={C.success} blur={privacy} />
        <MetricBox label="待結餘額" value={$$(sm.totalUnpaid)} color={sm.totalUnpaid>0?C.danger:C.success} blur={privacy} />
        <MetricBox label="訂單筆數" value={sm.orderCount+' 筆'} />
      </div>
      <div style={{ background:C.card, borderRadius:12, padding:'10px 14px', marginBottom:20, border:`1px solid ${C.border}` }}>
        <div style={{ height:8, background:C.border, borderRadius:4, overflow:'hidden', marginBottom:4 }}><div style={{ height:'100%', background:C.success, borderRadius:4, width:`${paidPct}%` }} /></div>
        <div style={{ fontSize:10, color:C.muted }}>付款進度 {paidPct}%</div>
      </div>

      {/* Recent pickups */}
      {picks.length > 0 && <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.gold, marginBottom:8 }}>最近領取紀錄（共{picks.length}筆）</div>
        <div style={{ background:C.card, borderRadius:12, overflow:'hidden', border:`1px solid ${C.border}` }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 3fr 1fr 2fr 2fr', gap:4, padding:'8px 12px', fontSize:10, color:C.muted, fontWeight:600, borderBottom:`1px solid ${C.border}` }}><span>日期</span><span>品名</span><span>數量</span><span>去向</span><span>管家</span></div>
          {picks.slice(0,10).map(p => <div key={p.id} style={{ display:'grid', gridTemplateColumns:'2fr 3fr 1fr 2fr 2fr', gap:4, padding:'6px 12px', fontSize:11, borderBottom:`1px solid ${C.border}20` }}><span style={{ color:C.muted }}>{fd(p.withdrawn_at||p.time)}</span><span>{p.product_name}</span><span style={{ color:C.gold }}>{p.qty}</span><span style={{ color:C.muted }}>{p.destination}</span><span style={{ color:C.muted }}>{p.staff}</span></div>)}
        </div>
        {picks.length > 10 && <div style={{ fontSize:10, color:C.muted, marginTop:6, textAlign:'center', cursor:'pointer' }} onClick={() => setTab('history')}>…還有{picks.length-10}筆，前往「領取軌跡」查看完整紀錄</div>}
      </div>}

      {/* Orders */}
      {validOrds.map(o => { const om = orderMap[o.order_no] || {}; const oPaid = (o.order_total||0)-(o.balance||0); return <div key={o.id} style={{ background:C.card, borderRadius:16, padding:16, marginBottom:12, border:`1px solid ${C.border}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div><span style={{ fontSize:13, fontWeight:700, color:C.gold, fontFamily:'var(--font-mono)' }}>{o.order_no}</span><span style={{ fontSize:10, color:C.muted, marginLeft:8 }}>{fd(o.created_at)}</span>{o.staff_name && <span style={{ fontSize:10, color:C.muted, marginLeft:4 }}>· {o.staff_name}</span>}</div>
          <span style={{ fontSize:10, padding:'2px 8px', borderRadius:8, fontWeight:600, background:o.status==='已沖平結清'?`${C.success}20`:`${C.danger}20`, color:o.status==='已沖平結清'?C.success:C.danger }}>{o.status||'—'}</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
          <div><div style={{ fontSize:10, color:C.muted }}>訂單總額</div><div style={{ fontSize:16, fontWeight:700 }}>{$$(o.order_total)}</div></div>
          <div><div style={{ fontSize:10, color:C.muted }}>已付金額</div><div style={{ fontSize:16, fontWeight:700, color:C.success }}>{$$(oPaid)}</div></div>
          <div><div style={{ fontSize:10, color:C.muted }}>未付餘額</div><div style={{ fontSize:16, fontWeight:700, color:o.balance>0?C.danger:C.muted }}>{$$(o.balance)}</div></div>
        </div>
        {o.order_total > 0 && <div style={{ height:4, background:C.border, borderRadius:2, overflow:'hidden', marginBottom:8 }}><div style={{ height:'100%', background:oPaid>=o.order_total?C.success:C.gold, width:`${Math.min(100,o.order_total?oPaid/o.order_total*100:0)}%`, borderRadius:2 }} /></div>}
        {/* Items */}
        {<div style={{ marginBottom:8 }}>
          <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>🛒 購買品項</div>
          {(om.items||[]).length > 0 ? om.items.map((it,i) => <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'3px 0', borderBottom:`1px solid ${C.border}20` }}><span style={{ flex:2 }}>{it.name}</span><span style={{ width:40, textAlign:'center' }}>{it.orderQty}支</span><span style={{ width:60, textAlign:'right' }}>{fc(it.price)}</span><span style={{ width:70, textAlign:'right', color:C.gold }}>{fc(it.orderQty*it.price)}</span></div>) : <div style={{ color:'#666', fontSize:12, padding:6 }}>（歷史訂單，無品項明細）</div>}
        </div>}
        {/* Payments */}
        {(om.payments||[]).length > 0 && <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>💳 收款 {om.payments.length} 次 · 累計 {fc(om.payments.reduce((s,p)=>s+p.amt,0))}</div>}
        {/* Actions */}
        {employee && o.balance > 0 && <div style={{ marginTop:8 }}><button onClick={() => setPayingOrder(o)} style={{ fontSize:11, padding:'6px 14px', borderRadius:8, background:`${C.success}15`, color:C.success, border:`1px solid ${C.success}30`, cursor:'pointer' }}>💳 結帳與拍單據</button></div>}
      </div> })}
    </div>}

    {/* CONSUME MODAL */}
    {consumeItem && <ConsumeModal item={consumeItem} member={member} employee={employee} onClose={() => setConsumeItem(null)} onDone={() => { setConsumeItem(null); load() }} />}
    {/* PAYMENT MODAL */}
    {payingOrder && <PaymentModal order={payingOrder} member={member} employee={employee} onClose={() => setPayingOrder(null)} onDone={() => { setPayingOrder(null); load() }} />}
    {/* PRINT MODAL */}
    {showPrint && <PrintInventoryModal member={member} inv={inv} byCab={byCab} sm={data.summary} onClose={() => setShowPrint(false)} />}
  </div>
}

/* ═══ CONSUME MODAL ═══ */
function ConsumeModal({ item, member, employee, onClose, onDone }) {
  const [dest, setDest] = useState('現場享用'); const [qty, setQty] = useState(1); const sigRef = useRef(null); const [sigData, setSigData] = useState(null); const [busy, setBusy] = useState(false)
  async function submit() {
    if (qty > item.qty) return alert(`最多 ${item.qty} 支`)
    if (!sigData) return alert('請客戶簽名')
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('vip_withdraw', { p_vip_id:member.id, p_cabinet_id:item.id, p_qty:qty, p_destination:dest, p_staff_id:employee.login_code||employee.id, p_staff_name:employee.name, p_signature_url:sigData, p_notes:'' })
      if (error) throw error
      if (data && !data.success) throw new Error(data.error || '領取失敗')
    } catch (e) {
      // Fallback to direct update if RPC doesn't exist
      await supabase.from('vip_cabinets').update({ quantity: item.qty - qty, updated_at: new Date().toISOString() }).eq('id', item.id)
      await supabase.from('vip_withdrawals').insert({ vip_id:member.id, vip_name:member.name, cabinet_id:item.id, cabinet_no:item.cabinet_no, product_name:item.product_name, qty_withdrawn:qty, qty_remaining:item.qty-qty, destination:dest, staff_id:employee.login_code||employee.id, staff_name:employee.name, signature_url:sigData, withdrawn_at:new Date().toISOString() })
    }
    setBusy(false); onDone()
  }
  return <Modal onClose={onClose} title="產品領取確認">
    <div style={{ background:'#0d0b09', borderRadius:12, padding:12, marginBottom:12, border:`1px solid ${C.border}` }}>
      <div style={{ fontSize:15, fontWeight:600 }}>{item.product_name}</div>
      <div style={{ fontSize:11, color:C.muted }}>來源：NO.{item.cabinet_no} 櫃位 · 庫存 {item.qty} 支</div>
    </div>
    <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>選擇去向</div>
    <div style={{ display:'flex', gap:6, marginBottom:12 }}>
      {DEST_OPTS.map(d => <button key={d.k} onClick={() => setDest(d.k)} style={{ flex:1, padding:'10px 0', borderRadius:12, fontSize:12, fontWeight:600, cursor:'pointer', background:dest===d.k?C.gold:'transparent', color:dest===d.k?'#000':C.text, border:`1px solid ${dest===d.k?C.gold:C.border}` }}>{d.icon} {d.k}</button>)}
    </div>
    <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>本次領取數量</div>
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:16, marginBottom:16 }}>
      <button onClick={() => setQty(q => Math.max(1,q-1))} style={{ width:44, height:44, borderRadius:12, border:`1px solid ${C.border}`, background:'#1a1714', color:C.text, cursor:'pointer', fontSize:20 }}>−</button>
      <span style={{ fontSize:32, fontWeight:800, fontFamily:'var(--font-mono)', width:60, textAlign:'center' }}>{qty}</span>
      <button onClick={() => setQty(q => Math.min(item.qty,q+1))} style={{ width:44, height:44, borderRadius:12, border:`1px solid ${C.gold}40`, background:`${C.gold}15`, color:C.gold, cursor:'pointer', fontSize:20 }}>+</button>
    </div>
    <SigCanvas sigRef={sigRef} sigData={sigData} setSigData={setSigData} />
    {busy && <div style={{ textAlign:'center', padding:12, color:C.gold }}>簽名上傳中，請稍候...</div>}
    <div style={{ display:'flex', gap:8 }}>
      <button onClick={onClose} style={{ flex:1, padding:12, borderRadius:12, border:`1px solid ${C.border}`, background:'transparent', color:C.muted, cursor:'pointer', fontSize:14 }}>取消返回</button>
      <GoldBtn onClick={submit} disabled={busy} style={{ flex:2, opacity:busy?.5:1 }}>確認領取並扣除庫存</GoldBtn>
    </div>
  </Modal>
}

/* ═══ PAYMENT MODAL ═══ */
function PaymentModal({ order, member, employee, onClose, onDone }) {
  const [amt, setAmt] = useState(String(order.balance||0)); const [method, setMethod] = useState('現金')
  const [remitCode, setRemitCode] = useState(''); const [note, setNote] = useState('')
  const sigRef = useRef(null); const [sigData, setSigData] = useState(null); const [busy, setBusy] = useState(false)
  const receiptRef = useRef(null); const [receiptPreview, setReceiptPreview] = useState(null); const [receiptData, setReceiptData] = useState(null)

  function handleReceipt(e) {
    const f = e.target.files?.[0]; if (!f) return
    const reader = new FileReader(); reader.onload = ev => { setReceiptPreview(ev.target.result); setReceiptData(ev.target.result) }; reader.readAsDataURL(f)
  }

  async function submit() {
    const a = +amt || 0; if (a <= 0) return alert('請填寫金額')
    setBusy(true)
    await supabase.from('vip_payments').insert({ order_id:order.id, order_no:order.order_no, vip_id:member.id, amount:a, payment_method:method, staff_id:employee.login_code||employee.id, staff_name:employee.name, notes:note||null, receipt_url:receiptData||null, remit_code:remitCode||null })
    const oldPaid = (order.order_total||0) - (order.balance||0)
    const np = oldPaid + a
    const newBalance = Math.max(0, (order.order_total||0) - np)
    await supabase.from('vip_orders').update({ paid_amount:np, balance:newBalance, status:newBalance<=0?'已沖平結清':'部分沖銷', updated_at:new Date().toISOString() }).eq('id', order.id)
    setBusy(false); onDone()
  }

  return <Modal onClose={onClose} title="帳款結清與拍照憑證">
    <div style={{ background:'#0d0b09', borderRadius:12, padding:12, marginBottom:12, border:`1px solid ${C.border}` }}>
      <div style={{ fontFamily:'var(--font-mono)', color:C.gold, fontSize:12 }}>{order.order_no}</div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, fontSize:14 }}><span>總額 {fc(order.order_total)}</span><span style={{ color:C.success }}>已付 {fc((order.order_total||0)-(order.balance||0))}</span></div>
      <div style={{ fontSize:20, fontWeight:800, color:C.danger, marginTop:4 }}>待付 {fc(order.balance)}</div>
    </div>
    <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>本次實收金額</div>
    <Inp type="number" value={amt} onChange={e => setAmt(e.target.value)} style={{ fontSize:24, textAlign:'center', fontWeight:700, color:C.gold }} />
    <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>支付方式</div>
    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
      {PAY_OPTS.map(p => <button key={p} onClick={() => setMethod(p)} style={{ padding:'6px 12px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer', background:method===p?C.gold:'transparent', color:method===p?'#000':C.muted, border:`1px solid ${method===p?C.gold:C.border}` }}>{p}</button>)}
    </div>
    {method === '銀行匯款' && <Inp placeholder="匯款末5碼" value={remitCode} onChange={e => setRemitCode(e.target.value)} />}
    <div style={{ marginBottom:12 }}>
      <input ref={receiptRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={handleReceipt} />
      <button onClick={() => receiptRef.current?.click()} style={{ width:'100%', padding:12, borderRadius:12, border:`1px dashed ${C.border}`, background:'transparent', color:receiptPreview?C.success:C.muted, cursor:'pointer', fontSize:13 }}>{receiptPreview ? '✅ 已拍攝單據（點擊重拍）' : '📷 拍攝刷卡單/收據'}</button>
      {receiptPreview && <img src={receiptPreview} alt="" style={{ width:'100%', maxHeight:200, objectFit:'contain', borderRadius:8, marginTop:8, border:`1px solid ${C.border}` }} />}
    </div>
    <SigCanvas sigRef={sigRef} sigData={sigData} setSigData={setSigData} />
    <Inp placeholder="備註" value={note} onChange={e => setNote(e.target.value)} />
    <div style={{ display:'flex', gap:8 }}>
      <button onClick={onClose} style={{ flex:1, padding:12, borderRadius:12, border:`1px solid ${C.border}`, background:'transparent', color:C.muted, cursor:'pointer' }}>取消</button>
      <GoldBtn onClick={submit} disabled={busy} style={{ flex:2, background:C.success, opacity:busy?.5:1 }}>確認收款</GoldBtn>
    </div>
  </Modal>
}

/* ═══ NEW ORDER MODAL ═══ */
function NewOrderModal({ employee, productCatalog, onClose, onDone }) {
  const [vipId, setVipId] = useState(''); const [vipName, setVipName] = useState(''); const [orderType, setOrderType] = useState('現貨購買')
  const [items, setItems] = useState([{ name:'', price:'', qtyCab:0, qtyOut:0, qtySite:0, qtyPend:0, cab:'', _showDrop:false }])
  const productList = productCatalog || []
  const [payMethod, setPayMethod] = useState('現金'); const [paidAmt, setPaidAmt] = useState(''); const [note, setNote] = useState(''); const [srcTags, setSrcTags] = useState([])
  const sigRef = useRef(null); const [sigData, setSigData] = useState(null); const [busy, setBusy] = useState(false)
  const receiptRef = useRef(null); const [receiptData, setReceiptData] = useState(null); const [receiptPreview, setReceiptPreview] = useState(null)
  const total = orderType === '客戶寄存' ? 0 : items.reduce((s,i) => s + (+i.price||0) * ((+i.qtyCab||0)+(+i.qtyOut||0)+(+i.qtySite||0)+(+i.qtyPend||0)), 0)

  async function submit() {
    if (!vipId.trim()) return alert('請填寫會員編號')
    const validItems = items.filter(i => i.name.trim()); if (!validItems.length) return alert('請填寫品項')
    setBusy(true)
    const orderNo = 'ORD-' + new Date().toISOString().replace(/[-T:.Z]/g,'').slice(0,15)
    const paid = +paidAmt || 0; const status = paid >= total && total > 0 ? '已沖平結清' : paid > 0 ? '部分沖銷' : '未付款'
    const notes = [note, srcTags.length ? '來源: '+srcTags.join(', ') : ''].filter(Boolean).join(' | ')
    const { data:ord, error } = await supabase.from('vip_orders').insert({ order_no:orderNo, vip_id:vipId.trim(), vip_name:vipName||null, order_type:orderType, order_total:total, paid_amount:paid, balance:Math.max(0,total-paid), status, notes, staff_id:employee.login_code||employee.id, staff_name:employee.name }).select().single()
    if (error) { setBusy(false); return alert('建立失敗: '+error.message) }
    for (const i of validItems) { const tq = (+i.qtyCab||0)+(+i.qtyOut||0)+(+i.qtySite||0)+(+i.qtyPend||0); const up = +i.price||0; await supabase.from('vip_order_items').insert({ order_id:ord.id, order_no:orderNo, product_name:i.name, qty_ordered:tq, qty_delivered:tq-(+i.qtyPend||0), qty_pending:+i.qtyPend||0, unit_price:up, subtotal:tq*up, destination:orderType, cabinet_no:i.cab||null, status:(+i.qtyPend||0)>0?'部分到貨':'已到齊' }) }
    // Cabinet upsert: check existing then update or insert
    for (const i of validItems) { if ((+i.qtyCab||0) > 0 && i.cab) { const vid = vipId.trim(); const { data:existing } = await supabase.from('vip_cabinets').select('id,quantity').eq('vip_id',vid).eq('cabinet_no',i.cab).eq('product_name',i.name).maybeSingle(); if (existing) { await supabase.from('vip_cabinets').update({ quantity:(existing.quantity||0)+(+i.qtyCab), updated_at:new Date().toISOString() }).eq('id',existing.id) } else { await supabase.from('vip_cabinets').insert({ vip_id:vid, cabinet_no:i.cab, product_name:i.name, quantity:+i.qtyCab, unit_price:+i.price||0, market_value:(+i.qtyCab)*(+i.price||0), stored_date:new Date().toISOString().slice(0,10) }) } } }
    if (paid > 0) await supabase.from('vip_payments').insert({ order_id:ord.id, order_no:orderNo, vip_id:vipId.trim(), amount:paid, payment_method:payMethod, staff_id:employee.login_code||employee.id, staff_name:employee.name, receipt_url:receiptData||null })
    setBusy(false); alert('✅ 訂單已建立'); onDone()
  }

  const upd = (idx,k,v) => { const a=[...items]; a[idx][k]=v; setItems(a) }

  return <Modal onClose={onClose} title="＋ 新增訂單 / 開櫃" wide>
    {/* Product datalist */}
    <datalist id="vip-prod-list">{productList.map(p => <option key={p.id} value={p.name} />)}</datalist>
    <div style={{ display:'flex', gap:8, marginBottom:12 }}>
      <Inp value={vipId} onChange={async e => { setVipId(e.target.value); if(e.target.value.length>=2) { const { data } = await supabase.from('customers').select('id,name,phone').ilike('name','%'+e.target.value+'%').limit(5); if(data?.length===1) setVipName(data[0].name) } }} type="tel" placeholder="會員編號 *" style={{ flex:1, marginBottom:0 }} />
      <Inp value={vipName} onChange={e => setVipName(e.target.value)} placeholder="姓名（新客戶填）" style={{ flex:1, marginBottom:0 }} />
    </div>
    <div style={{ display:'flex', gap:6, marginBottom:12 }}>{['現貨購買','預購訂貨','客戶寄存'].map(t => <button key={t} onClick={() => setOrderType(t)} style={{ flex:1, padding:8, borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer', background:orderType===t?C.gold:'transparent', color:orderType===t?'#000':C.text, border:`1px solid ${orderType===t?C.gold:C.border}` }}>{t}</button>)}</div>

    {items.map((item,idx) => <div key={idx} style={{ background:'#0d0b09', borderRadius:14, padding:12, marginBottom:10, border:`1px solid ${C.border}` }}>
      <div style={{ display:'flex', gap:6, marginBottom:8 }}><Inp list="vip-prod-list" autoComplete="off" placeholder="搜尋雪茄品名或品牌 *" value={item.name} onChange={e => { const val=e.target.value; upd(idx,'name',val); const found=productList.find(p=>p.name===val); if(found) upd(idx,'price',String(found.price_vip||found.price_a||0)) }} style={{ flex:2, marginBottom:0 }} /><Inp type="number" placeholder="單價 $" value={item.price} onChange={e => upd(idx,'price',e.target.value)} style={{ flex:1, marginBottom:0 }} />{items.length>1 && <button onClick={() => setItems(items.filter((_,i)=>i!==idx))} style={{ color:C.danger, background:'none', border:'none', cursor:'pointer', fontSize:16 }}>✕</button>}</div>
      <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>購買支數 <b style={{ color:C.text }}>{(+item.qtyCab||0)+(+item.qtyOut||0)+(+item.qtySite||0)+(+item.qtyPend||0)}</b></div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:6 }}>{[['qtyCab','📦 入櫃'],['qtyOut','🛍️ 外帶'],['qtySite','🚬 現場'],['qtyPend','✈️ 未到貨']].map(([k,l]) => <div key={k}><div style={{ fontSize:9, color:C.muted, marginBottom:2 }}>{l}</div><input type="number" min={0} value={item[k]} onChange={e => upd(idx,k,+e.target.value||0)} style={{ width:'100%', fontSize:13, padding:'8px 4px', background:'#1a1714', border:`1px solid ${C.border}`, borderRadius:8, color:C.text, textAlign:'center' }} /></div>)}</div>
      {(+item.qtyCab||0) > 0 && <Inp placeholder="入櫃 → 櫃位號碼" value={item.cab} onChange={e => upd(idx,'cab',e.target.value)} style={{ borderColor:`${C.gold}50`, color:C.gold, marginBottom:4 }} />}
      <div style={{ fontSize:10, color:C.muted, textAlign:'right' }}>合計 {(+item.qtyCab||0)+(+item.qtyOut||0)+(+item.qtySite||0)+(+item.qtyPend||0)} 支 | 小計 {fc((+item.price||0)*((+item.qtyCab||0)+(+item.qtyOut||0)+(+item.qtySite||0)+(+item.qtyPend||0)))}</div>
    </div>)}
    <button onClick={() => setItems([...items, { name:'', price:'', qtyCab:0, qtyOut:0, qtySite:0, qtyPend:0, cab:'', _showDrop:false }])} style={{ fontSize:12, color:C.gold, background:'none', border:`1px dashed ${C.border}`, borderRadius:10, padding:10, width:'100%', cursor:'pointer', marginBottom:16 }}>+ 新增品項</button>

    <div style={{ fontSize:20, fontWeight:800, color:C.gold, textAlign:'right', marginBottom:16 }}>訂單總額：{fc(total)}</div>
    {total > 0 && total < 168000 && <div style={{ background:`${C.warning}10`, border:`1px solid ${C.warning}30`, borderRadius:10, padding:'8px 12px', marginBottom:12, fontSize:11, color:C.warning }}>⚠️ 此訂單金額未達開櫃門檻 ($168,000)</div>}

    <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width:'100%', fontSize:13, padding:'10px 12px', background:'#1a1714', border:`1px solid ${C.border}`, borderRadius:12, color:C.text, marginBottom:8 }}>{PAY_OPTS.map(p => <option key={p}>{p}</option>)}</select>
    {payMethod === '銀行匯款' && <Inp placeholder="匯款末5碼" />}
    <Inp type="number" placeholder="本次收款金額 $" value={paidAmt} onChange={e => setPaidAmt(e.target.value)} />
    <div style={{ marginBottom:12 }}><input ref={receiptRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e => { const f=e.target.files?.[0]; if(f) { const r=new FileReader(); r.onload=ev=>{ setReceiptPreview(ev.target.result); setReceiptData(ev.target.result) }; r.readAsDataURL(f) } }} /><button onClick={() => receiptRef.current?.click()} style={{ width:'100%', padding:12, borderRadius:12, border:`1px dashed ${C.border}`, background:'transparent', color:receiptPreview?C.success:C.muted, cursor:'pointer' }}>{receiptPreview ? '✅ 已拍攝（點擊重拍）' : '📷 拍攝刷卡單/收據'}</button>{receiptPreview && <img src={receiptPreview} alt="" style={{ width:'100%', maxHeight:150, objectFit:'contain', borderRadius:8, marginTop:6 }} />}</div>

    <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>客戶來源標籤</div>
    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>{SRC_TAGS.map(t => <button key={t} onClick={() => setSrcTags(p => p.includes(t)?p.filter(x=>x!==t):[...p,t])} style={{ padding:'5px 14px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer', background:srcTags.includes(t)?C.gold:'transparent', color:srcTags.includes(t)?'#000':C.muted, border:`1px solid ${srcTags.includes(t)?C.gold:C.border}` }}>{t}</button>)}</div>
    <textarea placeholder="指定年份、禮盒包裝、特殊需求..." value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ width:'100%', fontSize:12, padding:'10px 12px', background:'#1a1714', border:`1px solid ${C.border}`, borderRadius:12, color:C.text, resize:'vertical', marginBottom:12, boxSizing:'border-box' }} />
    <SigCanvas sigRef={sigRef} sigData={sigData} setSigData={setSigData} />
    <GoldBtn onClick={submit} disabled={busy} style={{ width:'100%', opacity:busy?.5:1 }}>{busy ? '建立中...' : '確認建立訂單'}</GoldBtn>
  </Modal>
}

/* ═══ PRINT INVENTORY MODAL ═══ */
function PrintInventoryModal({ member, inv, byCab, sm, onClose }) {
  return <Modal onClose={onClose} title="🖨️ 列印窖藏清單" wide>
    <div id="vip-print" style={{ background:'#fff', color:'#000', padding:16, borderRadius:12, fontSize:12 }}>
      <div style={{ textAlign:'center', marginBottom:12 }}><div style={{ fontSize:18, fontWeight:800 }}>W CIGAR BAR</div><div style={{ fontSize:10, color:'#999' }}>VIP 窖藏庫存清單 | 列印日期：{fd(new Date())}</div></div>
      <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #ddd', marginBottom:12 }}><span>會員姓名：<b>{member.name}</b></span><span>會員編號：<b>{member.id}</b></span><span>開櫃日期：<b>{fd(member.cabinet_opened)}</b></span></div>
      {Object.entries(byCab).map(([cab,items]) => <div key={cab} style={{ marginBottom:12 }}>
        <div style={{ fontWeight:700, marginBottom:4, color:'#8B7355' }}>NO.{cab} 號櫃</div>
        {items.map(i => <div key={i.id} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid #eee', fontSize:11 }}><span style={{ flex:2 }}>{i.product_name}</span><span style={{ width:40, textAlign:'center' }}>{i.qty}支</span><span style={{ width:60, textAlign:'right' }}>{fc(i.unit_price)}</span><span style={{ width:70, textAlign:'right', color:'#8B7355' }}>{fc(i.qty*i.unit_price)}</span><span style={{ width:70, textAlign:'right', color:'#999' }}>{fd(i.stored_at)}</span></div>)}
        <div style={{ textAlign:'right', fontWeight:700, color:'#8B7355', padding:'4px 0' }}>小計：{items.reduce((s,i)=>s+i.qty,0)}支 / {fc(items.reduce((s,i)=>s+i.qty*i.unit_price,0))}</div>
      </div>)}
      <div style={{ display:'flex', justifyContent:'space-around', padding:12, background:'#f5f0e8', borderRadius:8, fontWeight:700, color:'#8B7355' }}><span>總庫存 {sm.cellarQty} 支</span><span>總市值 {fc(sm.cellarVal)}</span><span>{Object.keys(byCab).length} 個櫃位</span></div>
      <div style={{ marginTop:20, borderTop:'1px solid #ddd', paddingTop:12, display:'flex', justifyContent:'space-between' }}><div><div style={{ fontSize:10, color:'#999' }}>客戶簽名</div><div style={{ width:200, height:60, borderBottom:'1px solid #ccc' }} /></div><div style={{ textAlign:'right', fontSize:8, color:'#ccc' }}>W CIGAR BAR VIP 窖藏管理系統<br/>Powered by CigarPrince™<br/>© 2025-2026 蔡勝濬（雪茄王子）版權所有</div></div>
    </div>
    <div style={{ display:'flex', gap:8, marginTop:16 }}>
      <button onClick={onClose} style={{ flex:1, padding:12, borderRadius:12, border:`1px solid ${C.border}`, background:'transparent', color:C.muted, cursor:'pointer' }}>✕ 關閉</button>
      <GoldBtn onClick={() => window.print()} style={{ flex:1 }}>🖨️ 列印/儲存 PDF</GoldBtn>
    </div>
  </Modal>
}

/* ═══ ADMIN ═══ */
function AdminView({ employee, onViewVip }) {
  const [members, setMembers] = useState([]); const [loading, setLoading] = useState(true); const [search, setSearch] = useState('')
  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [mR, cR, oR] = await Promise.all([
      supabase.from('vip_members').select('id, name, phone, cabinet_opened, cabinet_expires, is_active').eq('is_active', true).order('name'),
      supabase.from('vip_cabinets').select('vip_id, quantity, unit_price').gt('quantity', 0),
      supabase.from('vip_orders').select('vip_id, order_total, balance, is_voided').eq('is_voided', false),
    ])
    const ml = mR.data||[]; const cab = cR.data||[]; const ord = oR.data||[]
    setMembers(ml.map(m => {
      const mc = cab.filter(c => c.vip_id === m.id); const mo = ord.filter(o => o.vip_id === m.id && !o.is_voided)
      return { ...m, stockQty:mc.reduce((s,c)=>s+(c.quantity||0),0), cellarVal:mc.reduce((s,c)=>s+(c.quantity||0)*(c.unit_price||0),0), totalSpent:mo.reduce((s,o)=>s+(o.order_total||0),0), totalPaid:mo.reduce((s,o)=>s+((o.order_total||0)-(o.balance||0)),0), unpaid:mo.reduce((s,o)=>s+(o.balance||0),0) }
    }))
    setLoading(false)
  }
  if (loading) return <div style={{ padding:40, textAlign:'center', color:C.muted }}>載入中…</div>
  const tv = members.length; const ts = members.reduce((s,m)=>s+m.totalSpent,0); const tp = members.reduce((s,m)=>s+m.totalPaid,0); const tu = members.reduce((s,m)=>s+m.unpaid,0)
  const collectPct = ts > 0 ? Math.round(tp/ts*100) : 100
  const ur = members.filter(m => m.unpaid > 0).sort((a,b) => b.unpaid - a.unpaid)
  const fil = members.filter(m => !search || (m.name||'').includes(search) || (m.id||'').includes(search))

  return <div style={{ padding:20, paddingBottom:80 }}>
    <div style={{ fontSize:20, fontWeight:700, color:C.gold, marginBottom:16 }}>💎 VIP 窖藏管理後台</div>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
      <MetricBox label="歷史總營收" value={fc(ts)} color={C.gold} />
      <MetricBox label="累計已收" value={fc(tp)} color={C.success} />
      <MetricBox label="全店待收" value={fc(tu)} color={tu>0?C.danger:C.muted} />
      <MetricBox label="VIP 會員數" value={tv} color={C.gold} />
    </div>
    <div style={{ background:C.card, borderRadius:12, padding:'10px 14px', marginBottom:20, border:`1px solid ${C.border}` }}>
      <div style={{ height:8, background:C.border, borderRadius:4, overflow:'hidden', marginBottom:4 }}><div style={{ height:'100%', background:C.success, borderRadius:4, width:`${collectPct}%` }} /></div>
      <div style={{ fontSize:10, color:C.muted }}>全店收款率 {collectPct}%</div>
    </div>
    {ur.length > 0 && <div style={{ marginBottom:20 }}>
      <div style={{ fontSize:15, fontWeight:700, color:C.danger, marginBottom:8 }}>💰 欠款客戶列表</div>
      {ur.map(v => <div key={v.id} onClick={() => onViewVip(v)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:C.card, borderRadius:12, marginBottom:6, border:`1px solid ${C.border}`, cursor:'pointer' }}>
        <div><span style={{ fontSize:14, fontWeight:600 }}>{v.name}</span><span style={{ fontSize:10, color:C.muted, marginLeft:8 }}>ID:{v.id} · 窖藏{v.stockQty}支</span></div>
        <span style={{ fontSize:16, fontWeight:700, color:C.danger, fontFamily:'var(--font-mono)' }}>{fc(v.unpaid)}</span>
      </div>)}
    </div>}
    <div style={{ fontSize:15, fontWeight:700, color:C.gold, marginBottom:8 }}>全部會員 ({tv})</div>
    <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 搜尋" style={{ marginBottom:12 }} />
    {fil.map(v => <div key={v.id} onClick={() => onViewVip(v)} style={{ background:C.card, borderRadius:14, padding:14, marginBottom:8, border:`1px solid ${C.border}`, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <div><div style={{ fontSize:14, fontWeight:600 }}>{v.name}</div><div style={{ fontSize:10, color:C.muted }}>{v.id}{v.phone?` · ${v.phone}`:''} · {v.stockQty}支 · {fc(v.cellarVal)}</div></div>
      <div style={{ textAlign:'right' }}><div style={{ fontSize:14, fontWeight:700, color:C.gold }}>{fc(v.totalSpent)}</div>{v.unpaid>0&&<div style={{ fontSize:10, color:C.danger }}>欠 {fc(v.unpaid)}</div>}</div>
    </div>)}
    <div style={{ textAlign:'center', fontSize:8, color:C.muted, marginTop:30 }}>W CIGAR BAR VIP 窖藏管理系統 ｜ Powered by CigarPrince™<br/>© 2025-2026 蔡勝濬（雪茄王子）版權所有</div>
  </div>
}
