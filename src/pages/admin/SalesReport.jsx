// src/pages/admin/SalesReport.jsx
// 銷售儀表板 — 即時 KPI / 趨勢 / 區域 / 店家 / 大使 / 品項 + 會計視角(含季對比) + 補貨建議 + 運費紀錄
import { useEffect, useMemo, useState } from 'react'
import { BarChart3, TrendingUp, Users, Building2, RefreshCw, Cigarette, Calculator, Download, Printer, Package, Truck, Calendar, Trash2, Plus } from 'lucide-react'
import PageShell, { Card } from '../../components/PageShell'
import { getSalesReport, getReplenishmentSuggestions, getRegionLabel, getDailyKPI, getQuarterComparison, getShippingLogs, addShippingLog, deleteShippingLog } from '../../lib/services/salesReport'

const REGION_COLORS = { taipei: '#3b82f6', taoyuan: '#f59e0b', taichung: '#10b981', kaohsiung: '#ec4899', tainan: '#f97316', hsinchu: '#8b5cf6' }
const fallbackColor = '#8a8278'
const CAT_COLORS = { capadura: '#c9a84c', cuban: '#dc2626' }

const fmtMoney = (n) => 'NT$ ' + Number(n || 0).toLocaleString()
const fmtInt = (n) => Number(n || 0).toLocaleString()
const fmtPct = (n) => (Number(n || 0) * 100).toFixed(1) + '%'
const fmtSignPct = (n) => { const p = Number(n || 0) * 100; return (p >= 0 ? '+' : '') + p.toFixed(1) + '%' }

function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function lastDayOfMonth(y, m) { return new Date(y, m+1, 0).getDate() }
function isWeekend(s) { const dow = new Date(s + 'T00:00:00').getDay(); return dow===0||dow===5||dow===6 }

function Kpi({ label, value, unit, accent }) {
  return (
    <Card style={{ flex: '1 1 140px', minWidth: 140, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: accent || '#e7e5e4' }}>
        {value}{unit && <span style={{ fontSize: 12, color: '#8a8278', marginLeft: 4 }}>{unit}</span>}
      </div>
    </Card>
  )
}

// 即時 KPI（今日 / 昨日 / 本週至今 / 本月至今）
function TodayKPISection({ daily }) {
  if (!daily) return null
  const cards = [
    { label: '今日', data: daily.today, accent: '#c9a84c', sub: daily.today.date },
    { label: '昨日', data: daily.yesterday, accent: '#8a8278', sub: daily.yesterday.date },
    { label: '本週至今', data: daily.weekToDate, accent: '#10b981', sub: `${daily.weekToDate.from.slice(5)} ~ ${daily.weekToDate.to.slice(5)}` },
    { label: '本月至今', data: daily.monthToDate, accent: '#3b82f6', sub: `${daily.monthToDate.from.slice(5)} ~ ${daily.monthToDate.to.slice(5)}` },
  ]
  const todayVsYday = daily.yesterday.revenue > 0 ? (daily.today.revenue - daily.yesterday.revenue) / daily.yesterday.revenue : (daily.today.revenue > 0 ? 1 : 0)
  return (
    <Card style={{ marginBottom: 12, padding: 14, borderColor: '#3a3024' }} className="no-print">
      <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Calendar size={14} color="#c9a84c" /> 即時銷售 KPI
        <span style={{ fontSize: 10, color: '#8a8278', fontWeight: 400, marginLeft: 'auto' }}>
          今日 vs 昨日：<span style={{ color: todayVsYday >= 0 ? '#10b981' : '#dc2626' }}>{fmtSignPct(todayVsYday)}</span>
        </span>
      </h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {cards.map((c, i) => (
          <Card key={i} style={{ flex: '1 1 180px', minWidth: 180, padding: 12 }}>
            <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: c.accent }}>{fmtMoney(c.data.revenue)}</div>
            <div style={{ fontSize: 10, color: '#8a8278', marginTop: 4 }}>{c.data.count} 筆 · {c.sub}</div>
          </Card>
        ))}
      </div>
    </Card>
  )
}

// 季對比
function QuarterComparison({ qoq }) {
  if (!qoq) return null
  const { current, previous, deltaRevenue, deltaQty, deltaCount, deltaProfit } = qoq
  const cell = { padding: '6px 8px', fontSize: 12, color: '#e7e5e4', borderBottom: '1px solid #1f1c19' }
  const head = { ...cell, color: '#8a8278', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500 }
  const deltaCol = (d) => ({ color: d > 0 ? '#10b981' : (d < 0 ? '#dc2626' : '#8a8278'), fontWeight: 600 })
  const noPrev = previous.revenue === 0 && previous.count === 0
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: '#8a8278', marginBottom: 8, letterSpacing: 1 }}>季對比 QUARTER ON QUARTER</div>
      {noPrev && <div style={{ fontSize: 10, color: '#fbbf24', marginBottom: 6 }}>⚠️ {previous.label} 尚無資料，無法做有意義對比</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...head, textAlign: 'left' }}>指標</th>
            <th style={{ ...head, textAlign: 'right' }}>{previous.label}</th>
            <th style={{ ...head, textAlign: 'right' }}>{current.label}</th>
            <th style={{ ...head, textAlign: 'right' }}>變化</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={cell}>銷售總額</td><td style={{ ...cell, textAlign: 'right' }}>{fmtMoney(previous.revenue)}</td><td style={{ ...cell, textAlign: 'right', color: '#c9a84c' }}>{fmtMoney(current.revenue)}</td><td style={{ ...cell, textAlign: 'right', ...deltaCol(deltaRevenue) }}>{noPrev ? '—' : fmtSignPct(deltaRevenue)}</td></tr>
          <tr><td style={cell}>毛利</td><td style={{ ...cell, textAlign: 'right' }}>{fmtMoney(previous.gross_profit)}</td><td style={{ ...cell, textAlign: 'right', color: '#10b981' }}>{fmtMoney(current.gross_profit)}</td><td style={{ ...cell, textAlign: 'right', ...deltaCol(deltaProfit) }}>{noPrev ? '—' : fmtSignPct(deltaProfit)}</td></tr>
          <tr><td style={cell}>銷售根數</td><td style={{ ...cell, textAlign: 'right' }}>{fmtInt(previous.qty)}</td><td style={{ ...cell, textAlign: 'right' }}>{fmtInt(current.qty)}</td><td style={{ ...cell, textAlign: 'right', ...deltaCol(deltaQty) }}>{noPrev ? '—' : fmtSignPct(deltaQty)}</td></tr>
          <tr><td style={cell}>交易筆數</td><td style={{ ...cell, textAlign: 'right' }}>{fmtInt(previous.count)}</td><td style={{ ...cell, textAlign: 'right' }}>{fmtInt(current.count)}</td><td style={{ ...cell, textAlign: 'right', ...deltaCol(deltaCount) }}>{noPrev ? '—' : fmtSignPct(deltaCount)}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

// 運費紀錄表
function ShippingLogsManager({ logs, total, onAdd, onDelete, loading }) {
  const [shipDate, setShipDate] = useState(() => todayStr())
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const cell = { padding: '6px 8px', fontSize: 12, color: '#e7e5e4', borderBottom: '1px solid #1f1c19' }
  const head = { ...cell, color: '#8a8278', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500 }
  const inp = { background: '#1a1815', border: '1px solid #2a2824', color: '#e7e5e4', padding: '5px 8px', borderRadius: 6, fontSize: 12 }
  const submit = async () => {
    if (!shipDate || !amount) return
    setBusy(true)
    try { await onAdd({ ship_date: shipDate, amount: Number(amount), notes }); setAmount(''); setNotes('') } finally { setBusy(false) }
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: '#8a8278', marginBottom: 8, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Truck size={12} /> 出貨運費紀錄 SHIPPING LOGS
        <span style={{ marginLeft: 'auto', color: '#fca5a5' }}>合計：{fmtMoney(total)}</span>
      </div>
      <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <input type="date" value={shipDate} onChange={e => setShipDate(e.target.value)} style={inp} />
        <input type="number" placeholder="金額" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...inp, width: 100 }} />
        <input type="text" placeholder="備註 (選填)" value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inp, flex: 1, minWidth: 120 }} />
        <button onClick={submit} disabled={busy || !shipDate || !amount} style={{ background: '#c9a84c', color: '#0a0a0a', border: 'none', padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Plus size={11} /> 新增
        </button>
      </div>
      {loading
        ? <div style={{ color: '#8a8278', fontSize: 11 }}>載入中…</div>
        : logs.length === 0
          ? <div style={{ color: '#8a8278', fontSize: 11, padding: '6px 0' }}>本期間尚無運費紀錄</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...head, textAlign: 'left' }}>日期</th><th style={{ ...head, textAlign: 'right' }}>金額</th><th style={{ ...head, textAlign: 'left' }}>備註</th><th style={{ ...head, textAlign: 'center', width: 40 }} className="no-print"></th></tr></thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td style={cell}>{l.ship_date}</td>
                    <td style={{ ...cell, textAlign: 'right', color: '#fca5a5' }}>{fmtMoney(l.amount)}</td>
                    <td style={{ ...cell, color: '#8a8278' }}>{l.notes || '—'}</td>
                    <td style={{ ...cell, textAlign: 'center' }} className="no-print">
                      <button onClick={() => { if (confirm('刪除這筆運費紀錄？')) onDelete(l.id) }} style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 2 }}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
    </div>
  )
}

function DailyLineChart({ data }) {
  const W = 640, H = 200, PADL = 50, PADR = 12, PADT = 12, PADB = 28
  const innerW = W - PADL - PADR, innerH = H - PADT - PADB
  if (!data.length) return <div style={{ color: '#8a8278', textAlign: 'center', padding: 20 }}>無資料</div>
  const max = Math.max(...data.map(d => d.revenue)) || 1
  const yScale = v => PADT + innerH - (v / max) * innerH
  const xScale = i => PADL + (data.length === 1 ? innerW/2 : (i / (data.length-1)) * innerW)
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.revenue)}`).join(' ')
  const fillPath = `${linePath} L ${xScale(data.length-1)} ${PADT + innerH} L ${xScale(0)} ${PADT + innerH} Z`
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(max * t))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxWidth: '100%' }}>
      {ticks.map((t, i) => { const y = yScale(t); return <g key={i}><line x1={PADL} y1={y} x2={W-PADR} y2={y} stroke="#1f1c19" /><text x={PADL-6} y={y+4} fill="#8a8278" fontSize="10" textAnchor="end">{t >= 1000 ? (t/1000).toFixed(t >= 10000 ? 0 : 1) + 'k' : t}</text></g> })}
      <path d={fillPath} fill="rgba(201,168,76,0.15)" />
      <path d={linePath} fill="none" stroke="#c9a84c" strokeWidth="2" />
      {data.map((d, i) => <circle key={i} cx={xScale(i)} cy={yScale(d.revenue)} r="3" fill="#c9a84c"><title>{`${d.sale_date}: NT$ ${d.revenue.toLocaleString()}`}</title></circle>)}
      {data.map((d, i) => { const step = Math.max(1, Math.ceil(data.length / 8)); if (i % step !== 0 && i !== data.length-1) return null; return <text key={i} x={xScale(i)} y={H-10} fill="#8a8278" fontSize="9" textAnchor="middle">{d.sale_date.slice(5)}</text> })}
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
    return { path: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`, color: REGION_COLORS[d.region] || fallbackColor, label: getRegionLabel(d.region), val: d.revenue, pct: d.revenue / total }
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
            <span style={{ width: 10, height: 10, background: a.color, borderRadius: 2 }} />
            <span style={{ color: '#e7e5e4', flex: 1 }}>{a.label}</span>
            <span style={{ color: '#8a8278' }}>{(a.pct*100).toFixed(1)}%</span>
            <span style={{ color: '#e7e5e4', minWidth: 70, textAlign: 'right' }}>{fmtMoney(a.val)}</span>
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
              <span style={{ color: '#8a8278', minWidth: 18 }}>{i+1}.</span>
              <span style={{ color: '#e7e5e4', flex: 1 }}>{getLabel(it)}</span>
              {getSubtitle && <span style={{ color: '#8a8278', fontSize: 10 }}>{getSubtitle(it)}</span>}
              <span style={{ color: '#e7e5e4', minWidth: 80, textAlign: 'right' }}>{fmtMoney(v)}</span>
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
  const block = (title, items, color) => {
    const sumQty = items.reduce((s, p) => s + (p.qty || 0), 0)
    const sumRev = items.reduce((s, p) => s + (p.revenue || 0), 0)
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #2a2824' }}>
          <span style={{ width: 8, height: 8, background: color, borderRadius: 2 }} />
          <span style={{ color: '#e7e5e4', fontSize: 13, fontWeight: 500 }}>{title}</span>
          <span style={{ color: '#8a8278', fontSize: 11, marginLeft: 'auto' }}>{fmtInt(sumQty)} 根 · {fmtMoney(sumRev)}</span>
        </div>
        {items.length === 0 ? <div style={{ color: '#a8a29e', fontSize: 11 }}>區間內無資料</div>
          : <BarList items={items} getLabel={p => p.product_label || p.product_key} getValue={p => p.revenue} getSubtitle={p => `${p.qty} 根 · ${p.cnt} 筆`} getColor={() => color} />}
      </div>
    )
  }
  return <>{block(`Capadura 系列 (${capaduraItems.length})`, capaduraItems, CAT_COLORS.capadura)}{block(`古巴雪茄 (${cubanItems.length})`, cubanItems, CAT_COLORS.cuban)}</>
}

function ReplenishmentSuggestion({ replen, loading }) {
  if (loading) return <Card style={{ marginBottom: 12, padding: 14 }} className="no-print"><div style={{ color: '#8a8278' }}>載入中…</div></Card>
  if (!replen) return null
  const { lowItems, totalItems, lowCount, criticalCount, totalSuggestedQty } = replen
  const allGood = lowCount === 0
  const cell = { padding: '6px 8px', fontSize: 12, color: '#e7e5e4', borderBottom: '1px solid #1f1c19' }
  const head = { ...cell, color: '#8a8278', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500 }
  const downloadCSV = () => {
    const lines = [['補貨建議報表', new Date().toISOString().slice(0,10)], [], ['店家', '商品', '類別', '目前', '警戒', '目標', '建議補', '優先度']]
    lowItems.forEach(it => lines.push([it.venue_name, it.product_label, it.category === 'capadura' ? 'Capadura' : '古巴', it.current_qty, it.alert_threshold, it.target_quantity, it.suggested_qty, it.is_critical ? '緊急' : '低']))
    const csv = '\uFEFF' + lines.map(r => r.map(c => { const s = String(c == null ? '' : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `w-cigar-補貨建議_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <Card style={{ marginBottom: 12, padding: 14, borderColor: criticalCount > 0 ? '#7f1d1d' : (lowCount > 0 ? '#3a3024' : '#10b981') }} className="no-print">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Package size={14} color={lowCount > 0 ? '#dc2626' : '#10b981'} />
          補貨建議 <span style={{ fontSize: 10, color: '#8a8278', fontWeight: 400 }}>({totalItems} SKU · 警戒 {lowCount} · 緊急 {criticalCount})</span>
        </h3>
        {lowCount > 0 && <button onClick={downloadCSV} style={{ marginLeft: 'auto', background: '#1a1815', border: '1px solid #c9a84c', color: '#c9a84c', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Download size={11} /> 下載補貨單</button>}
      </div>
      {allGood ? <div style={{ background: '#0c1a0e', border: '1px solid #166534', color: '#86efac', fontSize: 12, padding: '10px 14px', borderRadius: 6 }}>✅ 目前所有店家庫存充足。員工 KEY 銷量後庫存自動扣，低於警戒線會出現在這。</div>
        : (
          <>
            <div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 8 }}>📦 共 {lowCount} 項需補貨，總計 <span style={{ color: '#c9a84c', fontWeight: 600 }}>{totalSuggestedQty} 根</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...head, textAlign: 'left' }}>店家</th><th style={{ ...head, textAlign: 'left' }}>商品</th><th style={{ ...head, textAlign: 'right' }}>目前</th><th style={{ ...head, textAlign: 'right' }}>警戒</th><th style={{ ...head, textAlign: 'right' }}>目標</th><th style={{ ...head, textAlign: 'right' }}>建議</th><th style={{ ...head, textAlign: 'center' }}>優先</th></tr></thead>
              <tbody>
                {lowItems.map((it, i) => (
                  <tr key={i} style={{ background: it.is_critical ? 'rgba(220,38,38,0.05)' : 'transparent' }}>
                    <td style={cell}>{it.venue_name}</td>
                    <td style={cell}><span style={{ display: 'inline-block', width: 6, height: 6, background: CAT_COLORS[it.category], borderRadius: 2, marginRight: 6 }} />{it.product_label}</td>
                    <td style={{ ...cell, textAlign: 'right', color: it.current_qty === 0 ? '#dc2626' : '#fca5a5' }}>{it.current_qty}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{it.alert_threshold}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{it.target_quantity}</td>
                    <td style={{ ...cell, textAlign: 'right', color: '#c9a84c', fontWeight: 600 }}>{it.suggested_qty}</td>
                    <td style={{ ...cell, textAlign: 'center', fontSize: 10 }}>
                      {it.is_critical ? <span style={{ background: '#7f1d1d', color: '#fca5a5', padding: '2px 6px', borderRadius: 4 }}>緊急</span> : <span style={{ background: '#3a3024', color: '#fbbf24', padding: '2px 6px', borderRadius: 4 }}>低</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
    </Card>
  )
}

// === 會計視角 ===
function AccountingView({ data, from, to, qoq, shipping }) {
  const calc = useMemo(() => {
    if (!data) return null
    const { kpi, byVenue, byAmbassador, byDate } = data
    const totalRev = Number(kpi.revenue) || 0
    const cogs = Number(kpi.cogs) || 0
    const grossProfit = totalRev - cogs
    const shipTotal = Number(shipping?.total) || 0
    const netProfit = grossProfit - shipTotal
    const grossMargin = totalRev > 0 ? grossProfit / totalRev : 0
    const netMargin = totalRev > 0 ? netProfit / totalRev : 0
    return { totalRev, cogs, grossProfit, netProfit, grossMargin, netMargin, shipTotal, byVenue, byAmbassador, kpi }
  }, [data, shipping])

  if (!calc) return <div style={{ color: '#8a8278', padding: 20 }}>無資料</div>

  const cell = { padding: '6px 8px', fontSize: 12, color: '#e7e5e4', borderBottom: '1px solid #1f1c19' }
  const head = { ...cell, color: '#8a8278', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500 }

  const downloadCSV = () => {
    const lines = []
    lines.push(['W Cigar 會計視角報表', from + ' ~ ' + to])
    lines.push([])
    lines.push(['損益快覽'])
    lines.push(['銷售總額', calc.totalRev], ['銷貨成本', calc.cogs], ['毛利', calc.grossProfit], ['毛利率', (calc.grossMargin*100).toFixed(2)+'%'])
    lines.push(['本期運費', calc.shipTotal], ['淨利', calc.netProfit], ['淨利率', (calc.netMargin*100).toFixed(2)+'%'])
    lines.push([])
    lines.push(['應收帳款 / 各店毛利'])
    lines.push(['店家', '地區', '筆數', '根數', '應收金額', '銷貨成本', '毛利', '毛利率'])
    calc.byVenue.forEach(v => lines.push([v.venue_name, getRegionLabel(v.region), v.cnt, v.qty || 0, v.revenue, v.cogs || 0, v.gross_profit || 0, ((v.gross_margin||0)*100).toFixed(1)+'%']))
    lines.push(['合計', '', calc.kpi.count, calc.kpi.qty, calc.totalRev, calc.cogs, calc.grossProfit, (calc.grossMargin*100).toFixed(1)+'%'])
    const csv = '\uFEFF' + lines.map(r => r.map(c => { const s = String(c == null ? '' : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `w-cigar-會計報表_${from}_${to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const unknownWarn = calc.kpi.qty_unknown_cost > 0 ? `⚠️ ${calc.kpi.unknown_products.join(', ')} 共 ${calc.kpi.qty_unknown_cost} 根尚未填成本` : null

  return (
    <Card style={{ marginBottom: 12, padding: 14, borderColor: '#3a3024', background: 'linear-gradient(180deg, #14110d 0%, #0a0a0a 100%)' }} className="accounting-view">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15, color: '#c9a84c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><Calculator size={16} /> 會計視角報表</h3>
        <span style={{ fontSize: 10, color: '#8a8278' }}>會計師專用 · 月結模式 · {from} ~ {to}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }} className="no-print">
          <button onClick={downloadCSV} style={{ background: '#1a1815', border: '1px solid #c9a84c', color: '#c9a84c', padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Download size={11} /> 下載 CSV</button>
          <button onClick={() => window.print()} style={{ background: '#1a1815', border: '1px solid #c9a84c', color: '#c9a84c', padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Printer size={11} /> 列印 / PDF</button>
        </div>
      </div>

      {unknownWarn && <div style={{ background: '#1a0c0c', border: '1px solid #7f1d1d', color: '#fca5a5', fontSize: 11, padding: '6px 10px', borderRadius: 6, marginBottom: 12 }}>{unknownWarn}</div>}

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#8a8278', marginBottom: 8, letterSpacing: 1 }}>1. 損益表 P&amp;L</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Kpi label="銷售總額" value={fmtMoney(calc.totalRev)} accent="#c9a84c" />
          <Kpi label="銷貨成本" value={fmtMoney(calc.cogs)} accent="#fca5a5" />
          <Kpi label="毛利" value={fmtMoney(calc.grossProfit)} accent="#10b981" />
          <Kpi label="毛利率" value={fmtPct(calc.grossMargin)} accent="#c9a84c" />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <Kpi label="本期運費" value={fmtMoney(calc.shipTotal)} accent="#fca5a5" />
          <Kpi label="淨利" value={fmtMoney(calc.netProfit)} accent={calc.netProfit >= 0 ? '#10b981' : '#dc2626'} />
          <Kpi label="淨利率" value={fmtPct(calc.netMargin)} />
        </div>
      </div>

      <QuarterComparison qoq={qoq} />

      <ShippingLogsManager logs={shipping?.logs || []} total={shipping?.total || 0} onAdd={shipping?.onAdd} onDelete={shipping?.onDelete} loading={shipping?.loading} />

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#8a8278', marginBottom: 8, letterSpacing: 1 }}>應收帳款 / 各店毛利明細</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ ...head, textAlign: 'left' }}>店家</th><th style={{ ...head, textAlign: 'left' }}>地區</th><th style={{ ...head, textAlign: 'right' }}>筆數</th><th style={{ ...head, textAlign: 'right' }}>根數</th><th style={{ ...head, textAlign: 'right' }}>應收</th><th style={{ ...head, textAlign: 'right' }}>成本</th><th style={{ ...head, textAlign: 'right' }}>毛利</th><th style={{ ...head, textAlign: 'right' }}>毛利率</th></tr></thead>
          <tbody>
            {calc.byVenue.map((v, i) => (
              <tr key={i}>
                <td style={cell}>{v.venue_name}</td>
                <td style={{ ...cell, color: REGION_COLORS[v.region] || fallbackColor }}>{getRegionLabel(v.region)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{v.cnt}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{v.qty || 0}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{fmtMoney(v.revenue)}</td>
                <td style={{ ...cell, textAlign: 'right', color: '#fca5a5' }}>{fmtMoney(v.cogs || 0)}</td>
                <td style={{ ...cell, textAlign: 'right', color: '#10b981' }}>{fmtMoney(v.gross_profit || 0)}</td>
                <td style={{ ...cell, textAlign: 'right', color: '#c9a84c' }}>{fmtPct(v.gross_margin || 0)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid #3a3024' }}>
              <td style={{ ...cell, fontWeight: 600, color: '#c9a84c' }}>合計</td>
              <td style={cell}>—</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{fmtInt(calc.kpi.count)}</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{fmtInt(calc.kpi.qty)}</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 600, color: '#c9a84c' }}>{fmtMoney(calc.totalRev)}</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 600, color: '#fca5a5' }}>{fmtMoney(calc.cogs)}</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 600, color: '#10b981' }}>{fmtMoney(calc.grossProfit)}</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{fmtPct(calc.grossMargin)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  )
}

const printStyle = `@media print { body { background: white !important; } .no-print { display: none !important; } .accounting-view { background: white !important; border: 1px solid #ccc !important; color: black !important; } .accounting-view * { color: black !important; } }`

export default function SalesReport() {
  const [from, setFrom] = useState('2026-04-01')
  const [to, setTo] = useState('2026-04-30')
  const [data, setData] = useState(null)
  const [replen, setReplen] = useState(null)
  const [daily, setDaily] = useState(null)
  const [qoq, setQoq] = useState(null)
  const [shippingLogs, setShippingLogs] = useState([])
  const [shippingTotal, setShippingTotal] = useState(0)
  const [shippingLoading, setShippingLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showAccounting, setShowAccounting] = useState(false)
  const [showReplen, setShowReplen] = useState(false)

  async function loadShipping() {
    setShippingLoading(true)
    try {
      const { logs, total } = await getShippingLogs(from, to)
      setShippingLogs(logs); setShippingTotal(total)
    } catch (e) { console.error(e) } finally { setShippingLoading(false) }
  }
  async function handleAddShipping(payload) {
    await addShippingLog({ ...payload, created_by_name: '老闆' })
    await loadShipping()
  }
  async function handleDeleteShipping(id) {
    await deleteShippingLog(id); await loadShipping()
  }

  async function load() {
    setLoading(true); setError(null)
    try {
      const [result, replenResult, dailyResult, qoqResult] = await Promise.all([
        getSalesReport(from, to),
        getReplenishmentSuggestions().catch(() => null),
        getDailyKPI().catch(() => null),
        getQuarterComparison().catch(() => null),
      ])
      setData(result); setReplen(replenResult); setDaily(dailyResult); setQoq(qoqResult)
      await loadShipping()
    } catch (e) {
      setError(e.message || String(e)); setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [])
  useEffect(() => { if (data !== null || error) load() /* eslint-disable-next-line */ }, [from, to])

  function applyPreset(preset) {
    const today = new Date()
    const yyyy = today.getFullYear(), mm = today.getMonth()
    let f, t
    if (preset === 'apr2026') { f = '2026-04-01'; t = '2026-04-30' }
    else if (preset === 'this-month') { f = `${yyyy}-${String(mm+1).padStart(2,'0')}-01`; t = `${yyyy}-${String(mm+1).padStart(2,'0')}-${String(lastDayOfMonth(yyyy, mm)).padStart(2,'0')}` }
    else if (preset === 'last-month') { const py = mm === 0 ? yyyy-1 : yyyy, pm = mm === 0 ? 11 : mm-1; f = `${py}-${String(pm+1).padStart(2,'0')}-01`; t = `${py}-${String(pm+1).padStart(2,'0')}-${String(lastDayOfMonth(py, pm)).padStart(2,'0')}` }
    else if (preset === 'ytd') { f = `${yyyy}-01-01`; t = todayStr() }
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
  const acctBtn = showAccounting ? { ...btnStyle, background: '#c9a84c', color: '#0a0a0a', border: '1px solid #c9a84c', fontWeight: 500 } : { ...btnStyle, border: '1px solid #c9a84c', color: '#c9a84c' }
  const replenLowCount = replen?.lowCount || 0
  const replenBtn = showReplen
    ? { ...btnStyle, background: replenLowCount > 0 ? '#dc2626' : '#10b981', color: '#fff', border: '1px solid transparent', fontWeight: 500 }
    : { ...btnStyle, border: '1px solid ' + (replenLowCount > 0 ? '#dc2626' : '#10b981'), color: replenLowCount > 0 ? '#dc2626' : '#10b981' }

  return (
    <PageShell title="銷售儀表板" subtitle="ADMIN · SALES REPORT">
      <style>{printStyle}</style>
      <Card style={{ marginBottom: 12, padding: 12 }} className="no-print">
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
          <button onClick={() => setShowAccounting(s => !s)} style={{ ...acctBtn, marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calculator size={12} /> 會計視角</button>
          <button onClick={() => setShowReplen(s => !s)} style={{ ...replenBtn, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Package size={12} /> 補貨建議{replenLowCount > 0 ? ` (${replenLowCount})` : ''}</button>
          <button onClick={load} disabled={loading} style={{ ...primaryBtn, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}><RefreshCw size={12} /> {loading ? '載入中…' : '重新整理'}</button>
        </div>
      </Card>

      {error && <Card style={{ marginBottom: 12, padding: 12, borderColor: '#7f1d1d', background: '#1a0c0c', color: '#fca5a5', fontSize: 12 }}>載入失敗：{error}</Card>}

      <TodayKPISection daily={daily} />
      {showReplen && <ReplenishmentSuggestion replen={replen} loading={loading} />}
      {showAccounting && <AccountingView data={data} from={from} to={to} qoq={qoq} shipping={{ logs: shippingLogs, total: shippingTotal, loading: shippingLoading, onAdd: handleAddShipping, onDelete: handleDeleteShipping }} />}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }} className="no-print">
        <Kpi label="總營收" value={fmtMoney(kpi.revenue)} />
        <Kpi label="總根數" value={fmtInt(kpi.qty)} unit="根" />
        <Kpi label="總單數" value={fmtInt(kpi.count)} unit="筆" />
        <Kpi label="活躍店家" value={fmtInt(kpi.venues)} unit="家" />
        <Kpi label="活躍大使" value={fmtInt(kpi.ambassadors)} unit="位" />
      </div>

      <Card style={{ marginBottom: 12, padding: 14 }} className="no-print">
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><TrendingUp size={14} color="#c9a84c" /> 每日營收趨勢</h3>
        <DailyLineChart data={byDate} />
      </Card>

      <Card style={{ marginBottom: 12, padding: 14 }} className="no-print">
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><BarChart3 size={14} color="#c9a84c" /> 各地區營收</h3>
        <RegionDonut data={byRegion} />
      </Card>

      <Card style={{ marginBottom: 12, padding: 14 }} className="no-print">
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Cigarette size={14} color="#c9a84c" /> 雪茄品項銷售排行</h3>
        <ProductRanking capaduraItems={byProductCapadura} cubanItems={byProductCuban} />
      </Card>

      <Card style={{ marginBottom: 12, padding: 14 }} className="no-print">
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Building2 size={14} color="#c9a84c" /> 店家排行 ({byVenue.length} 家)</h3>
        <BarList items={byVenue} getLabel={v => v.venue_name} getValue={v => v.revenue} getSubtitle={v => `${getRegionLabel(v.region)} · ${v.cnt} 筆 · 毛利 ${fmtMoney(v.gross_profit || 0)}`} getColor={v => REGION_COLORS[v.region] || fallbackColor} />
      </Card>

      <Card style={{ marginBottom: 12, padding: 14 }} className="no-print">
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#e7e5e4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Users size={14} color="#c9a84c" /> 雪茄大使排行榜 ({byAmbassador.length} 位)</h3>
        <BarList items={byAmbassador} getLabel={a => a.ambassador_name || a.ambassador_id} getValue={a => a.revenue} getSubtitle={a => `${a.qty || 0} 根 · ${a.cnt} 筆 · 客單 ${fmtMoney(Math.round(a.revenue / Math.max(a.cnt, 1)))}`} getColor={() => '#c9a84c'} />
      </Card>
    </PageShell>
  )
}
