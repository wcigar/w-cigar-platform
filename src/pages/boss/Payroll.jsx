import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { calcLaborIns, calcHealthIns, calcLaborPension, calcLaborInsER, calcHealthInsER, findBracket, LABOR_INS_BRACKETS, HEALTH_INS_BRACKETS } from '../../lib/constants'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { format, subMonths } from 'date-fns'

export default function Payroll() {
  const [tab, setTab] = useState('payroll')
  const [month, setMonth] = useState(format(new Date(),'yyyy-MM'))
  const [emps, setEmps] = useState([])
  const [salConfigs, setSalConfigs] = useState([])
  const [bonuses, setBonuses] = useState([])
  const [expenses, setExpenses] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [newExp, setNewExp] = useState({category:'',item:'',amount:''})
  const [showExpForm, setShowExpForm] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [month])
  async function load() {
    setLoading(true)
    const [eR,sR,bR,xR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled',true).order('name'),
      supabase.from('salary_config').select('*'),
      supabase.from('bonus_definitions').select('*').eq('enabled',true),
      supabase.from('expenses').select('*').gte('date',month+'-01').lte('date',month+'-31').order('date',{ascending:false}),
    ])
    setEmps((eR.data||[]).filter(e=>!e.is_admin)); setSalConfigs(sR.data||[]); setBonuses(bR.data||[]); setExpenses(xR.data||[]); setLoading(false)
  }

  function getCfg(eid) { return salConfigs.find(s=>s.employee_id===eid)||{} }
  function calcPay(emp) {
    const c = getCfg(emp.id), base = c.monthly_salary||0
    const lb = findBracket(base, LABOR_INS_BRACKETS), hb = findBracket(base, HEALTH_INS_BRACKETS)
    const li = calcLaborIns(base), hi = calcHealthIns(base), lp = calcLaborPension(base)
    const liER = calcLaborInsER(base), hiER = calcHealthInsER(base)
    const empBon = bonuses.filter(b=>b.employee_id===emp.id).reduce((s,b)=>s+(b.amount||0),0)
    const deduct = li+hi, net = base+empBon-deduct
    return {base,empBon,li,hi,lp,liER,hiER,lb,hb,deduct,net,erCost:base+empBon+liER+hiER+lp}
  }

  async function addExpense() {
    if (!newExp.category||!newExp.amount) return
    await supabase.from('expenses').insert({...newExp,amount:+newExp.amount,date:format(new Date(),'yyyy-MM-dd'),handler:'ADMIN'})
    setNewExp({category:'',item:'',amount:''}); setShowExpForm(false); load()
  }

  const months = Array.from({length:6},(_,i)=>format(subMonths(new Date(),i),'yyyy-MM'))
  const totalExp = expenses.reduce((s,e)=>s+(e.amount||0),0)

  if (loading) return <div className="page-container">{[1,2,3].map(i=><div key={i} className="loading-shimmer" style={{height:80,marginBottom:10}}/>)}</div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">薪資財務</div>
      <div style={{display:'flex',gap:8,marginBottom:16,overflowX:'auto',paddingBottom:4}}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{padding:'6px 12px',borderRadius:20,fontSize:12,fontWeight:500,whiteSpace:'nowrap',cursor:'pointer',background:m===month?'var(--gold-glow)':'transparent',color:m===month?'var(--gold)':'var(--text-dim)',border:m===month?'1px solid var(--border-gold)':'1px solid var(--border)'}}>{parseInt(m.slice(5))}月</button>)}
      </div>
      <div style={{display:'flex',gap:8,marginBottom:20}}>
        {[{id:'payroll',l:'薪資明細'},{id:'expenses',l:'支出管理'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{padding:'8px 16px',borderRadius:20,fontSize:13,fontWeight:500,cursor:'pointer',background:tab===t.id?'var(--gold-glow)':'transparent',color:tab===t.id?'var(--gold)':'var(--text-dim)',border:tab===t.id?'1px solid var(--border-gold)':'1px solid var(--border)'}}>{t.l}</button>
        ))}
      </div>
      {tab==='payroll' && (<div>
        <div className="grid-2" style={{marginBottom:16}}>
          <div className="card" style={{padding:14,textAlign:'center'}}><div style={{fontSize:11,color:'var(--text-dim)',marginBottom:4}}>員工實領</div><div style={{fontSize:20,fontFamily:'var(--font-mono)',color:'var(--gold)',fontWeight:600}}>${emps.reduce((s,e)=>s+calcPay(e).net,0).toLocaleString()}</div></div>
          <div className="card" style={{padding:14,textAlign:'center'}}><div style={{fontSize:11,color:'var(--text-dim)',marginBottom:4}}>雇主成本</div><div style={{fontSize:20,fontFamily:'var(--font-mono)',color:'var(--red)',fontWeight:600}}>${emps.reduce((s,e)=>s+calcPay(e).erCost,0).toLocaleString()}</div></div>
        </div>
        {emps.map(emp => {
          const p = calcPay(emp), ex = expanded===emp.id
          return <div key={emp.id} className="card" style={{marginBottom:8,padding:0,overflow:'hidden'}}>
            <div style={{padding:14,display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'}} onClick={() => setExpanded(ex?null:emp.id)}>
              <div><div style={{fontSize:14,fontWeight:600}}>{emp.name}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{emp.id} · {emp.title}</div></div>
              <div style={{textAlign:'right',display:'flex',alignItems:'center',gap:8}}>
                <div><div style={{fontSize:16,fontFamily:'var(--font-mono)',fontWeight:600,color:'var(--gold)'}}>${p.net.toLocaleString()}</div><div style={{fontSize:10,color:'var(--text-muted)'}}>實領</div></div>
                {ex?<ChevronUp size={16} color="var(--text-muted)"/>:<ChevronDown size={16} color="var(--text-muted)"/>}
              </div>
            </div>
            {ex && <div style={{padding:'0 14px 14px',borderTop:'1px solid var(--border)'}}>
              <div style={{paddingTop:12}}>
                <R label="底薪" value={p.base}/>{p.empBon>0&&<R label="加給" value={p.empBon} positive/>}
                <div style={{height:1,background:'var(--border)',margin:'8px 0'}}/>
                <R label="投保薪資(勞保)" value={p.lb} dim/><R label="勞保(自付)" value={-p.li} negative/><R label="健保(自付)" value={-p.hi} negative/>
                <div style={{height:1,background:'var(--border)',margin:'8px 0'}}/>
                <R label="實發" value={p.net} highlight/>
                <div style={{height:1,background:'var(--border)',margin:'8px 0'}}/>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>雇主負擔</div>
                <R label="勞保(雇主)" value={p.liER} dim/><R label="健保(雇主)" value={p.hiER} dim/><R label="勞退6%" value={p.lp} dim/><R label="雇主總成本" value={p.erCost} highlight/>
              </div>
            </div>}
          </div>
        })}
      </div>)}
      {tab==='expenses' && (<div>
        <div className="card" style={{padding:14,marginBottom:16}}><div style={{fontSize:11,color:'var(--text-dim)',marginBottom:4}}>本月支出</div><div style={{fontSize:22,fontFamily:'var(--font-mono)',color:'var(--red)',fontWeight:600}}>${totalExp.toLocaleString()}</div></div>
        <button className="btn-outline" style={{marginBottom:16,display:'flex',alignItems:'center',gap:6}} onClick={() => setShowExpForm(!showExpForm)}><Plus size={14}/> 新增支出</button>
        {showExpForm && <div className="card" style={{marginBottom:16,padding:16}}>
          <select value={newExp.category} onChange={e=>setNewExp(p=>({...p,category:e.target.value}))} style={{marginBottom:10}}><option value="">選擇分類</option>{['食材','酒水','雪茄進貨','設備','房租','水電','人事','行銷','雜支'].map(c=><option key={c}>{c}</option>)}</select>
          <input placeholder="說明" value={newExp.item} onChange={e=>setNewExp(p=>({...p,item:e.target.value}))} style={{marginBottom:10}}/>
          <input type="number" placeholder="金額" value={newExp.amount} onChange={e=>setNewExp(p=>({...p,amount:e.target.value}))} style={{marginBottom:10}} inputMode="numeric"/>
          <button className="btn-gold" onClick={addExpense}>儲存</button>
        </div>}
        {expenses.length===0?<div className="card" style={{textAlign:'center',padding:40,color:'var(--text-dim)'}}>無支出</div>:
          expenses.map(e=><div key={e.id} className="card" style={{padding:12,marginBottom:6,display:'flex',justifyContent:'space-between'}}><div><div style={{fontSize:13,fontWeight:500}}>{e.item||e.category}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{e.date} · {e.category}</div></div><div style={{fontSize:15,fontFamily:'var(--font-mono)',color:'var(--red)',fontWeight:600}}>-${(e.amount||0).toLocaleString()}</div></div>)
        }
      </div>)}
    </div>
  )
}
function R({label,value,positive,negative,highlight,dim}) {
  const c = highlight?'var(--gold)':positive?'var(--green)':negative?'var(--red)':dim?'var(--text-muted)':'var(--text)'
  return <div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',fontSize:13}}><span style={{color:dim?'var(--text-muted)':'var(--text-dim)'}}>{label}</span><span style={{fontFamily:'var(--font-mono)',fontWeight:highlight?600:400,color:c}}>{typeof value==='number'?(value<0?`-$${Math.abs(value).toLocaleString()}`:`$${value.toLocaleString()}`):value}</span></div>
}
