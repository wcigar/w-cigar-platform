import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { BarChart3, TrendingUp, Award, Star } from 'lucide-react'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

export default function StaffKPI() {
  const { user } = useAuth()
  const [evaluations, setEvaluations] = useState([])
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadKPI() }, [month])

  async function loadKPI() {
    setLoading(true)
    const start = `${month}-01`
    const end = format(endOfMonth(new Date(start)), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('kpi_evaluations')
      .select('*')
      .eq('employee_id', user.employee_id)
      .gte('evaluation_date', start)
      .lte('evaluation_date', end)
      .order('evaluation_date', { ascending: false })
    setEvaluations(data || [])
    setLoading(false)
  }

  const avgScore = evaluations.length
    ? (evaluations.reduce((s, e) => s + (e.score || 0), 0) / evaluations.length).toFixed(1)
    : '—'

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), i)
    return format(d, 'yyyy-MM')
  })

  return (
    <div className="page-container fade-in">
      <div className="section-title">我的 KPI</div>

      {/* Month selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {months.map(m => (
          <button
            key={m}
            onClick={() => setMonth(m)}
            style={{
              padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
              background: m === month ? 'var(--gold-glow)' : 'transparent',
              color: m === month ? 'var(--gold)' : 'var(--text-dim)',
              border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            {m.slice(0, 4)}年{parseInt(m.slice(5))}月
          </button>
        ))}
      </div>

      {/* Score summary */}
      <div className="card" style={{ marginBottom: 20, textAlign: 'center', borderColor: 'var(--border-gold)' }}>
        <Star size={20} color="var(--gold)" style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 48, fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontWeight: 600, lineHeight: 1 }}>
          {avgScore}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>
          本月平均分數（{evaluations.length} 筆評核）
        </div>
      </div>

      {/* Evaluation list */}
      {loading ? (
        [1,2,3].map(i => <div key={i} className="loading-shimmer" style={{height:60,marginBottom:8}}/>)
      ) : evaluations.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          本月尚無評核記錄
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {evaluations.map(ev => (
            <div key={ev.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{ev.category || '綜合評核'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{ev.evaluation_date}</div>
                </div>
                <div style={{
                  fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 600,
                  color: ev.score >= 90 ? 'var(--green)' : ev.score >= 70 ? 'var(--gold)' : 'var(--red)',
                }}>
                  {ev.score}
                </div>
              </div>
              {ev.comment && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  {ev.comment}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
