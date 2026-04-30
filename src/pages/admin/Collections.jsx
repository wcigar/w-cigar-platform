// src/pages/admin/Collections.jsx
// 督導月度結帳頁
//   - 切換 4 位督導 (KELLY/IRIS/NANA/BOA)
//   - 該督導負責的店家清單
//   - 每店一行：大使賣 + 自賣 + 應付酒店 + 已收/差額
//   - 點任一店 → 詳情 modal：補錄自賣量 + 標記收齊
import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, UserCheck, AlertTriangle, Check, X, Edit3, ChevronRight, Coins, Printer, FileText, Send, Eraser } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { listVenues, REGION_OPTIONS as REGIONS } from '../../lib/services/venues'
import { getVenueSalesMatrixTemplate } from '../../lib/services/venueSales'

const REGION_COLOR = {
  taipei: '#3b82f6', taoyuan: '#10b981', hsinchu: '#06b6d4',
  taichung: '#a855f7', tainan: '#f97316', kaohsiung: '#ef4444',
}
import {
  SUPERVISORS, getSupervisorVenueMap, autoAssignByRegion,
} from '../../lib/services/supervisors'
import {
  COLLECTION_STATUSES, currentPeriod, getMonthlyCollection,
  setSelfSaleQty, recordCollectionPayment, setStocktake, setSignatures,
} from '../../lib/services/collections'
import { getDefaultAlertMap } from '../../lib/services/venues'
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
    const regs = Object.keys(REGIONS).filter(r => vs.some(v => v.region === r))
    for (const r of regs) {
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
  const [collections, setCollections] = useState([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const out = []
      for (const vid of myVenueIds) {
        const venue = venuesById[vid]
        if (!venue) continue
        // MVP: empty ambassador sales (上線後改從 sales table 聚合)
        const c = await getMonthlyCollection(period, vid, {}, !!venue.has_self_sale)
        if (cancelled) return
        out.push({
          ...c,
          venue_name: venue.name, venue_region: venue.region,
          has_self_sale: venue.has_self_sale,
          products: tplMap[vid]?.products || [],
        })
      }
      if (!cancelled) setCollections(out)
    })()
    return () => { cancelled = true }
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
    <PageShell title="督導結帳" subtitle="ADMIN · MONTHLY COLLECTIONS" backTo="/admin/venue-hub" backLabel="酒店銷售管理">
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
          <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: (REGION_COLOR[c.venue_region] || '#6b7280') + '22', color: REGION_COLOR[c.venue_region] || '#6b7280' }}>
            {REGIONS[c.venue_region] || c.venue_region}
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
  const navigate = useNavigate()
  const [stage, setStage] = useState('stocktake')  // stocktake → confirm → sign → done
  const [stocktake, setStocktakeState] = useState(() => collection.stocktake_qty_by_product || {})
  const [paid, setPaid] = useState(collection.paid_amount || 0)
  const [note, setNote] = useState(collection.note || '')
  const [accountantName, setAccountantName] = useState(collection.accountant_name || '')
  const [supSig, setSupSig] = useState(collection.supervisor_signature || null)
  const [accSig, setAccSig] = useState(collection.accountant_signature || null)
  const [busy, setBusy] = useState(false)

  // 取每店每品的「系統當前庫存」(已扣大使賣) — Phase 2: 直接從 inventory_balances 撈
  const [inventoryMap, setInventoryMap] = useState({})
  // 取每店的 venue_pricing 作 self_sale 推算 — Phase 2: 直接從 venue_pricing 撈
  const [venuePricing, setVenuePricing] = useState({})
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const map = {}
      collection.products.forEach(p => { map[p.key] = 0 })
      if (collection.products.length > 0) {
        const keys = collection.products.map(p => p.key)
        const { data } = await supabase
          .from('inventory_balances').select('product_key, current_qty')
          .eq('venue_id', collection.venue_id).in('product_key', keys)
        ;(data || []).forEach(e => { map[e.product_key] = e.current_qty || 0 })
      }
      const { data: priceData } = await supabase
        .from('venue_pricing').select('*').eq('venue_id', collection.venue_id)
      const priceMap = {}
      ;(priceData || []).forEach(p => { priceMap[p.product_key] = p })
      if (!cancelled) {
        setInventoryMap(map)
        setVenuePricing(priceMap)
      }
    })()
    return () => { cancelled = true }
  }, [collection])

  function setQty(key, v) {
    setStocktakeState(s => ({ ...s, [key]: v }))
  }

  // 計算自動推導的自賣量 + 應付金額
  const computed = useMemo(() => {
    const selfSale = {}
    const discrepancies = []
    let selfRevenue = 0, selfShareDue = 0
    Object.entries(stocktake).forEach(([pk, actualStr]) => {
      if (actualStr === '' || actualStr == null) return
      const actual = Math.max(0, Number(actualStr) || 0)
      const current = inventoryMap[pk] || 0
      if (current > actual) {
        const qty = current - actual
        selfSale[pk] = qty
        const entry = venuePricing[pk]
        if (entry) {
          selfRevenue += (entry.sale_price || 0) * qty
          selfShareDue += (entry.venue_share_self_per_unit || 0) * qty
        }
      } else if (current < actual) {
        discrepancies.push({ product_key: pk, current, actual })
      }
    })
    const ambDue = collection.ambassador?.venue_share_due || 0
    const totalDue = ambDue + selfShareDue
    return { selfSale, discrepancies, selfRevenue, selfShareDue, ambDue, totalDue }
  }, [stocktake, inventoryMap, venuePricing, collection])

  async function handleSubmitStocktake() {
    setBusy(true)
    await setStocktake(period, collection.venue_id, stocktake, inventoryMap, actor)
    setBusy(false)
    setStage('confirm')
  }

  async function handleSubmitConfirm() {
    setBusy(true)
    await recordCollectionPayment(period, collection.venue_id, {
      paid_amount: Number(paid) || 0, note,
      status: Number(paid) >= computed.totalDue ? 'collected' : (Number(paid) > 0 ? 'partial' : 'pending'),
    }, actor)
    setBusy(false)
    setStage('sign')
  }

  async function handleSubmitSignatures() {
    if (!supSig) return alert('請督導簽名')
    if (!accSig) return alert('請酒店會計簽名')
    if (!accountantName.trim()) return alert('請填酒店會計姓名')
    setBusy(true)
    await setSignatures(period, collection.venue_id,
      { supervisor_signature: supSig, accountant_signature: accSig, accountant_name: accountantName.trim() }, actor)
    setBusy(false)
    setStage('done')
  }

  function gotoReceiptPage() {
    onClose()
    navigate(`/admin/collections/receipt/${collection.venue_id}/${period}`)
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

        {/* Stepper */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, fontSize: 11 }}>
          {['stocktake', 'confirm', 'sign', 'done'].map((s, i) => {
            const labels = { stocktake: '①盤點', confirm: '②確認金額', sign: '③簽名', done: '④完成' }
            const active = stage === s
            const passed = ['stocktake', 'confirm', 'sign', 'done'].indexOf(stage) > i
            return (
              <div key={s} style={{
                flex: 1, padding: '6px 4px', textAlign: 'center', borderRadius: 6,
                background: active ? '#c9a84c22' : passed ? '#10b98115' : '#1a1714',
                border: '1px solid ' + (active ? '#c9a84c' : passed ? '#10b98155' : '#2a2520'),
                color: active ? '#c9a84c' : passed ? '#10b981' : '#5a554e',
              }}>{labels[s]}</div>
            )
          })}
        </div>

        {stage === 'stocktake' && (
          <StocktakeStage
            collection={collection} stocktake={stocktake} setQty={setQty}
            inventoryMap={inventoryMap} computed={computed}
            onNext={handleSubmitStocktake} busy={busy} onClose={onClose}
          />
        )}

        {stage === 'confirm' && (
          <ConfirmStage
            collection={collection} computed={computed}
            paid={paid} setPaid={setPaid} note={note} setNote={setNote}
            onBack={() => setStage('stocktake')} onNext={handleSubmitConfirm} busy={busy}
          />
        )}

        {stage === 'sign' && (
          <SignStage
            accountantName={accountantName} setAccountantName={setAccountantName}
            supSig={supSig} setSupSig={setSupSig}
            accSig={accSig} setAccSig={setAccSig}
            onBack={() => setStage('confirm')} onNext={handleSubmitSignatures} busy={busy}
            actor={actor}
          />
        )}

        {stage === 'done' && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 16, color: '#10b981', fontWeight: 500, marginBottom: 6 }}>結帳完成！</div>
            <div style={{ fontSize: 12, color: '#8a8278', marginBottom: 16 }}>
              簽名已存入系統。可生成對帳單列印或 LINE 分享。
            </div>
            <button onClick={gotoReceiptPage} style={{ ...primaryBtn(), padding: '10px 20px' }}>
              <FileText size={14} /> 開啟對帳單
            </button>
            <button onClick={() => { onSaved(); }} style={{ ...ghostBtn(), padding: '8px 16px', marginLeft: 8 }}>
              關閉
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// === Stage 1: Stocktake ===
function StocktakeStage({ collection, stocktake, setQty, inventoryMap, computed, onNext, busy, onClose }) {
  return (
    <>
      <div style={{ background: '#1a1714', borderLeft: '3px solid #3b82f6', padding: 10, marginBottom: 12, fontSize: 11, color: '#3b82f6', lineHeight: 1.5 }}>
        現場盤點 — 逐品填「實際剩餘根數」。系統會自動算店家自賣量（= 系統應剩 − 實際剩）
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto', background: '#1a1714', borderRadius: 8, padding: 10 }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a2520' }}>
              <th style={{ textAlign: 'left', padding: 4, color: '#8a8278', fontSize: 10 }}>商品</th>
              <th style={{ textAlign: 'center', padding: 4, color: '#3b82f6', fontSize: 10 }}>應剩</th>
              <th style={{ textAlign: 'center', padding: 4, color: '#f97316', fontSize: 10 }}>實際剩</th>
              <th style={{ textAlign: 'center', padding: 4, color: '#a855f7', fontSize: 10 }}>店家自賣</th>
            </tr>
          </thead>
          <tbody>
            {collection.products.map(p => {
              const should = inventoryMap[p.key] || 0
              const actual = stocktake[p.key]
              const actualNum = actual === '' || actual == null ? null : Number(actual)
              const selfSale = computed.selfSale[p.key] || 0
              const isOverShoot = actualNum != null && actualNum > should
              return (
                <tr key={p.key} style={{ borderBottom: '1px solid #1a1714' }}>
                  <td style={{ padding: 4, color: '#e8dcc8' }}>{p.name}</td>
                  <td style={{ textAlign: 'center', padding: 4, color: '#3b82f6', fontWeight: 500 }}>{should}</td>
                  <td style={{ textAlign: 'center', padding: 4 }}>
                    <input type="number" min="0" placeholder={String(should)} value={actual ?? ''}
                      onChange={e => setQty(p.key, e.target.value)}
                      style={{ width: 60, padding: '4px 6px', background: '#0a0a0a', border: `1px solid ${isOverShoot ? '#ef4444' : '#f9731666'}`, borderRadius: 4, color: isOverShoot ? '#ef4444' : '#f97316', fontSize: 12, textAlign: 'center', outline: 'none' }} />
                  </td>
                  <td style={{ textAlign: 'center', padding: 4, color: selfSale > 0 ? '#a855f7' : '#5a554e', fontWeight: 500 }}>
                    {selfSale > 0 ? `+${selfSale}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {computed.discrepancies.length > 0 && (
        <div style={{ marginTop: 8, padding: 8, background: '#ef444422', borderLeft: '3px solid #ef4444', fontSize: 11, color: '#ef4444' }}>
          ⚠ 異常：{computed.discrepancies.length} 項實際剩多於系統 — 可能漏 KEY-in 或實際多送貨。檢查無誤再繼續
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={onClose} style={{ ...ghostBtn(), flex: 1, justifyContent: 'center', padding: 10 }}>取消</button>
        <button onClick={onNext} disabled={busy} style={{ ...primaryBtn(), flex: 2, justifyContent: 'center', padding: 10, opacity: busy ? 0.5 : 1 }}>
          下一步：確認金額 →
        </button>
      </div>
    </>
  )
}

// === Stage 2: Confirm ===
function ConfirmStage({ collection, computed, paid, setPaid, note, setNote, onBack, onNext, busy }) {
  const dueTotal = computed.totalDue
  const remaining = Math.max(0, dueTotal - (Number(paid) || 0))
  return (
    <>
      <div style={{ background: '#1a1714', borderLeft: '3px solid #c9a84c', padding: 10, marginBottom: 12, borderRadius: 6 }}>
        <div style={{ fontSize: 12, color: '#c9a84c', fontWeight: 500, marginBottom: 8 }}>應付酒店明細</div>
        <table style={{ width: '100%', fontSize: 12 }}>
          <tbody>
            <tr><td style={{ padding: '4px 0', color: '#3b82f6' }}>大使賣</td><td style={{ textAlign: 'right', padding: '4px 0', color: '#3b82f6' }}>NT$ {Math.round(computed.ambDue).toLocaleString()}</td></tr>
            {computed.selfShareDue > 0 && (
              <tr><td style={{ padding: '4px 0', color: '#f97316' }}>店家自賣（盤點推算）</td><td style={{ textAlign: 'right', padding: '4px 0', color: '#f97316' }}>NT$ {Math.round(computed.selfShareDue).toLocaleString()}</td></tr>
            )}
            <tr style={{ borderTop: '1px solid #c9a84c' }}><td style={{ padding: '6px 0', color: '#c9a84c', fontWeight: 600 }}>應付總額</td><td style={{ textAlign: 'right', padding: '6px 0', color: '#c9a84c', fontWeight: 600, fontSize: 14 }}>NT$ {Math.round(dueTotal).toLocaleString()}</td></tr>
          </tbody>
        </table>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4 }}>實付/實收金額（NT$）</div>
        <input type="number" min="0" value={paid} onChange={e => setPaid(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', background: '#0a0a0a', border: '1px solid #c9a84c66', borderRadius: 6, color: '#c9a84c', fontSize: 16, textAlign: 'right', outline: 'none' }} />
      </div>
      {remaining > 0 && (
        <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8 }}>⚠ 尚差 NT$ {Math.round(remaining).toLocaleString()}</div>
      )}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4 }}>備註</div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="差額/異常/收款方式..."
          style={{ width: '100%', padding: '6px 10px', background: '#0a0a0a', border: '1px solid #2a2520', borderRadius: 4, color: '#e8dcc8', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={onBack} style={{ ...ghostBtn(), flex: 1, justifyContent: 'center', padding: 10 }}>← 上一步</button>
        <button onClick={onNext} disabled={busy} style={{ ...primaryBtn(), flex: 2, justifyContent: 'center', padding: 10, opacity: busy ? 0.5 : 1 }}>
          下一步：簽名 →
        </button>
      </div>
    </>
  )
}

// === Stage 3: Sign ===
function SignStage({ accountantName, setAccountantName, supSig, setSupSig, accSig, setAccSig, onBack, onNext, busy, actor }) {
  return (
    <>
      <div style={{ background: '#1a1714', borderLeft: '3px solid #a855f7', padding: 10, marginBottom: 12, fontSize: 11, color: '#a855f7' }}>
        雙方簽名後生效（手指/滑鼠在框內畫即可）
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4 }}>督導簽名（{actor.name}）</div>
        <SignaturePad value={supSig} onChange={setSupSig} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4 }}>酒店會計姓名</div>
        <input value={accountantName} onChange={e => setAccountantName(e.target.value)}
          placeholder="例如：林會計"
          style={{ width: '100%', padding: '6px 10px', background: '#0a0a0a', border: '1px solid #2a2520', borderRadius: 4, color: '#e8dcc8', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4 }}>酒店會計簽名</div>
        <SignaturePad value={accSig} onChange={setAccSig} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={onBack} style={{ ...ghostBtn(), flex: 1, justifyContent: 'center', padding: 10 }}>← 上一步</button>
        <button onClick={onNext} disabled={busy} style={{ ...primaryBtn(), flex: 2, justifyContent: 'center', padding: 10, opacity: busy ? 0.5 : 1 }}>
          完成結帳 →
        </button>
      </div>
    </>
  )
}

// === Signature Canvas ===
function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasDrawn, setHasDrawn] = useState(!!value)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = canvas.offsetWidth * 2
    canvas.height = canvas.offsetHeight * 2
    const ctx = canvas.getContext('2d')
    ctx.scale(2, 2)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#c9a84c'
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight)
      img.src = value
    }
  }, [])

  function getPos(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const t = e.touches ? e.touches[0] : e
    return { x: t.clientX - rect.left, y: t.clientY - rect.top }
  }

  function start(e) {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  function move(e) {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  function end() {
    if (!drawing.current) return
    drawing.current = false
    setHasDrawn(true)
    onChange(canvasRef.current.toDataURL('image/png'))
  }
  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    onChange(null)
  }

  return (
    <div style={{ position: 'relative', background: '#fff', borderRadius: 6, border: '1px solid #2a2520', height: 100 }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      {!hasDrawn && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 11, pointerEvents: 'none' }}>
          請在此區簽名
        </div>
      )}
      <button onClick={clear} type="button"
        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.05)', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, color: '#666', cursor: 'pointer' }}>
        <Eraser size={10} style={{ verticalAlign: 'middle' }} /> 清除
      </button>
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
