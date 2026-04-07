import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Star } from 'lucide-react'
import { format, subMonths } from 'date-fns'

export default function StaffKPI() {
  const { user } = useAuth()
  const [month, setMonth] = useState(format(new Date(),'yyyy-MM'))
  const [stats, setStats] = useState(null)
  const [kpi, setKpi] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [month])
  async function load() {
    setLoading(true)
    const start = month+'-01', end = month+'-31'
    const [taskRes, kpiRes] = await Promise.all([
      supabase.from('task_status').select('completed').eq('owner', user.employee_id).gte('date',start).lte('date',end),
      supabase.from('kpi_evaluations').select('*').eq('employee_id', user.employee_id).eq('month', month).maybeSingle(),
    ])
    const tasks = taskRes.data || []
    const done = tasks.filter(t => t.completed).length
    setStats({ total: tasks.length, done, rate: tasks.length ? Math.round(done/tasks.length*100) : 0 })
    setKpi(kpiRes.data)
    setLoading(false)
  }

  const months = Array.from({length:6},(_,i) => format(subMonths(new Date(),i),'yyyy-MM'))

  return (
    <div className="page-container fade-in">
      <div className="section-title">我的 KPI</div>
      <div style={{display:'flex',gap:8,marginBottom:20,overflowX:'auto',paddingBottom:4}}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{padding:'8px 14px',borderRadius:20,fontSize:12,fontWeight:500,whiteSpace:'nowrap',background:m===month?'var(--gold-glow)':'transparent',color:m===month?'var(--gold)':'var(--text-dim)',border:m===month?'1px solid var(--border-gold)':'1px solid var(--border)',cursor:'pointer'}}>{parseInt(m.slice(5))}月</button>)}
      </div>
      {loading ? <div className="loading-shimmer" style={{height:200}}/> : (<>
        <div className="card" style={{marginBottom:20,textAlign:'center',borderColor:'var(--border-gold)'}}>
          <Star size={20} color="var(--gold)" style={{marginBottom:8}}/>
          <div style={{fontSize:48,fontFamily:'var(--font-mono)',color:'var(--gold)',fontWeight:600,lineHeight:1}}>{stats?.rate || 0}%</div>
          <div style={{fontSize:13,color:'var(--text-dim)',marginTop:6}}>SOP 達成率（{stats?.done}/{stats?.total} 完成）</div>
        </div>
        {kpi && (
          <div className="card">
            <div style={{fontSize:14,fontWeight:600,marginBottom:8}}>老闆評級</div>
            <div style={{fontSize:32,fontFamily:'var(--font-mono)',color:'var(--gold)',fontWeight:700}}>{kpi.boss_grade || '-'}</div>
            {kpi.boss_comment && <div style={{fontSize:13,color:'var(--text-dim)',marginTop:8}}>{kpi.boss_comment}</div>}
          </div>
        )}
      </>)}
    </div>
  )
}
