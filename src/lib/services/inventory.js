// src/lib/services/inventory.js
// 場域庫存 service — Phase 1 已接 Supabase。
// table: inventory_balances (venue_id, product_key) PK
import { supabase } from '../supabase'
import { listVenues, getDefaultAlertMap } from './venues'
import { getVenueSalesMatrixTemplate } from './venueSales'

// Region template cache：getVenueSalesMatrixTemplate(region) 回傳 { venues:[{id,products,...}] }，
// 同 region 多家店共用一份 template，cache 起來避免每店重打一次。
const _tplCache = {}
async function loadRegionTplMap(region) {
  if (_tplCache[region]) return _tplCache[region]
  const t = await getVenueSalesMatrixTemplate(region)
  const map = {}
  ;(t.venues || []).forEach(v => { map[v.id] = v })
  _tplCache[region] = map
  return map
}

export async function getInventoryEntry(venueId, productKey, defaultAlertThreshold = 3) {
  const { data, error } = await supabase
    .from('inventory_balances')
    .select('*')
    .eq('venue_id', venueId)
    .eq('product_key', productKey)
    .maybeSingle()
  if (error) throw error
  return data || {
    venue_id: venueId,
    product_key: productKey,
    current_qty: 0,
    alert_threshold: defaultAlertThreshold,
    target_quantity: 10,
    updated_at: null,
  }
}

export async function upsertInventoryEntry(venueId, productKey, patch) {
  const existing = await getInventoryEntry(venueId, productKey)
  const row = {
    venue_id: venueId,
    product_key: productKey,
    current_qty: patch.current_qty ?? existing.current_qty ?? 0,
    alert_threshold: patch.alert_threshold ?? existing.alert_threshold ?? 3,
    target_quantity: patch.target_quantity ?? existing.target_quantity ?? 10,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('inventory_balances')
    .upsert(row, { onConflict: 'venue_id,product_key' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function bulkSetInventory(payload) {
  if (!Array.isArray(payload) || payload.length === 0) return { success: true, count: 0 }
  const rows = payload.map(p => ({
    venue_id: p.venue_id,
    product_key: p.product_key,
    current_qty: Math.max(0, Number(p.current_qty || 0)),
    alert_threshold: Math.max(0, Number(p.alert_threshold || 3)),
    target_quantity: Math.max(0, Number(p.target_quantity || 10)),
    updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase
    .from('inventory_balances')
    .upsert(rows, { onConflict: 'venue_id,product_key' })
  if (error) throw error
  return { success: true, count: rows.length }
}

async function fetchAllBalances() {
  const { data, error } = await supabase.from('inventory_balances').select('*')
  if (error) throw error
  const map = {}
  ;(data || []).forEach(r => {
    map[r.venue_id + ':' + r.product_key] = r
  })
  return map
}

export function computeStatus(qty, alert, target) {
  // 嚴格小於閥值才跳紅（等於閥值算黃色提醒）
  if (qty < alert) return 'red'
  if (qty <= alert + Math.ceil((target - alert) * 0.3)) return 'yellow'
  return 'green'
}

// === 商品顯示順序（給 Matrix / 補貨單 / 警示清單）===
// non_cuban (Capadura) 在前，cuban 在後
// cuban 順序由 Wilson 指定：羅密歐 → 寬丘 → 3T → 蒙特魚雷 → D4 → Robusto → Siglo VI
export const PRODUCT_DISPLAY_ORDER = [
  // Capadura 系列
  'capadura_888_robusto',
  'capadura_898_robusto',
  'capadura_888_toro',
  'capadura_898_toro',
  'capadura_888_torpedo',
  'capadura_898_torpedo',
  'jinxiong',
  // 古巴雪茄（Wilson 指定順序）
  'romeo',
  'romeo_wide',
  'trinidad_emerald',
  'monte_no2',
  'd4',
  'robusto',
  'siglo6_tube',
  'siglo6_tube_mentor',
]

export function sortByDisplayOrder(items, keyField = 'product_key') {
  const idx = (k) => {
    const i = PRODUCT_DISPLAY_ORDER.indexOf(k)
    return i === -1 ? 999 : i
  }
  return [...items].sort((a, b) => idx(a[keyField]) - idx(b[keyField]))
}

export async function listAlertItems(venueId) {
  const venues = await listVenues()
  const v = venues.find(x => x.id === venueId)
  if (!v) return []
  const balances = await fetchAllBalances()
  const tplMap = await loadRegionTplMap(v.region)
  const tpl = tplMap[v.id] || { products: [] }
  const products = tpl.products || []
  const result = []
  products.forEach(p => {
    const key = v.id + ':' + p.key
    const entry = balances[key]
    if (!entry) return
    const status = computeStatus(entry.current_qty, entry.alert_threshold, entry.target_quantity)
    if (status === 'red' || status === 'yellow') {
      result.push({
        product_key: p.key,
        product_name: p.name,
        product_price: p.price || 0,
        ...entry,
        status,
      })
    }
  })
  return sortByDisplayOrder(result)
}

export async function buildInventoryMatrix() {
  const venues = await listVenues()
  const balances = await fetchAllBalances()
  const defaultAlertMap = getDefaultAlertMap()
  return Promise.all(venues.map(async v => {
    const tplMap = await loadRegionTplMap(v.region)
    const tpl = tplMap[v.id] || { products: [] }
    const defaultAlert = defaultAlertMap[v.id] ?? 3
    const products = tpl.products || []
    const rawRows = products.map(p => {
      const key = v.id + ':' + p.key
      const entry = balances[key] || {
        current_qty: 0,
        alert_threshold: defaultAlert,
        target_quantity: 10,
      }
      const status = computeStatus(entry.current_qty, entry.alert_threshold, entry.target_quantity)
      return {
        product_key: p.key,
        product_name: p.name,
        product_price: p.price || 0,
        current_qty: entry.current_qty,
        alert_threshold: entry.alert_threshold,
        target_quantity: entry.target_quantity,
        status,
      }
    })
    const rows = sortByDisplayOrder(rawRows)
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
  }))
}

export async function deductInventoryFromSales(itemsByVenue) {
  const log = []
  for (const [venueId, items] of Object.entries(itemsByVenue)) {
    for (const it of items) {
      if (!it.product_key || !it.quantity) continue
      const existing = await getInventoryEntry(venueId, it.product_key)
      const before = existing.current_qty || 0
      const after = Math.max(0, before - Number(it.quantity || 0))
      await upsertInventoryEntry(venueId, it.product_key, { current_qty: after })
      log.push({ venue_id: venueId, product_key: it.product_key, before, deducted: Number(it.quantity), after })
    }
  }
  return log
}

export async function addInventoryFromShipment(itemsByVenue) {
  const log = []
  for (const [venueId, items] of Object.entries(itemsByVenue)) {
    for (const it of items) {
      if (!it.product_key || !it.quantity) continue
      const existing = await getInventoryEntry(venueId, it.product_key)
      const before = existing.current_qty || 0
      const after = before + Number(it.quantity || 0)
      await upsertInventoryEntry(venueId, it.product_key, { current_qty: after })
      log.push({ venue_id: venueId, product_key: it.product_key, before, added: Number(it.quantity), after })
    }
  }
  return log
}

export async function _clearInventoryStore() {
  const { error } = await supabase.from('inventory_balances').delete().neq('venue_id', '__never__')
  if (error) throw error
  return { success: true }
}
