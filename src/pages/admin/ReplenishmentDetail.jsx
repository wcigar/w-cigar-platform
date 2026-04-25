// src/pages/admin/ReplenishmentDetail.jsx
// 補貨單詳情：每店分區 + 倉庫調整 + 雙人/單人確認 + 出貨 + 列印
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, Truck, Printer, AlertTriangle,
  Edit3, X, ShieldCheck, UserX,
} from 'lucide-react'
import {
  getReplenishmentRun, confirmRun, confirmRunSingleUser, adjustItems, shipRun, cancelRun,
  REPLENISHMENT_STATUS as ST, REPLENISHMENT_STATUS_LABEL as STL,
} from '../../lib/services/replenishment'
import PageShell, { Card } from '../../components/PageShell'

export default function ReplenishmentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingItem, setEditingItem] = useState(null)
  const [adjustDraft, setAdjustDraft] = useState({ qty: 0, reason: '' })
  const [singleUserModal, setSingleUserModal] = useState(false)
  const [singleReason, setSingleReason] = useState('')

  async function reload() {
    setLoading(true)
    const r = await getReplenishmentRun(id)
    setRun(r)
    setLoading(false)
  }
  useEffect(() => { reload() }, [id])

  const session = (() => {
    try { return JSON.parse(localStorage.getItem('w_cigar_user') || '{}') } catch { return {} }
  })()
  const actor = { id: session.id || 'unknown', name: session.name || '員工' }

  if (loading) return <PageShell title="補貨單"><Card>載入中…</Card></PageShell>
  if (!run) return <PageShell title="補貨單"><Card>找不到補貨單</Card></PageShell>

  // 按 venue 分組
  const venuesMap = {}
  run.items.forEach(it => {
    if (!venuesMap[it.venue_id]) {
      venuesMap[it.venue_id] = { venue_id: it.venue_id, venue_name: it.venue_name, region: it.region, items: [], subtotal: 0 }
    }
    venuesMap[it.venue_id].items.push(it)
    venuesMap[it.venue_id].subtotal += it.final_qty * (it.product_price || 0)
  })
  const venues = Object.values(venuesMap)

  const isMaker = run.created_by === actor.id
  const canConfirmDual = run.status === ST.MAKER_DONE && !isMaker
  const canConfirmSingle = run.status === ST.MAKER_DONE && isMaker
  const canAdjust = run.status === ST.MAKER_DONE || run.status === ST.CHECKER_DONE
  const canShip = run.status === ST.CHECKER_DONE
  const canCancel = run.status === ST.MAKER_DONE || run.status === ST.CHECKER_DONE

  async function handleConfirm() {
    if (!window.confirm(`確認補貨單 ${run.run_no}？確認後將進入待出貨狀態。`)) return
    const res = await confirmRun(run.id, actor)
    if (!res.success) { alert(res.error); return }
    reload()
  }

  async function handleSingleUserConfirm() {
    if (!singleReason.trim()) { alert('請填寫單人模式理由'); return }
    if (!window.confirm(`單人模式確認 ${run.run_no}？\n理由：${singleReason}\n（系統會記錄此次操作，並在補貨單上標記「單人模式」）`)) return
    if (!window.confirm('再次確認 — 真的要在無另一員工核對下出貨？')) return
    const res = await confirmRunSingleUser(run.id, actor, singleReason)
    if (!res.success) { alert(res.error); return }
    setSingleUserModal(false)
    setSingleReason('')
    reload()
  }

  async function handleShip() {
    if (!window.confirm(`已連繫快遞、貨已交運嗎？\n補貨單 ${run.run_no} 將進入「配送中」狀態。`)) return
    const res = await shipRun(run.id, actor)
    if (!res.success) { alert(res.error); return }
    if (window.confirm('✓ 已標示為配送中。要立即列印「每店出貨單」附在貨裡嗎？')) {
      navigate(`/admin/replenishment/${run.id}/print`)
    } else {
      reload()
    }
  }

  async function handleCancel() {
    const reason = prompt('取消理由（必填）：')
    if (!reason) return
    const res = await cancelRun(run.id, reason, actor)
    if (!res.success) { alert(res.error); return }
    reload()
  }

  function startAdjust(item) {
    setEditingItem(item)
    setAdjustDraft({ qty: item.final_qty, reason: item.warehouse_adjusted_reason || '' })
  }
  async function commitAdjust() {
    const res = await adjustItems(run.id, [{ item_id: editingItem.id, final_qty: Number(adjustDraft.qty), reason: adjustDraft.reason }], actor)
    if (!res.success) { alert(res.error); return }
    setEditingItem(null)
    reload()
  }

  const statusColor = {
    [ST.MAKER_DONE]: '#f59e0b',
    [ST.CHECKER_DONE]: '#3b82f6',
    [ST.SHIPPING]: '#c9a84c',
    [ST.DELIVERED]: '#10b981',
    [ST.CANCELLED]: '#ef4444',
  }[run.status] || '#8a8278'

  return (
    <PageShell title={`補貨單 ${run.run_no}`} subtitle="ADMIN · REPLENISHMENT DETAIL">
      <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <button onClick={() => navigate('/admin/replenishment')} style={ghostBtn()}>
          <ArrowLeft size={13} /> 返回列表
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: statusColor + '22', color: statusColor, fontWeight: 500 }}>
            {STL[run.status]}
          </span>
          {run.single_user_mode && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: '#f59e0b22', color: '#f59e0b' }}>單人模式</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {canConfirmDual && (
            <button onClick={handleConfirm} style={primaryBtn('#3b82f6')}>
              <ShieldCheck size={14} /> 我已核對 · 確認此單
            </button>
          )}
          {canConfirmSingle && (
            <button onClick={() => setSingleUserModal(true)} style={primaryBtn('#f59e0b')}>
              <UserX size={14} /> 單人模式確認
            </button>
          )}
          {canShip && (
            <button onClick={handleShip} style={primaryBtn('#c9a84c')}>
              <Truck size={14} /> 已叫快遞，標示出貨
            </button>
          )}
          {(run.status === ST.CHECKER_DONE || run.status === ST.SHIPPING || run.status === ST.DELIVERED) && (
            <button onClick={() => navigate(`/admin/replenishment/${run.id}/print`)} style={ghostBtn('#c9a84c')}>
              <Printer size={14} /> 列印每店出貨單
            </button>
          )}
          {canCancel && (
            <button onClick={handleCancel} style={ghostBtn('#ef4444')}>
              <X size={14} /> 取消單
            </button>
          )}
        </div>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, fontSize: 12 }}>
          <Stat label="店家數" value={run.venue_count} />
          <Stat label="商品項" value={run.item_count} />
          <Stat label="預計總額" value={`NT$ ${(run.total_amount || 0).toLocaleString()}`} color="#c9a84c" />
          <Stat label="建立人" value={run.created_by_name || '?'} />
          {run.confirmed_by_name && <Stat label="確認人" value={run.confirmed_by_name} color="#3b82f6" />}
        </div>
      </Card>

      {canConfirmDual && (
        <Card style={{ background: '#3b82f622', borderLeft: '3px solid #3b82f6', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={14} /> 你不是建立人 — 請逐項核對下方數量，確認無誤後點上方「確認此單」
          </div>
        </Card>
      )}

      {isMaker && run.status === ST.MAKER_DONE && (
        <Card style={{ background: '#f59e0b22', borderLeft: '3px solid #f59e0b', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#f59e0b', lineHeight: 1.6 }}>
            <AlertTriangle size={14} style={{ verticalAlign: 'middle' }} /> 你是建立人 — 預設另一員工要點「確認」才能出貨。若你目前單獨值班，可改用「單人模式確認」（會記錄理由）
          </div>
        </Card>
      )}

      {venues.map(v => (
        <VenueBlock key={v.venue_id} venue={v} canAdjust={canAdjust} onAdjust={startAdjust} />
      ))}

      <Card style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: '#8a8278', marginBottom: 8 }}>處理紀錄</div>
        {(run.events || []).slice().reverse().map((e, i) => (
          <div key={i} style={{ fontSize: 11, color: '#8a8278', padding: '4px 0', borderBottom: '1px solid #1a1714' }}>
            <span style={{ color: '#5a554e' }}>{e.at?.slice(5, 16).replace('T', ' ')}</span>
            <span style={{ color: '#c9a84c', marginLeft: 8 }}>· {e.actor}</span>
            <span style={{ color: '#e8dcc8', marginLeft: 8 }}>· {e.detail}</span>
          </div>
        ))}
      </Card>

      {editingItem && (
        <Modal onClose={() => setEditingItem(null)} title={`調整 — ${editingItem.product_name}`}>
          <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 6 }}>
            原建議量 {editingItem.suggested_qty} 支 · 當前現庫 {editingItem.current_qty_snapshot} · 上限 {editingItem.target_quantity_snapshot}
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4 }}>實際出貨量</div>
            <input type="number" min="0" value={adjustDraft.qty}
              onChange={e => setAdjustDraft(d => ({ ...d, qty: e.target.value }))}
              style={modalInput()} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4 }}>調整理由（缺貨／破損／其他）</div>
            <input value={adjustDraft.reason} onChange={e => setAdjustDraft(d => ({ ...d, reason: e.target.value }))}
              placeholder="例如：倉庫只剩 3 支" style={modalInput()} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditingItem(null)} style={{ ...ghostBtn(), flex: 1 }}>取消</button>
            <button onClick={commitAdjust} style={{ ...primaryBtn(), flex: 2 }}>儲存</button>
          </div>
        </Modal>
      )}

      {singleUserModal && (
        <Modal onClose={() => setSingleUserModal(false)} title="單人模式確認">
          <div style={{ background: '#f59e0b22', borderLeft: '3px solid #f59e0b', padding: '8px 10px', marginBottom: 10, fontSize: 11, color: '#f59e0b', lineHeight: 1.5 }}>
            ⚠ 你正在跳過雙人複核機制。系統會記錄此次操作 + 通知老闆。請只在「真的單獨值班、無法找到第二人」的情況下使用。
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4 }}>單人模式理由（必填）</div>
            <input value={singleReason} onChange={e => setSingleReason(e.target.value)}
              placeholder="例如：晚班只有我一人" style={modalInput()} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setSingleUserModal(false)} style={{ ...ghostBtn(), flex: 1 }}>取消</button>
            <button onClick={handleSingleUserConfirm} style={{ ...primaryBtn('#f59e0b'), flex: 2 }}>
              <UserX size={13} /> 我確認單人模式出貨
            </button>
          </div>
        </Modal>
      )}
    </PageShell>
  )
}

function VenueBlock({ venue, canAdjust, onAdjust }) {
  return (
    <div style={{ background: '#15110f', border: '1px solid #2a2520', borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#e8e0d0' }}>{venue.venue_name}</span>
          <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: venue.region === 'taipei' ? '#3b82f622' : '#a855f722', color: venue.region === 'taipei' ? '#3b82f6' : '#a855f7' }}>
            {venue.region === 'taipei' ? '台北' : '台中'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#c9a84c', fontWeight: 500 }}>NT$ {Math.round(venue.subtotal).toLocaleString()}</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #2a2520' }}>
            <th style={{ textAlign: 'left', padding: '4px', color: '#8a8278', fontWeight: 500, fontSize: 11 }}>商品</th>
            <th style={{ textAlign: 'center', padding: '4px', color: '#8a8278', fontWeight: 500, fontSize: 11, width: 60 }}>建議</th>
            <th style={{ textAlign: 'center', padding: '4px', color: '#8a8278', fontWeight: 500, fontSize: 11, width: 60 }}>實際</th>
            <th style={{ textAlign: 'right', padding: '4px', color: '#8a8278', fontWeight: 500, fontSize: 11, width: 80 }}>小計</th>
            <th style={{ width: 30 }}></th>
          </tr>
        </thead>
        <tbody>
          {venue.items.map(it => {
            const adjusted = it.warehouse_adjusted
            const sub = it.final_qty * (it.product_price || 0)
            return (
              <tr key={it.id} style={{ borderBottom: '1px solid #1a1714' }}>
                <td style={{ padding: '4px', color: '#e8dcc8' }}>
                  {it.product_name}
                  <div style={{ fontSize: 9, color: '#5a554e' }}>NT$ {it.product_price?.toLocaleString()}</div>
                </td>
                <td style={{ textAlign: 'center', padding: '4px', color: '#8a8278' }}>{it.suggested_qty}</td>
                <td style={{ textAlign: 'center', padding: '4px', color: adjusted ? '#f59e0b' : '#c9a84c', fontWeight: 500 }}>
                  {it.final_qty}
                  {adjusted && <div style={{ fontSize: 9, color: '#f59e0b' }}>已調整</div>}
                </td>
                <td style={{ textAlign: 'right', padding: '4px', color: '#e8dcc8' }}>NT$ {sub.toLocaleString()}</td>
                <td style={{ textAlign: 'center', padding: '4px' }}>
                  {canAdjust && (
                    <button onClick={() => onAdjust(it)} title="調整實際數量"
                      style={{ background: 'transparent', border: 'none', color: '#8a8278', cursor: 'pointer', padding: 2 }}>
                      <Edit3 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#8a8278' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 500, color: color || '#e8e0d0', marginTop: 2 }}>{value}</div>
    </div>
  )
}

function Modal({ children, title, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#15110f', border: '1px solid #2a2520', borderRadius: 12,
        width: '100%', maxWidth: 460, marginTop: 60, padding: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ color: '#c9a84c', fontSize: 15, fontWeight: 500 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8a8278', cursor: 'pointer', padding: 4 }}>
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function modalInput() {
  return {
    width: '100%', padding: '8px 10px', background: '#1a1714',
    border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }
}
function primaryBtn(bg) {
  return {
    padding: '8px 14px', background: bg || '#c9a84c', border: 'none', borderRadius: 6,
    color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer',
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
