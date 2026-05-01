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
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
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

  async function loadReport() {
    setReportLoading(true)
    const mths = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM')).reverse()
    const data = []
    for (const m of mths) {
      const s = m + '-01', e = format(endOfMonth(new Date(m + '-01')), 'yyyy-MM-dd')
      const [pR, xR] = await Promise.all([
        supabase.from('petty_cash').select('amount,given_by').gte('date', s).lte('date', e),
        supabase.from('expenses').select('amount,category,handler').gte('date', s).lte('date', e),
      ])
      const cashIn = (pR.data || []).reduce((s, r) => s + (r.amount || 0), 0)
      const cashOut = (xR.data || []).reduce((s, r) => s + (r.amount || 0), 0)
      const byCat = {}; (xR.data || []).forEach(x => { const c = x.category || '其他'; byCat[c] = (byCat[c] || 0) + (x.amount || 0) })
      const byGiver = {}; (pR.data || []).forEach(p => { const g = p.given_by || '未知'; byGiver[g] = (byGiver[g] || 0) + (p.amount || 0) })
      data.push({ month: m, label: parseInt(m.slice(5)) + '月', cashIn, cashOut, balance: cashIn - cashOut, byCat, byGiver })
    }
    setReport(data); setReportLoading(false)
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
        {[['overview','收支時間軸'],['in','撥付紀錄'],['out','支出紀錄'],['report','📊 報表分析']].map(([v,l])=><button key={v} onClick={()=>{setTab(v);if(v==='report'&&!report)loadReport()}} style={tabStyle(tab===v)}>{l}</button>)}
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

      {/* 📊 報表分析 */}
      {tab==='report'&&(
        <div>
          {reportLoading?<div style={{textAlign:'center',padding:30,color:'#888078'}}>載入 6 個月資料中…</div>:!report?null:(()=>{
            const maxVal = Math.max(...report.map(d=>Math.max(d.cashIn,d.cashOut)),1)
            // 合併所有月份的分類
            const allCats = {}; report.forEach(d=>Object.entries(d.byCat).forEach(([c,a])=>{allCats[c]=(allCats[c]||0)+a}))
            const catList = Object.entries(allCats).sort((a,b)=>b[1]-a[1])
            const catColors = ['rgba(196,163,90,.8)','rgba(100,170,100,.7)','rgba(100,140,170,.7)','rgba(190,70,60,.7)','rgba(155,89,182,.7)','rgba(245,158,11,.7)','rgba(52,152,219,.7)']
            const totalAllIn = report.reduce((s,d)=>s+d.cashIn,0)
            const totalAllOut = report.reduce((s,d)=>s+d.cashOut,0)
            return <>
              {/* 6 個月總計 */}
              <div className="card" style={{padding:16,marginBottom:12}}>
                <div style={{fontFamily:'Noto Serif TC,serif',fontSize:14,fontWeight:700,color:'var(--gold)',marginBottom:12}}>📊 近 6 個月零用金總覽</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,textAlign:'center'}}>
                  <div><div style={{fontSize:10,color:'var(--text-dim)'}}>總收入</div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:18,fontWeight:600,color:'var(--green)',marginTop:2}}>${totalAllIn.toLocaleString()}</div></div>
                  <div><div style={{fontSize:10,color:'var(--text-dim)'}}>總支出</div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:18,fontWeight:600,color:'var(--red)',marginTop:2}}>${totalAllOut.toLocaleString()}</div></div>
                  <div><div style={{fontSize:10,color:'var(--text-dim)'}}>淨額</div><div style={{fontFamily:'JetBrains Mono,monospace',fontSize:18,fontWeight:600,color:totalAllIn-totalAllOut>=0?'var(--gold)':'var(--red)',marginTop:2}}>${(totalAllIn-totalAllOut).toLocaleString()}</div></div>
                </div>
              </div>

              {/* 月度趨勢圖 */}
              <div className="card" style={{padding:16,marginBottom:12}}>
                <div style={{fontFamily:'Noto Serif TC,serif',fontSize:13,fontWeight:700,color:'var(--gold)',marginBottom:14}}>📈 月度收支趨勢</div>
                <div style={{display:'flex',alignItems:'flex-end',gap:6,height:160,padding:'0 4px'}}>
                  {report.map(d=>(
                    <div key={d.month} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                      <div style={{width:'100%',display:'flex',gap:2,alignItems:'flex-end',height:120}}>
                        <div style={{flex:1,background:'rgba(77,168,108,.3)',borderRadius:'4px 4px 0 0',height:Math.max(4,d.cashIn/maxVal*120),transition:'height .5s'}} title={`收入 $${d.cashIn.toLocaleString()}`}/>
                        <div style={{flex:1,background:'rgba(196,77,77,.3)',borderRadius:'4px 4px 0 0',height:Math.max(4,d.cashOut/maxVal*120),transition:'height .5s'}} title={`支出 $${d.cashOut.toLocaleString()}`}/>
                      </div>
                      <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'JetBrains Mono,monospace'}}>{d.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex',justifyContent:'center',gap:16,marginTop:10,fontSize:10,color:'var(--text-muted)'}}>
                  <span><span style={{display:'inline-block',width:10,height:10,borderRadius:2,background:'rgba(77,168,108,.3)',marginRight:4,verticalAlign:'middle'}}/>收入</span>
                  <span><span style={{display:'inline-block',width:10,height:10,borderRadius:2,background:'rgba(196,77,77,.3)',marginRight:4,verticalAlign:'middle'}}/>支出</span>
                </div>
              </div>

              {/* 月度對比表 */}
              <div className="card" style={{padding:16,marginBottom:12}}>
                <div style={{fontFamily:'Noto Serif TC,serif',fontSize:13,fontWeight:700,color:'var(--gold)',marginBottom:10}}>📋 月度對比</div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                    <th style={{textAlign:'left',padding:'6px 4px',color:'var(--text-muted)',fontWeight:500}}>月份</th>
                    <th style={{textAlign:'right',padding:'6px 4px',color:'var(--green)',fontWeight:500}}>收入</th>
                    <th style={{textAlign:'right',padding:'6px 4px',color:'var(--red)',fontWeight:500}}>支出</th>
                    <th style={{textAlign:'right',padding:'6px 4px',color:'var(--gold)',fontWeight:500}}>餘額</th>
                    <th style={{textAlign:'right',padding:'6px 4px',color:'var(--text-muted)',fontWeight:500}}>較前月</th>
                  </tr></thead>
                  <tbody>{report.map((d,i)=>{
                    const prev = i>0?report[i-1]:null
                    const diff = prev?d.cashOut-prev.cashOut:0
                    const diffPct = prev&&prev.cashOut>0?Math.round(diff/prev.cashOut*100):0
                    return <tr key={d.month} style={{borderBottom:'1px solid var(--border)'}}>
                      <td style={{padding:'8px 4px',fontFamily:'JetBrains Mono,monospace',color:'var(--text)'}}>{d.label}</td>
                      <td style={{padding:'8px 4px',textAlign:'right',fontFamily:'JetBrains Mono,monospace',color:'var(--green)'}}>${d.cashIn.toLocaleString()}</td>
                      <td style={{padding:'8px 4px',textAlign:'right',fontFamily:'JetBrains Mono,monospace',color:'var(--red)'}}>${d.cashOut.toLocaleString()}</td>
                      <td style={{padding:'8px 4px',textAlign:'right',fontFamily:'JetBrains Mono,monospace',color:d.balance>=0?'var(--gold)':'var(--red)'}}>${d.balance.toLocaleString()}</td>
                      <td style={{padding:'8px 4px',textAlign:'right',fontSize:11,color:diff>0?'var(--red)':diff<0?'var(--green)':'var(--text-muted)'}}>{i===0?'—':diff>0?`+${diffPct}% ▲`:diff<0?`${diffPct}% ▼`:'持平'}</td>
                    </tr>
                  })}</tbody>
                </table>
              </div>

              {/* 支出分類圓餅（用橫條圖替代） */}
              <div className="card" style={{padding:16,marginBottom:12}}>
                <div style={{fontFamily:'Noto Serif TC,serif',fontSize:13,fontWeight:700,color:'var(--gold)',marginBottom:10}}>🏷️ 6 個月支出分類佔比</div>
                {catList.map(([cat,amt],i)=>{
                  const pct = totalAllOut>0?Math.round(amt/totalAllOut*100):0
                  return <div key={cat} style={{marginBottom:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                      <span style={{fontWeight:600,color:'var(--text)'}}>{cat}</span>
                      <span style={{fontFamily:'JetBrains Mono,monospace',color:'var(--text-muted)'}}>${amt.toLocaleString()} ({pct}%)</span>
                    </div>
                    <div style={{height:6,background:'var(--black)',borderRadius:3,overflow:'hidden'}}>
                      <div style={{height:'100%',width:pct+'%',background:catColors[i%catColors.length],borderRadius:3,transition:'width .5s'}}/>
                    </div>
                  </div>
                })}
              </div>

              {/* 撥付人分析 */}
              <div className="card" style={{padding:16}}>
                <div style={{fontFamily:'Noto Serif TC,serif',fontSize:13,fontWeight:700,color:'var(--gold)',marginBottom:10}}>👤 撥付人 6 個月累計</div>
                {(()=>{
                  const allGivers = {}; report.forEach(d=>Object.entries(d.byGiver).forEach(([g,a])=>{allGivers[g]=(allGivers[g]||0)+a}))
                  return Object.entries(allGivers).sort((a,b)=>b[1]-a[1]).map(([name,amt])=>(
                    <div key={name} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                      <span style={{fontWeight:600}}>{name}</span>
                      <span style={{fontFamily:'JetBrains Mono,monospace',color:'var(--green)',fontWeight:600}}>${amt.toLocaleString()}</span>
                    </div>
                  ))
                })()}
              </div>
            </>
          })()}
        </div>
      )}
    </div>
  )
}
