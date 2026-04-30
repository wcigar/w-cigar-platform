// src/pages/admin/InventoryMatrix.jsx
// 庫存管理矩陣頁。每店一張卡，內含商品 grid，紅黃綠狀態 + inline 編輯閾值/上限。
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Zap, Settings, AlertTriangle } from 'lucide-react'
import { listVenues, upsertVenue, REGION_OPTIONS as REGIONS } from '../../lib/services/venues'
import {
  buildInventoryMatrix, upsertInventoryEntry, sortByDisplayOrder,
} from '../../lib/services/inventory'
import { createRunFromAlerts } from '../../lib/services/replenishment'
import PageShell, { Card } from '../../components/PageShell'

const REGION_COLOR = {
  taipei: '#3b82f6', taoyuan: '#10b981', hsinchu: '#06b6d4',
  taichung: '#a855f7', tainan: '#f97316', kaohsiung: '#ef4444',
}

export default function InventoryMatrix() {
  const navigate = useNavigate()
  const [venues, setVenues] = useState([])
  const [matrix, setMatrix] = useState([])
  const [filter, setFilter] = useState({ region: 'all', q: '', alertOnly: false })
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)
  const [generating, setGenerating] = useState(false)

  async function reload() {
    setLoading(true)
    const vs = await listVenues()
    const m = await buildInventoryMatrix()
    setVenues(vs)
    setMatrix(m)
    setLoading(false)
  }
  useEffect(() => { reload() }, [refreshTick])

  const filtered = useMemo(() => {
    return matrix.filter(v => {
      if (filter.region !== 'all' && v.region !== filter.region) return false
      if (filter.alertOnly && v.alert_count === 0) return false
      if (filter.q.trim()) {
        const q = filter.q.trim().toLowerCase()
        if (!v.venue_name.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [matrix, filter])

  const stats = useMemo(() => {
    let red = 0, yellow = 0, total = 0, reorderTotal = 0
    matrix.forEach(v => {
      v.rows.forEach(r => {
        total++
        if (r.status === 'red') red++
        else if (r.status === 'yellow') yellow++
      })
      reorderTotal += v.reorder_total_amount || 0
    })
    return {
      venue_total: matrix.length,
      sku_total: total,
      red,
      yellow,
      reorder_total: reorderTotal,
    }
  }, [matrix])

  const alertItems = useMemo(() => sortByDisplayOrder(matrix.flatMap(v => v.rows
    .filter(r => r.status === 'red' || r.status === 'yellow')
    .map(r => ({
      venue_id: v.venue_id, venue_name: v.venue_name, region: v.region,
      product_key: r.product_key, product_name: r.product_name,
      product_price: r.product_price,
      current_qty: r.current_qty, alert_threshold: r.alert_threshold,
      target_quantity: r.target_quantity,
      suggested_qty: Math.max(0, r.target_quantity - r.current_qty),
      status: r.status,
    }))
  )), [matrix])

  async function handleGenerateRun() {
    if (alertItems.length === 0) {
      alert('沒有警示項目，無需建單')
      return
    }
    if (!window.confirm(`將為 ${stats.red + stats.yellow} 個警示項目（${new Set(alertItems.map(a => a.venue_id)).size} 家店）一鍵建立補貨單，確定？`)) return
    setGenerating(true)
    const session = JSON.parse(localStorage.getItem('w_cigar_user') || '{}')
    const actor = { id: session.id || 'unknown', name: session.name || '員工' }
    const res = await createRunFromAlerts(alertItems, actor)
    setGenerating(false)
    if (!res.success) { alert(res.error || '建單失敗'); return }
    if (window.confirm(`✓ 已建立補貨單 ${res.run_no}（${res.run.item_count} 項，${res.run.venue_count} 店）。\n\n要立即跳到「補貨單」頁進入雙人確認流程嗎？`)) {
      navigate(`/admin/replenishment/${res.run_id}`)
    }
  }

  async function handleSetEntryField(venueId, productKey, field, value) {
    const num = Math.max(0, parseInt(value, 10) || 0)
    await upsertInventoryEntry(venueId, productKey, { [field]: num })
    setRefreshTick(t => t + 1)
  }

  async function handleSetVenueDefaultAlert(venueId, value) {
    const num = Math.max(0, parseInt(value, 10) || 0)
    const v = venues.find(x => x.id === venueId)
    await upsertVenue({ ...v, id: venueId, default_alert_threshold: num })
    setRefreshTick(t => t + 1)
  }

  return (
    <PageShell title="庫存管理" subtitle="ADMIN · INVENTORY">
      <SummaryRow stats={stats} loading={loading} />

      <Card style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 200px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#6a655c' }} />
          <input value={filter.q} onChange={e => setFilter(f => ({ ...f, q: e.target.value }))}
            placeholder="搜尋店家"
            style={inputStyle({ paddingLeft: 30 })} />
        </div>
        <select value={filter.region} onChange={e => setFilter(f => ({ ...f, region: e.target.value }))} style={inputStyle({ width: 'auto' })}>
          <option value="all">全部地區</option>
          {Object.keys(REGIONS).filter(r => matrix.some(v => v.region === r)).map(r => (
            <option key={r} value={r}>{REGIONS[r]}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#8a8278', cursor: 'pointer' }}>
          <input type="checkbox" checked={filter.alertOnly}
            onChange={e => setFilter(f => ({ ...f, alertOnly: e.target.checked }))} />
          只看警示
        </label>
        <button onClick={() => navigate('/admin/inventory/baseline')} style={ghostBtn()}>
          <Settings size={13} /> 初始化 baseline
        </button>
        <button
          onClick={handleGenerateRun}
          disabled={generating || alertItems.length === 0}
          style={{
            ...primaryBtn(),
            background: alertItems.length > 0 ? '#dc2626' : '#3a332a',
            color: alertItems.length > 0 ? '#fff' : '#6a655c',
            cursor: alertItems.length > 0 ? 'pointer' : 'not-allowed',
          }}>
          <Zap size={14} /> {generating ? '建單中…' : `一鍵生成補貨單（${alertItems.length}）`}
        </button>
      </Card>

      <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#8a8278', marginBottom: 8, paddingLeft: 4 }}>
        圖例：
        <span style={{ color: '#ef4444' }}>● 紅 (&lt; 閾值)</span>
        <span style={{ color: '#f59e0b' }}>● 黃 (= 閾值~+30%)</span>
        <span style={{ color: '#10b981' }}>● 綠 (充足)</span>
      </div>

      {loading ? (
        <Card>載入中…</Card>
      ) : filtered.length === 0 ? (
        <Card style={{ textAlign: 'center', color: '#6a655c', padding: 30 }}>沒有符合條件的店家</Card>
      ) : (
        filtered.map(v => (
          <VenueInventoryCard
            key={v.venue_id}
            venue={v}
            onChangeEntry={handleSetEntryField}
            onChangeDefaultAlert={handleSetVenueDefaultAlert}
          />
        ))
      )}

      <div style={{ marginTop: 12, padding: 10, background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, fontSize: 11, color: '#8a8278', lineHeight: 1.6 }}>
        <span style={{ color: '#c9a84c', fontWeight: 500 }}>提示：</span>
        每格的「現庫」由 KEY-in 後自動扣減；點「閾值」「上限」可即時編輯儲存。需一次性初始化 5/1 庫存請進「初始化 baseline」頁。
      </div>
    </PageShell>
  )
}

function SummaryRow({ stats, loading }) {
  const cell = (label, value, color, sub) => (
    <div style={{ flex: 1, minWidth: 90, padding: 10, background: '#1a1714', border: `1px solid ${color || '#2a2520'}44`, borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: color || '#8a8278', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: color || '#e8e0d0', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#5a554e', marginTop: 2 }}>{sub}</div>}
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      {cell('店家總數', loading ? '—' : stats.venue_total)}
      {cell('紅色警示', loading ? '—' : stats.red, '#ef4444', '低於閾值')}
      {cell('接近警示', loading ? '—' : stats.yellow, '#f59e0b', '閾值+2')}
      {cell('預估補貨', loading ? '—' : `NT$ ${(stats.reorder_total || 0).toLocaleString()}`, '#c9a84c')}
    </div>
  )
}

function VenueInventoryCard({ venue, onChangeEntry, onChangeDefaultAlert }) {
  const [editingDefault, setEditingDefault] = useState(false)
  const [defaultDraft, setDefaultDraft] = useState(String(venue.venue_default_alert))

  const borderColor =
    venue.red_count > 0 ? '#ef4444' :
    venue.alert_count > 0 ? '#f59e0b' : '#10b981'
  const statusLabel =
    venue.red_count > 0 ? `${venue.red_count} 紅 + ${venue.alert_count - venue.red_count} 黃` :
    venue.alert_count > 0 ? `${venue.alert_count} 黃` : '✓ 充足'
  const statusColor =
    venue.red_count > 0 ? '#ef4444' :
    venue.alert_count > 0 ? '#f59e0b' : '#10b981'

  return (
    <div style={{ background: '#15110f', border: '1px solid #2a2520', borderRadius: 10, padding: 12, marginBottom: 8, borderLeft: `3px solid ${borderColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#e8e0d0' }}>{venue.venue_name}</span>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: (REGION_COLOR[venue.region] || '#6b7280') + '22', color: REGION_COLOR[venue.region] || '#6b7280' }}>
            {REGIONS[venue.region] || venue.region}
          </span>
          <span style={{ fontSize: 11, color: '#8a8278', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            預設閾值
            {editingDefault ? (
              <input type="number" min="0" value={defaultDraft}
                onChange={e => setDefaultDraft(e.target.value)}
                onBlur={() => { onChangeDefaultAlert(venue.venue_id, defaultDraft); setEditingDefault(false) }}
                onKeyDown={e => { if (e.key === 'Enter') { onChangeDefaultAlert(venue.venue_id, defaultDraft); setEditingDefault(false) } }}
                autoFocus
                style={{ width: 40, padding: '2px 4px', background: '#0a0a0a', border: '1px solid #c9a84c', borderRadius: 4, color: '#c9a84c', fontSize: 11 }} />
            ) : (
              <button onClick={() => { setDefaultDraft(String(venue.venue_default_alert)); setEditingDefault(true) }}
                style={{ background: 'transparent', border: '1px dashed #2a2520', color: '#c9a84c', padding: '1px 6px', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>
                &lt; {venue.venue_default_alert}
              </button>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: statusColor }}>
          {venue.alert_count > 0 && <AlertTriangle size={12} />}
          <span>{statusLabel}</span>
          {venue.reorder_total_amount > 0 && (
            <span style={{ color: '#8a8278' }}>· 補貨 NT$ {Math.round(venue.reorder_total_amount).toLocaleString()}</span>
          )}
        </div>
      </div>

      {venue.rows.length === 0 ? (
        <div style={{ fontSize: 11, color: '#5a554e', textAlign: 'center', padding: 12 }}>無商品（請至「店家管理」設定）</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 4 }}>
          {venue.rows.map(r => (
            <ProductCell key={r.product_key} row={r} venueId={venue.venue_id} onChangeEntry={onChangeEntry} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProductCell({ row, venueId, onChangeEntry }) {
  const color =
    row.status === 'red' ? '#ef4444' :
    row.status === 'yellow' ? '#f59e0b' : '#10b981'
  const borderColor = row.status === 'green' ? '#2a2520' : color + '66'
  const replenishQty = Math.max(0, row.target_quantity - row.current_qty)
  const isAlert = row.status === 'red' || row.status === 'yellow'

  const [editing, setEditing] = useState(null)  // 'qty' | 'alert' | 'target' | null
  const [draft, setDraft] = useState('')

  function startEdit(field, current) {
    setDraft(String(current))
    setEditing(field)
  }
  function commit() {
    if (editing) onChangeEntry(venueId, row.product_key, fieldMap(editing), draft)
    setEditing(null)
  }
  function fieldMap(e) {
    return e === 'qty' ? 'current_qty' : e === 'alert' ? 'alert_threshold' : 'target_quantity'
  }

  return (
    <div style={{ background: '#0a0a0a', border: `1px solid ${borderColor}`, borderRadius: 6, padding: '6px 6px', textAlign: 'center', fontSize: 10 }}>
      <div style={{ color: '#8a8278', fontSize: 10, lineHeight: 1.2, minHeight: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {row.product_name}
      </div>
      <Editable label="現庫" value={row.current_qty} editing={editing === 'qty'} draft={draft} setDraft={setDraft}
        onStart={() => startEdit('qty', row.current_qty)} onCommit={commit}
        valueColor={color} valueSize={16} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 2, marginTop: 4, fontSize: 9, color: '#5a554e' }}>
        <button onClick={() => startEdit('alert', row.alert_threshold)}
          title="閾值（&lt; 紅）"
          style={{ flex: 1, background: 'transparent', border: '1px dashed #2a2520', padding: '1px 0', borderRadius: 3, color: '#8a8278', fontSize: 9, cursor: 'pointer' }}>
          {editing === 'alert'
            ? <input type="number" min="0" value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit() }}
                autoFocus style={{ width: '100%', background: 'transparent', border: 'none', color: '#c9a84c', textAlign: 'center', fontSize: 9 }} />
            : <>閾 {row.alert_threshold}</>}
        </button>
        <button onClick={() => startEdit('target', row.target_quantity)}
          title="補貨上限"
          style={{ flex: 1, background: 'transparent', border: '1px dashed #2a2520', padding: '1px 0', borderRadius: 3, color: '#8a8278', fontSize: 9, cursor: 'pointer' }}>
          {editing === 'target'
            ? <input type="number" min="0" value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit() }}
                autoFocus style={{ width: '100%', background: 'transparent', border: 'none', color: '#c9a84c', textAlign: 'center', fontSize: 9 }} />
            : <>上 {row.target_quantity}</>}
        </button>
      </div>
      <div style={{ marginTop: 3, fontSize: 9, color: isAlert ? color : '#5a554e' }}>
        {isAlert ? `補 +${replenishQty}` : '—'}
      </div>
    </div>
  )
}

function Editable({ label, value, editing, draft, setDraft, onStart, onCommit, valueColor, valueSize }) {
  return (
    <div onClick={onStart} style={{ cursor: 'pointer', padding: '2px 0' }}>
      {editing ? (
        <input type="number" min="0" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={onCommit}
          onKeyDown={e => { if (e.key === 'Enter') onCommit() }}
          autoFocus
          style={{
            width: '100%', textAlign: 'center', background: '#0a0a0a',
            border: '1px solid #c9a84c', borderRadius: 4, color: '#c9a84c',
            fontSize: valueSize || 14, padding: '2px 0',
          }} />
      ) : (
        <div style={{ color: valueColor || '#e8e0d0', fontSize: valueSize || 14, fontWeight: 500, lineHeight: 1.1 }}>{value}</div>
      )}
    </div>
  )
}

function inputStyle(extra = {}) {
  return {
    width: '100%', padding: '8px 10px', background: '#1a1714',
    border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8',
    fontSize: 13, outline: 'none', boxSizing: 'border-box', ...extra,
  }
}
function primaryBtn() {
  return {
    padding: '8px 14px', background: '#c9a84c', border: 'none', borderRadius: 6,
    color: '#0a0a0a', fontSize: 13, fontWeight: 600,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }
}
function ghostBtn(color) {
  return {
    padding: '6px 10px', background: 'transparent',
    border: `1px solid ${color || '#2a2520'}`, borderRadius: 6,
    color: color || '#8a8278', fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }
}
