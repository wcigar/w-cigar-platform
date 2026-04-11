import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { ClipboardList, CheckCircle2, Circle, AlertCircle, Plus, Search } from 'lucide-react'
import { format } from 'date-fns'

export default function BossOperations() {
  const [tab, setTab] = useState('sop')
  const [employees, setEmployees] = useState([])
  const [tasks, setTasks] = useState([])
  const [notices, setNotices] = useState([])
  const [newNotice, setNewNotice] = useState({ title: '', content: '' })
  const [showNoticeForm, setShowNoticeForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [empRes, taskRes, noticeRes] = await Promise.all([
      supabase.from('employees').select('*').eq('is_active', true).order('name'),
      supabase.from('task_status').select('*, employees(name)').eq('date', today).order('employee_id').order('task_order'),
      supabase.from('notices').select('*').order('created_at', { ascending: false }).limit(20),
    ])
    setEmployees(empRes.data || [])
    setTasks(taskRes.data || [])
    setNotices(noticeRes.data || [])
    setLoading(false)
  }

  async function publishNotice() {
    if (!newNotice.title) return
    await supabase.from('notices').insert({ ...newNotice, is_active: true, created_by: 'ADMIN' })
    setNewNotice({ title: '', content: '' })
    setShowNoticeForm(false)
    loadData()
  }

  // Group tasks by employee
  const tasksByEmp = {}
  tasks.forEach(t => {
    const key = t.employee_id
    if (!tasksByEmp[key]) tasksByEmp[key] = { name: t.employees?.name || key, tasks: [] }
    tasksByEmp[key].tasks.push(t)
  })

  const tabs = [
    { id: 'sop', label: 'SOP 總覽' },
    { id: 'notices', label: '公告管理' },
  ]

  if (loading) return <div className="page-container">{[1,2,3].map(i=><div key={i} className="loading-shimmer" style={{height:80,marginBottom:10}}/>)}</div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">營運管理</div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            background: tab === t.id ? 'var(--gold-glow)' : 'transparent',
            color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)',
            border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'sop' && (
        <div>
          {Object.entries(tasksByEmp).length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>今日無 SOP 任務</div>
          ) : (
            Object.entries(tasksByEmp).map(([empId, { name, tasks: empTasks }]) => {
              const done = empTasks.filter(t => t.status === 'done').length
              const pct = Math.round((done / empTasks.length) * 100)
              return (
                <div key={empId} className="card" style={{ marginBottom: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
                    <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: pct === 100 ? 'var(--green)' : 'var(--gold)' }}>
                      {done}/{empTasks.length} ({pct}%)
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'var(--black)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--green)' : 'linear-gradient(90deg, var(--gold-dim), var(--gold))', borderRadius: 2 }} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {empTasks.map(t => (
                      <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: t.status === 'done' ? 'var(--green)' : 'var(--text-muted)' }}>
                        {t.status === 'done' ? <CheckCircle2 size={10}/> : <Circle size={10}/>}
                        {t.task_name}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {tab === 'notices' && (
        <div>
          <button className="btn-outline" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowNoticeForm(!showNoticeForm)}>
            <Plus size={14} /> 新增公告
          </button>

          {showNoticeForm && (
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <input placeholder="標題" value={newNotice.title} onChange={e => setNewNotice(p => ({ ...p, title: e.target.value }))} style={{ marginBottom: 10 }} />
              <textarea placeholder="內容" rows={3} value={newNotice.content} onChange={e => setNewNotice(p => ({ ...p, content: e.target.value }))} style={{ marginBottom: 10, resize: 'none' }} />
              <button className="btn-gold" onClick={publishNotice}>發布</button>
            </div>
          )}

          {notices.map(n => (
            <div key={n.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{n.title}</span>
                <span className={`badge ${n.is_active ? 'badge-green' : 'badge-red'}`}>{n.is_active ? '啟用' : '停用'}</span>
              </div>
              {n.content && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>{n.content}</div>}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>{n.created_at?.slice(0, 16)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
