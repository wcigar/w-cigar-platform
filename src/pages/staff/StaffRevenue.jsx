import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { format, endOfMonth } from 'date-fns'
import { DollarSign, Send, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react'

const PAYMENTS = [
  { key: 'cash_amount', label: '現金', icon: '💵', color: '#4da86c' },
  { key: 'acpay_amount', label: 'ACPAY刷卡', icon: '💳', color: '#4d8ac4' },
  { key: 'teb_amount', label: '臺灣企銀刷卡', icon: '🏦', color: '#8b6cc4' },
  { key: 'transfer_amount', label: '銀行轉帳', icon: '🔄', color: '#c4a84d' },
  { key: 'wechat_amount', label: '微信支付', icon: '💚', color: '#07c160' },
  { key: 'alipay_amount', label: '支付寶', icon: '🔵', color: '#1677ff' },
]

const initForm = { cash_amount:'', acpay_amount:'', teb_amount:'', transfer_amount:'', wechat_amount:'', alipay_amount:'', customer_count:'', note:'', cash_drawer:'' }

export default function StaffRevenue() {
  const { user } = useAuth()
  const [form, setForm] = useState({...initForm})
  const [existing, setExisting] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [monthTotal, setMonthTotal] = useState(0)
  const [records, setRecords] = useState([])
  const [tab, setTab] = useState('entry')
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = format(new Date(), 'yyyy-MM')
  const DRAWER_BASE = 10000

  useEffect(() => { load() }, [])

  async function load() {
    const { data: todayData } = await supabase.from('daily_revenue').select('*').eq('date', today).maybeSingle()
    if (todayData) {
      setExisting(todayData)
      setForm({ cash_amount: todayData.cash_amount||'', acpay_amount: todayData.acpay_amount||'', teb_amount: todayData.teb_amount||'', transfer_amount: todayData.transfer_amount||'', wechat_amount: todayData.wechat_amount||'', alipay_amount: todayData.alipay_amount||'', customer_count: todayData.customer_count||'', note: todayData.note||'', cash_drawer: todayData.other_amount||'' })
    }
    const mEnd = format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const { data: mData } = await supabase.from('daily_revenue').select('total').gte('date', month + '-01').lte('date', mEnd)
    setMonthTotal((mData||[]).reduce((s,r) => s + (+r.total||0), 0))
    const { data: recent } = await supabase.from('daily_revenue').select('*').order('date', { ascending: false }).limit(7)
    setRecords(recent||[])
  }

  function getTotal() { return PAYMENTS.reduce((s,m) => s + (+form[m.key]||0), 0) }
  function getCashExpected() { return DRAWER_BASE + (+form.cash_amount||0) }
  function getCashDiff() { return (+form.cash_drawer||0) - getCashExpected() }

  async function submit() {
    const total = getTotal()
    if (total <= 0) return alert('請至少填入一項營收金額')
    setSubmitting(true)
    const payload = { date: today, cash_amount: +form.cash_amount||0, card_amount: (+form.acpay_amount||0)+(+form.teb_amount||0), acpay_amount: +form.acpay_amount||0, teb_amount: +form.teb_amount||0, transfer_amount: +form.transfer_amount||0, wechat_amount: +form.wechat_amount||0, alipay_amount: +form.alipay_amount||0, other_amount: +form.cash_drawer||0, total, customer_count: +form.customer_count||0, note: form.note||null, recorded_by: user.name }
    if (existing) { await supabase.from('daily_revenue').update(payload).eq('id', existing.id) }
    else { await supabase.from('daily_revenue').insert(payload) }
    setSubmitting(false)
    alert(existing ? '營收已更新！' : '營收已登記！')
    load()
  }

  const tabStyle = (active) => ({ flex:1, padding:'10px 0', fontSize:13, fontWeight:600, cursor:'pointer', background: active ? 'var(--gold-glow)' : 'transparent', color: active ? 'var(--gold)' : 'var(--text-dim)', border: active ? '1px solid var(--border-gold)' : '1px solid var(--border)', borderRadius:8, textAlign:'center' })

  return (
    <div className="page-container fade-in">
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
        <DollarSign size={20} color="var(--gold)" />
        <span className="section-title" style={{ margin:0 }}>每日營收</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
        <div className="card" style={{ textAlign:'center', padding:12 }}>
          <div style={{ fontSize:11, color:'var(--text-dim)' }}>今日合計</div>
          <div style={{ fontSize:22, fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--gold)', marginTop:4 }}>{"$"}{getTotal().toLocaleString()}</div>
        </div>
        <div className="card" style={{ textAlign:'center', padding:12 }}>
          <div style={{ fontSize:11, color:'var(--text-dim)' }}>本月累計</div>
          <div style={{ fontSize:22, fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--green)', marginTop:4 }}>{"$"}{monthTotal.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        <button onClick={() => setTab('entry')} style={tabStyle(tab==='entry')}>💰 營收登記</button>
        <button onClick={() => setTab('cash')} style={tabStyle(tab==='cash')}>🏧 現金盤點</button>
        <button onClick={() => setTab('history')} style={tabStyle(tab==='history')}>📊 近期紀錄</button>
      </div>

      {existing && <div style={{ background:'rgba(77,168,108,.1)', border:'1px solid rgba(77,168,108,.3)', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:'var(--green)' }}>✅ 今日已登記（by {existing.recorded_by}），可修改更新</div>}

      {tab === 'entry' && (
        <div>
          {PAYMENTS.map(m => (
            <div key={m.key} style={{ marginBottom:10 }}>
              <label style={{ fontSize:12, color:m.color, fontWeight:600, marginBottom:4, display:'flex', alignItems:'center', gap:4 }}><span>{m.icon}</span> {m.label}</label>
              <input type="number" inputMode="numeric" placeholder="0" value={form[m.key]} onChange={e => setForm(p=>({...p,[m.key]:e.target.value}))} style={{ fontSize:18, fontFamily:'var(--font-mono)', fontWeight:700, padding:'10px 14px' }} />
            </div>
          ))}
          <div style={{ marginBottom:10 }}>
            <label style={{ fontSize:12, color:'var(--text-dim)', fontWeight:600, marginBottom:4, display:'block' }}>👥 來客組數</label>
            <input type="number" inputMode="numeric" placeholder="0" value={form.customer_count} onChange={e => setForm(p=>({...p,customer_count:e.target.value}))} style={{ fontSize:18, fontFamily:'var(--font-mono)', fontWeight:700, padding:'10px 14px' }} />
          </div>
          <input placeholder="備註 — 如VIP包廂、特殊消費等" value={form.note} onChange={e => setForm(p=>({...p,note:e.target.value}))} style={{ width:'100%', fontSize:14, padding:'10px 12px', marginBottom:16 }} />
          <button onClick={submit} disabled={submitting} className="btn-gold" style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Send size={16} /> {submitting ? '提交中...' : existing ? '更新今日營收' : '登記今日營收'}
          </button>
        </div>
      )}

      {tab === 'cash' && (
        <div>
          <div className="card" style={{ marginBottom:12, padding:14 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--gold)', marginBottom:10 }}>🏧 現金盤點</div>
            <div style={{ fontSize:12, color:'var(--text-dim)', marginBottom:8 }}>輸入每種面額的張/枚數</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {[{v:2000,label:"$2,000",color:"#c9a84c"},{v:1000,label:"$1,000",color:"#4da86c"},{v:500,label:"$500",color:"#4d8ac4"},{v:100,label:"$100",color:"#c44d4d"},{v:50,label:"$50",color:"#8b6cc4"},{v:10,label:"$10",color:"#c4a84d"},{v:5,label:"$5",color:"#f59e0b"},{v:1,label:"$1",color:"var(--text-dim)"}].map(d => (
                <div key={d.v} style={{ display:'flex', alignItems:'center', gap:6, background:'var(--black)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:d.color, minWidth:52 }}>{d.label}</span>
                  <span style={{ color:'var(--text-dim)', fontSize:12 }}>×</span>
                  <input type="number" inputMode="numeric" placeholder="0" value={form['d'+d.v]||''} onChange={e => setForm(p=>({...p,['d'+d.v]:e.target.value}))} style={{ flex:1, fontSize:16, fontFamily:'var(--font-mono)', fontWeight:700, padding:'6px 8px', minHeight:38, textAlign:'center' }} />
                  <span style={{ fontSize:11, color:'var(--text-dim)', minWidth:55, textAlign:'right', fontFamily:'var(--font-mono)' }}>{"="}{((+(form['d'+d.v]||0))*d.v).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop:'1px solid var(--border-gold)', marginTop:10, paddingTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:14, fontWeight:700, color:'var(--gold)' }}>💰 盤點總計</span>
              <span style={{ fontSize:22, fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--gold)' }}>{"$"}{[2000,1000,500,100,50,10,5,1].reduce((s,v)=>s+(+(form["d"+v]||0))*v,0).toLocaleString()}</span>
            </div>
          </div>
          <div className="card" style={{ marginBottom:12, padding:14 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text-dim)', marginBottom:8 }}>比對驗證</div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13 }}>
              <span style={{ color:'var(--text-dim)' }}>開店備用金</span>
              <span style={{ fontFamily:'var(--font-mono)', fontWeight:600 }}>{"$"}{DRAWER_BASE.toLocaleString()}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13 }}>
              <span style={{ color:'var(--text-dim)' }}>+ 今日現金收入</span>
              <span style={{ fontFamily:'var(--font-mono)', fontWeight:600, color:'var(--green)' }}>{"$"}{(+form.cash_amount||0).toLocaleString()}</span>
            </div>
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:700 }}>
              <span>= 應有現金</span>
              <span style={{ fontFamily:'var(--font-mono)', color:'var(--gold)' }}>{"$"}{getCashExpected().toLocaleString()}</span>
            </div>
          </div>
          {(() => { const counted = [2000,1000,500,100,50,10,5,1].reduce((s,v)=>s+(+(form["d"+v]||0))*v,0); const diff = counted - getCashExpected(); return counted > 0 ? (
            <div className="card" style={{ padding:14, borderColor: diff===0?'rgba(77,168,108,.4)':'rgba(196,77,77,.4)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {diff===0 ? <CheckCircle2 size={20} color="var(--green)" /> : <AlertTriangle size={20} color={diff>0?'#f59e0b':'var(--red)'} />}
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:diff===0?'var(--green)':diff>0?'#f59e0b':'var(--red)' }}>
                    {diff===0 ? '✅ 現金正確' : diff>0 ? '⚠️ 多 $'+diff.toLocaleString() : '❌ 短少 $'+Math.abs(diff).toLocaleString()}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-dim)', marginTop:2 }}>應有 {"$"}{getCashExpected().toLocaleString()} / 實點 {"$"}{counted.toLocaleString()}</div>
                </div>
              </div>
            </div>
          ) : null })()}
          <button onClick={()=>{const c=[2000,1000,500,100,50,10,5,1].reduce((s,v)=>s+(+(form["d"+v]||0))*v,0);setForm(p=>({...p,cash_drawer:String(c)}));submit()}} disabled={submitting} className="btn-gold" style={{ width:'100%', marginTop:16, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Send size={16} /> 儲存盤點結果
          </button>
        </div>
      )}

      {tab === 'history' && (
        <div>
          {records.length === 0 && <div style={{ textAlign:'center', color:'var(--text-dim)', padding:40 }}>尚無營收紀錄</div>}
          {records.map(r => (
            <div key={r.id} className="card" style={{ marginBottom:8, padding:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontSize:13, fontWeight:600 }}>{r.date}</span>
                <span style={{ fontSize:18, fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--gold)' }}>{"$"}{(+r.total).toLocaleString()}</span>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', fontSize:11 }}>
                {+r.cash_amount > 0 && <span style={{ background:'rgba(77,168,108,.1)', color:'#4da86c', padding:'3px 8px', borderRadius:10 }}>💵 {(+r.cash_amount).toLocaleString()}</span>}
                {+r.acpay_amount > 0 && <span style={{ background:'rgba(77,138,196,.1)', color:'#4d8ac4', padding:'3px 8px', borderRadius:10 }}>💳 ACPAY {(+r.acpay_amount).toLocaleString()}</span>}
                {+r.teb_amount > 0 && <span style={{ background:'rgba(139,108,196,.1)', color:'#8b6cc4', padding:'3px 8px', borderRadius:10 }}>🏦 企銀 {(+r.teb_amount).toLocaleString()}</span>}
                {+r.transfer_amount > 0 && <span style={{ background:'rgba(196,168,77,.1)', color:'#c4a84d', padding:'3px 8px', borderRadius:10 }}>🔄 {(+r.transfer_amount).toLocaleString()}</span>}
                {+r.wechat_amount > 0 && <span style={{ background:'rgba(7,193,96,.1)', color:'#07c160', padding:'3px 8px', borderRadius:10 }}>💚 微信 {(+r.wechat_amount).toLocaleString()}</span>}
                {+r.alipay_amount > 0 && <span style={{ background:'rgba(22,119,255,.1)', color:'#1677ff', padding:'3px 8px', borderRadius:10 }}>🔵 支付寶 {(+r.alipay_amount).toLocaleString()}</span>}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:11, color:'var(--text-dim)' }}>
                <span>👥 {r.customer_count||0} 組</span>
                <span>by {r.recorded_by}</span>
              </div>
              {r.note && <div style={{ fontSize:11, color:'var(--text-dim)', marginTop:4, fontStyle:'italic' }}>{r.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
