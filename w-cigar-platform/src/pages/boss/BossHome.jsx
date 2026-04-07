import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, DollarSign, Settings, Clock, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function BossHome() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ employees: 0, todayWorking: 0, pendingLeaves: 0, sopCompletion: 0 })
  const [todaySchedules, setTodaySchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setLoading(true)
    try {
      const [empRes, schedRes, leaveRes, taskRes] = await Promise.all([
        supabase.from('employees').select('id', { count: 'exact' }).eq('is_active', true),
        supabase.from('schedules').select('*, employees(name)').eq('date', today),
        supabase.from('leave_requests').select('id', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('task_status').select('status').eq('date', today),
      ])

      const tasks = taskRes.data || []
      const doneTasks = tasks.filter(t => t.status === 'done').length
      const schedules = schedRes.data || []
      const working = schedules.filter(s => s.shift_type !== '休假')

      setStats({
        employees: empRes.count || 0,
        todayWorking: working.length,
        pendingLeaves: leaveRes.count || 0,
        sopCompletion: tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0,
      })
      setTodaySchedules(schedules)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const cards = [
    { icon: Briefcase, label: '營運管理', sub: `SOP ${stats.sopCompletion}% 完成`, path: '/operations', color: 'var(--gold)' },
    { icon: Users, label: '人事排班', sub: `今日 ${stats.todayWorking} 人上班`, path: '/hr', color: '#4da86c' },
    { icon: DollarSign, label: '薪資財務', sub: '薪資 · 支出 · 勞健保', path: '/payroll', color: '#4d8ac4' },
    { icon: Settings, label: '系統設定', sub: '員工 · 參數 · 公告', path: '/settings', color: '#c44d4d' },
  ]

  if (loading) return <div className="page-container">{[1,2,3,4].map(i => <div key={i} className="loading-shimmer" style={{height:90,marginBottom:12}}/>)}</div>

  return (
    <div className="page-container fade-in">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', fontWeight: 600 }}>管理總覽</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>
          {format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhTW })}
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <StatBox icon={<Users size={16}/>} label="在職人數" value={stats.employees} color="var(--gold)" />
        <StatBox icon={<Clock size={16}/>} label="今日出勤" value={stats.todayWorking} color="var(--green)" />
        <StatBox icon={<CheckCircle2 size={16}/>} label="SOP完成率" value={`${stats.sopCompletion}%`} color="var(--blue)" />
        <StatBox icon={<AlertTriangle size={16}/>} label="待審假單" value={stats.pendingLeaves} color="var(--red)" />
      </div>

      {/* 4 category cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {cards.map(c => (
          <div
            key={c.path}
            className="card"
            style={{ padding: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
            onClick={() => navigate(c.path)}
          >
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${c.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <c.icon size={22} color={c.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{c.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{c.sub}</div>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 18 }}>›</div>
          </div>
        ))}
      </div>

      {/* Today's schedule overview */}
      <div className="section-title">今日排班</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {todaySchedules.map(s => (
          <div key={s.id} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{s.employees?.name || s.employee_id}</span>
            <span className={`badge ${s.shift_type === '休假' ? 'badge-blue' : 'badge-gold'}`}>{s.shift_type}</span>
          </div>
        ))}
        {todaySchedules.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: 16, textAlign: 'center' }}>今日無排班資料</div>
        )}
      </div>
    </div>
  )
}

function StatBox({ icon, label, value, color }) {
  return (
    <div className="card" style={{ padding: 14, textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>{value}</div>
    </div>
  )
}
