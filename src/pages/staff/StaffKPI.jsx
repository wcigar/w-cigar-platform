import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Star, TrendingUp, Trophy, Target } from 'lucide-react'
import { format, subMonths, endOfMonth } from 'date-fns'

export default function StaffKPI() {
  const { user } = useAuth()
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [stats, setStats] = useState(null)
  const [kpi, setKpi] = useState(null)
  const [trends, setTrends] = useState([])
  const [loading, setLoading] = useState(true)
  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    // 修復 #9: 用 Promise.all 一次查 3 個月
    const m3 = [0, 1, 2].map(i => format(subMonths(new Date(), i), 'yyyy-MM'))
    const queries = m3.flatMap(m => [
      supabase.from('task_status').select('completed').eq('owner', user.employee_id).gte('date', m + '-01').lte('date', format(endOfMonth(new Date(m + '-01')), 'yyyy-MM-dd')),
      supabase.from('task_status').select('completed_by').eq('owner', 'ALL').eq('completed', true).gte('date', m + '-01').lte('date', format(endOfMonth(new Date(m + '-01')), 'yyyy-MM-dd')),
    ])
    const [kR, ...results] = await Promise.all([
      supabase.from('kpi_evaluations').select('*').eq('employee_id', user.employee_id).eq('month', month).maybeSingle(),
      ...queries
    ])
    setKpi(kR.data)

    const trendData = m3.map((m, i) => {
      const tasks = results[i * 2].data || [], grabs = results[i * 2 + 1].data || []
      const done = tasks.filter(t => t.completed).length
      return { month: m, rate: tasks.length ? Math.round(done / tasks.length * 100) : 0, grabs: grabs.filter(r => r.completed_by === user.name).length, done, total: tasks.length }
    })
    setTrends(trendData)
    const cur = trendData.find(t => t.month === month) || trendData[0]
    if (cur) setStats({ total: cur.total, done: cur.done, rate: cur.rate, grabs: cur.grabs })
    setLoading(false)
  }

  if (loading) return <div className="page-container"><div className="loading-shimmer" style={{ height: 200 }} /></div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">我的 KPI</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', background: m === month ? 'var(--gold-glow)' : 'transparent', color: m === month ? 'var(--gold)' : 'var(--text-dim)', border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)', cursor: 'pointer' }}>{parseInt(m.slice(5))}月</button>)}
      </div>
      <div className="card" style={{ marginBottom: 16, textAlign: 'center', borderColor: 'var(--border-gold)' }}>
        <Star size={20} color="var(--gold)" style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 52, fontFamily: 'var(--font-mono)', color: (stats?.rate || 0) >= 85 ? 'var(--green)' : (stats?.rate || 0) >= 70 ? 'var(--gold)' : 'var(--red)', fontWeight: 700, lineHeight: 1 }}>{stats?.rate || 0}%</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>SOP 達成率（{stats?.done || 0}/{stats?.total || 0}）</div>
      </div>
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Trophy size={14} color="var(--gold)" /><span style={{ fontSize: 10, color: 'var(--text-dim)' }}>搶單</span></div><div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)', marginTop: 4 }}>{stats?.grabs || 0}</div></div>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Target size={14} color="var(--green)" /><span style={{ fontSize: 10, color: 'var(--text-dim)' }}>完成</span></div><div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--green)', marginTop: 4 }}>{stats?.done || 0}</div></div>
      </div>
      {kpi && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>老闆評級</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 36, fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontWeight: 700 }}>{kpi.boss_grade || '-'}</div>
            <div>{kpi.boss_comment && <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{kpi.boss_comment}</div>}<div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>系統建議: {kpi.suggested_grade || '-'} · {kpi.lock_status}</div></div>
          </div>
        </div>
      )}
      {trends.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}><TrendingUp size={16} color="var(--gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>近期趨勢</span></div>
          {trends.map(t => (
            <div key={t.month} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>{parseInt(t.month.slice(5))}月</span>
              <span><strong style={{ color: t.rate >= 85 ? 'var(--green)' : t.rate >= 70 ? 'var(--gold)' : 'var(--red)' }}>{t.rate}%</strong><span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>搶{t.grabs}單</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
