import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, DollarSign, Settings, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function BossHome() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({emps:0,working:0,sop:0})
  const [scheds, setScheds] = useState([])
  const [loading, setLoading] = useState(true)
  const today = format(new Date(),'yyyy-MM-dd')

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [eR,sR,tR] = await Promise.all([
      supabase.from('employees').select('id',{count:'exact'}).eq('enabled',true),
      supabase.from('schedules').select('*, employees(name)').eq('date',today),
      supabase.from('task_status').select('completed').eq('date',today),
    ])
    const tasks = tR.data||[], sc = sR.data||[]
    setStats({emps:eR.count||0, working:sc.filter(s=>s.shift!=='休假').length, sop:tasks.length?Math.round(tasks.filter(t=>t.completed).length/tasks.length*100):0})
    setScheds(sc); setLoading(false)
  }

  const cards = [
    {icon:Briefcase,label:'營運管理',sub:`SOP ${stats.sop}% 完成`,path:'/operations',color:'var(--gold)'},
    {icon:Users,label:'人事排班',sub:`今日 ${stats.working} 人上班`,path:'/hr',color:'#4da86c'},
    {icon:DollarSign,label:'薪資財務',sub:'薪資 · 支出 · 勞健保',path:'/payroll',color:'#4d8ac4'},
    {icon:Settings,label:'系統設定',sub:'員工 · SOP定義 · 公告',path:'/settings',color:'#c44d4d'},
  ]

  if (loading) return <div className="page-container">{[1,2,3,4].map(i=><div key={i} className="loading-shimmer" style={{height:90,marginBottom:12}}/>)}</div>

  return (
    <div className="page-container fade-in">
      <div style={{marginBottom:24}}>
        <h2 style={{fontFamily:'var(--font-display)',fontSize:28,color:'var(--gold)',fontWeight:600}}>管理總覽</h2>
        <p style={{color:'var(--text-dim)',fontSize:13,marginTop:4}}>{format(new Date(),'yyyy年M月d日 EEEE',{locale:zhTW})}</p>
      </div>
      <div className="grid-2" style={{marginBottom:20}}>
        <SB icon={<Users size={16}/>} label="在職" value={stats.emps} color="var(--gold)"/>
        <SB icon={<Clock size={16}/>} label="今日出勤" value={stats.working} color="var(--green)"/>
        <SB icon={<CheckCircle2 size={16}/>} label="SOP完成率" value={stats.sop+'%'} color="var(--blue)"/>
        <SB icon={<AlertTriangle size={16}/>} label="排班人數" value={scheds.length} color="var(--red)"/>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:24}}>
        {cards.map(c => (
          <div key={c.path} className="card" style={{padding:16,cursor:'pointer',display:'flex',alignItems:'center',gap:14}} onClick={() => navigate(c.path)}>
            <div style={{width:44,height:44,borderRadius:12,background:c.color+'15',display:'flex',alignItems:'center',justifyContent:'center'}}><c.icon size={22} color={c.color}/></div>
            <div style={{flex:1}}><div style={{fontSize:15,fontWeight:600}}>{c.label}</div><div style={{fontSize:12,color:'var(--text-dim)',marginTop:2}}>{c.sub}</div></div>
            <div style={{color:'var(--text-muted)',fontSize:18}}>›</div>
          </div>
        ))}
      </div>
      <div className="section-title">今日排班</div>
      {scheds.map(s => <div key={s.id} className="card" style={{padding:12,marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:14,fontWeight:500}}>{s.employees?.name||s.employee_id}</span><span className={`badge ${s.shift==='休假'?'badge-blue':'badge-gold'}`}>{s.shift}</span></div>)}
      {scheds.length===0 && <div style={{fontSize:13,color:'var(--text-dim)',textAlign:'center',padding:16}}>今日無排班</div>}
    </div>
  )
}
function SB({icon,label,value,color}) {
  return <div className="card" style={{padding:14,textAlign:'center'}}><div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginBottom:6}}><span style={{color}}>{icon}</span><span style={{fontSize:11,color:'var(--text-dim)'}}>{label}</span></div><div style={{fontSize:24,fontFamily:'var(--font-mono)',fontWeight:600,color}}>{value}</div></div>
}
