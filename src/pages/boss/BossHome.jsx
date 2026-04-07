import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, DollarSign, Settings, Clock, CheckCircle2, AlertTriangle, Trophy } from 'lucide-react'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function BossHome() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ emps: 0, working: 0, sop: 0, abnPending: 0 })
  const [scheds, setScheds] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = format(new Date(), 'yyyy-MM')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [eR, sR, tR, aR, lbR] = await Promise.all([
      supabase.from('employees').select('id', { count: 'exact' }).eq('enabled', true),
      supabase.from('schedules').select('*, employees(name)').eq('date', today),
      supabase.from('task_status').select('completed').eq('date', today),
      supabase.from('abnormal_reports').select('id', { count: 'exact' }).eq('status', '待處理'),
      supabase.from('task_status').select('completed_by').eq('owner', 'ALL').eq('completed', true).gte('date', month + '-01').lte('date', month + '-31'),
    ])
    const tasks = tR.data || [], sc = sR.data || []
    setStats({
      emps: eR.count || 0,
      working: sc.filter(s => s.shift !== '休假' && s.shift !== '臨時請假').length,
      sop: tasks.length ? Math.round(tasks.filter(t => t.completed).length / tasks.length * 100) : 0,
      abnPending: aR.count || 0
    })
    setScheds(sc)
    const counts = {}
    ;(lbR.data || []).forEach(r => { if (r.completed_by) counts[r.completed_by] = (counts[r.completed_by] || 0) + 1 })
    setLeaderboard(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
    setLoading(false)
  }

  const cards = [
    { icon: Briefcase, label: '營運管理', sub: `SOP ${stats.sop}%・異常 ${stats.abnPending}`, path: '/operations', color: 'var(--gold)' },
    { icon: Users, label: '人事排班', sub: `今日 ${stats.working} 人上班`, path: '/hr', color: '#4da86c' },
    { icon: DollarSign, label: '薪資財務', sub: '薪資・支出・勞健保', path: '/payroll', color: '#4d8ac4' },
    { icon: Settings, label: '系統設定', sub: '員工・SOP定義・KPI考核', path: '/settings', color: '#c44d4d' },
  ]

  if (loading) return <div className="page-container">{[1, 2, 3, 4].map(i => <div key={i} className="loading-shimmer" style={{ height: 90, marginBottom: 12 }} />)}</div>

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', fontWeight: 600 }}>老闆戰情室</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhTW })}</p>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        <SB label="在職" value={stats.emps} color="var(--gold)" />
        <SB label="出勤" value={stats.working} color="var(--green)" />
        <SB label="SOP" value={stats.sop + '%'} color="var(--blue)" />
        <SB label="異常" value={stats.abnPending} color={stats.abnPending > 0 ? 'var(--red)' : 'var(--text-muted)'} />
      </div>

      {/* 4 category cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {cards.map(c => (
          <div key={c.path} className="card" style={{ padding: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }} onClick={() => navigate(c.path)}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: c.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><c.icon size={22} color={c.color} /></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{c.label}</div><div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{c.sub}</div></div>
            <div style={{ color: 'var(--text-muted)', fontSize: 18 }}>›</div>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Trophy size={16} color="var(--gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>{month.slice(5)}月搶單排行</span></div>
          {leaderboard.slice(0, 5).map((x, i) => (
            <div key={x.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
              <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {x.name}</span>
              <strong style={{ color: 'var(--gold)' }}>{x.count} 單</strong>
            </div>
          ))}
        </div>
      )}

      {/* Today schedule */}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', marginBottom: 8 }}>今日排班</div>
      {scheds.map(s => (
        <div key={s.id} className="card" style={{ padding: 12, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{s.employees?.name || s.employee_id}</span>
          <span className={`badge ${s.shift === '休假' || s.shift === '臨時請假' ? 'badge-blue' : 'badge-gold'}`}>{s.shift}</span>
        </div>
      ))}
      {scheds.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: 16 }}>今日無排班</div>}
    </div>
  )
}

function SB({ label, value, color }) {
  return <div className="card" style={{ padding: 10, textAlign: 'center' }}>
    <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{label}</div>
    <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 600, color, marginTop: 2 }}>{value}</div>
  </div>
}
