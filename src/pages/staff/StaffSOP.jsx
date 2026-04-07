import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { CheckCircle2, Circle, Clock, Camera } from 'lucide-react'
import { format } from 'date-fns'

export default function StaffSOP() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { loadTasks() }, [])

  async function loadTasks() {
    setLoading(true)
    // Load tasks assigned to this user OR to ALL (grab tasks)
    const { data } = await supabase.from('task_status').select('*')
      .eq('date', today).or(`owner.eq.${user.employee_id},owner.eq.ALL`).order('task_id')
    setTasks(data || [])
    setLoading(false)
  }

  async function toggleTask(task) {
    if (task.completed && task.completed_by !== user.name) return // Can't un-complete others' tasks
    const update = task.completed
      ? { completed: false, completed_at: null, completed_by: '', completed_by_id: '' }
      : { completed: true, completed_at: new Date().toISOString(), completed_by: user.name, completed_by_id: user.employee_id }
    await supabase.from('task_status').update(update).eq('id', task.id)
    loadTasks()
  }

  const myTasks = tasks.filter(t => t.owner === user.employee_id)
  const grabTasks = tasks.filter(t => t.owner === 'ALL')
  const myDone = myTasks.filter(t => t.completed).length
  const pct = myTasks.length ? Math.round((myDone / myTasks.length) * 100) : 0

  if (loading) return <div className="page-container">{[1,2,3,4].map(i => <div key={i} className="loading-shimmer" style={{height:60,marginBottom:10}}/>)}</div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">每日 SOP 任務</div>

      <div className="card" style={{marginBottom:20,textAlign:'center'}}>
        <div style={{fontSize:48,fontFamily:'var(--font-mono)',color:pct===100?'var(--green)':'var(--gold)',fontWeight:600,lineHeight:1}}>{pct}%</div>
        <div style={{fontSize:13,color:'var(--text-dim)',marginTop:6}}>{myDone} / {myTasks.length} 完成</div>
        <div style={{height:4,background:'var(--black)',borderRadius:2,marginTop:12,overflow:'hidden'}}>
          <div style={{height:'100%',width:pct+'%',background:pct===100?'var(--green)':'linear-gradient(90deg,var(--gold-dim),var(--gold))',borderRadius:2,transition:'width .4s'}}/>
        </div>
      </div>

      {myTasks.length === 0 && grabTasks.length === 0 ? (
        <div className="card" style={{textAlign:'center',padding:40,color:'var(--text-dim)'}}>今日尚無 SOP 任務</div>
      ) : (<>
        {/* Group by category */}
        {Object.entries(myTasks.reduce((acc, t) => { (acc[t.category||'其他'] = acc[t.category||'其他'] || []).push(t); return acc }, {})).map(([cat, items]) => (
          <div key={cat}>
            <div style={{fontSize:12,color:'var(--text-dim)',fontWeight:600,padding:'8px 0',borderBottom:'1px solid var(--border)'}}>{cat}</div>
            {items.map(t => <TaskCard key={t.id} task={t} onToggle={toggleTask} userName={user.name}/>)}
          </div>
        ))}

        {grabTasks.length > 0 && (
          <>
            <div style={{fontSize:14,fontWeight:700,color:'var(--green)',marginTop:18,marginBottom:8}}>搶單任務 ({grabTasks.filter(t=>t.completed).length}/{grabTasks.length})</div>
            {grabTasks.map(t => <TaskCard key={t.id} task={t} onToggle={toggleTask} userName={user.name} isGrab/>)}
          </>
        )}
      </>)}
    </div>
  )
}

function TaskCard({ task: t, onToggle, userName, isGrab }) {
  const grabbedByOther = isGrab && t.completed && t.completed_by !== userName
  return (
    <div className="card" style={{padding:14,marginBottom:6,cursor:grabbedByOther?'default':'pointer',display:'flex',alignItems:'center',gap:12,opacity:t.completed?.7:1}}
      onClick={() => !grabbedByOther && onToggle(t)}>
      {t.completed ? <CheckCircle2 size={22} color="var(--green)" style={{flexShrink:0}}/> : <Circle size={22} color="var(--text-muted)" style={{flexShrink:0}}/>}
      <div style={{flex:1}}>
        <div style={{fontSize:14,fontWeight:500,color:t.completed?'var(--text-dim)':'var(--text)',textDecoration:t.completed?'line-through':'none'}}>{t.title}</div>
        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,display:'flex',gap:6,flexWrap:'wrap'}}>
          {isGrab && <span style={{color:'var(--green)'}}>搶單</span>}
          {t.completed_at && <span><Clock size={10}/> {format(new Date(t.completed_at),'HH:mm')} {t.completed_by}</span>}
          {grabbedByOther && <span style={{color:'var(--red)'}}>已被 {t.completed_by} 搶走</span>}
        </div>
      </div>
    </div>
  )
}
