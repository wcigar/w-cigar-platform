// src/pages/admin/InventoryBaseline.jsx
// 5/1 上線一次性初始化頁。把每店每品的「最後庫存量 + 閾值 + 目標上限」一頁填完。
// 提交後寫入 inventory store。
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, Copy, ArrowLeft, AlertTriangle } from 'lucide-react'
import { listVenues, getDefaultAlertMap } from '../../lib/services/venues'
import { getVenueSalesMatrixTemplate } from '../../lib/services/venueSales'
import { bulkSetInventory, buildInventoryMatrix } from '../../lib/services/inventory'
import PageShell, { Card } from '../../components/PageShell'

export default function InventoryBaseline() {
  const navigate = useNavigate()
  const [venues, setVenues] = useState([])
  const [tplMap, setTplMap] = useState({})
  const [draft, setDraft] = useState({}) // { "venueId:productKey": { qty, alert, target } }
  const [region, setRegion] = useState('taipei')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const vs = await listVenues()
    const map = {}
    for (const r of ['taipei', 'taichung']) {
      const tpl = await getVenueSalesMatrixTemplate(r)
      tpl.venues.forEach(v => { map[v.id] = v })
    }
    setTplMap(map)
    setVenues(vs)

    // pre-fill draft from existing inventory
    const matrix = await buildInventoryMatrix()
    const init = {}
    matrix.forEach(v => {
      v.rows.forEach(r => {
        init[`${v.venue_id}:${r.product_key}`] = {
          qty: r.current_qty || '',
          alert: r.alert_threshold,
          target: r.target_quantity,
        }
      })
    })
    setDraft(init)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filteredVenues = useMemo(() =>
    venues.filter(v => v.is_active !== false && v.region === region),
    [venues, region])

  const filledCount = useMemo(() =>
    Object.values(draft).filter(d => Number(d.qty) > 0).length,
    [draft])
  const totalSlots = useMemo(() => {
    let n = 0
    filteredVenues.forEach(v => { n += (tplMap[v.id]?.products || []).length })
    return n
  }, [filteredVenues, tplMap])

  function setField(venueId, productKey, field, value) {
    setDraft(d => ({ ...d, [`${venueId}:${productKey}`]: { ...d[`${venueId}:${productKey}`], [field]: value } }))
  }

  function applyVenueDefaults(venueId, alert, target) {
    setDraft(d => {
      const next = { ...d }
      const products = tplMap[venueId]?.products || []
      products.forEach(p => {
        next[`${venueId}:${p.key}`] = { ...next[`${venueId}:${p.key}`], alert, target }
      })
      return next
    })
  }

  async function handleSubmit() {
    if (!window.confirm(`確定要寫入 ${filledCount} 筆庫存資料？\n（已存在的紀錄會被覆蓋）`)) return
    setBusy(true)
    const payload = []
    Object.entries(draft).forEach(([key, d]) => {
      const [venue_id, product_key] = key.split(':')
      const qty = Number(d.qty)
      if (qty < 0) return
      payload.push({
        venue_id, product_key,
        current_qty: qty,
        alert_threshold: Number(d.alert) || 3,
        target_quantity: Number(d.target) || 10,
      })
    })
    await bulkSetInventory(payload)
    setBusy(false)
    if (window.confirm(`✓ 已寫入 ${payload.length} 筆。返回庫存矩陣頁？`)) {
      navigate('/admin/inventory')
    }
  }

  return (
    <PageShell title="初始化 baseline" subtitle="ADMIN · INVENTORY BASELINE">
      <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <button onClick={() => navigate('/admin/inventory')} style={ghostBtn()}>
          <ArrowLeft size={13} /> 返回庫存矩陣
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setRegion('taipei')} style={tabBtn(region === 'taipei')}>台北 ({venues.filter(v => v.region === 'taipei' && v.is_active !== false).length})</button>
          <button onClick={() => setRegion('taichung')} style={tabBtn(region === 'taichung')}>台中 ({venues.filter(v => v.region === 'taichung' && v.is_active !== false).length})</button>
        </div>
        <div style={{ fontSize: 11, color: '#8a8278' }}>
          已填 <span style={{ color: '#c9a84c', fontWeight: 500 }}>{filledCount}</span> / {totalSlots} 格
        </div>
        <button onClick={handleSubmit} disabled={busy} style={{ ...primaryBtn(), opacity: busy ? 0.5 : 1 }}>
          <Save size={14} /> {busy ? '寫入中…' : '一次寫入全部'}
        </button>
      </Card>

      <Card style={{ background: '#1a1714', borderLeft: '3px solid #f59e0b', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#f59e0b', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
          <div style={{ lineHeight: 1.6 }}>
            <strong>使用方式：</strong>每家店輸入「現庫量 / 閾值 / 上限」三個數字。閾值預設使用「店家管理」的設定，可在此頁微調。「複製到全店」可把該店所有商品設成同一閾值/上限。提交後資料會覆蓋已存在的紀錄。
          </div>
        </div>
      </Card>

      {loading ? (
        <Card>載入中…</Card>
      ) : (
        filteredVenues.map(v => {
          const products = tplMap[v.id]?.products || []
          if (products.length === 0) return null
          return (
            <BaselineVenueBlock key={v.id} venue={v} products={products} draft={draft}
              setField={setField} applyDefaults={applyVenueDefaults} />
          )
        })
      )}
    </PageShell>
  )
}

function BaselineVenueBlock({ venue, products, draft, setField, applyDefaults }) {
  const [quickAlert, setQuickAlert] = useState(venue.default_alert_threshold ?? 3)
  const [quickTarget, setQuickTarget] = useState(10)

  return (
    <div style={{ background: '#15110f', border: '1px solid #2a2520', borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#e8e0d0' }}>
          {venue.name}
          <span style={{ marginLeft: 8, fontSize: 11, color: '#8a8278' }}>共 {products.length} 品</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8a8278' }}>
          複製到全店：閾值
          <input type="number" min="0" value={quickAlert} onChange={e => setQuickAlert(e.target.value)}
            style={{ width: 40, padding: '3px 6px', background: '#0a0a0a', border: '1px solid #2a2520', borderRadius: 4, color: '#e8dcc8', fontSize: 11 }} />
          上限
          <input type="number" min="0" value={quickTarget} onChange={e => setQuickTarget(e.target.value)}
            style={{ width: 40, padding: '3px 6px', background: '#0a0a0a', border: '1px solid #2a2520', borderRadius: 4, color: '#e8dcc8', fontSize: 11 }} />
          <button onClick={() => applyDefaults(venue.id, parseInt(quickAlert) || 0, parseInt(quickTarget) || 0)}
            style={ghostBtn('#c9a84c')}>
            <Copy size={12} /> 套用
          </button>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #2a2520' }}>
            <th style={th('left')}>商品</th>
            <th style={th('center', 80)}>現庫</th>
            <th style={th('center', 70)}>閾值</th>
            <th style={th('center', 70)}>上限</th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => {
            const k = `${venue.id}:${p.key}`
            const d = draft[k] || { qty: '', alert: 3, target: 10 }
            return (
              <tr key={p.key} style={{ borderBottom: '1px solid #1a1714' }}>
                <td style={td('left')}>
                  {p.name} <span style={{ color: '#5a554e', fontSize: 10 }}>NT$ {p.price?.toLocaleString()}</span>
                </td>
                <td style={td('center')}>
                  <input type="number" min="0" value={d.qty} onChange={e => setField(venue.id, p.key, 'qty', e.target.value)}
                    placeholder="0" style={cellInput(d.qty !== '' && Number(d.qty) >= 0)} />
                </td>
                <td style={td('center')}>
                  <input type="number" min="0" value={d.alert ?? 3} onChange={e => setField(venue.id, p.key, 'alert', e.target.value)}
                    style={cellInput(true, '#3b82f6')} />
                </td>
                <td style={td('center')}>
                  <input type="number" min="0" value={d.target ?? 10} onChange={e => setField(venue.id, p.key, 'target', e.target.value)}
                    style={cellInput(true, '#10b981')} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function th(align, w) {
  return {
    textAlign: align, padding: '6px 4px', color: '#8a8278', fontWeight: 500,
    fontSize: 11, ...(w ? { width: w } : {}),
  }
}
function td(align) {
  return { textAlign: align, padding: '4px', color: '#e8dcc8' }
}
function cellInput(filled, hue) {
  return {
    width: '100%', padding: '4px 6px', background: filled ? '#0a0a0a' : '#1a1714',
    border: '1px solid ' + (hue || (filled ? '#c9a84c' : '#2a2520')),
    borderRadius: 4, color: hue || (filled ? '#c9a84c' : '#8a8278'),
    fontSize: 12, textAlign: 'center', outline: 'none',
  }
}
function tabBtn(active) {
  return {
    padding: '6px 14px', background: active ? '#c9a84c22' : 'transparent',
    border: '1px solid ' + (active ? '#c9a84c' : '#2a2520'),
    borderRadius: 6, color: active ? '#c9a84c' : '#8a8278',
    fontSize: 12, cursor: 'pointer',
  }
}
function primaryBtn() {
  return {
    padding: '8px 14px', background: '#c9a84c', border: 'none', borderRadius: 6,
    color: '#0a0a0a', fontSize: 13, fontWeight: 600, cursor: 'pointer',
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
