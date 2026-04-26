// src/pages/admin/Collections.jsx
// 督導月度結帳頁
//   - 切換 4 位督導 (KELLY/IRIS/NANA/BOA)
//   - 該督導負責的店家清單
//   - 每店一行：大使賣 + 自賣 + 應付酒店 + 已收/差額
//   - 點任一店 → 詳情 modal：補錄自賣量 + 標記收齊
import { useEffect, useMemo, useState } from 'react'
import { Calendar, UserCheck, AlertTriangle, Check, X, Edit3, ChevronRight, Coins } from 'lucide-react'
import { listVenues } from '../../lib/services/venues'
import { getVenueSalesMatrixTemplate } from '../../lib/services/venueSales'
import {
  SUPERVISORS, getSupervisorVenueMap, autoAssignByRegion,
} from '../../lib/services/supervisors'
import {
  COLLECTION_STATUSES, currentPeriod, getMonthlyCollection,
  setSelfSaleQty, recordCollectionPayment,
} from '../../lib/services/collections'
import PageShell, { Card } from '../../components/PageShell'

export default function Collections() {
  const [supervisorId, setSupervisorId] = useState(SUPERVISORS[0].id)
  const [period, setPeriod] = useState(currentPeriod())
  const [venues, setVenues] = useState([])
  const [tplMap, setTplMap] = useState({})
  const [supVenueMap, setSupVenueMap] = useState({})
  const [editing, setEditing] = useState(null)  // venue obj being edited
  const [refreshTick, setRefreshTick] = useState(0)
  const [loading, setLoading] = useState(true)

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
    setSupVenueMap(getSupervisorVenueMap())
    setLoading(false)
  }
  useEffect(() => { reload() }, [refreshTick])

  const session = (() => {
    try { return JSON.parse(localStorage.getItem('w_cigar_user') || '{}') } catch { return {} }
  })()
  const actor = { id: session.id, name: session.name }

  const venuesById = useMemo(() => {
    const o = {}
    venues.forEach(v => { o[v.id] = v })
    return o
  }, [venues])

  // For each venue assigned to supervisor, build collection row
  const supervisor = SUPERVISORS.find(s => s.id === supervisorId)
  const myVenueIds = supVenueMap[supervisorId] || []
  const collections = useMemo(() => {
    return myVenueIds.map(vid => {
      const venue = venuesById[vid]
      if (!venue) return null
      // MVP: empty ambassador sales (上線後改從 sales table 聚合)
      const ambSales = {}
      const c = getMonthlyCollection(period, vid, ambSales, !!venue.has_self_sale)
      return {
        ...c,
        venue_name: venue.name, venue_region: venue.region,
        has_self_sale: venue.has_self_sale,
        products: tplMap[vid]?.products || [],
      }
    }).filter(Boolean)
  }, [myVenueIds, venuesById, period, tplMap, refreshTick])

  const stats = useMemo(() => {
    let due = 0, paid = 0, pendingCount = 0, collectedCount = 0
    collections.forEach(c => {
      due += c.venue_share_due_total || 0
      paid += c.paid_amount || 0
      if (c.status === 'collected') collectedCount++
      else pendingCount++
    })
    return { total: collections.length, due, paid, pendingCount, collectedCount }
  }, [collections])

  function handleAutoAssign() {
    if (!window.confirm('未指派的店家會自動按地區分配（台中→Boa、台北 KELLY/IRIS/NANA 平均）。繼續？')) return
    autoAssignByRegion(venues)
    setRefreshTick(n => n + 1)
  }

  // 每月 10 號截止警示（基於當前 period 與今日比對）
  const dueWarning = (() => {
    const today = new Date()
    const [py, pm] = period.split('-').map(Number)
    if (!py || !pm) return null
    // 結帳期間 = period 那個月的 10 號（例：4 月帳，5/10 之前要收完）
    const dueDate = new Date(py, pm, 10)  // pm 0-indexed → 自動是 next month
    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))
    const dueStr = `${dueDate.getFullYear()}/${String(dueDate.getMonth() + 1).padStart(2,'0')}/10`
    if (diffDays < 0) return { color: '#ef4444', icon: '🔴', text: `${dueStr} 截止已過 ${-diffDays} 天 — 請盡速完成`, pulse: true }
    if (diffDays === 0) return { color: '#dc2626', icon: '⚠️', text: `今日 ${dueStr} 為截止日 — 請完成所有結帳`, pulse: true }
    if (diffDays <= 3) return { color: '#f59e0b', icon: '⏰', text: `距離截止 ${dueStr} 還剩 ${diffDays} 天`, pulse: false }
    if (diffDays <= 7) return { color: '#3b82f6', icon: '📅', text: `截止日 ${dueStr}，還有 ${diffDays} 天`, pulse: false }
    return { color: '#6a655c', icon: '📅', text: `截止日 ${dueStr}（${diffDays} 天後）`, pulse: false }
  })()

  return (
    <PageShell title="督導結帳" subtitle="ADMIN · MONTHLY COLLECTIONS">
      {dueWarning && (
        <Card style={{ background: dueWarning.color + '15', borderLeft: `3px solid ${dueWarning.color}`, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: dueWarning.color, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
            <span style={{ fontSize: 16 }}>{dueWarning.icon}</span> {dueWarning.text}
          </div>
        </Card>
      )}

      {/* 期間 + 督導切換 */}
      <Card style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8a8278' }}>
          <Calendar size={12} /> 期間
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            style={{ background: '#1a1714', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8', padding: '4px 8px', fontSize: 12 }} />
        </div>
        <button onClick={handleAutoAssign} style={ghostBtn('#c9a84c')}>
          自動指派督導（按地區）
        </button>
      </Card>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {SUPERVISORS.map(s => {
          const venueCount = (supVenueMap[s.id] || []).length
          const active = supervisorId === s.id
          return (
            <button key={s.id} onClick={() => setSupervisorId(s.id)} style={{
              padding: '8px 14px', borderRadius: 8,
              border: `2px solid ${active ? s.color : '#2a2520'}`,
              background: active ? s.color + '22' : 'transparent',
              color: active ? s.color : '#8a8278',
              cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <UserCheck size={13} /> {s.name}
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(0,0,0,0.3)' }}>
                {s.region === 'taipei' ? '台北' : '台中'} · {venueCount}
              </span>
            </button>
          )
        })}
      </div>

      {/* 該督導 KPI */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {kpi('負責店數', stats.total, supervisor?.color || '#c9a84c')}
        {kpi('應收總額', `NT$ ${Math.round(stats.due).toLocaleString()}`, '#a855f7')}
        {kpi('已收', `NT$ ${Math.round(stats.paid).toLocaleString()}`, '#10b981')}
        {kpi('待收', stats.pendingCount, stats.pendingCount > 0 ? '#f59e0b' : '#6a655c')}
        {kpi('已收齊', stats.collectedCount, '#10b981')}
      </div>

      {loading ? (
        <Card>載入中…</Card>
      ) : collections.length === 0 ? (
        <Card style={{ textAlign: 'center', color: '#6a655c', padding: 30 }}>
          {supervisor?.name} 目前沒有負責店家 — 點上方「自動指派督導」或到「店家管理」手動指派
        </Card>
      ) : (
        collections.map(c => (
          <CollectionRow key={c.venue_id} c={c} onClick={() => setEditing(c)} />
        ))
      )}

      {editing && (
        <CollectionEditModal
          collection={editing}
          actor={actor}
          period={period}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setRefreshTick(n => n + 1) }}
        />
      )}
    </PageShell>
  )
}

function kpi(label, value, color) {
  return (
    <div style={{ flex: 1, minWidth: 90, padding: 10, background: '#1a1714', border: `1px solid ${color}44`, borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 500, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function CollectionRow({ c, onClick }) {
  const st = COLLECTION_STATUSES[c.status] || COLLECTION_STATUSES.pending
  const ambDue = c.ambassador?.venue_share_due || 0
  const selfDue = c.self_sale?.venue_share_due || 0
  const totalDue = c.venue_share_due_total || 0
  const paid = c.paid_amount || 0
  const remaining = totalDue - paid

  return (
    <div onClick={onClick} style={{ background: '#15110f', border: '1px solid #2a2520', borderRadius: 10, padding: 12, marginBottom: 8, borderLeft: `3px solid ${st.color}`, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#e8e0d0' }}>{c.venue_name}</span>
          <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: c.venue_region === 'taipei' ? '#3b82f622' : '#a855f722', color: c.venue_region === 'taipei' ? '#3b82f6' : '#a855f7' }}>
            {c.venue_region === 'taipei' ? '台北' : '台中'}
          </span>
          {c.has_self_sale && <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f9731622', color: '#f97316' }}>店家自賣</span>}
        </div>
        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: st.color + '22', color: st.color, fontWeight: 500 }}>
          {st.label}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: c.has_self_sale ? 'repeat(4, 1fr) auto' : 'repeat(3, 1fr) auto', gap: 8, fontSize: 11 }}>
        <Mini label="大使賣金額" value={`NT$ ${Math.round(ambDue).toLocaleString()}`} color="#3b82f6" />
        {c.has_self_sale && <Mini label="自賣金額" value={`NT$ ${Math.round(selfDue).toLocaleString()}`} color="#f97316" />}
        <Mini label="應付酒店" value={`NT$ ${Math.round(totalDue).toLocaleString()}`} color="#a855f7" />
        <Mini label="已收" value={`NT$ ${Math.round(paid).toLocaleString()}`} color="#10b981" />
        <ChevronRight size={16} color="#6a655c" style={{ alignSelf: 'center' }} />
      </div>
      {remaining > 0 && c.status !== 'collected' && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertTriangle size={11} /> 尚差 NT$ {Math.round(remaining).toLocaleString()}
        </div>
      )}
    </div>
  )
}

function Mini({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#6a655c' }}>{label}</div>
      <div style={{ fontSize: 12, color: color || '#e8e0d0', fontWeight: 500, marginTop: 1 }}>{value}</div>
    </div>
  )
}

function CollectionEditModal({ collection, actor, period, onClose, onSaved }) {
  const [selfSaleQty, setSelfSaleState] = useState(() => collection.self_sale_qty_by_product || {})
  const [paid, setPaid] = useState(collection.paid_amount || 0)
  const [note, setNote] = useState(collection.note || '')
  const [status, setStatus] = useState(collection.status || 'pending')
  const [busy, setBusy] = useState(false)

  // recompute self_sale settle preview from current draft
  const dueTotal = collection.venue_share_due_total || 0
  const paidNum = Number(paid) || 0
  const remaining = Math.max(0, dueTotal - paidNum)

  function setQty(key, v) {
    setSelfSaleState(s => {
      const next = { ...s }
      const num = Math.max(0, parseInt(v, 10) || 0)
      if (num === 0) delete next[key]
      else next[key] = num
      return next
    })
  }

  async function handleSubmit(closeAfter = true) {
    setBusy(true)
    if (collection.has_self_sale) {
      setSelfSaleQty(period, collection.venue_id, selfSaleQty, actor)
    }
    recordCollectionPayment(period, collection.venue_id, { paid_amount: paidNum, note, status }, actor)
    setBusy(false)
    if (closeAfter) onSaved()
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#15110f', border: '1px solid #2a2520', borderRadius: 12,
        width: '100%', maxWidth: 580, marginTop: 30, padding: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ color: '#c9a84c', fontSize: 16, fontWeight: 500 }}>
            {collection.venue_name} · {period} 結帳
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8a8278', cursor: 'pointer' }}><X size={14} /></button>
        </div>

        {/* 大使賣（read-only） */}
        <div style={{ marginBottom: 12, padding: 10, background: '#1a1714', borderLeft: '3px solid #3b82f6', borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 500, marginBottom: 4 }}>📊 大使賣（從 KEY-in 累計）</div>
          <div style={{ fontSize: 11, color: '#8a8278' }}>
            營業額 NT$ {Math.round(collection.ambassador?.revenue || 0).toLocaleString()}
            ｜應付酒店 NT$ {Math.round(collection.ambassador?.venue_share_due || 0).toLocaleString()}
          </div>
          {(collection.ambassador?.lines?.length || 0) === 0 && (
            <div style={{ fontSize: 11, color: '#5a554e', marginTop: 4, fontStyle: 'italic' }}>
              （MVP：暫無從 sales 聚合，請先 KEY-in 銷售資料）
            </div>
          )}
        </div>

        {/* 店家自賣（補錄） */}
        {collection.has_self_sale && (
          <div style={{ marginBottom: 12, padding: 10, background: '#1a1714', borderLeft: '3px solid #f97316', borderRadius: 6 }}>
            <div style={{ fontSize: 12, color: '#f97316', fontWeight: 500, marginBottom: 6 }}>🏪 店家自賣（現場盤點補錄）</div>
            <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 8 }}>
              到店現場盤點，把店家少爺自賣的根數逐品填入：
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {collection.products.map(p => (
                <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <span style={{ flex: 1, color: '#e8dcc8' }}>{p.name}</span>
                  <input type="number" min="0" placeholder="0" value={selfSaleQty[p.key] || ''}
                    onChange={e => setQty(p.key, e.target.value)}
                    style={{ width: 60, padding: '4px 6px', background: '#0a0a0a', border: '1px solid #f9731666', borderRadius: 4, color: '#f97316', fontSize: 12, textAlign: 'center' }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, padding: 6, background: '#0a0a0a', borderRadius: 4, fontSize: 11, color: '#f97316' }}>
              自賣應付酒店：NT$ {Math.round(collection.self_sale?.venue_share_due || 0).toLocaleString()}
            </div>
          </div>
        )}

        {/* 收款區 */}
        <div style={{ marginBottom: 12, padding: 10, background: '#1a1714', borderLeft: '3px solid #c9a84c', borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: '#c9a84c', fontWeight: 500, marginBottom: 6 }}>
            <Coins size={11} style={{ verticalAlign: 'middle' }} /> 督導現場收款
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: 8 }}>
            <span style={{ color: '#8a8278' }}>應付總額</span>
            <span style={{ color: '#a855f7', fontWeight: 500, marginLeft: 'auto' }}>NT$ {Math.round(dueTotal).toLocaleString()}</span>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4 }}>實付/實收金額</div>
            <input type="number" min="0" value={paid} onChange={e => setPaid(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: '#0a0a0a', border: '1px solid #c9a84c66', borderRadius: 6, color: '#c9a84c', fontSize: 14, textAlign: 'right', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {Object.entries(COLLECTION_STATUSES).map(([k, v]) => (
              <button key={k} onClick={() => setStatus(k)} style={{
                flex: 1, padding: '6px 8px', fontSize: 11,
                background: status === k ? v.color + '22' : 'transparent',
                border: '1px solid ' + (status === k ? v.color : '#2a2520'),
                borderRadius: 4, color: status === k ? v.color : '#8a8278', cursor: 'pointer',
              }}>{v.label}</button>
            ))}
          </div>
          {remaining > 0 && status !== 'collected' && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#f59e0b' }}>
              ⚠ 尚差 NT$ {Math.round(remaining).toLocaleString()}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4 }}>備註（差額/異常說明）</div>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="例如：酒店少爺說下次補 / 收齊"
              style={{ width: '100%', padding: '6px 10px', background: '#0a0a0a', border: '1px solid #2a2520', borderRadius: 4, color: '#e8dcc8', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ ...ghostBtn(), flex: 1, justifyContent: 'center', padding: 10 }}>取消</button>
          <button onClick={() => handleSubmit(true)} disabled={busy} style={{ ...primaryBtn(), flex: 2, opacity: busy ? 0.5 : 1, padding: 10 }}>
            <Check size={14} /> {busy ? '儲存中…' : '儲存結帳資料'}
          </button>
        </div>
      </div>
    </div>
  )
}

function primaryBtn() {
  return {
    padding: '8px 14px', background: '#c9a84c', border: 'none', borderRadius: 6,
    color: '#0a0a0a', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
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
