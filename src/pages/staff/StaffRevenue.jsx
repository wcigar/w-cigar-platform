import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { format, endOfMonth } from 'date-fns'
import { DollarSign, Send, TrendingUp, AlertTriangle, CheckCircle2, Plus, Trash2, Lock } from 'lucide-react'

const PAYMENTS = [
  { key: 'cash_amount', label: '現金', icon: '💵', color: '#4da86c' },
  { key: 'acpay_amount', label: 'ACPAY刷卡', icon: '💳', color: '#4d8ac4' },
  { key: 'teb_amount', label: '臺灣企銀刷卡', icon: '🏦', color: '#8b6cc4' },
  { key: 'transfer_amount', label: '銀行轉帳', icon: '🔄', color: '#c4a84d' },
  { key: 'wechat_amount', label: '微信支付', icon: '💚', color: '#07c160' },
  { key: 'alipay_amount', label: '支付寶', icon: '🔵', color: '#1677ff' },
]
const ROOMS = ['1F四人位','1F六人位','B1包廂四人位','B1包廂大圓桌','B1沙發區','戶外區']
const DENOMS = [{v:2000,label:'$2,000',color:'#c9a84c'},{v:1000,label:'$1,000',color:'#4da86c'},{v:500,label:'$500',color:'#4d8ac4'},{v:100,label:'$100',color:'#c44d4d'},{v:50,label:'$50',color:'#8b6cc4'},{v:10,label:'$10',color:'#c4a84d'},{v:5,label:'$5',color:'#f59e0b'},{v:1,label:'$1',color:'var(--text-dim)'}]
const DRAWER_BASE = 10000

export default function StaffRevenue() {
  const { user } = useAuth()
  const [tab, setTab] = useState('revenue')
  const [form, setForm] = useState({ cash_amount:'', acpay_amount:'', teb_amount:'', transfer_amount:'', wechat_amount:'', alipay_amount:'', customer_count:'', vip_groups:'', walk_in_groups:'', note:'' })
  const [denoms, setDenoms] = useState({})
  const [existing, setExisting] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [monthTotal, setMonthTotal] = useState(0)
  const [records, setRecords] = useState([])
  const [rooms, setRooms] = useState([])
  const [roomForm, setRoomForm] = useState({ room_name:'', start_time:'', end_time:'', guest_count:'', amount:'', is_vip:false, vip_name:'', note:'' })
  const [tips, setTips] = useState([])
  const [tipForm, setTipForm] = useState({ employee_id:'', amount:'', source:'現金', note:'' })
  const [credits, setCredits] = useState([])
  const [creditForm, setCreditForm] = useState({ customer_name:'', amount:'', reason:'' })
  const [closing, setClosing] = useState(null)
  const [cigarTemp, setCigarTemp] = useState('')
  const [cigarHumidity, setCigarHumidity] = useState('')
  const [employees, setEmployees] = useState([])
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = format(new Date(), 'yyyy-MM')

  useEffect(() => { load() }, [])

  async function load() {
    const [revR, mR, recR, roomR, tipR, creditR, closR, empR] = await Promise.all([
      supabase.from('daily_revenue').select('*').eq('date', today).maybeSingle(),
      supabase.from('daily_revenue').select('total').gte('date', month + '-01').lte('date', format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')),
      supabase.from('daily_revenue').select('*').order('date', { ascending: false }).limit(7),
      supabase.from('room_usage').select('*').eq('date', today).order('created_at'),
      supabase.from('tips').select('*').eq('date', today).order('created_at'),
      supabase.from('credit_tabs').select('*').eq('status', '未結').order('date', { ascending: false }),
      supabase.from('daily_closing').select('*').eq('date', today).maybeSingle(),
      supabase.from('employees').select('id, name').eq('enabled', true),
    ])
    if (revR.data) {
      setExisting(revR.data)
      setForm({ cash_amount:revR.data.cash_amount||'', acpay_amount:revR.data.acpay_amount||'', teb_amount:revR.data.teb_amount||'', transfer_amount:revR.data.transfer_amount||'', wechat_amount:revR.data.wechat_amount||'', alipay_amount:revR.data.alipay_amount||'', customer_count:revR.data.customer_count||'', vip_groups:revR.data.vip_groups||'', walk_in_groups:revR.data.walk_in_groups||'', note:revR.data.note||'' })
    }
    setMonthTotal((mR.data||[]).reduce((s,r) => s + (+r.total||0), 0))
    setRecords(recR.data||[])
    setRooms(roomR.data||[])
    setTips(tipR.data||[])
    setCredits(creditR.data||[])
    setClosing(closR.data)
    setEmployees((empR.data||[]).filter(e => e.id !== 'ADMIN'))
  }

  function getTotal() { return PAYMENTS.reduce((s,m) => s + (+form[m.key]||0), 0) }
  function getCashExpected() { return DRAWER_BASE + (+form.cash_amount||0) }
  function getCounted() { return DENOMS.reduce((s,d) => s + (+(denoms['d'+d.v]||0))*d.v, 0) }

  async function saveRevenue() {
    const total = getTotal()
    if (total <= 0) return alert('請至少填入一項營收金額')
    setSubmitting(true)
    const avgSpend = (+form.customer_count||0) > 0 ? Math.round(total / +form.customer_count) : 0
    const payload = { date:today, cash_amount:+form.cash_amount||0, card_amount:(+form.acpay_amount||0)+(+form.teb_amount||0), acpay_amount:+form.acpay_amount||0, teb_amount:+form.teb_amount||0, transfer_amount:+form.transfer_amount||0, wechat_amount:+form.wechat_amount||0, alipay_amount:+form.alipay_amount||0, other_amount:0, total, customer_count:+form.customer_count||0, vip_groups:+form.vip_groups||0, walk_in_groups:+form.walk_in_groups||0, avg_spending:avgSpend, note:form.note||null, recorded_by:user.name }
    if (existing) { await supabase.from('daily_revenue').update(payload).eq('id', existing.id) }
    else { await supabase.from('daily_revenue').insert(payload) }
    setSubmitting(false)
    alert(existing ? '營收已更新！' : '營收已登記！')
    load()
  }

  async function addRoom() {
    if (!roomForm.room_name) return alert('請選擇包廂')
    await supabase.from('room_usage').insert({ ...roomForm, date:today, guest_count:+roomForm.guest_count||0, amount:+roomForm.amount||0, recorded_by:user.name })
    setRoomForm({ room_name:'', start_time:'', end_time:'', guest_count:'', amount:'', is_vip:false, vip_name:'', note:'' })
    load()
  }

  async function addTip() {
    if (!tipForm.employee_id || !tipForm.amount) return alert('請選擇員工和金額')
    await supabase.from('tips').insert({ ...tipForm, date:today, amount:+tipForm.amount })
    setTipForm({ employee_id:'', amount:'', source:'現金', note:'' })
    load()
  }

  async function addCredit() {
    if (!creditForm.customer_name || !creditForm.amount) return alert('請填寫客人姓名和金額')
    await supabase.from('credit_tabs').insert({ ...creditForm, date:today, amount:+creditForm.amount, recorded_by:user.name })
    setCreditForm({ customer_name:'', amount:'', reason:'' })
    load()
  }

  async function settleCredit(id) {
    await supabase.from('credit_tabs').update({ status:'已結', settled_date:today, settled_by:user.name }).eq('id', id)
    load()
  }

  async function submitClosing() {
    const tempOk = +cigarTemp >= 16 && +cigarTemp <= 20
    const humOk = +cigarHumidity >= 62 && +cigarHumidity <= 72
    if (!cigarTemp || !cigarHumidity) return alert('請填入雪茄房溫濕度')
    if (!tempOk || !humOk) {
      if (!confirm('溫濕度不在安全範圍！溫度16-20°C / 濕度62-72%\n確定要送出日結？')) return
    }
    const counted = getCounted()
    const payload = { date:today, revenue_total:getTotal(), cash_counted:counted, cash_expected:getCashExpected(), cash_diff:counted-getCashExpected(), room_count:rooms.length, guest_groups:+form.customer_count||0, vip_groups:+form.vip_groups||0, avg_spending:getTotal()/(+form.customer_count||1), tips_total:tips.reduce((s,t)=>s+(+t.amount||0),0), credit_total:credits.filter(c=>c.date===today).reduce((s,c)=>s+(+c.amount||0),0), temp_ok:tempOk, humidity_ok:humOk, cigar_temp:+cigarTemp, cigar_humidity:+cigarHumidity, closed_by:user.name, closed_at:new Date().toISOString(), note:'' }
    if (closing) { await supabase.from('daily_closing').update(payload).eq('id', closing.id) }
    else { await supabase.from('daily_closing').insert(payload) }
    alert('日結已完成！')
    load()
  }

  const TB = (label, key, active) => <button onClick={()=>setTab(key)} style={{ flex:1, padding:'8px 4px', fontSize:14, fontWeight:600, cursor:'pointer', background:active?'var(--gold-glow)':'transparent', color:active?'var(--gold)':'var(--text-dim)', border:active?'1px solid var(--border-gold)':'1px solid var(--border)', borderRadius:8, textAlign:'center' }}>{label}</button>

  return (
    <div className="page-container fade-in">
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <DollarSign size={20} color="var(--gold)" />
        <span className="section-title" style={{ margin:0 }}>每日營收 & 日結</span>
        {closing && <span style={{ fontSize:14, background:'rgba(77,168,108,.15)', color:'var(--green)', padding:'3px 8px', borderRadius:10 }}>已日結</span>}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:12 }}>
        <div className="card" style={{ textAlign:'center', padding:10 }}>
          <div style={{ fontSize:14, color:'var(--text-dim)' }}>今日營收</div>
          <div style={{ fontSize:24, fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--gold)', marginTop:2 }}>{"$"}{getTotal().toLocaleString()}</div>
        </div>
        <div className="card" style={{ textAlign:'center', padding:10 }}>
          <div style={{ fontSize:14, color:'var(--text-dim)' }}>包廂/客組</div>
          <div style={{ fontSize:24, fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--blue)', marginTop:2 }}>{rooms.length}/{+form.customer_count||0}</div>
        </div>
        <div className="card" style={{ textAlign:'center', padding:10 }}>
          <div style={{ fontSize:14, color:'var(--text-dim)' }}>本月累計</div>
          <div style={{ fontSize:24, fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--green)', marginTop:2 }}>{"$"}{monthTotal.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ display:'flex', gap:4, marginBottom:12, flexWrap:'wrap' }}>
        {TB('💰營收', 'revenue', tab==='revenue')}
        {TB('🏧盤點', 'cash', tab==='cash')}
        {TB('🚪包廂', 'room', tab==='room')}
        {TB('💡小費', 'tips', tab==='tips')}
        {TB('📋日結', 'close', tab==='close')}
      </div>

      {tab === 'revenue' && (
        <div>
          {existing && <div style={{ background:'rgba(77,168,108,.1)', border:'1px solid rgba(77,168,108,.3)', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:14, color:'var(--green)' }}>已登記（by {existing.recorded_by}），可修改</div>}
          {PAYMENTS.map(m => (
            <div key={m.key} style={{ marginBottom:8 }}>
              <label style={{ fontSize:14, color:m.color, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>{m.icon} {m.label}</label>
              <input type="number" inputMode="numeric" placeholder="0" value={form[m.key]} onChange={e => setForm(p=>({...p,[m.key]:e.target.value}))} style={{ fontSize:24, fontFamily:'var(--font-mono)', fontWeight:700, padding:'10px 14px' }} />
            </div>
          ))}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:10 }}>
            <div><label style={{ fontSize:14, color:'var(--text-dim)' }}>👥 總客組</label><input type="number" inputMode="numeric" placeholder="0" value={form.customer_count} onChange={e => setForm(p=>({...p,customer_count:e.target.value}))} style={{ fontSize:17, fontFamily:'var(--font-mono)', fontWeight:700, padding:'8px' }} /></div>
            <div><label style={{ fontSize:14, color:'var(--gold)' }}>👑 VIP組</label><input type="number" inputMode="numeric" placeholder="0" value={form.vip_groups} onChange={e => setForm(p=>({...p,vip_groups:e.target.value}))} style={{ fontSize:17, fontFamily:'var(--font-mono)', fontWeight:700, padding:'8px' }} /></div>
            <div><label style={{ fontSize:14, color:'var(--text-dim)' }}>🚶 散客組</label><input type="number" inputMode="numeric" placeholder="0" value={form.walk_in_groups} onChange={e => setForm(p=>({...p,walk_in_groups:e.target.value}))} style={{ fontSize:17, fontFamily:'var(--font-mono)', fontWeight:700, padding:'8px' }} /></div>
          </div>
          {(+form.customer_count||0) > 0 && <div style={{ fontSize:14, color:'var(--text-dim)', marginBottom:8 }}>客單價約 {"$"}{Math.round(getTotal()/(+form.customer_count)).toLocaleString()}</div>}
          <input placeholder="備註 — VIP包廂、特殊消費等" value={form.note} onChange={e => setForm(p=>({...p,note:e.target.value}))} style={{ width:'100%', fontSize:14, padding:'10px 12px', marginBottom:12 }} />
          <button onClick={saveRevenue} disabled={submitting} className="btn-gold" style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Send size={16} /> {existing ? '更新營收' : '登記營收'}
          </button>
        </div>
      )}

      {tab === 'cash' && (
        <div>
          <div className="card" style={{ marginBottom:12, padding:14 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--gold)', marginBottom:8 }}>輸入每種面額的張/枚數</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {DENOMS.map(d => (
                <div key={d.v} style={{ display:'flex', alignItems:'center', gap:4, background:'var(--black)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 8px' }}>
                  <span style={{ fontSize:14, fontWeight:700, color:d.color, minWidth:48 }}>{d.label}</span>
                  <span style={{ color:'var(--text-dim)', fontSize:11 }}>x</span>
                  <input type="number" inputMode="numeric" placeholder="0" value={denoms['d'+d.v]||''} onChange={e => setDenoms(p=>({...p,['d'+d.v]:e.target.value}))} style={{ flex:1, fontSize:17, fontFamily:'var(--font-mono)', fontWeight:700, padding:'5px 6px', minHeight:36, textAlign:'center' }} />
                  <span style={{ fontSize:14, color:'var(--text-dim)', minWidth:48, textAlign:'right', fontFamily:'var(--font-mono)' }}>{"="}{((+(denoms['d'+d.v]||0))*d.v).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop:'1px solid var(--border-gold)', marginTop:10, paddingTop:10, display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:14, fontWeight:700, color:'var(--gold)' }}>盤點總計</span>
              <span style={{ fontSize:24, fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--gold)' }}>{"$"}{getCounted().toLocaleString()}</span>
            </div>
          </div>
          <div className="card" style={{ padding:12, marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:4 }}><span style={{ color:'var(--text-dim)' }}>開店備用金</span><span style={{ fontFamily:'var(--font-mono)', fontWeight:600 }}>{"$"}{DRAWER_BASE.toLocaleString()}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:4 }}><span style={{ color:'var(--text-dim)' }}>+ 今日現金</span><span style={{ fontFamily:'var(--font-mono)', fontWeight:600, color:'var(--green)' }}>{"$"}{(+form.cash_amount||0).toLocaleString()}</span></div>
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:6, display:'flex', justifyContent:'space-between', fontWeight:700 }}><span>= 應有</span><span style={{ fontFamily:'var(--font-mono)', color:'var(--gold)' }}>{"$"}{getCashExpected().toLocaleString()}</span></div>
          </div>
          {getCounted() > 0 && (() => { const diff = getCounted() - getCashExpected(); return (
            <div className="card" style={{ padding:12, borderColor:diff===0?'rgba(77,168,108,.4)':'rgba(196,77,77,.4)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {diff===0 ? <CheckCircle2 size={18} color="var(--green)" /> : <AlertTriangle size={18} color={diff>0?'#f59e0b':'var(--red)'} />}
                <span style={{ fontSize:14, fontWeight:700, color:diff===0?'var(--green)':diff>0?'#f59e0b':'var(--red)' }}>
                  {diff===0 ? '現金正確' : diff>0 ? '多 $'+diff.toLocaleString() : '短少 $'+Math.abs(diff).toLocaleString()}
                </span>
              </div>
            </div>
          ) })()}
        </div>
      )}

      {tab === 'room' && (
        <div>
          <div className="card" style={{ padding:14, marginBottom:12 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--gold)', marginBottom:10 }}>新增包廂紀錄</div>
            <select value={roomForm.room_name} onChange={e => setRoomForm(p=>({...p,room_name:e.target.value}))} style={{ marginBottom:8 }}>
              <option value="">選擇包廂</option>
              {ROOMS.map(r => <option key={r}>{r}</option>)}
            </select>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
              <div><label style={{ fontSize:14, color:'var(--text-dim)' }}>開始</label><input type="time" value={roomForm.start_time} onChange={e => setRoomForm(p=>({...p,start_time:e.target.value}))} /></div>
              <div><label style={{ fontSize:14, color:'var(--text-dim)' }}>結束</label><input type="time" value={roomForm.end_time} onChange={e => setRoomForm(p=>({...p,end_time:e.target.value}))} /></div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
              <div><label style={{ fontSize:14, color:'var(--text-dim)' }}>人數</label><input type="number" inputMode="numeric" placeholder="0" value={roomForm.guest_count} onChange={e => setRoomForm(p=>({...p,guest_count:e.target.value}))} /></div>
              <div><label style={{ fontSize:14, color:'var(--text-dim)' }}>消費金額</label><input type="number" inputMode="numeric" placeholder="0" value={roomForm.amount} onChange={e => setRoomForm(p=>({...p,amount:e.target.value}))} style={{ fontFamily:'var(--font-mono)' }} /></div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <input type="checkbox" checked={roomForm.is_vip} onChange={e => setRoomForm(p=>({...p,is_vip:e.target.checked}))} style={{ width:20, height:20, accentColor:'var(--gold)' }} />
              <span style={{ fontSize:14, color:'var(--gold)' }}>VIP客人</span>
              {roomForm.is_vip && <input placeholder="VIP姓名" value={roomForm.vip_name} onChange={e => setRoomForm(p=>({...p,vip_name:e.target.value}))} style={{ flex:1, fontSize:14, padding:'6px 8px' }} />}
            </div>
            <button onClick={addRoom} className="btn-gold" style={{ width:'100%' }}><Plus size={14} /> 新增</button>
          </div>
          {rooms.length > 0 && <div style={{ fontSize:14, color:'var(--text-dim)', marginBottom:6 }}>今日 {rooms.length} 筆</div>}
          {rooms.map(r => (
            <div key={r.id} className="card" style={{ padding:10, marginBottom:6, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:14, fontWeight:600 }}>{r.room_name} {r.is_vip && <span style={{ fontSize:14, color:'var(--gold)' }}>👑 {r.vip_name}</span>}</div>
                <div style={{ fontSize:14, color:'var(--text-dim)' }}>{r.start_time}-{r.end_time} · {r.guest_count}人</div>
              </div>
              <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--gold)' }}>{"$"}{(+r.amount).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'tips' && (
        <div>
          <div className="card" style={{ padding:14, marginBottom:12 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--gold)', marginBottom:10 }}>登記小費</div>
            <select value={tipForm.employee_id} onChange={e => setTipForm(p=>({...p,employee_id:e.target.value}))} style={{ marginBottom:8 }}>
              <option value="">選擇員工</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <input type="number" inputMode="numeric" placeholder="小費金額" value={tipForm.amount} onChange={e => setTipForm(p=>({...p,amount:e.target.value}))} style={{ marginBottom:8, fontSize:17, fontFamily:'var(--font-mono)', fontWeight:700 }} />
            <button onClick={addTip} className="btn-gold" style={{ width:'100%' }}><Plus size={14} /> 登記小費</button>
          </div>
          {tips.length > 0 && <div style={{ fontSize:14, color:'var(--text-dim)', marginBottom:6 }}>今日小費 {"$"}{tips.reduce((s,t)=>s+(+t.amount||0),0).toLocaleString()}</div>}
          {tips.map(t => (
            <div key={t.id} className="card" style={{ padding:10, marginBottom:6, display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:14 }}>{employees.find(e=>e.id===t.employee_id)?.name||t.employee_id}</span>
              <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--green)' }}>{"$"}{(+t.amount).toLocaleString()}</span>
            </div>
          ))}

          <div className="card" style={{ padding:14, marginTop:16 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'#f59e0b', marginBottom:10 }}>掛帳登記</div>
            <input placeholder="客人姓名" value={creditForm.customer_name} onChange={e => setCreditForm(p=>({...p,customer_name:e.target.value}))} style={{ marginBottom:8 }} />
            <input type="number" inputMode="numeric" placeholder="掛帳金額" value={creditForm.amount} onChange={e => setCreditForm(p=>({...p,amount:e.target.value}))} style={{ marginBottom:8, fontSize:17, fontFamily:'var(--font-mono)', fontWeight:700 }} />
            <input placeholder="原因（選填）" value={creditForm.reason} onChange={e => setCreditForm(p=>({...p,reason:e.target.value}))} style={{ marginBottom:8 }} />
            <button onClick={addCredit} className="btn-outline" style={{ width:'100%', borderColor:'rgba(245,158,11,.4)', color:'#f59e0b' }}><Plus size={14} /> 登記掛帳</button>
          </div>
          {credits.length > 0 && (
            <div style={{ marginTop:12 }}>
              <div style={{ fontSize:14, color:'#f59e0b', fontWeight:600, marginBottom:6 }}>未結掛帳 ({credits.length}筆)</div>
              {credits.map(c => (
                <div key={c.id} className="card" style={{ padding:10, marginBottom:6 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div><span style={{ fontSize:14, fontWeight:600 }}>{c.customer_name}</span><span style={{ fontSize:14, color:'var(--text-dim)', marginLeft:6 }}>{c.date}</span></div>
                    <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, color:'#f59e0b' }}>{"$"}{(+c.amount).toLocaleString()}</span>
                  </div>
                  {c.reason && <div style={{ fontSize:14, color:'var(--text-dim)' }}>{c.reason}</div>}
                  <button onClick={()=>settleCredit(c.id)} style={{ marginTop:6, background:'rgba(77,168,108,.12)', color:'var(--green)', border:'1px solid rgba(77,168,108,.3)', borderRadius:8, padding:'4px 12px', fontSize:14, cursor:'pointer' }}>結清</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'close' && (
        <div>
          {closing && <div style={{ background:'rgba(77,168,108,.1)', border:'1px solid rgba(77,168,108,.3)', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:14, color:'var(--green)' }}>✅ 今日已完成日結（by {closing.closed_by}）</div>}
          <div className="card" style={{ padding:14, marginBottom:12 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--gold)', marginBottom:10 }}>🌡️ 雪茄房溫濕度確認</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={{ fontSize:14, color:'var(--text-dim)' }}>溫度 (°C)</label>
                <input type="number" inputMode="numeric" placeholder="16-20" value={cigarTemp} onChange={e => setCigarTemp(e.target.value)} style={{ fontSize:24, fontFamily:'var(--font-mono)', fontWeight:700, textAlign:'center', padding:'10px' }} />
                {cigarTemp && <div style={{ fontSize:14, textAlign:'center', marginTop:4, color:(+cigarTemp>=16&&+cigarTemp<=20)?'var(--green)':'var(--red)' }}>{(+cigarTemp>=16&&+cigarTemp<=20)?'✅ 正常':'❌ 異常 (16-20°C)'}</div>}
              </div>
              <div>
                <label style={{ fontSize:14, color:'var(--text-dim)' }}>濕度 (%)</label>
                <input type="number" inputMode="numeric" placeholder="62-72" value={cigarHumidity} onChange={e => setCigarHumidity(e.target.value)} style={{ fontSize:24, fontFamily:'var(--font-mono)', fontWeight:700, textAlign:'center', padding:'10px' }} />
                {cigarHumidity && <div style={{ fontSize:14, textAlign:'center', marginTop:4, color:(+cigarHumidity>=62&&+cigarHumidity<=72)?'var(--green)':'var(--red)' }}>{(+cigarHumidity>=62&&+cigarHumidity<=72)?'✅ 正常':'❌ 異常 (62-72%)'}</div>}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding:14, marginBottom:12 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--gold)', marginBottom:10 }}>📋 日結摘要</div>
            <div style={{ fontSize:14, lineHeight:2 }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span>💰 今日營收</span><span style={{ fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--gold)' }}>{"$"}{getTotal().toLocaleString()}</span></div>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span>🏧 現金盤點</span><span style={{ fontFamily:'var(--font-mono)', fontWeight:700, color:getCounted()===getCashExpected()?'var(--green)':getCounted()>0?'var(--red)':'var(--text-dim)' }}>{getCounted()>0 ? '$'+getCounted().toLocaleString()+' ('+(getCounted()-getCashExpected()>=0?'+':'')+( getCounted()-getCashExpected()).toLocaleString()+')' : '未盤點'}</span></div>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span>🚪 包廂使用</span><span style={{ fontFamily:'var(--font-mono)', fontWeight:600 }}>{rooms.length} 間</span></div>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span>👥 客組數</span><span style={{ fontFamily:'var(--font-mono)', fontWeight:600 }}>{+form.customer_count||0} 組（VIP {+form.vip_groups||0}）</span></div>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span>💡 小費</span><span style={{ fontFamily:'var(--font-mono)', fontWeight:600, color:'var(--green)' }}>{"$"}{tips.reduce((s,t)=>s+(+t.amount||0),0).toLocaleString()}</span></div>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span>📌 未結掛帳</span><span style={{ fontFamily:'var(--font-mono)', fontWeight:600, color:credits.length>0?'#f59e0b':'var(--text-dim)' }}>{credits.length} 筆 {"$"}{credits.reduce((s,c)=>s+(+c.amount||0),0).toLocaleString()}</span></div>
            </div>
          </div>

          <button onClick={submitClosing} disabled={submitting} className="btn-gold" style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:16, fontSize:16 }}>
            <Lock size={18} /> {closing ? '更新日結' : '確認日結'}
          </button>
        </div>
      )}
    </div>
  )
}