// src/lib/services/replenishment.js
// 補貨單 service：localStorage MVP
//
// 狀態機：
//   draft → maker_done(=待確認) → checker_done(=待出貨) → shipping → delivered
//                                                                    └ cancelled
//   單人模式：draft → checker_done（同一員工 +理由 + 連續兩次 confirm）
//
// localStorage 'wcigar_replenishment_runs_v1' = { [runId]: { ...run, items:[], events:[] } }

import { addInventoryFromShipment } from './inventory'

const USE_MOCK = true
const STORAGE_KEY = 'wcigar_replenishment_runs_v1'
const STATUS = {
  DRAFT: 'draft',
  MAKER_DONE: 'maker_done',     // 員工 A 已建單，等員工 B 確認
  CHECKER_DONE: 'checker_done', // 雙人確認完成，等出貨
  SHIPPING: 'shipping',          // 已出貨（叫快遞）
  DELIVERED: 'delivered',        // 大使簽收完成
  CANCELLED: 'cancelled',
}
export const REPLENISHMENT_STATUS = STATUS

const STATUS_LABEL = {
  draft: '草稿', maker_done: '待確認', checker_done: '待出貨',
  shipping: '配送中', delivered: '已完成', cancelled: '已取消',
}
export const REPLENISHMENT_STATUS_LABEL = STATUS_LABEL

function readRuns() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}
function writeRuns(s) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}

function nextRunNo() {
  const today = new Date()
  const y = today.getFullYear().toString().slice(2)
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  const prefix = `RP-${y}${m}${d}`
  const runs = Object.values(readRuns())
  const todayRuns = runs.filter(r => r.run_no?.startsWith(prefix))
  const seq = String(todayRuns.length + 1).padStart(4, '0')
  return `${prefix}-${seq}`
}

function nowIso() { return new Date().toISOString() }

// ---------- Public API ----------

export async function listReplenishmentRuns({ status } = {}) {
  const runs = Object.values(readRuns())
  let out = runs
  if (status) out = out.filter(r => r.status === status)
  return out.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
}

export async function getReplenishmentRun(id) {
  const runs = readRuns()
  return runs[id] || null
}

/**
 * 從 listAlertItems() 產生的清單一鍵建單。
 * alertItems: 已 prefilled suggested_qty 的清單
 * actor: { id, name }（maker）
 */
export async function createRunFromAlerts(alertItems, actor) {
  if (!alertItems || alertItems.length === 0) {
    return { success: false, error: '沒有警示項目，無需建單' }
  }
  const id = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const run_no = nextRunNo()
  const items = alertItems.map((a, i) => ({
    id: `${id}_i${i}`,
    venue_id: a.venue_id, venue_name: a.venue_name, region: a.region,
    product_key: a.product_key, product_name: a.product_name, product_price: a.product_price,
    current_qty_snapshot: a.current_qty,
    alert_threshold_snapshot: a.alert_threshold,
    target_quantity_snapshot: a.target_quantity,
    suggested_qty: a.suggested_qty,
    final_qty: a.suggested_qty,
    warehouse_adjusted: false,
    warehouse_adjusted_reason: null,
  }))
  const venueIds = [...new Set(items.map(i => i.venue_id))]
  const total_amount = items.reduce((s, i) => s + (i.final_qty * (i.product_price || 0)), 0)
  const run = {
    id, run_no,
    status: STATUS.MAKER_DONE,         // 一建單就是「待確認」
    created_at: nowIso(),
    created_by: actor?.id || null,
    created_by_name: actor?.name || null,
    confirmed_at: null,
    confirmed_by: null,
    confirmed_by_name: null,
    shipped_at: null,
    delivered_at: null,
    single_user_mode: false,
    single_user_reason: null,
    venues: venueIds,
    items,
    total_amount,
    item_count: items.length,
    venue_count: venueIds.length,
    events: [{ at: nowIso(), action: 'create', actor: actor?.name || '?', detail: `從警示自動建單（${items.length} 項，${venueIds.length} 店）` }],
  }
  const all = readRuns()
  all[id] = run
  writeRuns(all)
  return { success: true, run_id: id, run_no, run }
}

/**
 * 員工 B 確認（double-check 簽名）。同帳號禁止。
 */
export async function confirmRun(runId, actor) {
  const all = readRuns()
  const r = all[runId]
  if (!r) return { success: false, error: '補貨單不存在' }
  if (r.status !== STATUS.MAKER_DONE) return { success: false, error: `狀態 ${r.status} 不可確認` }
  if (r.created_by && actor?.id && r.created_by === actor.id) {
    return { success: false, error: '同一員工不可同時建單與確認，請另一員工確認，或啟用「單人模式」', need_single_user_mode: true }
  }
  r.status = STATUS.CHECKER_DONE
  r.confirmed_at = nowIso()
  r.confirmed_by = actor?.id || null
  r.confirmed_by_name = actor?.name || null
  r.events.push({ at: nowIso(), action: 'confirm', actor: actor?.name || '?', detail: '雙人確認完成' })
  all[runId] = r
  writeRuns(all)
  return { success: true, run: r }
}

/**
 * 單人模式確認：同一員工自己 confirm，需要理由 + 兩次 confirm dialog。
 */
export async function confirmRunSingleUser(runId, actor, reason) {
  if (!reason || !reason.trim()) {
    return { success: false, error: '單人模式需要填寫理由' }
  }
  const all = readRuns()
  const r = all[runId]
  if (!r) return { success: false, error: '補貨單不存在' }
  if (r.status !== STATUS.MAKER_DONE) return { success: false, error: `狀態 ${r.status} 不可確認` }
  r.status = STATUS.CHECKER_DONE
  r.confirmed_at = nowIso()
  r.confirmed_by = actor?.id || null
  r.confirmed_by_name = actor?.name || null
  r.single_user_mode = true
  r.single_user_reason = reason.trim()
  r.events.push({
    at: nowIso(), action: 'confirm_single_user',
    actor: actor?.name || '?',
    detail: `單人模式確認（理由：${reason.trim()}）`,
  })
  all[runId] = r
  writeRuns(all)
  return { success: true, run: r, single_user_mode: true }
}

/**
 * 倉庫調整補貨量（缺貨時調降）
 * adjustments: [{ item_id, final_qty, reason }, ...]
 */
export async function adjustItems(runId, adjustments, actor) {
  const all = readRuns()
  const r = all[runId]
  if (!r) return { success: false, error: '補貨單不存在' }
  let changed = 0
  adjustments.forEach(adj => {
    const it = r.items.find(i => i.id === adj.item_id)
    if (!it) return
    if (Number(adj.final_qty) === it.final_qty) return
    it.final_qty = Math.max(0, Number(adj.final_qty) || 0)
    it.warehouse_adjusted = true
    it.warehouse_adjusted_reason = adj.reason || null
    changed++
  })
  r.total_amount = r.items.reduce((s, i) => s + i.final_qty * (i.product_price || 0), 0)
  if (changed > 0) {
    r.events.push({ at: nowIso(), action: 'warehouse_adjust', actor: actor?.name || '?', detail: `倉庫調整 ${changed} 項` })
  }
  all[runId] = r
  writeRuns(all)
  return { success: true, run: r, changed }
}

/**
 * 出貨（叫快遞）—— 必須先 checker_done
 */
export async function shipRun(runId, actor) {
  const all = readRuns()
  const r = all[runId]
  if (!r) return { success: false, error: '補貨單不存在' }
  if (r.status !== STATUS.CHECKER_DONE) return { success: false, error: `狀態 ${r.status} 不可出貨（需先確認）` }
  r.status = STATUS.SHIPPING
  r.shipped_at = nowIso()
  r.events.push({ at: nowIso(), action: 'ship', actor: actor?.name || '?', detail: '已叫快遞，配送中' })
  all[runId] = r
  writeRuns(all)
  return { success: true, run: r }
}

/**
 * 大使端簽收 → 入庫（從 ambassador receipts 觸發）
 *   actuallyReceived: { [item_id]: 實收數量 }（缺漏走 discrepancy）
 *   若為 null 表示「全部一致」
 */
export async function deliverRunForVenue(runId, venueId, actuallyReceived, actor) {
  const all = readRuns()
  const r = all[runId]
  if (!r) return { success: false, error: '補貨單不存在' }
  if (r.status !== STATUS.SHIPPING && r.status !== STATUS.CHECKER_DONE) {
    return { success: false, error: `狀態 ${r.status} 不可簽收` }
  }
  const venueItems = r.items.filter(i => i.venue_id === venueId)
  if (venueItems.length === 0) return { success: false, error: '此補貨單不含此店' }

  const itemsByVenue = { [venueId]: [] }
  const discrepancies = []
  venueItems.forEach(it => {
    const expected = it.final_qty
    const actual = actuallyReceived && actuallyReceived[it.id] != null
      ? Number(actuallyReceived[it.id])
      : expected
    itemsByVenue[venueId].push({ product_key: it.product_key, quantity: actual })
    it.received_qty = actual
    it.received_at = nowIso()
    if (actual !== expected) {
      discrepancies.push({ item_id: it.id, expected, actual, diff: actual - expected, product_name: it.product_name })
    }
  })

  // 寫入庫存
  addInventoryFromShipment(itemsByVenue)

  r.events.push({
    at: nowIso(),
    action: 'deliver',
    actor: actor?.name || '?',
    detail: `${venueId} 簽收（${venueItems.length} 項${discrepancies.length ? `，${discrepancies.length} 項異常` : ''}）`,
  })
  if (discrepancies.length > 0) {
    r.events.push({ at: nowIso(), action: 'discrepancy', actor: actor?.name || '?', detail: JSON.stringify(discrepancies) })
  }

  // 全部 venue 都簽收完 → status = delivered
  const allReceived = r.items.every(i => i.received_qty != null)
  if (allReceived) {
    r.status = STATUS.DELIVERED
    r.delivered_at = nowIso()
  }
  all[runId] = r
  writeRuns(all)
  return { success: true, run: r, discrepancies, all_delivered: allReceived }
}

/**
 * 取消補貨單（只能在 maker_done / checker_done 狀態取消）
 */
export async function cancelRun(runId, reason, actor) {
  const all = readRuns()
  const r = all[runId]
  if (!r) return { success: false, error: '補貨單不存在' }
  if (r.status === STATUS.SHIPPING || r.status === STATUS.DELIVERED) {
    return { success: false, error: '已出貨/已完成的補貨單不可取消' }
  }
  r.status = STATUS.CANCELLED
  r.events.push({ at: nowIso(), action: 'cancel', actor: actor?.name || '?', detail: reason || '無理由' })
  all[runId] = r
  writeRuns(all)
  return { success: true, run: r }
}

/**
 * 把單筆 run 拆成「每店 packing slip」格式 — 給列印頁用
 */
export function buildPackingSlips(run) {
  if (!run) return []
  const byVenue = {}
  run.items.forEach(it => {
    if (!byVenue[it.venue_id]) {
      byVenue[it.venue_id] = {
        venue_id: it.venue_id,
        venue_name: it.venue_name,
        region: it.region,
        run_no: run.run_no,
        run_id: run.id,
        items: [],
        subtotal: 0,
      }
    }
    byVenue[it.venue_id].items.push(it)
    byVenue[it.venue_id].subtotal += it.final_qty * (it.product_price || 0)
  })
  return Object.values(byVenue)
}

export function _clearReplenishmentStore() {
  if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
}
