import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Printer, FileText } from 'lucide-react'
import { format, subMonths } from 'date-fns'
import { calcLaborIns, calcHealthIns } from '../../lib/constants'

export default function PayrollExport() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [emps, setEmps] = useState([])
  const [salConfigs, setSalConfigs] = useState([])
  const [scheds, setScheds] = useState([])
  const [loading, setLoading] = useState(true)
  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01', e = month + '-31'
    const [eR, cR, sR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true),
      supabase.from('salary_config').select('*'),
      supabase.from('schedules').select('*').gte('date', s).lte('date', e),
    ])
    setEmps((eR.data || []).filter(emp => !emp.is_admin && emp.id !== 'ADMIN'))
    setSalConfigs(cR.data || [])
    setScheds(sR.data || [])
    setLoading(false)
  }

  function getMetrics(emp) {
    const cfg = salConfigs.find(c => c.employee_id === emp.id)
    const salary = cfg?.monthly_salary || 0
    const empSch = scheds.filter(s => s.employee_id === emp.id)
    const workDays = empSch.filter(s => s.shift === '早班' || s.shift === '晚班' || s.shift_type === '早班' || s.shift_type === '晚班').length
    const restDays = empSch.filter(s => s.shift === '休假' || s.shift_type === '休假').length
    const li = typeof calcLaborIns === 'function' ? calcLaborIns(salary) : 0
    const hi = typeof calcHealthIns === 'function' ? calcHealthIns(salary) : 0
    return { salary, workDays, restDays, laborIns: li, healthIns: hi, netPay: salary - li - hi }
  }

  function printAll() {
    const rows = emps.map(emp => { const m = getMetrics(emp); return '<tr><td>'+emp.name+'</td><td>'+(emp.title||'')+'</td><td>'+(emp.emp_type||'')+'</td><td class="r">$'+m.salary.toLocaleString()+'</td><td class="r">'+m.workDays+'</td><td class="r">'+m.restDays+'</td><td class="r">$'+m.laborIns.toLocaleString()+'</td><td class="r">$'+m.healthIns.toLocaleString()+'</td><td class="r"><b>$'+m.netPay.toLocaleString()+'</b></td></tr>' }).join('')
    const w = window.open('','_blank')
    w.document.write('<html><head><title>薪資總表 '+month+'</title><style>body{font-family:sans-serif;padding:30px;color:#222}h1{font-size:20px;border-bottom:2px solid #c9a84c;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin:16px 0;font-size:12px}th{background:#f5f0e8;padding:8px;text-align:left;border:1px solid #ddd;font-size:11px}td{padding:7px 8px;border:1px solid #ddd}.r{text-align:right;font-family:monospace}@media print{body{padding:15px}}</style></head><body>')
    w.document.write('<h1>W Cigar Bar — '+month.slice(0,4)+'年'+parseInt(month.slice(5))+'月 薪資總表</h1>')
    w.document.write('<p style="color:#999;font-size:11px">產生：'+format(new Date(),'yyyy/MM/dd HH:mm')+'</p>')
    w.document.write('<table><thead><tr><th>姓名</th><th>職稱</th><th>類型</th><th class="r">月薪</th><th class="r">出勤</th><th class="r">休假</th><th class="r">勞保</th><th class="r">健保</th><th class="r">實發</th></tr></thead><tbody>'+rows+'</tbody></table></body></html>')
    w.document.close(); setTimeout(()=>w.print(),500)
  }

  function printSlip(emp) {
    const m = getMetrics(emp)
    const w = window.open('','_blank')
    w.document.write('<html><head><title>薪資條</title><style>body{font-family:sans-serif;padding:30px;color:#222;max-width:420px;margin:0 auto}h2{font-size:18px;border-bottom:2px solid #c9a84c;padding-bottom:6px;margin-bottom:4px}.sub{color:#999;font-size:11px;margin-bottom:16px}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;font-size:14px}.label{color:#666}.val{font-family:monospace;font-weight:600}.ded{color:#c44d4d}.total{font-size:20px;font-weight:700;color:#c9a84c;text-align:right;margin-top:16px;padding-top:12px;border-top:2px solid #c9a84c}@media print{body{padding:15px}}</style></head><body>')
    w.document.write('<h2>W Cigar Bar 薪資條</h2><div class="sub">'+month.slice(0,4)+'年'+parseInt(month.slice(5))+'月 · '+format(new Date(),'yyyy/MM/dd')+'</div>')
    w.document.write('<div class="row"><span class="label">姓名</span><span class="val">'+emp.name+'</span></div>')
    w.document.write('<div class="row"><span class="label">職稱</span><span class="val">'+(emp.title||'')+' · '+(emp.emp_type||'')+'</span></div>')
    w.document.write('<div class="row"><span class="label">底薪</span><span class="val">$'+m.salary.toLocaleString()+'</span></div>')
    w.document.write('<div class="row"><span class="label">出勤</span><span class="val">'+m.workDays+' 天</span></div>')
    w.document.write('<div class="row"><span class="label">休假</span><span class="val">'+m.restDays+' 天</span></div>')
    w.document.write('<div class="row"><span class="label">勞保自付</span><span class="val ded">-$'+m.laborIns.toLocaleString()+'</span></div>')
    w.document.write('<div class="row"><span class="label">健保自付</span><span class="val ded">-$'+m.healthIns.toLocaleString()+'</span></div>')
    w.document.write('<div class="total">實發：$'+m.netPay.toLocaleString()+'</div></body></html>')
    w.document.close(); setTimeout(()=>w.print(),500)
  }

  if (loading) return <div>{[1,2].map(i => <div key={i} className="loading-shimmer" style={{height:60,marginBottom:8}} />)}</div>

  return (
    <div>
      <div style={{display:'flex',gap:6,marginBottom:16,overflowX:'auto'}}>
        {months.map(m => <button key={m} onClick={()=>setMonth(m)} style={{padding:'6px 12px',borderRadius:20,fontSize:12,fontWeight:500,whiteSpace:'nowrap',cursor:'pointer',background:m===month?'var(--gold-glow)':'transparent',color:m===month?'var(--gold)':'var(--text-dim)',border:m===month?'1px solid var(--border-gold)':'1px solid var(--border)'}}>{parseInt(m.slice(5))}月</button>)}
      </div>
      <button className="btn-gold" onClick={printAll} style={{width:'100%',padding:14,fontSize:15,marginBottom:16,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><Printer size={18} /> 列印全員薪資總表</button>
      {emps.map(emp => { const m = getMetrics(emp); return (
        <div key={emp.id} className="card" style={{padding:14,marginBottom:8}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div><div style={{fontSize:16,fontWeight:700}}>{emp.name}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{emp.id} · {emp.title} · {emp.emp_type}</div></div>
            <button className="btn-outline" onClick={()=>printSlip(emp)} style={{padding:'6px 12px',fontSize:11,display:'flex',alignItems:'center',gap:4}}><FileText size={12} /> 薪資條</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
            <div style={{padding:8,background:'var(--black)',borderRadius:8,textAlign:'center'}}><div style={{fontSize:9,color:'var(--text-dim)'}}>月薪</div><div style={{fontSize:15,fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--gold)'}}>{m.salary?'$'+m.salary.toLocaleString():'未設'}</div></div>
            <div style={{padding:8,background:'var(--black)',borderRadius:8,textAlign:'center'}}><div style={{fontSize:9,color:'var(--text-dim)'}}>出勤</div><div style={{fontSize:15,fontFamily:'var(--font-mono)',fontWeight:700}}>{m.workDays}天</div></div>
            <div style={{padding:8,background:'var(--black)',borderRadius:8,textAlign:'center'}}><div style={{fontSize:9,color:'var(--text-dim)'}}>扣除</div><div style={{fontSize:15,fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--red)'}}>${(m.laborIns+m.healthIns).toLocaleString()}</div></div>
            <div style={{padding:8,background:'var(--black)',borderRadius:8,textAlign:'center'}}><div style={{fontSize:9,color:'var(--text-dim)'}}>實發</div><div style={{fontSize:15,fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--green)'}}>{m.netPay?'$'+m.netPay.toLocaleString():'—'}</div></div>
          </div>
        </div>
      )})}
    </div>
  )
}
