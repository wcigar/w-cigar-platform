// src/pages/admin/SalesReport.jsx
// 銷售儀表板 — KPI / 趨勢 / 區域 / 店家 / 大使 / 品項排行
import { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, Users, Building2, RefreshCw, Cigarette } from 'lucide-react'
import PageShell, { Card } from '../../components/PageShell'
import { getSalesReport, getRegionLabel } from '../../lib/services/salesReport'

const REGION_COLORS = {
  taipei: '#3b82f6',
  taoyuan: '#f59e0b',
  taichung: '#10b981',
  kaohsiung: '#ec4899',
  tainan: '#f97316',
  hsinchu: '#8b5cf6',
}
const fallbackColor = '#8a8278'
const CAT_COLORS = { capadura: '#c9a84c', cuban: '#dc2626' }

const fmtMoney = (n) => 'NT$ ' + Number(n || 0).toLocaleString()
const fmtInt = (n) => Number(n || 0).toLocaleString()

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function lastDayOfMonth(y, m) {
  return new Date(y, m+1, 0).getDate()
}

function Kpi({ label, value, unit }) {
  return (
    <Card style={{ flex: '1 1 140px', minWidth: 140, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: '#e7e5e4' }}>
        {value}{unit && <span style={{ fontSize: 12, color: '#8a8278', marginLeft: 4 }}>{unit}</span>}
      </div>
    </Card>
  )
}

function DailyLineChart({ data }) {
  const W = 640, H = 200, PADL = 50, PADR = 12, PADT = 12, PADB = 28
  const innerW = W - PADL - PADR
  const innerH = H - PADT - PADB

  if (!data.length) return <div style={{ color: '#8a8278', textAlign: 'center', padding: 20 }}>無資料</div>

  const max = Math.max(...data.map(d => d.revenue)) || 1
  const yScale = v => PADT + innerH - (v / max) * innerH
  const xScale = i => PADL + (data.length === 1 ? innerW/2 : (i / (data.length-1)) * innerW)

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.revenue)}`).join(' ')
  const fillPath = `${linePath} L ${xScale(data.length-1)} ${PADT + innerH} L ${xScale(0)} ${PADT + innerH} Z`

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(max * t))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxWidth: '100%' }}>
      {ticks.map((t, i) => {
        const y = yScale(t)
        return (
          <g key={i}>
            <line x1={PADL} y1={y} x2={W-PADR} y2={y} stroke="#1f1c19" strokeWidth="1" />
            <text x={PADL-6} y={y+4} fill="#8a8278" fontSize="10" textAnchor="end">
              {t >= 1000 ? (t/1000).toFixed(t >= 10000 ? 0 : 1) + 'k' : t}
            </text>
          </g>
        )
      })}
      <path d={fillPath} fill="rgba(201,168,76,0.15)" />
      <path d={linePath} fill="none" stroke="#c9a84c" strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={i} cx={xScale(i)} cy={yScale(d.revenue)} r="3" fill="#c9a84c">
          <title>{`${d.sale_date}: NT$ ${d.revenue.toLocaleString()}`}</title>
        </circle>
      ))}
      {data.map((d, i) => {
        const step = Math.max(1, Math.ceil(data.length / 8))
        if (i % step !== 0 && i !== data.length-1) return null
        return (
          <text key={i} x={xScale(i)} y={H-10} fill="#8a8278" fontSize="9" textAnchor="middle">
            {d.sale_date.slice(5)}
          </text>
        )
      })}
    </svg>
  )
}

function RegionDonut({ data }) {
  const total = data.reduce((s, r) => s + r.revenue, 0) || 1
  const cx = 80, cy = 80, R = 70, r = 44
  let acc = 0
  const arcs = data.map((d) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI/2
    acc += d.revenue
    const end = (acc / total) * Math.PI * 2 - Math.PI/2
    const large = (end - start) > Math.PI ? 1 : 0
    const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start)
    const x2 = cx + R * Math.cos(end), y2 = cy + R * Math.sin(end)
    const x3 = cx + r * Math.cos(end), y3 = cy + r * Math.sin(end)
    const x4 = cx + r * Math.cos(start), y4 = cy + r * Math.sin(start)
    const path = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`
    return { path, color: REGION_COLORS[d.region] || fallbackColor, label: getRegionLabel(d.region), val: d.revenue, pct: d.revenue / total }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
        {arcs.length === 0 && <circle cx={cx} cy={cy} r={R} fill="#1f1c19" />}
        {arcs.map((a, i) => <path key={i} d={a.path} fill={a.color}><title>{`${a.label}: NT$ ${a.val.toLocaleString()}`}</title></path>)}
      </svg>
      <div style={{ flex: 1, minWidth: 140 }}>
        {arcs.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, background: a.color, borderRadius: 2, flexShrink: 0 }} />
            <span style={{ color: '#e7e5e4', flex: 1 }}>{a.label}</span>
            <span style={{ color: '#8a8278', fontVariantNumeric: 'tabular-nums' }}>{(a.pct*100).toFixed(1)}%</span>
            <span style={{ color: '#e7e5e4', fontVariantNumeric: 'tabular-nums', minWidth: 70, textAlign: 'right' }}>{fmtMoney(a.val)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarList({ items, getLabel, getValue, getSubtitle, getColor }) {
  const max = Math.max(...items.map(getValue)) || 1
  return (
    <div>
      {items.map((it, i) => {
        const v = getValue(it)
        const pct = (v / max) * 100
        const color = (getColor && getColor(it)) || '#c9a84c'
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: '#8a8278', minWidth: 18, fontVariantNumeric: 'tabular-nums' }}>{i+1}.</span>
              <span style={{ color: '#e7e5e4', flex: 1 }}>{getLabel(it)}</span>
              {getSubtitle && <span style={{ color: '#8a8278', fontSize: 10 }}>{getSubtitle(it)}</span>}
              <span style={{ color: '#e7e5e4', fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>{fmtMoney(v)}</span>
            </div>
            <div style={{ height: 6, background: '#1f1c19', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProductRanking({ capaduraItems, cubanItems }) {
  const renderBlock = (title, items, color) => {
    const sumQty = items.reduce((s, p) => s + (p.qty || 0), 0)
    const sumRev = items.reduce((s, p) => s + (p.revenue || 0), 0)
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #2a2824' }}>
          <span style={{ width: 8, height: 8, background: color, borderRadius: 2 }} />
          <span style={{ color: '#e7e5e4', fontSize: 13, fontWeight: 500 }}>{title}</span>
          <span style={{ color: '#8a8278', fontSize: 11, marginLeft: 'auto' }}>
            {fmtInt(sumQty)} 根 · {fmtMoney(sumRev)}
          </span>
        </div>
        {items.length === 0
          ? <div style={{ color: '#a8a29e', fontSize: 11, padding: '4px 0' }}>區間內無資料</div>
          : (
            <BarList
              items={items}
              getLabel={p => p.product_label || p.product_key}
              getValue={p => p.revenue}
              getSubtitle={p => `${p.qty} 根 · ${p.cnt} 筆`}
              getColor={() => color}
            />
          )}
      </div>
    )
  }
  return (
    <>
      {renderBlock(`Capadura 系列 (${capaduraItems.length})`, capaduraItems, CAT_COLORS.capadura)}
      {renderBlock(`古巴雪茄 (${cubanItems.length})`, cubanItems, CAT_COLORS.cuban)}
    </>
  )
}

export default function SalesReport() {
  const [from, setFrom] = useState('2026-04-01')
  const [to, setTo] = useState('2026-04-30')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const result = await getSalesReport(from, to)
      setData(result)
    } catch (e) {
      setError(e.message || String(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [])
  useEffect(() => { if (data !== null || error) load() /* eslint-disable-next-line */ }, [from, to])

  function applyPreset(preset) {
    const today = new Date()
    const yyyy = today.getFullYear(), mm = today.getMonth()
    let f, t
    if (preset === 'apr2026') { f = '2026-04-01'; t = '2026-04-30' }
    else if (preset === 'this-month') {
      f = `${yyyy}-${String(mm+1).padStart(2,'0')}-01`
      t = `${yyyy}-${String(mm+1).padStart(2,'0')}-${String(lastDayOfMonth(yyyy, mm)).padStart(2,'0')}`
    } else if (preset === 'last-month') {
      const py = mm === 0 ? yyyy-1 : yyyy, pm = mm === 0 ? 11 : mm-1
      f = `${py}-${String(pm+1).padStart(2,'0')}-01`
      t = `${py}-${String(pm+1).padStart(2,'0')}-${String(lastDayOfMonth(py, pm)).padStart(2,'0')}`
    } else if (preset === 'ytd') {
      f = `${yyyy}-01-01`; t = todayStr()
    }
    setFrom(f); setTo(t)
  }

  const kpi = data?.kpi || { revenue: 0, count: 0, qty: 0, venues: 0, ambassadors: 0 }
  const byRegion = data?.byRegion || []
  const byVenue = data?.byVenue || []
  const byAmbassador = data?.byAmbassador || []
  const byDate = data?.byDate || []
  const byProductCapadura = data?.byProductCapadura || []
  const byProductCuban = data?.byProductCuban || []

  const inputStyle = { background: '#1a1815', border: '1px solid #2a2824', color: '#e7e5e4', padding: '6px 10px', borderRadius: 6, fontSize: 13 }
  const btnStyle = { background: '#1a1815', border: '1px solid #2a2824', color: '#8a8278', padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }
  const primaryBtn = { ...btnStyle, background: '#c9a84c', color: '#0a0a0a', border: '1px solid #c9a84c', fontWeight: 500 }

  return (
    <PageShell title="銷售儀表板" subtitle="ADMIN · SALES REPORT">
      <Card style={{ marginBottom: 12, padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#8a8278' }}>從</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
          <span style={{ fontSize: 12, color: '#8a8278' }}>到</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
          <div style={{ display: 'inline-flex', gap: 4, marginLeft: 8 }}>
            <button onClick={() => applyPreset('apr2026')} style={btnStyle}>2026/4 月</button>
            <button onClick={() => applyPreset('this-month')} style={btnStyle}>本月</button>
            <button onClick={() => applyPreset('last-month')} style={btnStyle}>上月</button>
            <button onClick={() => applyPreset('ytd')} style={btnStyle}>年初至今</button>
          </div>
          <button onClick={load} disabled={loading} style={{ ...primaryBtn, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={12} /> {loading ? '載入中…' : '重新整理'}
          </button>
        </div>
      </Card>

      {error && (
        <Card style={{ marginBottom: 12, padding: 12, borderColor: '#7f1d1d', background: '#1a0c0c', color: '#fca5a5', fontSize: 12 }}>
          載入失敗：{error}
        </Card>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Kpi label="總營收" value={fmtMoney(kpi.revenue)} />
        <Kpi label="總根數" value={fmtInt(kpi.qty)} unit="根" />
        <Kpi label="總單數" value={fmtInt(kpi.count)} unit="筆" />
        <Kpi label="活躍店家" value={fmtInt(kpi.venues)} unit="家" />
        <Kpi label="活躍大使" value={fmtInt(kpi.ambassadors)} unit="位" />
      </div>

      <Card style={{ marginBottom: 12, padding: 14 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <TrendingUp size={14} color="#c9a84c" /> 每日營收趨勢
        </h3>
        <DailyLineChart data={byDate} />
      </Card>

      <Card style={{ marginBottom: 12, padding: 14 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <BarChart3 size={14} color="#c9a84c" /> 各地區營收
        </h3>
        <RegionDonut data={byRegion} />
      </Card>

      <Card style={{ marginBottom: 12, padding: 14 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Cigarette size={14} color="#c9a84c" /> 雪茄品項銷售排行
        </h3>
        <ProductRanking capaduraItems={byProductCapadura} cubanItems={byProductCuban} />
      </Card>

      <Card style={{ marginBottom: 12, padding: 14 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Building2 size={14} color="#c9a84c" /> 店家排行 ({byVenue.length} 家)
        </h3>
        <BarList
          items={byVenue}
          getLabel={v => v.venue_name}
          getValue={v => v.revenue}
          getSubtitle={v => `${getRegionLabel(v.region)} · ${v.cnt} 筆`}
          getColor={v => REGION_COLORS[v.region] || fallbackColor}
        />
      </Card>

      <Card style={{ marginBottom: 12, padding: 14 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={14} color="#c9a84c" /> 雪茄大使排行榜 ({byAmbassador.length} 位)
        </h3>
        <BarList
          items={byAmbassador}
          getLabel={a => a.ambassador_name || a.ambassador_id}
          getValue={a => a.revenue}
          getSubtitle={a => `${a.qty || 0} 根 · ${a.cnt} 筆 · 客單 ${fmtMoney(Math.round(a.revenue / Math.max(a.cnt, 1)))}`}
          getColor={() => '#c9a84c'}
        />
      </Card>
    </PageShell>
  )
}
// src/pages/admin/SalesReport.jsx
// 銷售儀表板 — KPI / 趨勢 / 區域 / 店家 / 大使排行
import { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, Users, Building2, RefreshCw } from 'lucide-react'
import PageShell, { Card } from '../../components/PageShell'
import { getSalesReport, getRegionLabel } from '../../lib/services/salesReport'

const REGION_COLORS = {
  taipei: '#3b82f6',
  taoyuan: '#f59e0b',
  taichung: '#10b981',
  kaohsiung: '#ec4899',
  tainan: '#f97316',
  hsinchu: '#8b5cf6',
}
const fallbackColor = '#8a8278'

const fmtMoney = (n) => 'NT$ ' + Number(n || 0).toLocaleString()
const fmtInt = (n) => Number(n || 0).toLocaleString()

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function lastDayOfMonth(y, m) {
  return new Date(y, m+1, 0).getDate()
}

function Kpi({ label, value, unit }) {
  return (
    <Card style={{ flex: '1 1 140px', minWidth: 140, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: '#e7e5e4' }}>
        {value}{unit && <span style={{ fontSize: 12, color: '#8a8278', marginLeft: 4 }}>{unit}</span>}
      </div>
    </Card>
  )
}

function DailyLineChart({ data }) {
  const W = 640, H = 200, PADL = 50, PADR = 12, PADT = 12, PADB = 28
  const innerW = W - PADL - PADR
  const innerH = H - PADT - PADB

  if (!data.length) return <div style={{ color: '#8a8278', textAlign: 'center', padding: 20 }}>無資料</div>

  const max = Math.max(...data.map(d => d.revenue)) || 1
  const yScale = v => PADT + innerH - (v / max) * innerH
  const xScale = i => PADL + (data.length === 1 ? innerW/2 : (i / (data.length-1)) * innerW)

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.revenue)}`).join(' ')
  const fillPath = `${linePath} L ${xScale(data.length-1)} ${PADT + innerH} L ${xScale(0)} ${PADT + innerH} Z`

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(max * t))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxWidth: '100%' }}>
      {ticks.map((t, i) => {
        const y = yScale(t)
        return (
          <g key={i}>
            <line x1={PADL} y1={y} x2={W-PADR} y2={y} stroke="#1f1c19" strokeWidth="1" />
            <text x={PADL-6} y={y+4} fill="#8a8278" fontSize="10" textAnchor="end">
              {t >= 1000 ? (t/1000).toFixed(t >= 10000 ? 0 : 1) + 'k' : t}
            </text>
          </g>
        )
      })}
      <path d={fillPath} fill="rgba(201,168,76,0.15)" />
      <path d={linePath} fill="none" stroke="#c9a84c" strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={i} cx={xScale(i)} cy={yScale(d.revenue)} r="3" fill="#c9a84c">
          <title>{`${d.sale_date}: NT$ ${d.revenue.toLocaleString()}`}</title>
        </circle>
      ))}
      {data.map((d, i) => {
        const step = Math.max(1, Math.ceil(data.length / 8))
        if (i % step !== 0 && i !== data.length-1) return null
        return (
          <text key={i} x={xScale(i)} y={H-10} fill="#8a8278" fontSize="9" textAnchor="middle">
            {d.sale_date.slice(5)}
          </text>
        )
      })}
    </svg>
  )
}

function RegionDonut({ data }) {
  const total = data.reduce((s, r) => s + r.revenue, 0) || 1
  const cx = 80, cy = 80, R = 70, r = 44
  let acc = 0
  const arcs = data.map((d) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI/2
    acc += d.revenue
    const end = (acc / total) * Math.PI * 2 - Math.PI/2
    const large = (end - start) > Math.PI ? 1 : 0
    const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start)
    const x2 = cx + R * Math.cos(end), y2 = cy + R * Math.sin(end)
    const x3 = cx + r * Math.cos(end), y3 = cy + r * Math.sin(end)
    const x4 = cx + r * Math.cos(start), y4 = cy + r * Math.sin(start)
    const path = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`
    return { path, color: REGION_COLORS[d.region] || fallbackColor, label: getRegionLabel(d.region), val: d.revenue, pct: d.revenue / total }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
        {arcs.length === 0 && <circle cx={cx} cy={cy} r={R} fill="#1f1c19" />}
        {arcs.map((a, i) => <path key={i} d={a.path} fill={a.color}><title>{`${a.label}: NT$ ${a.val.toLocaleString()}`}</title></path>)}
      </svg>
      <div style={{ flex: 1, minWidth: 140 }}>
        {arcs.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, background: a.color, borderRadius: 2, flexShrink: 0 }} />
            <span style={{ color: '#e7e5e4', flex: 1 }}>{a.label}</span>
            <span style={{ color: '#8a8278', fontVariantNumeric: 'tabular-nums' }}>{(a.pct*100).toFixed(1)}%</span>
            <span style={{ color: '#e7e5e4', fontVariantNumeric: 'tabular-nums', minWidth: 70, textAlign: 'right' }}>{fmtMoney(a.val)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarList({ items, getLabel, getValue, getSubtitle, getColor }) {
  const max = Math.max(...items.map(getValue)) || 1
  return (
    <div>
      {items.map((it, i) => {
        const v = getValue(it)
        const pct = (v / max) * 100
        const color = (getColor && getColor(it)) || '#c9a84c'
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: '#8a8278', minWidth: 18, fontVariantNumeric: 'tabular-nums' }}>{i+1}.</span>
              <span style={{ color: '#e7e5e4', flex: 1 }}>{getLabel(it)}</span>
              {getSubtitle && <span style={{ color: '#8a8278', fontSize: 10 }}>{getSubtitle(it)}</span>}
              <span style={{ color: '#e7e5e4', fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>{fmtMoney(v)}</span>
            </div>
            <div style={{ height: 6, background: '#1f1c19', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function SalesReport() {
  const [from, setFrom] = useState('2026-04-01')
  const [to, setTo] = useState('2026-04-30')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const result = await getSalesReport(from, to)
      setData(result)
    } catch (e) {
      setError(e.message || String(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [])
  useEffect(() => { if (data !== null || error) load() /* eslint-disable-next-line */ }, [from, to])

  function applyPreset(preset) {
    const today = new Date()
    const yyyy = today.getFullYear(), mm = today.getMonth()
    let f, t
    if (preset === 'apr2026') { f = '2026-04-01'; t = '2026-04-30' }
    else if (preset === 'this-month') {
      f = `${yyyy}-${String(mm+1).padStart(2,'0')}-01`
      t = `${yyyy}-${String(mm+1).padStart(2,'0')}-${String(lastDayOfMonth(yyyy, mm)).padStart(2,'0')}`
    } else if (preset === 'last-month') {
      const py = mm === 0 ? yyyy-1 : yyyy, pm = mm === 0 ? 11 : mm-1
      f = `${py}-${String(pm+1).padStart(2,'0')}-01`
      t = `${py}-${String(pm+1).padStart(2,'0')}-${String(lastDayOfMonth(py, pm)).padStart(2,'0')}`
    } else if (preset === 'ytd') {
      f = `${yyyy}-01-01`; t = todayStr()
    }
    setFrom(f); setTo(t)
  }

  const kpi = data?.kpi || { revenue: 0, count: 0, venues: 0, ambassadors: 0 }
  const byRegion = data?.byRegion || []
  const byVenue = data?.byVenue || []
  const byAmbassador = data?.byAmbassador || []
  const byDate = data?.byDate || []

  const inputStyle = { background: '#1a1815', border: '1px solid #2a2824', color: '#e7e5e4', padding: '6px 10px', borderRadius: 6, fontSize: 13 }
  const btnStyle = { background: '#1a1815', border: '1px solid #2a2824', color: '#8a8278', padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }
  const primaryBtn = { ...btnStyle, background: '#c9a84c', color: '#0a0a0a', border: '1px solid #c9a84c', fontWeight: 500 }

  return (
    <PageShell title="銷售儀表板" subtitle="ADMIN · SALES REPORT">
      <Card style={{ marginBottom: 12, padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#8a8278' }}>從</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
          <span style={{ fontSize: 12, color: '#8a8278' }}>到</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
          <div style={{ display: 'inline-flex', gap: 4, marginLeft: 8 }}>
            <button onClick={() => applyPreset('apr2026')} style={btnStyle}>2026/4 月</button>
            <button onClick={() => applyPreset('this-month')} style={btnStyle}>本月</button>
            <button onClick={() => applyPreset('last-month')} style={btnStyle}>上月</button>
            <button onClick={() => applyPreset('ytd')} style={btnStyle}>年初至今</button>
          </div>
          <button onClick={load} disabled={loading} style={{ ...primaryBtn, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={12} /> {loading ? '載入中…' : '重新整理'}
          </button>
        </div>
      </Card>

      {error && (
        <Card style={{ marginBottom: 12, padding: 12, borderColor: '#7f1d1d', background: '#1a0c0c', color: '#fca5a5', fontSize: 12 }}>
          載入失敗：{error}
        </Card>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Kpi label="總營收" value={fmtMoney(kpi.revenue)} />
        <Kpi label="總單數" value={fmtInt(kpi.count)} unit="筆" />
        <Kpi label="活躍店家" value={fmtInt(kpi.venues)} unit="家" />
        <Kpi label="活躍大使" value={fmtInt(kpi.ambassadors)} unit="位" />
      </div>

      <Card style={{ marginBottom: 12, padding: 14 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <TrendingUp size={14} color="#c9a84c" /> 每日營收趨勢
        </h3>
        <DailyLineChart data={byDate} />
      </Card>

      <Card style={{ marginBottom: 12, padding: 14 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <BarChart3 size={14} color="#c9a84c" /> 各地區營收
        </h3>
        <RegionDonut data={byRegion} />
      </Card>

      <Card style={{ marginBottom: 12, padding: 14 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Building2 size={14} color="#c9a84c" /> 店家排行 ({byVenue.length} 家)
        </h3>
        <BarList
          items={byVenue}
          getLabel={v => v.venue_name}
          getValue={v => v.revenue}
          getSubtitle={v => `${getRegionLabel(v.region)} · ${v.cnt} 筆`}
          getColor={v => REGION_COLORS[v.region] || fallbackColor}
        />
      </Card>

      <Card style={{ marginBottom: 12, padding: 14 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={14} color="#c9a84c" /> 雪茄大使排行榜 ({byAmbassador.length} 位)
        </h3>
        <BarList
          items={byAmbassador}
          getLabel={a => a.ambassador_name || a.ambassador_id}
          getValue={a => a.revenue}
          getSubtitle={a => `${a.cnt} 筆 · 客單 ${fmtMoney(Math.round(a.revenue / Math.max(a.cnt, 1)))}`}
          getColor={() => '#c9a84c'}
        />
      </Card>
    </PageShell>
  )
}
