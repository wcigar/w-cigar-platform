// src/lib/services/inventory.js
// 場域庫存（venue_inventory）service：localStorage MVP
//
// 資料結構：
//   localStorage 'wcigar_inventory_v1' = {
//     "<venueId>:<productKey>": {
//       venue_id, product_key,
//       current_qty,           // 當前庫存量（KEY-in 後自動扣）
//       alert_threshold,        // 低於此值跳紅警示（覆蓋 venue 預設）
//       target_quantity,        // 補貨目標上限
//       updated_at,
//     }
//   }
//
// venue 預設 alert_threshold 存在 venues service 的 override 層
// 改 USE_MOCK=false 後切到 supabase rpc，UI 不需要改。

import { supabase } from '../supabase'

const USE_MOCK = true
const STORAGE_KEY = 'wcigar_inventory_v1'

function readStore() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}
function writeStore(s) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}
function makeKey(venueId, productKey) { return `${venueId}:${productKey}` }

// ---------- Public API ----------

/**
 * 取得單筆庫存記錄（若不存在回傳 default 結構）
 */
export function getInventoryEntry(venueId, productKey, defaultAlertThreshold = 3) {
  const store = readStore()
  const key = makeKey(venueId, productKey)
  return store[key] || {
    venue_id: venueId,
    product_key: productKey,
    current_qty: 0,
    alert_threshold: defaultAlertThreshold,
    target_quantity: 10,
    updated_at: null,
  }
}

/**
 * upsert 一筆。可只更新部分欄位。
 */
export function upsertInventoryEntry(venueId, productKey, patch) {
  const store = readStore()
  const key = makeKey(venueId, productKey)
  const existing = store[key] || {
    venue_id: venueId,
    product_key: productKey,
    current_qty: 0,
    alert_threshold: 3,
    target_quantity: 10,
  }
  store[key] = {
    ...existing,
    ...patch,
    venue_id: venueId,
    product_key: productKey,
    updated_at: new Date().toISOString(),
  }
  writeStore(store)
  return store[key]
}

/**
 * 批次 baseline 寫入。Override 任何已存在的紀錄。
 * payload: [{ venue_id, product_key, current_qty, alert_threshold, target_quantity }, ...]
 */
export function bulkSetInventory(payload, { merge = false } = {}) {
  const store = merge ? readStore() : {}
  payload.forEach(p => {
    if (!p.venue_id || !p.product_key) return
    const key = makeKey(p.venue_id, p.product_key)
    store[key] = {
      venue_id: p.venue_id,
      product_key: p.product_key,
      current_qty: Number(p.current_qty) || 0,
      alert_threshold: Number(p.alert_threshold) || 3,
      target_quantity: Number(p.target_quantity) || 10,
      updated_at: new Date().toISOString(),
    }
  })
  writeStore(store)
  return { success: true, count: payload.length }
}

/**
 * 結合 venues + 每店 products 回傳完整 inventory 矩陣
 *   venues: 從 listVenues()
 *   templateByVenueId: { venueId: { products: [{key, name, price}, ...] } }
 *   defaultAlertByVenue: { venueId: number }
 */
export function buildInventoryMatrix(venues, templateByVenueId, defaultAlertByVenue = {}) {
  const store = readStore()
  return venues
    .filter(v => v.is_active !== false)
    .map(v => {
      const tpl = templateByVenueId[v.id]
      const products = tpl?.products || []
      const defaultAlert = defaultAlertByVenue[v.id] || 3
      const rows = products.map(p => {
        const entry = store[makeKey(v.id, p.key)]
        return {
          venue_id: v.id,
          product_key: p.key,
          product_name: p.name,
          product_price: p.price,
          current_qty: entry?.current_qty ?? 0,
          alert_threshold: entry?.alert_threshold ?? defaultAlert,
          target_quantity: entry?.target_quantity ?? 10,
          updated_at: entry?.updated_at || null,
          status: computeStatus(entry?.current_qty ?? 0, entry?.alert_threshold ?? defaultAlert, entry?.target_quantity ?? 10),
        }
      })
      const alertCount = rows.filter(r => r.status === 'red' || r.status === 'yellow').length
      const redCount = rows.filter(r => r.status === 'red').length
      const reorderTotal = rows
        .filter(r => r.status === 'red' || r.status === 'yellow')
        .reduce((sum, r) => sum + Math.max(0, r.target_quantity - r.current_qty) * (r.product_price || 0), 0)
      return {
        venue_id: v.id,
        venue_name: v.name,
        region: v.region,
        is_active: v.is_active !== false,
        rows,
        alert_count: alertCount,
        red_count: redCount,
        reorder_total_amount: reorderTotal,
        venue_default_alert: defaultAlert,
      }
    })
}

/**
 * 從一筆 sales submit payload 自動扣庫存。
 * itemsByVenue: { venueId: [{ product_key, quantity }, ...] }
 */
export function deductInventoryFromSales(itemsByVenue) {
  const store = readStore()
  const log = []
  Object.entries(itemsByVenue).forEach(([venueId, items]) => {
    items.forEach(it => {
      if (!it.product_key || !it.quantity) return
      const key = makeKey(venueId, it.product_key)
      const before = store[key]?.current_qty ?? 0
      const after = Math.max(0, before - Number(it.quantity))
      if (!store[key]) {
        store[key] = {
          venue_id: venueId, product_key: it.product_key,
          current_qty: 0, alert_threshold: 3, target_quantity: 10,
        }
      }
      store[key].current_qty = after
      store[key].updated_at = new Date().toISOString()
      log.push({ venue_id: venueId, product_key: it.product_key, before, after, deducted: before - after })
    })
  })
  writeStore(store)
  return { success: true, log }
}

/**
 * 加庫存（大使收貨入庫）。
 */
export function addInventoryFromShipment(itemsByVenue) {
  const store = readStore()
  const log = []
  Object.entries(itemsByVenue).forEach(([venueId, items]) => {
    items.forEach(it => {
      if (!it.product_key || !it.quantity) return
      const key = makeKey(venueId, it.product_key)
      const before = store[key]?.current_qty ?? 0
      const after = before + Number(it.quantity)
      if (!store[key]) {
        store[key] = {
          venue_id: venueId, product_key: it.product_key,
          current_qty: 0, alert_threshold: 3, target_quantity: 10,
        }
      }
      store[key].current_qty = after
      store[key].updated_at = new Date().toISOString()
      log.push({ venue_id: venueId, product_key: it.product_key, before, after, added: after - before })
    })
  })
  writeStore(store)
  return { success: true, log }
}

/**
 * 取得目前所有警示項目（紅 + 黃）— 給 generateRunFromAlerts 用
 */
export function listAlertItems(matrix) {
  const out = []
  matrix.forEach(v => {
    v.rows.forEach(r => {
      if (r.status === 'red' || r.status === 'yellow') {
        out.push({
          venue_id: v.venue_id,
          venue_name: v.venue_name,
          region: v.region,
          product_key: r.product_key,
          product_name: r.product_name,
          product_price: r.product_price,
          current_qty: r.current_qty,
          alert_threshold: r.alert_threshold,
          target_quantity: r.target_quantity,
          suggested_qty: Math.max(0, r.target_quantity - r.current_qty),
          status: r.status,
        })
      }
    })
  })
  return out
}

/**
 * 計算單筆狀態：red < alert / yellow ≤ alert+2 / green
 */
export function computeStatus(qty, alert, target) {
  if (qty <= alert) return 'red'
  if (qty <= alert + 2) return 'yellow'
  return 'green'
}

/**
 * 清空（測試用）
 */
export function _clearInventoryStore() { writeStore({}) }
