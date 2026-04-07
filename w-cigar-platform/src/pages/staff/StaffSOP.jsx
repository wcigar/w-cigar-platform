import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { CheckCircle2, Circle, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'

export default function StaffSOP() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { loadTasks() }, [])

  async function loadTasks() {
    setLoading(true)
    const { data } = await supabase
      .from('task_status')
      .select('*')
      .eq('employee_id', user.employee_id)
      .eq('date', today)
      .order('task_order')
    setTasks(data || [])
    setLoading(false)
  }

  async function toggleTask(task) {
    const newStatus = task.status === 'done' ? 'pending' : 'done'
    const update = { status: newStatus }
    if (newStatus === 'done') update.completed_at = new Date().toISOString()
    else update.completed_at = null

    await supabase.from('task_status').update(update).eq('id', task.id)
    loadTasks()
  }

  const done = tasks.filter(t => t.status === 'done').length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0

  if (loading) return <div className="page-container">{[1,2,3,4].map(i => <div key={i} className="loading-shimmer" style={{height:60,marginBottom:10}}/>)}</div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">每日 SOP 任務</div>

      {/* Summary */}
      <div className="card" style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 48, fontFamily: 'var(--font-mono)', color: pct === 100 ? 'var(--green)' : 'var(--gold)', fontWeight: 600, lineHeight: 1 }}>
          {pct}%
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>{done} / {tasks.length} 完成</div>
        <div style={{ height: 4, background: 'var(--black)', borderRadius: 2, marginTop: 12, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--green)' : 'linear-gradient(90deg, var(--gold-dim), var(--gold))', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          今日尚無 SOP 任務
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map((task, i) => (
            <div
              key={task.id}
              className="card"
              style={{ padding: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
              onClick={() => toggleTask(task)}
            >
              {task.status === 'done'
                ? <CheckCircle2 size={22} color="var(--green)" style={{ flexShrink: 0 }} />
                : <Circle size={22} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              }
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 14, fontWeight: 500,
                  color: task.status === 'done' ? 'var(--text-dim)' : 'var(--text)',
                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                }}>
                  {task.task_name}
                </div>
                {task.completed_at && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={10} /> {format(new Date(task.completed_at), 'HH:mm')} 完成
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
