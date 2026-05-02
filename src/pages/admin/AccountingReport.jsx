// src/pages/admin/AccountingReport.jsx
// 會計總表 — 月度公司損益 + 大使貢獻 + 每店業績
// URL: /admin/accounting-report
//
// 核心 KPI（公司視角）：
//   總營業額 = Σ (銷量 × 售價)
//   進貨成本 = Σ (銷量 × cost_price)            — 只 boss 看得到
//   場域應付 = Σ (銷量 × venue_share_per_unit)
//   大使薪資 = 從 attendance 服務取月度匯總
//   公司毛利 = 總營業額 − 進貨成本 − 場域應付 − 大使薪資
//   毛利率   = 公司毛利 / 總營業額
//
// MVP：4 月用 Excel seed 數據估算（capa_qty × 1000 + cuban_qty × 2000）
// 5 月起自動從 sales 聚合
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, RefreshCw, ChevronDown, ChevronRight, Eye, EyeOff, TrendingUp, Building2, Users } from 'lucide-react'
import { listMonthlyPayroll } from '../../lib/services/attendance'
import PageShell, { Card } from '../../components/PageShell'

// 假設平均單價（4 月 Excel 沒拆每店每品，先估算）
const AVG_CAPA_PRICE = 1000     // 非古巴卡帕平均售價
const AVG_CUBAN_PRICE = 2300    // 古巴雪茄平均售價
const AVG_COST_RATE = 0.45      // 平均成本率（成本 / 售價）
const AVG_VENUE_SHARE_RATE = 0.18  // 平均場域抽成率

export default function AccountingReport() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('2026-04')
  const [payrollRows, setPayrollRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCost, setShowCost] = useState(true)  // boss 控制是否顯示成本

  function reload() {
    setLoading(true)
    setPayrollRows(listMonthlyPayroll(period))
    setLoading(false)
  }
  useEffect(() => { reload() }, [period])

  const session = (() => {
    try { return JSON.parse(localStorage.getItem('w_cigar_user') || '{}') } catch { return {} }
  })()
  const isBoss = !!session.is_admin || (session.role || '').toLowerCase() === 'boss'

  const summary = useMemo(() => {
    let revenue = 0, totalCost = 0, totalVenueShare = 0, totalSalary = 0, capa = 0, cuban = 0
    payrollRows.forEach(r => {
      const c = Number(r.capa_qty) || 0
      const cu = Number(r.cuban_qty) || 0
      const r1 = c * AVG_CAPA_PRICE + cu * AVG_CUBAN_PRICE
      capa += c
      cuban += cu
      revenue += r1
      totalCost += Math.round(r1 * AVG_COST_RATE)
      totalVenueShare += Math.round(r1 * AVG_VENUE_SHARE_RATE)
      totalSalary += Number(r.total) || 0
    })
    const grossProfit = revenue - totalCost - totalVenueShare - totalSalary
    const marginRate = revenue > 0 ? (grossProfit / revenue) : 0
    return {
      capa, cuban, total_qty: capa + cuban,
      revenue, total_cost: totalCost, venue_share: totalVenueShare,
      ambassador_salary: totalSalary, gross_profit: grossProfit, margin_rate: marginRate,
    }
  }, [payrollRows])

  // 大使銷售貢獻表：每位大使的卡帕/古巴/估算營業額/估算毛利
  const ambassadorContribs = useMemo(() => {
    return payrollRows.map(r => {
      const c = Number(r.capa_qty) || 0
      const cu = Number(r.cuban_qty) || 0
      const rev = c * AVG_CAPA_PRICE + cu * AVG_CUBAN_PRICE
      const cost = Math.round(rev * AVG_COST_RATE)
      const share = Math.round(rev * AVG_VENUE_SHARE_RATE)
      const salary = Number(r.total) || 0
      const profit = rev - cost - share - salary
      return {
        name: r.name,
        capa: c, cuban: cu, total_qty: c + cu,
        revenue: rev, cost, venue_share: share,
        salary, profit,
        margin: rev > 0 ? (profit / rev) : 0,
      }
    }).sort((a, b) => b.revenue - a.revenue)
  }, [payrollRows])

  return (
    <PageShell title="會計總表" subtitle="ADMIN · ACCOUNTING REPORT" backTo="/admin/venue-hub" backLabel="酒店銷售管理">
      <Card style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8a8278' }}>
          <Calendar size={12} /> 期間
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            style={{ background: '#1a1714', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8', padding: '4px 8px', fontSize: 12 }} />
        </div>
        <button onClick={reload} style={ghostBtn()}><RefreshCw size={12} /> 重新整理</button>
        {isBoss && (
          <button onClick={() => setShowCost(s => !s)} style={ghostBtn(showCost ? '#10b981' : '#6a655c')}>
            {showCost ? <Eye size={12} /> : <EyeOff size={12} />} {showCost ? '顯示' : '隱藏'}成本/毛利
          </button>
        )}
        <button onClick={() => navigate('/admin/payroll-report')} style={ghostBtn('#22c55e')}>
          薪資明細 →
        </button>
      </Card>

      {!isBoss && (
        <Card style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid #f59e0b', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#f59e0b' }}>
            ⚠ 你目前以「{session.role || 'staff'}」身份登入 — 進貨成本與公司毛利欄位不可見
          </div>
        </Card>
      )}

      {/* 公司損益 KPI */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#c9a84c', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <TrendingUp size={14} /> {period} 公司損益
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {kpi('總營業額', `NT$ ${summary.revenue.toLocaleString()}`, '#e8e0d0')}
          {kpi('銷售根數', `${summary.total_qty} 支`, '#3b82f6', `卡帕 ${summary.capa} / 古巴 ${summary.cuban}`)}
          {isBoss && showCost && kpi('進貨成本', `NT$ ${summary.total_cost.toLocaleString()}`, '#ef4444', '估算')}
          {kpi('場域應付', `NT$ ${summary.venue_share.toLocaleString()}`, '#a855f7', '估算')}
          {kpi('大使薪資', `NT$ ${summary.ambassador_salary.toLocaleString()}`, '#f59e0b', '已知')}
          {isBoss && showCost && kpi('公司毛利', `NT$ ${summary.gross_profit.toLocaleString()}`, summary.gross_profit >= 0 ? '#10b981' : '#ef4444')}
          {isBoss && showCost && kpi('毛利率', `${(summary.margin_rate * 100).toFixed(1)}%`, summary.margin_rate >= 0.2 ? '#10b981' : '#f59e0b')}
        </div>
      </div>

      {/* 大使貢獻 */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#c9a84c', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={14} /> 大使銷售貢獻（{period}）
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2520' }}>
                <th style={th('left', 80)}>大使</th>
                <th style={th('center', 50)}>卡帕</th>
                <th style={th('center', 50)}>古巴</th>
                <th style={th('center', 50)}>合計</th>
                <th style={th('right', 90)}>估營業額</th>
                {isBoss && showCost && <th style={th('right', 80)}>估成本</th>}
                <th style={th('right', 80)}>場域應付</th>
                <th style={th('right', 90)}>實付薪資</th>
                {isBoss && showCost && <th style={th('right', 90)}>公司毛利</th>}
                {isBoss && showCost && <th style={th('center', 50)}>毛利率</th>}
              </tr>
            </thead>
            <tbody>
              {ambassadorContribs.map((a, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #1a1714' }}>
                  <td style={td('left', '#e8dcc8', 13, 500)}>{a.name}</td>
                  <td style={td('center', '#3b82f6')}>{a.capa}</td>
                  <td style={td('center', '#a855f7')}>{a.cuban}</td>
                  <td style={td('center', '#c9a84c', 12, 500)}>{a.total_qty}</td>
                  <td style={td('right', '#e8e0d0', 12, 500)}>{a.revenue.toLocaleString()}</td>
                  {isBoss && showCost && <td style={td('right', '#ef4444')}>{a.cost.toLocaleString()}</td>}
                  <td style={td('right', '#a855f7')}>{a.venue_share.toLocaleString()}</td>
                  <td style={td('right', '#f59e0b')}>{a.salary.toLocaleString()}</td>
                  {isBoss && showCost && <td style={td('right', a.profit >= 0 ? '#10b981' : '#ef4444', 12, 500)}>{a.profit.toLocaleString()}</td>}
                  {isBoss && showCost && <td style={td('center', a.margin >= 0.2 ? '#10b981' : '#f59e0b', 11)}>{(a.margin * 100).toFixed(0)}%</td>}
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #c9a84c', background: 'rgba(201,168,76,0.05)' }}>
                <td style={td('left', '#c9a84c', 13, 600)}>合計</td>
                <td style={td('center', '#3b82f6', 12, 500)}>{summary.capa}</td>
                <td style={td('center', '#a855f7', 12, 500)}>{summary.cuban}</td>
                <td style={td('center', '#c9a84c', 12, 600)}>{summary.total_qty}</td>
                <td style={td('right', '#e8e0d0', 12, 600)}>{summary.revenue.toLocaleString()}</td>
                {isBoss && showCost && <td style={td('right', '#ef4444', 12, 500)}>{summary.total_cost.toLocaleString()}</td>}
                <td style={td('right', '#a855f7', 12, 500)}>{summary.venue_share.toLocaleString()}</td>
                <td style={td('right', '#f59e0b', 12, 500)}>{summary.ambassador_salary.toLocaleString()}</td>
                {isBoss && showCost && <td style={td('right', summary.gross_profit >= 0 ? '#10b981' : '#ef4444', 13, 700)}>{summary.gross_profit.toLocaleString()}</td>}
                {isBoss && showCost && <td style={td('center', '#c9a84c', 12, 600)}>{(summary.margin_rate * 100).toFixed(0)}%</td>}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* 27 家店業績 placeholder */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#c9a84c', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Building2 size={14} /> 各店業績（{period}）
        </div>
        <div style={{ background: '#1a1714', borderLeft: '3px solid #f59e0b', padding: 12, fontSize: 12, color: '#f59e0b', lineHeight: 1.6 }}>
          📌 4 月歷史資料未拆分到每家店（Excel 只記大使視角），各店業績從 5 月起自動聚合。<br />
          <span style={{ color: '#8a8278' }}>5 月起，每天員工 KEY-in 銷量 → 系統自動按店家分組 → 這裡顯示完整 27 店業績、毛利、毛利率排行</span>
        </div>
      </Card>

      <div style={{ marginTop: 12, padding: 10, background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, fontSize: 11, color: '#8a8278', lineHeight: 1.6 }}>
        <span style={{ color: '#c9a84c', fontWeight: 500 }}>計算公式（4 月為估算值）：</span><br />
        · 估營業額 = 卡帕 × NT$ {AVG_CAPA_PRICE.toLocaleString()} + 古巴 × NT$ {AVG_CUBAN_PRICE.toLocaleString()}<br />
        · 估成本 = 營業額 × {(AVG_COST_RATE * 100).toFixed(0)}%（業界平均成本率）<br />
        · 場域應付 = 營業額 × {(AVG_VENUE_SHARE_RATE * 100).toFixed(0)}%（平均抽成率）<br />
        · 公司毛利 = 營業額 − 成本 − 場域應付 − 大使薪資（含獎金扣款）<br />
        5 月起每筆 KEY-in 用實際售價/成本/抽成計算 → 完全精準，不再估算
      </div>
    </PageShell>
  )
}

function kpi(label, value, color, sub) {
  return (
    <div style={{ background: '#1a1714', border: `1px solid ${color}33`, borderRadius: 8, padding: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 500, color, marginTop: 2, fontFamily: 'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: '#5a554e', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
function th(align, w) {
  return { textAlign: align, padding: '8px 4px', color: '#8a8278', fontWeight: 500, fontSize: 11, letterSpacing: 1, ...(w ? { width: w } : {}) }
}
function td(align, color, size, weight) {
  return { textAlign: align, padding: '8px 4px', color: color || '#e8dcc8', fontSize: size || 12, fontWeight: weight || 400, fontFamily: align === 'right' || align === 'center' ? 'monospace' : 'inherit' }
}
function ghostBtn(color) {
  return {
    padding: '6px 10px', background: 'transparent',
    border: `1px solid ${color || '#2a2520'}`, borderRadius: 6,
    color: color || '#8a8278', fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }
}
