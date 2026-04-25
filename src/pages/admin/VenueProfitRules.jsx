// src/pages/admin/VenueProfitRules.jsx
// 場域定價矩陣 — 取代 % 分潤模型。每店每品 4 個值：售價/成本/場域抽/公司毛利
// 進貨成本（cost_price）只 boss role 可看可編，其他 role 顯示 ***
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Save, Lock, Calculator, AlertTriangle, EyeOff } from 'lucide-react'
import { listVenues } from '../../lib/services/venues'
import { getVenueSalesMatrixTemplate } from '../../lib/services/venueSales'
import {
  buildPricingMatrix, upsertVenuePricing, bulkSetVenuePricing, canSeeCostPrice,
} from '../../lib/services/venueProfitRules'
import PageShell, { Card } from '../../components/PageShell'

export default function VenueProfitRules() {
  const navigate = useNavigate()
  const [venues, setVenues] = useState([])
  const [tplMap, setTplMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)
  const [filter, setFilter] = useState({ q: '', region: 'all', onlyConfigured: false })

  const session = (() => {
    try { return JSON.parse(localStorage.getItem('w_cigar_user') || '{}') } catch { return {} }
  })()
  const seeCost = canSeeCostPrice(session)
  const actor = { id: session.id || 'unknown', name: session.name || '員工', is_admin: !!session.is_admin, role: session.role }

  async function reload() {
    setLoading(true)
    const vs = await listVenues()
    const map = {}
    for (const r of ['taipei', 'taichung']) {
      const tpl = await getVenueSalesMatrixTemplate(r)
      tpl.venues.forEach(v => { map[v.id] = v })
    }
    setTplMap(map)
    setVenues(vs)
    setLoading(false)
  }
  useEffect(() => { reload() }, [refreshTick])

  const matrix = useMemo(() => {
    if (venues.length === 0) return []
    return buildPricingMatrix(venues, tplMap, session)
  }, [venues, tplMap, session, refreshTick])

  const filtered = useMemo(() => matrix.filter(v => {
    if (filter.region !== 'all' && v.region !== filter.region) return false
    if (filter.q.trim()) {
      const q = filter.q.trim().toLowerCase()
      if (!v.venue_name.toLowerCase().includes(q)) return false
    }
    return true
  }), [matrix, filter])

  const stats = useMemo(() => {
    let total = 0, set = 0
    matrix.forEach(v => { total += v.product_count; set += v.set_count })
    return { venues: matrix.length, total, set, unset: total - set }
  }, [matrix])

  function handleEdit(venueId, productKey, field, value) {
    const num = Math.max(0, parseInt(value, 10) || 0)
    upsertVenuePricing(venueId, productKey, { [field]: num }, actor)
    setRefreshTick(t => t + 1)
  }

  return (
    <PageShell title="場域定價" subtitle="ADMIN · VENUE PRICING">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {kpi('店家總數', stats.venues, '#e8e0d0')}
        {kpi('SKU 總數', stats.total, '#3b82f6')}
        {kpi('已設定', stats.set, '#10b981')}
        {kpi('未設定', stats.unset, '#f59e0b')}
      </div>

      {!seeCost && (
        <Card style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid #f59e0b', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lock size={13} /> 你目前以「{session.role || 'staff'}」身份登入 — 進貨成本欄位不可見（顯示 ***），公司毛利也已隱藏
          </div>
        </Card>
      )}

      <Card style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 200px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#6a655c' }} />
          <input value={filter.q} onChange={e => setFilter(f => ({ ...f, q: e.target.value }))}
            placeholder="搜尋店家"
            style={inputStyle({ paddingLeft: 30 })} />
        </div>
        <select value={filter.region} onChange={e => setFilter(f => ({ ...f, region: e.target.value }))} style={inputStyle({ width: 'auto' })}>
          <option value="all">全部地區</option>
          <option value="taipei">台北</option>
          <option value="taichung">台中</option>
        </select>
      </Card>

      <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 8, padding: '0 4px', lineHeight: 1.6 }}>
        每店每品 1 筆定價：售價 / 進貨成本 / 場域抽（每根給酒店）/ 公司毛利（自動算）。<br />
        改完即時儲存到 localStorage。月結算用此資料 × 銷量 → 算公司毛利、場域應付。
      </div>

      {loading ? (
        <Card>載入中…</Card>
      ) : filtered.length === 0 ? (
        <Card style={{ textAlign: 'center', color: '#6a655c', padding: 30 }}>沒有符合條件的店家</Card>
      ) : (
        filtered.map(v => (
          <VenuePricingCard key={v.venue_id} venue={v} seeCost={seeCost} onEdit={handleEdit} />
        ))
      )}
    </PageShell>
  )
}

function kpi(label, value, color) {
  return (
    <div style={{ flex: 1, minWidth: 90, padding: 10, background: '#1a1714', border: `1px solid ${color}44`, borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: color, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function VenuePricingCard({ venue, seeCost, onEdit }) {
  const totalProductsConfigured = venue.set_count
  const borderColor =
    totalProductsConfigured === 0 ? '#f59e0b' :
    totalProductsConfigured < venue.product_count ? '#3b82f6' : '#10b981'

  return (
    <div style={{ background: '#15110f', border: '1px solid #2a2520', borderRadius: 10, padding: 12, marginBottom: 8, borderLeft: `3px solid ${borderColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#e8e0d0' }}>{venue.venue_name}</span>
          <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: venue.region === 'taipei' ? '#3b82f622' : '#a855f722', color: venue.region === 'taipei' ? '#3b82f6' : '#a855f7' }}>
            {venue.region === 'taipei' ? '台北' : '台中'}
          </span>
          <span style={{ marginLeft: 6, fontSize: 11, color: '#8a8278' }}>
            已設 {venue.set_count} / {venue.product_count}
          </span>
          {venue.has_self_sale && (
            <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f9731622', color: '#f97316' }}>
              店家自賣
            </span>
          )}
        </div>
        {seeCost && venue.set_count > 0 && (
          <div style={{ fontSize: 11, color: '#10b981' }}>
            單根毛利合計 NT$ {Math.round(venue.sum_profit_per_unit).toLocaleString()}
          </div>
        )}
      </div>

      {venue.rows.length === 0 ? (
        <div style={{ fontSize: 11, color: '#5a554e', textAlign: 'center', padding: 12 }}>無商品（請至「店家管理」綁定商品）</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2520' }}>
                <th style={th('left')}>商品</th>
                <th style={th('center', 60)}>類別</th>
                <th style={th('center', 75)}>售價</th>
                <th style={th('center', 75)}>{seeCost ? '進貨成本' : <span style={{ color: '#5a554e' }}><EyeOff size={10} style={{ verticalAlign: 'middle' }} /> 成本</span>}</th>
                <th style={th('center', 75)} title="大使賣時，每根給酒店多少">場域抽（大使）</th>
                {venue.has_self_sale && <th style={th('center', 80)} title="店家少爺自賣時，每根給酒店多少（通常較高）">場域抽（自賣）</th>}
                {seeCost && <th style={th('center', 75)} title="公司毛利（大使賣）">公司毛利</th>}
                {seeCost && venue.has_self_sale && <th style={th('center', 80)} title="公司毛利（店家自賣）">毛利（自賣）</th>}
                {seeCost && <th style={th('center', 50)}>毛利率</th>}
              </tr>
            </thead>
            <tbody>
              {venue.rows.map(r => (
                <PricingRow key={r.product_key} row={r} seeCost={seeCost} onEdit={onEdit} venueId={venue.venue_id} hasSelfSale={venue.has_self_sale} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PricingRow({ row, seeCost, onEdit, venueId, hasSelfSale }) {
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')

  function startEdit(field, current) {
    if (field === 'cost_price' && !seeCost) return
    setDraft(String(current || 0))
    setEditing(field)
  }
  function commit() {
    if (editing) onEdit(venueId, row.product_key, editing, draft)
    setEditing(null)
  }

  const isCuban = row.category === 'cuban_cigar'

  return (
    <tr style={{ borderBottom: '1px solid #1a1714' }}>
      <td style={td('left')}>
        {row.product_name}
        {row.note && <div style={{ fontSize: 9, color: '#5a554e' }}>{row.note}</div>}
      </td>
      <td style={td('center')}>
        <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4,
          background: isCuban ? '#a855f722' : '#3b82f622',
          color:      isCuban ? '#a855f7'   : '#3b82f6',
        }}>
          {isCuban ? '古巴' : '非古巴'}
        </span>
      </td>
      <td style={td('center')}>
        <Editable editing={editing === 'sale_price'} draft={draft} setDraft={setDraft}
          onStart={() => startEdit('sale_price', row.sale_price)} onCommit={commit}
          value={row.sale_price} configured={row.configured} color="#e8dcc8" />
      </td>
      <td style={td('center')}>
        {seeCost ? (
          <Editable editing={editing === 'cost_price'} draft={draft} setDraft={setDraft}
            onStart={() => startEdit('cost_price', row.cost_price)} onCommit={commit}
            value={row.cost_price} configured={row.configured && row.cost_price > 0} color="#ef4444" />
        ) : (
          <span style={{ color: '#5a554e', fontSize: 12, fontFamily: 'monospace' }}>***</span>
        )}
      </td>
      <td style={td('center')}>
        <Editable editing={editing === 'venue_share_per_unit'} draft={draft} setDraft={setDraft}
          onStart={() => startEdit('venue_share_per_unit', row.venue_share_per_unit)} onCommit={commit}
          value={row.venue_share_per_unit} configured={row.configured} color="#a855f7" />
      </td>
      {hasSelfSale && (
        <td style={td('center')}>
          <Editable editing={editing === 'venue_share_self_per_unit'} draft={draft} setDraft={setDraft}
            onStart={() => startEdit('venue_share_self_per_unit', row.venue_share_self_per_unit)} onCommit={commit}
            value={row.venue_share_self_per_unit} configured={row.configured && row.venue_share_self_per_unit > 0} color="#f97316" />
        </td>
      )}
      {seeCost && (
        <td style={{ ...td('center'), color: row.company_profit_per_unit > 0 ? '#10b981' : '#5a554e', fontWeight: 500 }}>
          {row.configured ? `${row.company_profit_per_unit.toLocaleString()}` : '—'}
        </td>
      )}
      {seeCost && hasSelfSale && (
        <td style={{ ...td('center'), color: row.company_profit_self_per_unit > 0 ? '#f97316' : '#5a554e', fontWeight: 500 }}>
          {row.configured ? `${row.company_profit_self_per_unit.toLocaleString()}` : '—'}
        </td>
      )}
      {seeCost && (
        <td style={{ ...td('center'), color: '#8a8278', fontSize: 11 }}>
          {row.configured && row.sale_price > 0 ? `${(row.margin_rate * 100).toFixed(0)}%` : '—'}
        </td>
      )}
    </tr>
  )
}

function Editable({ editing, draft, setDraft, onStart, onCommit, value, configured, color }) {
  if (editing) {
    return (
      <input type="number" min="0" value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={onCommit}
        onKeyDown={e => { if (e.key === 'Enter') onCommit() }}
        autoFocus
        style={{ width: '100%', padding: '4px 6px', background: '#0a0a0a', border: `1px solid ${color}`, borderRadius: 4, color, fontSize: 12, textAlign: 'center', outline: 'none' }} />
    )
  }
  return (
    <button onClick={onStart} style={{
      background: 'transparent', border: '1px dashed ' + (configured ? color + '66' : '#2a2520'),
      borderRadius: 4, color: configured ? color : '#5a554e', fontSize: 12,
      padding: '4px 8px', cursor: 'pointer', minWidth: 60, fontFamily: 'monospace',
    }}>
      {configured ? value.toLocaleString() : '—'}
    </button>
  )
}

function th(align, w) {
  return { textAlign: align, padding: '6px 4px', color: '#8a8278', fontWeight: 500, fontSize: 11, ...(w ? { width: w } : {}) }
}
function td(align) {
  return { textAlign: align, padding: '4px', color: '#e8dcc8' }
}
function inputStyle(extra = {}) {
  return {
    width: '100%', padding: '8px 10px', background: '#1a1714',
    border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8',
    fontSize: 13, outline: 'none', boxSizing: 'border-box', ...extra,
  }
}
