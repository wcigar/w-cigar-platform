// src/lib/services/replenishment.js
// 補貨單 service — Phase 2 已接 Supabase。
// tables: replenishment_runs (id PK uuid)
//         replenishment_run_items (id PK uuid, run_id FK)
//
// 狀態機：
//   draft → maker_done(=待確認) → checker_done(=待出貨) → shipping → delivered
//                                                                    └ cancelled
//   單人模式：draft → checker_done（同一員工 + 理由 + 連續兩次 confirm）

import { supabase } from '../supabase'
import { addInventoryFromShipment } from './inventory'

const STATUS = {
  DRAFT: 'draft',
  MAKER_DONE: 'maker_done',
  CHECKER_DONE: 'checker_done',
  SHIPPING: 'shipping',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
}
export const REPLENISHMENT_STATUS = STATUS

const STATUS_LABEL = {
  draft: '草稿', maker_done: '待確認', checker_done: '待出貨',
  shipping: '配送中', delivered: '已完成', cancelled: '已取消',
}
export const REPLENISHMENT_STATUS_LABEL = STATUS_LABEL

function nowIso() { return new Date().toISOString() }

// run_no 由 id + created_at 派生（DB 沒有此欄位）
function deriveRunNo(id, createdAt) {
  const d = createdAt ? new Date(createdAt) : new Date()
  const yy = d.getFullYear().toString().slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const tail = (id || '').replace(/-/g, '').slice(0, 4).toUpperCase() || '0000'
  return `RP-${yy}${mm}${dd}-${tail}`
}

// 把 DB row 補上 UI 需要的派生欄位
function hydrateRun(run, items, venueNameMap = {}, venueRegionMap = {}) {
  const its = (items || []).map(it => ({
    id: it.id,
    run_id: it.run_id,
    venue_id: it.venue_id,
    venue_name: venueNameMap[it.venue_id] || it.venue_id,
    region: venueRegionMap[it.venue_id] || null,
    product_key: it.product_key,
    product_name: it.product_name,
    product_price: it.unit_price,
    final_qty: it.quantity,
    suggested_qty: it.quantity,                       // DB 不存，回讀用 quantity
    current_qty_snapshot: it.current_qty_snapshot,
    alert_threshold_snapshot: it.alert_threshold_snapshot,
    target_quantity_snapshot: it.target_quantity_snapshot,
    received_qty: it.delivered_qty,                   // alias
    delivered_qty: it.delivered_qty,
    received_at: it.ambassador_signed_at,
    ambassador_signed_at: it.ambassador_signed_at,
    ambassador_signed_by: it.ambassador_signed_by,
    warehouse_adjusted: false,                        // DB 不存，預設 false（事件 log 內可查）
    warehouse_adjusted_reason: null,
  }))
  const venueIds = [...new Set(its.map(i => i.venue_id))]
  const total_amount = its.reduce((s, i) => s + (i.final_qty || 0) * (i.product_price || 0), 0)
  return {
    id: run.id,
    run_no: deriveRunNo(run.id, run.created_at),
    status: run.status,
    created_at: run.created_at,
    created_by: null,
    created_by_name: run.created_by_name,
    confirmed_at: run.checker_at,
    confirmed_by: null,
    confirmed_by_name: run.checker_name,
    maker_name: run.maker_name,
    maker_at: run.maker_at,
    checker_name: run.checker_name,
    checker_at: run.checker_at,
    shipped_at: run.shipped_at,
    delivered_at: run.delivered_at,
    cancelled_at: run.cancelled_at,
    cancel_reason: run.cancel_reason,
    single_user_mode: !!run.single_user_mode,
    single_user_reason: run.single_user_reason,
    events: Array.isArray(run.events) ? run.events : [],
    notes: run.notes,
    venues: venueIds,
    items: its,
    total_amount,
    item_count: its.length,
    venue_count: venueIds.length,
  }
}

async function fetchVenueNameMap(venueIds) {
  if (!venueIds || venueIds.length === 0) return { vn: {}, vr: {} }
  const { data } = await supabase.from('venues').select('id, name, region').in('id', venueIds)
  const vn = {}, vr = {}
  ;(data || []).forEach(v => { vn[v.id] = v.name; vr[v.id] = v.region })
  return { vn, vr }
}

// ---------- Public API ----------

export async function listReplenishmentRuns({ status } = {}) {
  let q = supabase.from('replenishment_runs').select('*').order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data: runs, error } = await q
  if (error) throw error
  if (!runs || runs.length === 0) return []

  const runIds = runs.map(r => r.id)
  const { data: items, error: e2 } = await supabase
    .from('replenishment_run_items').select('*').in('run_id', runIds)
  if (e2) throw e2
  const itemsByRun = {}
  ;(items || []).forEach(it => {
    if (!itemsByRun[it.run_id]) itemsByRun[it.run_id] = []
    itemsByRun[it.run_id].push(it)
  })

  const allVenueIds = [...new Set((items || []).map(i => i.venue_id))]
  const { vn, vr } = await fetchVenueNameMap(allVenueIds)

  return runs.map(r => hydrateRun(r, itemsByRun[r.id] || [], vn, vr))
}

export async function getReplenishmentRun(id) {
  const { data: run, error } = await supabase
    .from('replenishment_runs').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!run) return null

  const { data: items, error: e2 } = await supabase
    .from('replenishment_run_items').select('*').eq('run_id', id)
  if (e2) throw e2

  const venueIds = [...new Set((items || []).map(i => i.venue_id))]
  const { vn, vr } = await fetchVenueNameMap(venueIds)
  return hydrateRun(run, items || [], vn, vr)
}

export async function createRunFromAlerts(alertItems, actor) {
  if (!alertItems || alertItems.length === 0) {
    return { success: false, error: '沒有警示項目，無需建單' }
  }

  const createdAt = nowIso()
  const runRow = {
    status: STATUS.MAKER_DONE,
    created_by_name: actor?.name || null,
    maker_name: actor?.name || null,
    maker_at: createdAt,
    single_user_mode: false,
    events: [{
      at: createdAt, action: 'create', actor: actor?.name || '?',
      detail: `從警示自動建單（${alertItems.length} 項，${new Set(alertItems.map(a => a.venue_id)).size} 店）`,
    }],
  }
  const { data: insertedRun, error } = await supabase
    .from('replenishment_runs').insert(runRow).select('*').single()
  if (error) throw error

  const itemRows = alertItems.map(a => ({
    run_id: insertedRun.id,
    venue_id: a.venue_id,
    product_key: a.product_key,
    product_name: a.product_name,
    quantity: a.suggested_qty,
    unit_price: a.product_price || 0,
    current_qty_snapshot: a.current_qty,
    alert_threshold_snapshot: a.alert_threshold,
    target_quantity_snapshot: a.target_quantity,
  }))
  const { data: insertedItems, error: e2 } = await supabase
    .from('replenishment_run_items').insert(itemRows).select('*')
  if (e2) throw e2

  const venueIds = [...new Set(itemRows.map(i => i.venue_id))]
  const { vn, vr } = await fetchVenueNameMap(venueIds)
  const run = hydrateRun(insertedRun, insertedItems, vn, vr)
  return { success: true, run_id: run.id, run_no: run.run_no, run }
}

export async function confirmRun(runId, actor) {
  const r = await getReplenishmentRun(runId)
  if (!r) return { success: false, error: '補貨單不存在' }
  if (r.status !== STATUS.MAKER_DONE) return { success: false, error: `狀態 ${r.status} 不可確認` }
  if (r.maker_name && actor?.name && r.maker_name === actor.name) {
    return { success: false, error: '同一員工不可同時建單與確認，請另一員工確認，或啟用「單人模式」', need_single_user_mode: true }
  }

  const at = nowIso()
  const events = [...r.events, { at, action: 'confirm', actor: actor?.name || '?', detail: '雙人確認完成' }]
  const { error } = await supabase.from('replenishment_runs').update({
    status: STATUS.CHECKER_DONE,
    checker_name: actor?.name || null,
    checker_at: at,
    events,
  }).eq('id', runId)
  if (error) throw error
  return { success: true, run: await getReplenishmentRun(runId) }
}

export async function confirmRunSingleUser(runId, actor, reason) {
  if (!reason || !reason.trim()) {
    return { success: false, error: '單人模式需要填寫理由' }
  }
  const r = await getReplenishmentRun(runId)
  if (!r) return { success: false, error: '補貨單不存在' }
  if (r.status !== STATUS.MAKER_DONE) return { success: false, error: `狀態 ${r.status} 不可確認` }

  const at = nowIso()
  const events = [...r.events, {
    at, action: 'confirm_single_user', actor: actor?.name || '?',
    detail: `單人模式確認（理由：${reason.trim()}）`,
  }]
  const { error } = await supabase.from('replenishment_runs').update({
    status: STATUS.CHECKER_DONE,
    checker_name: actor?.name || null,
    checker_at: at,
    single_user_mode: true,
    single_user_reason: reason.trim(),
    events,
  }).eq('id', runId)
  if (error) throw error
  return { success: true, run: await getReplenishmentRun(runId), single_user_mode: true }
}

export async function adjustItems(runId, adjustments, actor) {
  const r = await getReplenishmentRun(runId)
  if (!r) return { success: false, error: '補貨單不存在' }
  let changed = 0
  for (const adj of adjustments) {
    const it = r.items.find(i => i.id === adj.item_id)
    if (!it) continue
    const newQty = Math.max(0, Number(adj.final_qty) || 0)
    if (newQty === it.final_qty) continue
    const { error } = await supabase
      .from('replenishment_run_items').update({ quantity: newQty }).eq('id', adj.item_id)
    if (error) throw error
    changed++
  }
  if (changed > 0) {
    const at = nowIso()
    const events = [...r.events, {
      at, action: 'warehouse_adjust', actor: actor?.name || '?',
      detail: `倉庫調整 ${changed} 項：${adjustments.map(a => `${a.item_id.slice(0,4)}→${a.final_qty}（${a.reason || '無理由'}）`).join('；')}`,
    }]
    const { error } = await supabase.from('replenishment_runs').update({ events }).eq('id', runId)
    if (error) throw error
  }
  return { success: true, run: await getReplenishmentRun(runId), changed }
}

export async function shipRun(runId, actor) {
  const r = await getReplenishmentRun(runId)
  if (!r) return { success: false, error: '補貨單不存在' }
  if (r.status !== STATUS.CHECKER_DONE) return { success: false, error: `狀態 ${r.status} 不可出貨（需先確認）` }
  const at = nowIso()
  const events = [...r.events, { at, action: 'ship', actor: actor?.name || '?', detail: '已叫快遞，配送中' }]
  const { error } = await supabase.from('replenishment_runs').update({
    status: STATUS.SHIPPING,
    shipped_at: at,
    events,
  }).eq('id', runId)
  if (error) throw error
  return { success: true, run: await getReplenishmentRun(runId) }
}

export async function deliverRunForVenue(runId, venueId, actuallyReceived, actor) {
  const r = await getReplenishmentRun(runId)
  if (!r) return { success: false, error: '補貨單不存在' }
  if (r.status !== STATUS.SHIPPING && r.status !== STATUS.CHECKER_DONE) {
    return { success: false, error: `狀態 ${r.status} 不可簽收` }
  }
  const venueItems = r.items.filter(i => i.venue_id === venueId)
  if (venueItems.length === 0) return { success: false, error: '此補貨單不含此店' }

  const at = nowIso()
  const itemsByVenue = { [venueId]: [] }
  const discrepancies = []
  for (const it of venueItems) {
    const expected = it.final_qty
    const actual = actuallyReceived && actuallyReceived[it.id] != null
      ? Number(actuallyReceived[it.id])
      : expected
    itemsByVenue[venueId].push({ product_key: it.product_key, quantity: actual })
    const { error } = await supabase
      .from('replenishment_run_items').update({
        delivered_qty: actual,
        ambassador_signed_at: at,
        ambassador_signed_by: actor?.name || null,
      }).eq('id', it.id)
    if (error) throw error
    if (actual !== expected) {
      discrepancies.push({ item_id: it.id, expected, actual, diff: actual - expected, product_name: it.product_name })
    }
  }

  // 寫入庫存
  await addInventoryFromShipment(itemsByVenue)

  const events = [...r.events, {
    at, action: 'deliver', actor: actor?.name || '?',
    detail: `${venueId} 簽收（${venueItems.length} 項${discrepancies.length ? `，${discrepancies.length} 項異常` : ''}）`,
  }]
  if (discrepancies.length > 0) {
    events.push({ at, action: 'discrepancy', actor: actor?.name || '?', detail: JSON.stringify(discrepancies) })
  }

  // 全部 venue 都簽收完 → status = delivered
  const refreshed = await getReplenishmentRun(runId)
  const allReceived = refreshed.items.every(i => i.delivered_qty != null)
  const updates = { events }
  if (allReceived) {
    updates.status = STATUS.DELIVERED
    updates.delivered_at = at
  }
  const { error } = await supabase.from('replenishment_runs').update(updates).eq('id', runId)
  if (error) throw error
  return { success: true, run: await getReplenishmentRun(runId), discrepancies, all_delivered: allReceived }
}

export async function cancelRun(runId, reason, actor) {
  const r = await getReplenishmentRun(runId)
  if (!r) return { success: false, error: '補貨單不存在' }
  if (r.status === STATUS.SHIPPING || r.status === STATUS.DELIVERED) {
    return { success: false, error: '已出貨/已完成的補貨單不可取消' }
  }
  const at = nowIso()
  const events = [...r.events, { at, action: 'cancel', actor: actor?.name || '?', detail: reason || '無理由' }]
  const { error } = await supabase.from('replenishment_runs').update({
    status: STATUS.CANCELLED,
    cancelled_at: at,
    cancel_reason: reason || null,
    events,
  }).eq('id', runId)
  if (error) throw error
  return { success: true, run: await getReplenishmentRun(runId) }
}

/**
 * 把單筆 run 拆成「每店 packing slip」格式 — 給列印頁用。pure function
 */
export function buildPackingSlips(run) {
  if (!run) return []
  const byVenue = {}
  ;(run.items || []).forEach(it => {
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
    byVenue[it.venue_id].subtotal += (it.final_qty || 0) * (it.product_price || 0)
  })
  return Object.values(byVenue)
}
