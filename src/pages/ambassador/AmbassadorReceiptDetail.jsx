// src/pages/ambassador/AmbassadorReceiptDetail.jsx
// 大使收貨詳情：對照紙本 packing slip 逐項勾選 → 一鍵簽收 / 填異常上報
import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, AlertTriangle, Edit3 } from 'lucide-react'
import { getReplenishmentRun, deliverRunForVenue } from '../../lib/services/replenishment'
import PageShell, { Card } from '../../components/PageShell'

export default function AmbassadorReceiptDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const venueIdFromUrl = searchParams.get('venue')

  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(true)
  const [venueId, setVenueId] = useState(venueIdFromUrl || null)
  const [mode, setMode] = useState('check') // 'check' | 'discrepancy'
  const [received, setReceived] = useState({}) // { itemId: actual_qty }
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const r = await getReplenishmentRun(id)
    setRun(r)
    if (!venueId && r) {
      // 自動取第一個尚未簽收的 venue
      const groups = {}
      r.items.forEach(it => {
        if (!groups[it.venue_id]) groups[it.venue_id] = []
        groups[it.venue_id].push(it)
      })
      const firstUnsigned = Object.keys(groups).find(vid => groups[vid].some(it => it.received_qty == null))
      setVenueId(firstUnsigned || Object.keys(groups)[0])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const venueGroups = useMemo(() => {
    if (!run) return {}
    const g = {}
    run.items.forEach(it => {
      if (!g[it.venue_id]) g[it.venue_id] = { name: it.venue_name, region: it.region, items: [] }
      g[it.venue_id].items.push(it)
    })
    return g
  }, [run])

  if (loading) return <PageShell title="收貨"><Card>載入中…</Card></PageShell>
  if (!run) return <PageShell title="收貨"><Card>找不到此補貨單</Card></PageShell>

  const venue = venueGroups[venueId]
  if (!venue) return <PageShell title="收貨"><Card>找不到此店</Card></PageShell>

  const allReceived = venue.items.every(it => it.received_qty != null)
  const session = (() => {
    try { return JSON.parse(localStorage.getItem('ambassador_session') || '{}') } catch { return {} }
  })()
  const actor = { id: session.ambassador_id || 'unknown', name: session.name || '大使' }

  async function handleConfirmAll() {
    if (!window.confirm(`確認 ${venue.name} 收到全部 ${venue.items.length} 項數量無誤？\n簽收後庫存自動入帳。`)) return
    setBusy(true)
    const res = await deliverRunForVenue(run.id, venueId, null, actor)  // null = 全部一致
    setBusy(false)
    if (!res.success) { alert(res.error); return }
    if (window.confirm('✓ 簽收成功，庫存已入帳。返回收貨列表？')) navigate('/ambassador/receipts')
    else load()
  }

  async function handleSubmitDiscrepancy() {
    setBusy(true)
    const map = {}
    venue.items.forEach(it => {
      map[it.id] = received[it.id] != null ? Number(received[it.id]) : it.final_qty
    })
    const res = await deliverRunForVenue(run.id, venueId, map, actor)
    setBusy(false)
    if (!res.success) { alert(res.error); return }
    if (res.discrepancies?.length > 0) {
      alert(`✓ 已簽收，記錄 ${res.discrepancies.length} 項差異：\n${res.discrepancies.map(d => `· ${d.product_name}：應 ${d.expected} 實 ${d.actual}（${d.diff > 0 ? '+' : ''}${d.diff}）`).join('\n')}`)
    } else {
      alert('✓ 簽收完成（無差異）')
    }
    navigate('/ambassador/receipts')
  }

  const venueIds = Object.keys(venueGroups)
  const showVenueSwitcher = venueIds.length > 1

  return (
    <PageShell title={`收貨確認 — ${venue.name}`} subtitle={`${run.run_no} · ${venue.region === 'taipei' ? '台北' : '台中'}`}>
      <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <button onClick={() => navigate('/ambassador/receipts')} style={ghostBtn()}>
          <ArrowLeft size={13} /> 返回列表
        </button>
        {showVenueSwitcher && (
          <select value={venueId} onChange={e => setVenueId(e.target.value)}
            style={{ padding: '6px 10px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8', fontSize: 12, outline: 'none' }}>
            {venueIds.map(vid => <option key={vid} value={vid}>{venueGroups[vid].name}</option>)}
          </select>
        )}
        {allReceived && (
          <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#10b98122', color: '#10b981' }}>
            ✓ 已簽收
          </span>
        )}
      </Card>

      {!allReceived && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#8a8278', marginBottom: 8 }}>對照紙本 packing slip 逐項清點：</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setMode('check')} style={tabBtn(mode === 'check', '#10b981')}>
              <CheckCircle2 size={13} /> 全部一致 — 一鍵簽收
            </button>
            <button onClick={() => setMode('discrepancy')} style={tabBtn(mode === 'discrepancy', '#f59e0b')}>
              <AlertTriangle size={13} /> 有差異 — 逐項輸入實收
            </button>
          </div>
        </Card>
      )}

      <div style={{ background: '#15110f', border: '1px solid #2a2520', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a2520' }}>
              <th style={th('left')}>商品</th>
              <th style={th('center', 70)}>應收</th>
              <th style={th('center', 80)}>實收</th>
              <th style={th('center', 50)}>狀態</th>
            </tr>
          </thead>
          <tbody>
            {venue.items.map(it => {
              const isMatched = it.received_qty != null
                ? it.received_qty === it.final_qty
                : (received[it.id] != null ? Number(received[it.id]) === it.final_qty : true)
              return (
                <tr key={it.id} style={{ borderBottom: '1px solid #1a1714' }}>
                  <td style={td('left')}>
                    {it.product_name}
                    {it.warehouse_adjusted && <div style={{ fontSize: 9, color: '#f59e0b' }}>已調整 · {it.warehouse_adjusted_reason || ''}</div>}
                  </td>
                  <td style={{ ...td('center'), color: '#c9a84c', fontWeight: 500 }}>{it.final_qty}</td>
                  <td style={td('center')}>
                    {it.received_qty != null ? (
                      <span style={{ color: it.received_qty === it.final_qty ? '#10b981' : '#f59e0b', fontWeight: 500 }}>
                        {it.received_qty}
                      </span>
                    ) : mode === 'discrepancy' ? (
                      <input type="number" min="0" placeholder={String(it.final_qty)}
                        value={received[it.id] ?? ''}
                        onChange={e => setReceived(r => ({ ...r, [it.id]: e.target.value }))}
                        style={{ width: 60, padding: '4px 6px', background: '#0a0a0a', border: '1px solid #c9a84c', borderRadius: 4, color: '#c9a84c', fontSize: 12, textAlign: 'center' }} />
                    ) : (
                      <span style={{ color: '#5a554e' }}>—</span>
                    )}
                  </td>
                  <td style={td('center')}>
                    {it.received_qty != null
                      ? <CheckCircle2 size={14} color={it.received_qty === it.final_qty ? '#10b981' : '#f59e0b'} />
                      : isMatched
                        ? <span style={{ color: '#5a554e' }}>—</span>
                        : <AlertTriangle size={14} color="#f59e0b" />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!allReceived && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => navigate('/ambassador/receipts')} style={{ ...ghostBtn(), flex: 1 }}>稍後再簽</button>
          {mode === 'check' ? (
            <button onClick={handleConfirmAll} disabled={busy}
              style={{ ...primaryBtn('#10b981'), flex: 2, opacity: busy ? 0.5 : 1 }}>
              <CheckCircle2 size={14} /> {busy ? '簽收中…' : '全部一致 · 簽收入庫'}
            </button>
          ) : (
            <button onClick={handleSubmitDiscrepancy} disabled={busy}
              style={{ ...primaryBtn('#f59e0b'), flex: 2, opacity: busy ? 0.5 : 1 }}>
              <AlertTriangle size={14} /> {busy ? '送出中…' : '送出（含差異）'}
            </button>
          )}
        </div>
      )}
    </PageShell>
  )
}

function th(align, w) {
  return { textAlign: align, padding: '6px 4px', color: '#8a8278', fontWeight: 500, fontSize: 11, ...(w ? { width: w } : {}) }
}
function td(align) {
  return { textAlign: align, padding: '6px 4px', color: '#e8dcc8' }
}
function tabBtn(active, color) {
  return {
    flex: 1, padding: '8px 12px',
    background: active ? (color || '#c9a84c') + '22' : 'transparent',
    border: '1px solid ' + (active ? (color || '#c9a84c') : '#2a2520'),
    borderRadius: 6, color: active ? (color || '#c9a84c') : '#8a8278',
    fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  }
}
function primaryBtn(bg) {
  return {
    padding: '12px 16px', background: bg || '#c9a84c', border: 'none', borderRadius: 8,
    color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
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
