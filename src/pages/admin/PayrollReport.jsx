// src/pages/admin/PayrollReport.jsx
// 月度薪資總表 — 老闆/會計視角
// 顯示每位大使月度：時數 / 卡帕 / 古巴 / 基本薪 / 車資 / 獎金 / 扣款 / 月薪總計
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Download, RefreshCw, ChevronDown, ChevronRight, Eye } from 'lucide-react'
import { listMonthlyPayroll, _reseedHistorical } from '../../lib/services/attendance'
import PageShell, { Card } from '../../components/PageShell'

export default function PayrollReport() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('2026-04')
  const [rows, setRows] = useState([])
  const [expanded, setExpanded] = useState(new Set())
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    setRows(listMonthlyPayroll(period))
    setLoading(false)
  }
  useEffect(() => { reload() }, [period])

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    hours: acc.hours + Number(r.total_hours || 0),
    capa: acc.capa + Number(r.capa_qty || 0),
    cuban: acc.cuban + Number(r.cuban_qty || 0),
    base: acc.base + Number(r.base_salary || 0),
    transport: acc.transport + Number(r.transport || 0),
    bonuses: acc.bonuses + Number(r.bonuses || 0),
    deductions: acc.deductions + Number(r.deductions || 0),
    total: acc.total + Number(r.total || 0),
  }), { hours: 0, capa: 0, cuban: 0, base: 0, transport: 0, bonuses: 0, deductions: 0, total: 0 }), [rows])

  function toggle(id) {
    setExpanded(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleResed() {
    if (!window.confirm('還原 4 月歷史薪資資料？已自填的會被覆蓋。')) return
    _reseedHistorical()
    reload()
  }

  return (
    <PageShell title="月度薪資總表" subtitle="ADMIN · PAYROLL REPORT">
      <Card style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8a8278' }}>
          <Calendar size={12} /> 期間
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            style={{ background: '#1a1714', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8', padding: '4px 8px', fontSize: 12 }} />
        </div>
        <button onClick={reload} style={ghostBtn()}><RefreshCw size={12} /> 重新整理</button>
        <button onClick={handleResed} style={ghostBtn('#f59e0b')}><RefreshCw size={12} /> 還原 4月歷史</button>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#8a8278' }}>共 {rows.length} 位大使</div>
      </Card>

      {/* KPI Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
        {kpi('總時數', `${totals.hours.toFixed(1)} h`, '#3b82f6')}
        {kpi('卡帕', `${totals.capa} 支`, '#a855f7')}
        {kpi('古巴', `${totals.cuban} 支`, '#f59e0b')}
        {kpi('基本薪資', `NT$ ${totals.base.toLocaleString()}`, '#e8e0d0')}
        {kpi('獎金', `NT$ ${totals.bonuses.toLocaleString()}`, '#10b981')}
        {kpi('扣款', `NT$ ${totals.deductions.toLocaleString()}`, totals.deductions < 0 ? '#ef4444' : '#6a655c')}
        {kpi('月薪總計', `NT$ ${totals.total.toLocaleString()}`, '#c9a84c')}
      </div>

      {loading ? (
        <Card>載入中…</Card>
      ) : rows.length === 0 ? (
        <Card style={{ textAlign: 'center', color: '#6a655c', padding: 30 }}>
          {period} 暫無薪資資料
        </Card>
      ) : (
        <div style={{ background: '#15110f', border: '1px solid #2a2520', borderRadius: 10, padding: 8, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 800 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2520' }}>
                <th style={th('left', 90)}>大使</th>
                <th style={th('center', 60)}>時薪</th>
                <th style={th('center', 60)}>時數</th>
                <th style={th('center', 50)}>卡帕</th>
                <th style={th('center', 50)}>古巴</th>
                <th style={th('right', 90)}>基本薪</th>
                <th style={th('right', 70)}>車資</th>
                <th style={th('right', 80)}>獎金</th>
                <th style={th('right', 80)}>扣款</th>
                <th style={th('right', 100)}>月薪總計</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isExp = expanded.has(r.ambassador_id)
                return (
                  <PayRow key={r.ambassador_id} row={r} expanded={isExp} onToggle={() => toggle(r.ambassador_id)} />
                )
              })}
              <tr style={{ borderTop: '2px solid #c9a84c', background: 'rgba(201,168,76,0.05)' }}>
                <td style={td('left', '#c9a84c', 13, 600)}>合計（{rows.length} 位）</td>
                <td></td>
                <td style={td('center', '#3b82f6', 12, 500)}>{totals.hours.toFixed(1)}</td>
                <td style={td('center', '#a855f7', 12, 500)}>{totals.capa}</td>
                <td style={td('center', '#f59e0b', 12, 500)}>{totals.cuban}</td>
                <td style={td('right', '#e8e0d0', 12, 500)}>NT$ {totals.base.toLocaleString()}</td>
                <td style={td('right', '#e8e0d0', 12, 500)}>NT$ {totals.transport.toLocaleString()}</td>
                <td style={td('right', '#10b981', 12, 500)}>NT$ {totals.bonuses.toLocaleString()}</td>
                <td style={td('right', totals.deductions < 0 ? '#ef4444' : '#6a655c', 12, 500)}>NT$ {totals.deductions.toLocaleString()}</td>
                <td style={td('right', '#c9a84c', 14, 700)}>NT$ {totals.total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 12, padding: 10, background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, fontSize: 11, color: '#8a8278', lineHeight: 1.6 }}>
        <span style={{ color: '#c9a84c', fontWeight: 500 }}>提示：</span>
        4 月資料為從 Excel 歷史檔匯入（標 <span style={{ color: '#3b82f6' }}>📊 Excel</span>）。5 月起員工每天填「時數」即自動匯總；月薪 = Σ(時薪×時數) + 車資 + 獎金 − 扣款。點任一行展開看獎金/扣款明細。
      </div>
    </PageShell>
  )
}

function PayRow({ row, expanded, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} style={{ borderBottom: '1px solid #1a1714', cursor: 'pointer' }}>
        <td style={td('left', '#e8dcc8', 13, 500)}>
          {expanded ? <ChevronDown size={11} style={{ verticalAlign: 'middle' }} /> : <ChevronRight size={11} style={{ verticalAlign: 'middle' }} />}
          {' '}{row.name}
          {row.is_seeded && <span style={{ marginLeft: 4, fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#3b82f622', color: '#3b82f6' }}>📊 Excel</span>}
        </td>
        <td style={td('center', '#c9a84c', 12)}>NT${row.hourly_rate}</td>
        <td style={td('center', '#3b82f6', 12, 500)}>{Number(row.total_hours || 0).toFixed(1)}</td>
        <td style={td('center', '#a855f7', 12)}>{row.capa_qty || 0}</td>
        <td style={td('center', '#f59e0b', 12)}>{row.cuban_qty || 0}</td>
        <td style={td('right', '#e8e0d0', 12)}>{(row.base_salary || 0).toLocaleString()}</td>
        <td style={td('right', '#e8e0d0', 12)}>{(row.transport || 0).toLocaleString()}</td>
        <td style={td('right', '#10b981', 12)}>{(row.bonuses || 0).toLocaleString()}</td>
        <td style={td('right', row.deductions < 0 ? '#ef4444' : '#6a655c', 12)}>{(row.deductions || 0).toLocaleString()}</td>
        <td style={td('right', '#c9a84c', 13, 700)}>{(row.total || 0).toLocaleString()}</td>
      </tr>
      {expanded && (
        <tr style={{ background: '#1a1714' }}>
          <td colSpan={10} style={{ padding: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 11 }}>
              <div>
                <div style={{ color: '#10b981', fontWeight: 500, marginBottom: 6 }}>獎金明細</div>
                {(row.bonuses_detail || []).length > 0 ? row.bonuses_detail.map((b, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #0a0a0a' }}>
                    <span style={{ color: '#e8dcc8' }}>{b.name}</span>
                    <span style={{ float: 'right', color: '#10b981', fontFamily: 'monospace' }}>+NT$ {Number(b.amount || 0).toLocaleString()}</span>
                  </div>
                )) : <span style={{ color: '#5a554e' }}>無</span>}
              </div>
              <div>
                <div style={{ color: '#ef4444', fontWeight: 500, marginBottom: 6 }}>扣款明細</div>
                {(row.deductions_detail || []).length > 0 ? row.deductions_detail.map((d, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #0a0a0a' }}>
                    <span style={{ color: '#e8dcc8' }}>{d.name}</span>
                    <span style={{ float: 'right', color: '#ef4444', fontFamily: 'monospace' }}>NT$ {Number(d.amount || 0).toLocaleString()}</span>
                  </div>
                )) : <span style={{ color: '#5a554e' }}>無</span>}
              </div>
            </div>
            {row.leave_days > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#f59e0b' }}>
                請假 {row.leave_days} 天
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function kpi(label, value, color) {
  return (
    <div style={{ background: '#1a1714', border: `1px solid ${color}33`, borderRadius: 8, padding: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 500, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}
function th(align, w) {
  return { textAlign: align, padding: '8px 4px', color: '#8a8278', fontWeight: 500, fontSize: 11, letterSpacing: 1, ...(w ? { width: w } : {}) }
}
function td(align, color, size, weight) {
  return { textAlign: align, padding: '8px 4px', color: color || '#e8dcc8', fontSize: size || 12, fontWeight: weight || 400, fontFamily: align === 'right' ? 'monospace' : 'inherit' }
}
function ghostBtn(color) {
  return {
    padding: '6px 10px', background: 'transparent',
    border: `1px solid ${color || '#2a2520'}`, borderRadius: 6,
    color: color || '#8a8278', fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }
}
