import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Wallet, Users, ChevronDown, ChevronUp, Image } from 'lucide-react'
import { format, subMonths, endOfMonth } from 'date-fns'

export default function PettyCash() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [records, setRecords] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [photoModal, setPhotoModal] = useState(null)
  const [editingCash, setEditingCash] = useState(null)
  const [cashForm, setCashForm] = useState({ amount: '', method: '', given_by: '', received_by: '', note: '' })

  function startEdit(r) { setEditingCash(r.id); setCashForm({ amount: String(r.amount || ''), method: r.method || '現金', given_by: r.given_by || 'Wilson', received_by: r.received_by || r.employee_name || '', note: r.note || '' }) }
  async function saveEdit(id) { if (!cashForm.amount || +cashForm.amount <= 0) return alert('金額不可為空'); await supabase.from('petty_cash').update({ amount: +cashForm.amount, method: cashForm.method, given_by: cashForm.given_by, received_by: cashForm.received_by, note: cashForm.note }).eq('id', id); setEditingCash(null); load() }
  async function deleteCash(r) { if (!confirm(`確定刪除這筆零用金？金額：$${r.amount.toLocaleString()}`)) return; await supabase.from('petty_cash').delete().eq('id', r.id); load() }
  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))

  useEffect(() => { load() }, [month])
  async function load() {
    setLoading(true)
    const s = month + '-01', e = format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const [pR, xR] = await Promise.all([ supabase.from('petty_cash').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }), supabase.from('expenses').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }) ])
    setRecords(pR.data || []); setExpenses(xR.data || []); setLoading(false)
  }

  const totalIn = records.reduce((s, r) => s + (r.amount || 0), 0)
  const totalOut = expenses.reduce((s, r) => s + (r.amount || 0), 0)
  const balance = totalIn - totalOut
  const wilsonIn = records.filter(r => r.given_by === 'Wilson').reduce((s, r) => s + (r.amount || 0), 0)
  const shanIn = records.filter(r => r.given_by === '珊珊').reduce((s, r) => s + (r.amount || 0), 0)
  const byHandler = {}; expenses.forEach(x => { const h = x.handler || '未知'; byHandler[h] = (byHandler[h] || 0) + (x.amount || 0) })
  const handlerList = Object.entries(byHandler).sort((a, b) => b[1] - a[1])
  const timeline = [...records.map(r => ({ ...r, _type: 'in', _sort: r.created_at || r.date })), ...expenses.map(r => ({ ...r, _type: 'out', _sort: r.created_at || r.date }))].sort((a, b) => b._sort > a._sort ? 1 : -1)

  if (loading) return <div>{[1,2,3].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8, borderRadius: 14 }} />)}</div>

  const SEP = <div style={{height:1,background:'linear-gradient(90deg,transparent,rgba(196,163,90,.06),transparent)',margin:'12px 0'}}/>
  const tabStyle = (active) => ({ padding:'7px 14px', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer', letterSpacing:1, background:active?'rgba(196,163,90,.15)':'transparent', color:active?'rgba(196,163,90,1)':'#888078', border:active?'1px solid rgba(196,163,90,.3)':'1px solid rgba(196,163,90,.08)' })

  function EditForm({ r }) {
    return <div>
      <div style={{fontFamily:'Noto Serif TC,serif',fontSize:13,fontWeight:600,color:'rgba(100,170,100,.8)',marginBottom:10}}>✏️ 編輯撥付紀錄</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
        <div><label style={{fontFamily:'Noto Serif TC,serif',fontSize:11,color:'#888078',display:'block',marginBottom:4}}>金額</label><input className="wcb-input" type="number" value={cashForm.amount} onChange={e=>setCashForm(f=>({...f,amount:e.target.value}))} style={{fontFamily:'JetBrains Mono,monospace',fontSize:16}}/></div>
        <div><label style={{fontFamily:'Noto Serif TC,serif',fontSize:11,color:'#888078',display:'block',marginBottom:4}}>方式</label><select className="wcb-input" value={cashForm.method} onChange={e=>setCashForm(f=>({...f,method:e.target.value}))}><option>現金</option><option>轉帳</option></select></div>
        <div><label style={{fontFamily:'Noto Serif TC,serif',fontSize:11,color:'#888078',display:'block',marginBottom:4}}>撥付人</label><select className="wcb-input" value={cashForm.given_by} onChange={e=>setCashForm(f=>({...f,given_by:e.target.value}))}><option>Wilson</option><option>珊珊</option></select></div>
        <div><label style={{fontFamily:'Noto Serif TC,serif',fontSize:11,color:'#888078',display:'block',marginBottom:4}}>經手人</label><input className="wcb-input" value={cashForm.received_by} onChange={e=>setCashForm(f=>({...f,received_by:e.target.value}))}/></div>
      </div>
      <div style={{marginBottom:10}}><label style={{fontFamily:'Noto Serif TC,serif',fontSize:11,color:'#888078',display:'block',marginBottom:4}}>備註</label><input className="wcb-input" value={cashForm.note} onChange={e=>setCashForm(f=>({...f,note:e.target.value}))} placeholder="備註"/></div>
      <div style={{display:'flex',gap:8}}>
        <button className="wcb-btn-gold" style={{flex:1}} onClick={()=>saveEdit(r.id)}>✅ 儲存</button>
        <button className="wcb-btn-outline" style={{flex:1}} onClick={()=>setEditingCash(null)}>取消</button>
      </div>
    </div>
  }

  function InRecord({ r, showActions }) {
    return <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontFamily:'Noto Serif TC,serif',fontSize:13,fontWeight:600,color:'rgba(100,170,100,.8)'}}>💰 撥付零用金</div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'rgba(196,163,90,.3)',marginTop:3}}>{r.date} · {r.given_by} · {r.method} · 經手：{r.received_by||r.employee_name} {r.signature_url&&'✍️'}</div></div>
        <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:18,fontWeight:600,color:'rgba(100,170,100,.8)'}}>+${r.amount.toLocaleString()}</span>
      </div>
      {r.note&&<div style={{fontFamily:'Noto Serif TC,serif',fontSize:11,color:'#888078',marginTop:4}}>📝 {r.note}</div>}
      {r.signature_url&&<img src={r.signature_url} alt="" style={{maxWidth:160,height:50,objectFit:'contain',borderRadius:8,border:'1px solid rgba(196,163,90,.1)',background:'#fff',marginTop:6,cursor:'pointer'}} onClick={()=>setPhotoModal(r.signature_url)}/>}
      {showActions&&<div style={{display:'flex',gap:6,marginTop:8,justifyContent:'flex-end'}}>
        <button className="wcb-btn-outline" style={{fontSize:10,padding:'6px 12px'}} onClick={()=>startEdit(r)}>✏️ 編輯</button>
        <button className="wcb-btn-danger" style={{fontSize:10,padding:'6px 12px'}} onClick={()=>deleteCash(r)}>🗑️ 刪除</button>
      </div>}
    </>
  }

  return (
    <div>
      {/* Photo modal */}
      {photoModal&&<div className="wcb-modal-overlay" style={{alignItems:'center'}} onClick={()=>setPhotoModal(null)}><div style={{maxWidth:500,width:'100%'}} onClick={e=>e.stopPropagation()}><img src={photoModal} alt="" style={{width:'100%',borderRadius:14,maxHeight:'80vh',objectFit:'contain'}}/><button className="wcb-btn-outline" style={{width:'100%',marginTop:10}} onClick={()=>setPhotoModal(null)}>關閉</button></div></div>}

      {/* Month tabs */}
      <div style={{display:'flex',gap:6,marginBottom:14,overflowX:'auto'}}>
        {months.map(m=><button key={m} onClick={()=>setMonth(m)} style={tabStyle(m===month)}>{parseInt(m.slice(5))}月</button>)}
      </div>

      {/* Summary */}
      <div className="wcb-card" style={{marginBottom:8}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,textAlign:'center'}}>
          <div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:'#888078',letterSpacing:1}}>INCOME</div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:20,fontWeight:300,color:'rgba(100,170,100,.8)',marginTop:4}}>${totalIn.toLocaleString()}</div></div>
          <div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:'#888078',letterSpacing:1}}>EXPENSE</div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:20,fontWeight:300,color:'rgba(190,70,60,.8)',marginTop:4}}>${totalOut.toLocaleString()}</div></div>
          <div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:'#888078',letterSpacing:1}}>BALANCE</div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:20,fontWeight:300,color:balance>=0?'rgba(196,163,90,.8)':'rgba(190,70,60,.8)',marginTop:4}}>${balance.toLocaleString()}</div></div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:16}}>
        <div className="wcb-card" style={{padding:10,textAlign:'center',marginBottom:0}}><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:'#888078',letterSpacing:1}}>Wilson</div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:16,fontWeight:300,color:'rgba(196,163,90,.7)',marginTop:3}}>${wilsonIn.toLocaleString()}</div></div>
        <div className="wcb-card" style={{padding:10,textAlign:'center',marginBottom:0}}><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:'#888078',letterSpacing:1}}>珊珊</div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:16,fontWeight:300,color:'rgba(196,163,90,.7)',marginTop:3}}>${shanIn.toLocaleString()}</div></div>
      </div>

      {/* Handler breakdown */}
      {handlerList.length>0&&(
        <div className="wcb-card" style={{marginBottom:16}}>
          <div style={{fontFamily:'Noto Serif TC,serif',fontSize:13,fontWeight:600,color:'rgba(196,163,90,.8)',marginBottom:10,display:'flex',alignItems:'center',gap:6}}><Users size={14}/> 各員工支出</div>
          {handlerList.map(([name,amt])=>{const pct=totalOut>0?Math.round(amt/totalOut*100):0;return(
            <div key={name} style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:4}}><span style={{fontFamily:'Noto Serif TC,serif',fontWeight:500,color:'var(--bone)'}}>{name}</span><span style={{fontFamily:'JetBrains Mono,monospace',color:'rgba(190,70,60,.7)'}}>${amt.toLocaleString()} <span style={{fontSize:10,color:'#888078'}}>({pct}%)</span></span></div>
              <div className="wcb-progress-track"><div className="wcb-progress-fill" style={{width:pct+'%',background:'linear-gradient(90deg,rgba(190,70,60,.4),rgba(190,70,60,.8))'}}/></div>
            </div>
          )})}
        </div>
      )}

      {/* Tab switcher */}
      <div style={{display:'flex',gap:6,marginBottom:16}}>
        {[['overview','收支時間軸'],['in','撥付紀錄'],['out','支出紀錄']].map(([v,l])=><button key={v} onClick={()=>setTab(v)} style={tabStyle(tab===v)}>{l}</button>)}
      </div>

      {/* Timeline */}
      {tab==='overview'&&(
        <div>
          {timeline.length===0?<div className="wcb-card" style={{textAlign:'center',padding:30,color:'#888078'}}>本月無紀錄</div>:
            timeline.map((r,i)=>r._type==='in'?(
              <div key={'i'+i} className="wcb-card" style={{borderColor:'rgba(100,170,100,.12)'}}>
                <InRecord r={r} showActions={true}/>
              </div>
            ):(
              <div key={'o'+i} className="wcb-card">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{flex:1}}><div style={{fontFamily:'Noto Serif TC,serif',fontSize:13,fontWeight:500,color:'var(--bone)'}}>🧀 {r.item||r.category}</div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'rgba(196,163,90,.3)',marginTop:3}}>{r.date} · <b style={{color:'var(--bone)'}}>{r.handler}</b> · {r.category} · {r.vendor||''} · {r.payment}</div></div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>{r.photo_url&&<Image size={14} color="rgba(196,163,90,.5)" style={{cursor:'pointer'}} onClick={()=>setPhotoModal(r.photo_url)}/>}<span style={{fontFamily:'JetBrains Mono,monospace',fontSize:16,fontWeight:600,color:'rgba(190,70,60,.7)'}}>-${(r.amount||0).toLocaleString()}</span></div>
                </div>
              </div>
            ))}
          {timeline.length>0&&<div className="wcb-card" style={{borderColor:'rgba(196,163,90,.2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontFamily:'Noto Serif TC,serif',fontSize:14,fontWeight:600,color:'rgba(196,163,90,.8)'}}>💰 目前餘額</span><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:22,fontWeight:300,color:balance>=0?'rgba(196,163,90,.8)':'rgba(190,70,60,.8)'}}>${balance.toLocaleString()}</span></div>}
        </div>
      )}

      {/* In records */}
      {tab==='in'&&(
        <div>
          {records.length===0?<div className="wcb-card" style={{textAlign:'center',padding:30,color:'#888078'}}>本月無撥付</div>:
            records.map(r=>(
              <div key={r.id} className="wcb-card">
                {editingCash===r.id?<EditForm r={r}/>:<InRecord r={r} showActions={true}/>}
              </div>
            ))}
        </div>
      )}

      {/* Out records */}
      {tab==='out'&&(
        <div>
          {expenses.length===0?<div className="wcb-card" style={{textAlign:'center',padding:30,color:'#888078'}}>本月無支出</div>:
            expenses.map(x=>(
              <div key={x.id} className="wcb-card">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{flex:1}}><div style={{fontFamily:'Noto Serif TC,serif',fontSize:13,fontWeight:500,color:'var(--bone)'}}>{x.item||x.category}</div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'rgba(196,163,90,.3)',marginTop:3}}>{x.date} · <b style={{color:'var(--bone)'}}>{x.handler}</b> · {x.category} · {x.vendor||'無廠商'} · {x.payment}</div></div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>{x.photo_url&&<Image size={14} color="rgba(196,163,90,.5)" style={{cursor:'pointer'}} onClick={()=>setPhotoModal(x.photo_url)}/>}<span style={{fontFamily:'JetBrains Mono,monospace',fontSize:16,fontWeight:600,color:'rgba(190,70,60,.7)'}}>-${(x.amount||0).toLocaleString()}</span></div>
                </div>
                {x.note&&<div style={{fontFamily:'Noto Serif TC,serif',fontSize:11,color:'#888078',marginTop:4}}>📝 {x.note}</div>}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
