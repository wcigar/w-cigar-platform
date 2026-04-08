import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { format, endOfMonth } from 'date-fns'
import { DollarSign, Send, TrendingUp } from 'lucide-react'

const METHODS = [
  { key: 'cash_amount', label: '現金', icon: '💵', color: '#4da86c' },
  { key: 'acpay_amount', label: 'ACPAY刮卡', icon: '💳', color: '#4d8ac4' },
  { key: 'teb_amount', label: '臺灣企銀刮卡', icon: '🏦', color: '#8b6cc4' },
  { key: 'transfer_amount', label: '銀行轉帳', icon: '🔄', color: '#c4a84d' },
  { key: 'wechat_amount', label: '微信支付', icon: '💚', color: '#07c160' },
  { key: 'alipay_amount', label: '支付寶', icon: '🔵', color: '#1677ff' },
]

export default function StaffRevenue() {
  const { user } = useAuth()
  const [form, setForm] = useState({ cash_amount:'', acpay_amount:'', teb_amount:'', transfer_amount:'', wechat_amount:'', alipay_amount:'', customer_count:'', note:'' })
  const [existing, setExisting] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [monthTotal, setMonthTotal] = useState(0)
  const [records, setRecords] = useState([])
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = format(new Date(), 'yyyy-MM')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: todayData } = await supabase.from('daily_revenue').select('*').eq('date', today).maybeSingle()
    if (todayData) {
      setExisting(todayData)
      setForm({ cash_amount: todayData.cash_amount||'', acpay_amount: todayData.acpay_amount||'', teb_amount: todayData.teb_amount||'', transfer_amount: todayData.transfer_amount||'', wechat_amount: todayData.wechat_amount||'', alipay_amount: todayData.alipay_amount||'', customer_count: todayData.customer_count||'', note: todayData.note||'' })
    }
    const mEnd = format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const { data: mData } = await supabase.from('daily_revenue').select('total').gte('date', month + '-01').lte('date', mEnd)
    setMonthTotal((mData||[]).reduce((s,r) => s + (+r.total||0), 0))
    const { data: recent } = await supabase.from('daily_revenue').select('*').order('date', { ascending: false }).limit(7)
    setRecords(recent||[])
  }

  function getTotal() { return METHODS.reduce((s,m) => s + (+form[m.key]||0), 0) }

  async function submit() {
    const total = getTotal()
    if (total <= 0) return alert('請至少填入一項營收金額')
    setSubmitting(true)
    const payload = { date: today, cash_amount: +form.cash_amount||0, card_amount: (+form.acpay_amount||0)+(+form.teb_amount||0), acpay_amount: +form.acpay_amount||0, teb_amount: +form.teb_amount||0, transfer_amount: +form.transfer_amount||0, wechat_amount: +form.wechat_amount||0, alipay_amount: +form.alipay_amount||0, other_amount: 0, total, customer_count: +form.customer_count||0, note: form.note||null, recorded_by: user.name }
    if (existing) { await supabase.from('daily_revenue').update(payload).eq('id', existing.id) }
    else { await supabase.from('daily_revenue').insert(payload) }
    setSubmitting(false)
    alert(existing ? '營收已更新！' : '營收已登記！')
    load()
  }

  return (
    <div className="page-container fade-in">
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
        <DollarSign size={20} color="var(--gold)" />
        <span className="section-title" style={{ margin:0 }}>今日營收登記</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
        <div className="card" style={{ textAlign:'center', padding:12 }}>
          <div style={{ fontSize:11, color:'var(--text-dim)' }}>今日合計</div>
          <div style={{ fontSize:22, fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--gold)', marginTop:4 }}>{getTotal().toLocaleString()}</div>
        </div>
        <div className="card" style={{ textAlign:'center', padding:12 }}>
          <div style={{ fontSize:11, color:'var(--text-dim)' }}>本月累計</div>
          <div style={{ fontSize:22, fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--green)', marginTop:4 }}>{monthTotal.toLocaleString()}</div>
        </div>
      </div>
      {existing && <div style={{ background:'rgba(77,168,108,.1)', border:'1px solid rgba(77,168,108,.3)', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:'var(--green)' }}>✅ 今日已登記（by {existing.recorded_by}），可修改更新</div>}
      {METHODS.map(m => (
        <div key={m.key} style={{ marginBottom:10 }}>
          <label style={{ fontSize:12, color:m.color, fontWeight:600, marginBottom:4, display:'flex', alignItems:'center', gap:4 }}><span>{m.icon}</span> {m.label}</label>
          <input type="number" inputMode="numeric" placeholder="0" value={form[m.key]} onChange={e => setForm(p=>({...p,[m.key]:e.target.value}))} style={{ fontSize:18, fontFamily:'var(--font-mono)', fontWeight:700, padding:'10px 14px' }} />
        </div>
      ))}
      <div style={{ marginBottom:10 }}>
        <label style={{ fontSize:12, color:'var(--text-dim)', fontWeight:600, marginBottom:4, display:'block' }}>👥 來客數</label>
        <input type="number" inputMode="numeric" placeholder="0" value={form.customer_count} onChange={e => setForm(p=>({...p,customer_count:e.target.value}))} style={{ fontSize:18, fontFamily:'var(--font-mono)', fontWeight:700, padding:'10px 14px' }} />
      </div>
      <input placeholder="備註（選填）" value={form.note} onChange={e => setForm(p=>({...p,note:e.target.value}))} style={{ width:'100%', fontSize:14, padding:'10px 12px', marginBottom:16 }} />
      <button onClick={submit} disabled={submitting} className="btn-gold" style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        <Send size={16} /> {submitting ? '提交中...' : existing ? '更新今日營收' : '登記今日營收'}
      </button>
      {records.length > 0 && (
        <div style={{ marginTop:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}><TrendingUp size={16} color="var(--text-dim)" /><span style={{ fontSize:13, color:'var(--text-dim)' }}>近 7 日營收</span></div>
          {records.map(r => (
            <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontSize:13, color:'var(--text-dim)' }}>{r.date}</span>
              <div style={{ display:'flex', gap:8, fontSize:11, flexWrap:'wrap' }}>
                {r.cash_amount > 0 && <span style={{color:'#4da86c'}}>💵{(+r.cash_amount).toLocaleString()}</span>}
                {r.acpay_amount > 0 && <span style={{color:'#4d8ac4'}}>💳{(+r.acpay_amount).toLocaleString()}</span>}
                {r.teb_amount > 0 && <span style={{color:'#8b6cc4'}}>🏦{(+r.teb_amount).toLocaleString()}</span>}
                {r.transfer_amount > 0 && <span style={{color:'#c4a84d'}}>🔄{(+r.transfer_amount).toLocaleString()}</span>}
                {r.wechat_amount > 0 && <span style={{color:'#07c160'}}>💚{(+r.wechat_amount).toLocaleString()}</span>}
                {r.alipay_amount > 0 && <span style={{color:'#1677ff'}}>🔵{(+r.alipay_amount).toLocaleString()}</span>}
              </div>
              <span style={{ fontSize:14, fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--gold)' }}>{(+r.total).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
