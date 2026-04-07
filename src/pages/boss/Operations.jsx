import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { CheckCircle2, Circle, Plus } from 'lucide-react'
import { format } from 'date-fns'

export default function BossOperations() {
  const [tab, setTab] = useState('sop')
  const [tasks, setTasks] = useState([])
  const [notices, setNotices] = useState([])
  const [newNotice, setNewNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [taskRes, noticeRes] = await Promise.all([
      supabase.from('task_status').select('*, employees(name)').eq('date', today).order('owner').order('task_id'),
      supabase.from('notices').select('*').order('created_at', { ascending: false }).limit(20),
    ])
    setTasks(taskRes.data || [])
    setNotices(noticeRes.data || [])
    setLoading(false)
  }

  async function publishNotice() {
    if (!newNotice) return
    await supabase.from('notices').insert({ content: newNotice, enabled: true, publisher: 'ADMIN' })
    setNewNotice('')
    setShowForm(false)
    loadData()
  }

  const tasksByEmp = {}
  tasks.forEach(t => {
    const key = t.owner
    if (!tasksByEmp[key]) tasksByEmp[key] = { name: t.employees?.name || key, tasks: [] }
    tasksByEmp[key].tasks.push(t)
  })

  if (loading) return <div className="page-container">{[1,2,3].map(i=><div key={i} className="loading-shimmer" style={{height:80,marginBottom:10}}/>)}</div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">營運管理</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[{id:'sop',label:'SOP 總覽'},{id:'notices',label:'公告管理'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: tab === t.id ? 'var(--gold-glow)' : 'transparent', color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)', border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{t.label}</button>
        ))}
      </div>
      {tab === 'sop' && (
        Object.keys(tasksByEmp).length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>今日無 SOP 任務</div> :
        Object.entries(tasksByEmp).map(([empId, { name, tasks: empTasks }]) => {
          const done = empTasks.filter(t => t.completed).length
          const pct = Math.round((done / empTasks.length) * 100)
          return (
            <div key={empId} className="card" style={{ marginBottom: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
                <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: pct === 100 ? 'var(--green)' : 'var(--gold)' }}>{done}/{empTasks.length} ({pct}%)</span>
              </div>
              <div style={{ height: 4, background: 'var(--black)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct+'%', background: pct === 100 ? 'var(--green)' : 'linear-gradient(90deg, var(--gold-dim), var(--gold))', borderRadius: 2 }} />
              </div>
            </div>
          )
        })
      )}
      {tab === 'notices' && (
        <div>
          <button className="btn-outline" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowForm(!showForm)}><Plus size={14}/> 新增公告</button>
          {showForm && (
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <textarea placeholder="公告內容" rows={3} value={newNotice} onChange={e => setNewNotice(e.target.value)} style={{ marginBottom: 10, resize: 'none' }} />
              <button className="btn-gold" onClick={publishNotice}>發布</button>
            </div>
          )}
          {notices.map(n => (
            <div key={n.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14 }}>{n.content}</span>
                <span className={`badge ${n.enabled ? 'badge-green' : 'badge-red'}`}>{n.enabled ? '啟用' : '停用'}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>{n.created_at?.slice(0, 16)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
