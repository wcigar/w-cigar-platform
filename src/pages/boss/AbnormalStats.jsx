import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { BarChart3, TrendingUp, Users, AlertTriangle } from 'lucide-react'
import { format, subMonths, differenceInHours } from 'date-fns'

export default function AbnormalStats() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('3m')

  useEffect(() => { load() }, [range])

  async function load() {
    setLoading(true)
    const months = range === '1m' ? 1 : range === '3m' ? 3 : 6
    const since = format(subMonths(new Date(), months), 'yyyy-MM-dd')
    const { data } = await supabase.from('abnormal_reports').select('*').gte('date', since).order('time', { ascending: false })
    setReports(data || [])
    setLoading(false)
  }

  if (loading) return <div className="loading-shimmer" style={{ height: 200 }} />

  const total = reports.length
  const pending = reports.filter(r => r.status === '待處理').length
  const processing = reports.filter(r => r.status === '處理中').length
  const resolved = reports.filter(r => r.status === '已解決').length

  const resolvedWithTime = reports.filter(r => r.resolved_at && r.time)
  const avgHours = resolvedWithTime.length > 0
    ? Math.round(resolvedWithTime.reduce((sum, r) => sum + differenceInHours(new Date(r.resolved_at), new Date(r.time)), 0) / resolvedWithTime.length)
    : null

  const slaReports = reports.filter(r => r.sla_deadline)
  const slaOnTime = slaReports.filter(r => {
    if (r.status === '已解決' && r.resolved_at) return new Date(r.resolved_at) <= new Date(r.sla_deadline)
    if (r.status !== '已解決') return new Date() <= new Date(r.sla_deadline)
    return true
  }).length
  const slaRate = slaReports.length > 0 ? Math.round(slaOnTime / slaReports.length * 100) : null

  const byReporter = {}
  reports.forEach(r => { byReporter[r.reporter] = (byReporter[r.reporter] || 0) + 1 })
  const reporters = Object.entries(byReporter).sort((a, b) => b[1] - a[1])

  const byMonth = {}
  reports.forEach(r => {
    const m = r.date?.slice(0, 7)
    if (m) { if (!byMonth[m]) byMonth[m] = { total: 0, resolved: 0 }; byMonth[m].total++; if (r.status === '已解決') byMonth[m].resolved++ }
  })
  const monthList = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]))

  const keywords = {}
  const kws = ['馬桶', '鐵捲門', '空調', '冷氣', '漏水', '網路', '電', '瓦斯', '鮮奶', '冰箱', '音響', '燈', '玻璃', '門鎖']
  reports.forEach(r => { if (r.description) kws.forEach(kw => { if (r.description.includes(kw)) keywords[kw] = (keywords[kw] || 0) + 1 }) })
  const topKeywords = Object.entries(keywords).sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {[['1m', '近1月'], ['3m', '近3月'], ['6m', '近半年']].map(([v, l]) => (
          <button key={v} onClick={() => setRange(v)} style={{ padding: '5px 12px', borderRadius: 14, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: range === v ? 'var(--gold-glow)' : 'transparent', color: range === v ? 'var(--gold)' : 'var(--text-dim)', border: range === v ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{l}</button>
        ))}
      </div>
      {total === 0 ? <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>此期間無異常報告</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
            <SB label="總異常" value={total} color="var(--text)" />
            <SB label="待處理" value={pending} color={pending > 0 ? 'var(--red)' : 'var(--green)'} />
            <SB label="已解決" value={resolved} color="var(--green)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
            <SB label="處理中" value={processing} color={processing > 0 ? '#f59e0b' : 'var(--text-muted)'} />
            <SB label="平均處理" value={avgHours != null ? avgHours + 'h' : '—'} color="var(--gold)" />
            <SB label="SLA達標" value={slaRate != null ? slaRate + '%' : '—'} color={slaRate != null && slaRate >= 80 ? 'var(--green)' : 'var(--red)'} />
          </div>
          <div className="card" style={{ padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><BarChart3 size={14} color="var(--gold)" /> 狀態分布</div>
            <div style={{ height: 20, borderRadius: 10, overflow: 'hidden', display: 'flex', background: 'var(--black)' }}>
              {resolved > 0 && <div style={{ width: (resolved / total * 100) + '%', background: 'var(--green)' }} />}
              {processing > 0 && <div style={{ width: (processing / total * 100) + '%', background: '#f59e0b' }} />}
              {pending > 0 && <div style={{ width: (pending / total * 100) + '%', background: 'var(--red)' }} />}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--text-dim)' }}>
              <span style={{ color: 'var(--green)' }}>已解決 {resolved}</span>
              <span style={{ color: '#f59e0b' }}>處理中 {processing}</span>
              <span style={{ color: 'var(--red)' }}>待處理 {pending}</span>
            </div>
          </div>
          {monthList.length > 1 && (
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><TrendingUp size={14} color="var(--gold)" /> 月趨勢</div>
              {monthList.map(([m, d]) => { const maxV = Math.max(...monthList.map(([_, x]) => x.total)); return (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', width: 40, flexShrink: 0 }}>{parseInt(m.slice(5))}月</span>
                  <div style={{ flex: 1, height: 16, background: 'var(--black)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: (d.resolved / maxV * 100) + '%', background: 'var(--green)', height: '100%' }} />
                    <div style={{ width: ((d.total - d.resolved) / maxV * 100) + '%', background: 'var(--red)', height: '100%' }} />
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', width: 30, textAlign: 'right' }}>{d.total}</span>
                </div>
              )})}
            </div>
          )}
          {topKeywords.length > 0 && (
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} color="var(--red)" /> 常見問題</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {topKeywords.map(([kw, count]) => <span key={kw} style={{ padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: 'rgba(196,77,77,.1)', color: 'var(--red)', border: '1px solid rgba(196,77,77,.2)' }}>{kw} x{count}</span>)}
              </div>
            </div>
          )}
          {reporters.length > 0 && (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Users size={14} color="var(--gold)" /> 回報人排行</div>
              {reporters.map(([name, count], i) => <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}><span>{i === 0 ? '🥇' : i === 1 ? '🥈' : (i+1)+'.'} {name}</span><strong style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{count}</strong></div>)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SB({ label, value, color }) {
  return <div className="card" style={{ padding: 8, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{label}</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color, marginTop: 2 }}>{value}</div></div>
}
