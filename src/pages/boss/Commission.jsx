import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { TrendingUp, RefreshCw, ArrowRight } from 'lucide-react'

export default function Commission() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [summary, setSummary] = useState(null)
  const [details, setDetails] = useState([])
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [recalcing, setRecalcing] = useState(false)

  useEffect(() => { loadData() }, [month])

  async function loadData() {
    setLoading(true)
    const [mcR, detR, rulesR] = await Promise.all([
      supabase.from('monthly_commission').select('*').eq('month', month).maybeSingle(),
      supabase.from('staff_monthly_commission').select('*').eq('month', month).order('total_hours', { ascending: false }),
      supabase.from('commission_rate_rules').select('*').eq('enabled', true).order('min_revenue'),
    ])
    setSummary(mcR.data)
    setDetails(detR.data || [])
    setRules(rulesR.data || [])
    setLoading(false)
  }

  async function recalc() {
    setRecalcing(true)
    try {
      const { data, error } = await supabase.rpc('calc_monthly_commission', { p_month: month })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || '計算失敗')
      alert('計算完成！')
      loadData()
    } catch (e) { alert('計算失敗: ' + e.message) }
    finally { setRecalcing(false) }
  }

  async function syncPayroll() {
    setSyncing(true)
    try {
      const { data, error } = await supabase.rpc('sync_commission_to_payroll', { p_month: month })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || '同步失敗')
      alert('已同步到薪資表！')
    } catch (e) { alert('同步失敗: ' + e.message) }
    finally { setSyncing(false) }
  }

  const fmt = n => `$${Number(n || 0).toLocaleString()}`
  const pct = (n, t) => t > 0 ? `${((n / t) * 100).toFixed(1)}%` : '0%'
  const formatWan = n => { const v = Number(n || 0); return v >= 10000 ? Math.round(v / 10000) + '萬' : v.toLocaleString() }
  const months = []
  for (let i = -3; i <= 1; i++) {
    const d = new Date(); d.setMonth(d.getMonth() + i)
    months.push(d.toISOString().slice(0, 7))
  }

  const s = summary || {}
  const totalRev = Number(s.total_revenue || 0)
  const bossRev = Number(s.boss_revenue || 0)
  const wifeRev = Number(s.wife_revenue || 0)
  const storeRev = Number(s.store_revenue || 0)
  const appliedRule = rules.find(r => storeRev >= Number(r.min_revenue) && storeRev < Number(r.max_revenue || Infinity))
  const qualifiedCount = details.filter(d => Number(d.total_hours) >= 30).length
  const disqualifiedCount = details.filter(d => Number(d.total_hours) < 30).length

  return (
    <div style={{ padding: 20, color: '#e8dcc8', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#c9a84c', display: 'flex', alignItems: 'center', gap: 10 }}><TrendingUp size={22} /> 月度業績分紅</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={recalc} disabled={recalcing} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #2a2520', background: '#1a1714', color: '#e8dcc8', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={14} /> {recalcing ? '計算中…' : '重新計算'}</button>
          <button onClick={syncPayroll} disabled={syncing} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#c9a84c', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><ArrowRight size={14} /> {syncing ? '同步中…' : '同步薪資'}</button>
        </div>
      </div>

      {/* Month selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {months.map(m => (
          <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: month === m ? 'rgba(201,168,76,.15)' : '#1a1714', color: month === m ? '#c9a84c' : '#8a7e6e', border: month === m ? '1px solid rgba(201,168,76,.3)' : '1px solid #2a2520' }}>
            {m.slice(5)}月
          </button>
        ))}
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#8a7e6e' }}>載入中…</div> : <>
        {/* Revenue split */}
        <div style={{ background: '#1a1714', border: '1px solid #2a2520', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', marginBottom: 12 }}>營收拆分</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <div style={{ background: '#0d0b09', borderRadius: 8, padding: 12 }}><div style={{ fontSize: 11, color: '#8a7e6e' }}>總營收</div><div style={{ fontSize: 22, fontWeight: 800, color: '#c9a84c', fontFamily: 'var(--font-mono)' }}>{fmt(totalRev)}</div></div>
            <div style={{ background: '#0d0b09', borderRadius: 8, padding: 12 }}><div style={{ fontSize: 11, color: '#8a7e6e' }}>店內業績（分紅池）</div><div style={{ fontSize: 22, fontWeight: 800, color: '#4da86c', fontFamily: 'var(--font-mono)' }}>{fmt(storeRev)}</div><div style={{ fontSize: 10, color: '#8a7e6e' }}>{pct(storeRev, totalRev)}</div></div>
            <div style={{ background: '#0d0b09', borderRadius: 8, padding: 12 }}><div style={{ fontSize: 11, color: '#8a7e6e' }}>老闆客戶</div><div style={{ fontSize: 18, fontWeight: 700, color: '#e8dcc8', fontFamily: 'var(--font-mono)' }}>{fmt(bossRev)}</div><div style={{ fontSize: 10, color: '#8a7e6e' }}>{pct(bossRev, totalRev)}</div></div>
            <div style={{ background: '#0d0b09', borderRadius: 8, padding: 12 }}><div style={{ fontSize: 11, color: '#8a7e6e' }}>老闆娘客戶</div><div style={{ fontSize: 18, fontWeight: 700, color: '#e8dcc8', fontFamily: 'var(--font-mono)' }}>{fmt(wifeRev)}</div><div style={{ fontSize: 10, color: '#8a7e6e' }}>{pct(wifeRev, totalRev)}</div></div>
          </div>
        </div>

        {/* Commission calc */}
        <div style={{ background: '#1a1714', border: '1px solid #2a2520', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', marginBottom: 12 }}>分紅計算</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div style={{ background: '#0d0b09', borderRadius: 8, padding: 12 }}><div style={{ fontSize: 11, color: '#8a7e6e' }}>適用級距</div><div style={{ fontSize: 16, fontWeight: 700, color: '#e8dcc8' }}>{s.commission_rate != null ? `${s.commission_rate}%` : appliedRule ? `${appliedRule.rate_percent || appliedRule.commission_rate || 0}%` : '—'}</div><div style={{ fontSize: 10, color: '#8a7e6e' }}>{appliedRule ? `${formatWan(appliedRule.min_revenue)}~${appliedRule.max_revenue ? formatWan(appliedRule.max_revenue) : '以上'}` : ''}</div></div>
            <div style={{ background: '#0d0b09', borderRadius: 8, padding: 12 }}><div style={{ fontSize: 11, color: '#8a7e6e' }}>分紅總額</div><div style={{ fontSize: 16, fontWeight: 700, color: '#4da86c', fontFamily: 'var(--font-mono)' }}>{fmt(s.total_commission)}</div></div>
            <div style={{ background: '#0d0b09', borderRadius: 8, padding: 12 }}><div style={{ fontSize: 11, color: '#8a7e6e' }}>30hr門檻</div><div style={{ fontSize: 14, fontWeight: 700, color: '#e8dcc8' }}><span style={{ color: '#4da86c' }}>{qualifiedCount}合格</span> / <span style={{ color: '#e74c3c' }}>{disqualifiedCount}不合格</span></div></div>
          </div>
        </div>

        {/* Staff details */}
        <div style={{ background: '#1a1714', border: '1px solid #2a2520', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', marginBottom: 12 }}>員工分紅明細</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 4, padding: '8px 0', borderBottom: '1px solid #2a2520', fontSize: 10, color: '#8a7e6e', fontWeight: 600 }}>
            <span>員工</span><span style={{ textAlign: 'right' }}>時數</span><span style={{ textAlign: 'right' }}>佔比</span><span style={{ textAlign: 'right' }}>獎金</span><span style={{ textAlign: 'center' }}>狀態</span>
          </div>
          {details.map(d => {
            const hrs = Number(d.total_hours || 0)
            const qualified = hrs >= 30
            return (
              <div key={d.id || d.employee_name} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 4, padding: '10px 0', borderBottom: '1px solid #2a2520', fontSize: 13, alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: '#e8dcc8' }}>{d.employee_name}</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#8a7e6e' }}>{hrs.toFixed(0)}hr</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#8a7e6e' }}>{d.hour_pct ? `${Number(d.hour_pct).toFixed(1)}%` : '—'}</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: qualified ? '#c9a84c' : '#8a7e6e' }}>{fmt(d.commission_amount)}</span>
                <span style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: qualified ? '#4da86c' : '#e74c3c' }}>{qualified ? '✅合格' : '❌未達'}</span>
              </div>
            )
          })}
          {!details.length && <div style={{ padding: 20, textAlign: 'center', color: '#8a7e6e', fontSize: 13 }}>尚無資料，請點擊「重新計算」</div>}
        </div>

        {/* Rate rules */}
        <div style={{ background: '#1a1714', border: '1px solid #2a2520', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', marginBottom: 12 }}>抽成級距表</div>
          {rules.map(r => {
            const isActive = appliedRule?.id === r.id
            return (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, marginBottom: 4, background: isActive ? 'rgba(201,168,76,.1)' : 'transparent', border: isActive ? '1px solid rgba(201,168,76,.3)' : '1px solid transparent' }}>
                <span style={{ fontSize: 13, color: isActive ? '#c9a84c' : '#8a7e6e' }}>
                  {formatWan(r.min_revenue)} ~ {r.max_revenue ? formatWan(r.max_revenue) : '以上'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#c9a84c' : '#e8dcc8' }}>
                  {r.rate_percent || r.commission_rate || 0}%{isActive ? ' ← 本月適用' : ''}
                </span>
              </div>
            )
          })}
        </div>
      </>}
    </div>
  )
}
