import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Star, TrendingUp, Trophy, Target } from 'lucide-react'
import { format, subMonths } from 'date-fns'

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
    const s = month + '-01', e = month + '-31'
    const [tR, gR, kR] = await Promise.all([
      supabase.from('task_status').select('completed').eq('owner', user.employee_id).gte('date', s).lte('date', e),
      supabase.from('task_status').select('completed_by').eq('owner', 'ALL').eq('completed', true).gte('date', s).lte('date', e),
      supabase.from('kpi_evaluations').select('*').eq('employee_id', user.employee_id).eq('month', month).maybeSingle(),
    ])
    const tasks = tR.data || [], done = tasks.filter(t => t.completed).length
    const grabs = (gR.data || []).filter(r => r.completed_by === user.name).length
    setStats({ total: tasks.length, done, rate: tasks.length ? Math.round(done / tasks.length * 100) : 0, grabs })
    setKpi(kR.data)

    // Load trends
    const trendData = []
    for (let i = 0; i < 3; i++) {
      const m = format(subMonths(new Date(), i), 'yyyy-MM')
      const ms = m + '-01', me = m + '-31'
      const [tr, gr] = await Promise.all([
        supabase.from('task_status').select('completed').eq('owner', user.employee_id).gte('date', ms).lte('date', me),
        supabase.from('task_status').select('completed_by').eq('owner', 'ALL').eq('completed', true).gte('date', ms).lte('date', me),
      ])
      const tt = tr.data || [], td = tt.filter(t => t.completed).length
      trendData.push({ month: m, rate: tt.length ? Math.round(td / tt.length * 100) : 0, grabs: (gr.data || []).filter(r => r.completed_by === user.name).length })
    }
    setTrends(trendData)
    setLoading(false)
  }

  if (loading) return <div className="page-container"><div className="loading-shimmer" style={{ height: 200 }} /></div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">我的 KPI</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', background: m === month ? 'var(--gold-glow)' : 'transparent', color: m === month ? 'var(--gold)' : 'var(--text-dim)', border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)', cursor: 'pointer' }}>{parseInt(m.slice(5))}月</button>)}
      </div>

      {/* Main score */}
      <div className="card" style={{ marginBottom: 16, textAlign: 'center', borderColor: 'var(--border-gold)' }}>
        <Star size={20} color="var(--gold)" style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 52, fontFamily: 'var(--font-mono)', color: stats?.rate >= 85 ? 'var(--green)' : stats?.rate >= 70 ? 'var(--gold)' : 'var(--red)', fontWeight: 700, lineHeight: 1 }}>{stats?.rate || 0}%</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>SOP 達成率（{stats?.done}/{stats?.total}）</div>
      </div>

      {/* Stats grid */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Trophy size={14} color="var(--gold)" /><span style={{ fontSize: 10, color: 'var(--text-dim)' }}>搶單數</span></div>
          <div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)', marginTop: 4 }}>{stats?.grabs || 0}</div>
        </div>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Target size={14} color="var(--green)" /><span style={{ fontSize: 10, color: 'var(--text-dim)' }}>完成數</span></div>
          <div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--green)', marginTop: 4 }}>{stats?.done || 0}</div>
        </div>
      </div>

      {/* Boss evaluation */}
      {kpi && (
        <div className="card" style={{ marginBottom: 16, borderColor: kpi.lock_status === '已鎖定' ? 'rgba(77,168,108,.3)' : undefined }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>老闆評級</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 36, fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontWeight: 700 }}>{kpi.boss_grade || '-'}</div>
            <div style={{ flex: 1 }}>
              {kpi.boss_comment && <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{kpi.boss_comment}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>系統建議: {kpi.suggested_grade || '-'} · {kpi.lock_status}</div>
            </div>
          </div>
        </div>
      )}

      {/* Trends */}
      {trends.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}><TrendingUp size={16} color="var(--gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>近期趨勢</span></div>
          {trends.map(t => (
            <div key={t.month} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>{t.month.slice(0, 4)}年{parseInt(t.month.slice(5))}月</span>
              <span>
                <strong style={{ color: t.rate >= 85 ? 'var(--green)' : t.rate >= 70 ? 'var(--gold)' : 'var(--red)' }}>{t.rate}%</strong>
                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>搶{t.grabs}單</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
