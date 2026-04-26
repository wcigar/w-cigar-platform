// src/lib/services/collections.js
// 督導月度結帳 service
//
// 業務模型：
//   每月每店有一筆結算單（period: 'YYYY-MM' × venue_id）
//   - ambassador_total: 從 sales 自動加總（大使賣的）
//   - self_sale_total: 督導現場補錄（店家自賣，only when has_self_sale）
//   - venue_share_due_ambassador: 自動算 = Σ(qty × venue_share_per_unit)
//   - venue_share_due_self: 自動算 = Σ(qty × venue_share_self_per_unit)
//   - paid_amount: 督導實際向酒店付/收的金額
//   - status: pending / partial / collected / exception
//
// localStorage:
//   wcigar_monthly_collections_v1 = { "<period>:<venue_id>": entry }

import { supabase } from '../supabase'
import { settleVenueSales } from './venueProfitRules'

const USE_MOCK = true
const STORAGE_KEY = 'wcigar_monthly_collections_v1'

export const COLLECTION_STATUSES = {
  pending:   { label: '待收',     color: '#f59e0b' },
  partial:   { label: '部分收款', color: '#fbbf24' },
  collected: { label: '已收齊',   color: '#10b981' },
  exception: { label: '差額異常', color: '#dc2626' },
}

function readStore() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}
function writeStore(s) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}
function makeKey(period, venueId) { return `${period}:${venueId}` }

export function currentPeriod() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ---------- Public API ----------

/**
 * 取得單筆月度結帳資料（自動計算 ambassador 部分；self_sale 從 store 讀）
 *   ambassadorSalesByProduct: { product_key: total_qty }（呼叫端從 sales 聚合）
 */
export function getMonthlyCollection(period, venueId, ambassadorSalesByProduct = {}, hasSelfSale = false) {
  const store = readStore()
  const key = makeKey(period, venueId)
  const entry = store[key] || { period, venue_id: venueId, self_sale_qty_by_product: {}, paid_amount: 0, note: '', collected_at: null, collected_by: null, status: 'pending' }
  const settle = settleVenueSales(venueId, {
    ambassador: ambassadorSalesByProduct || {},
    self_sale:  entry.self_sale_qty_by_product || {},
  })
  return {
    ...entry,
    period, venue_id: venueId,
    has_self_sale: hasSelfSale,
    ambassador: settle.ambassador,
    self_sale: settle.self_sale,
    total: settle.total,
    venue_share_due_total: settle.total.venue_share_due,
    company_gross_profit_total: settle.total.company_gross_profit,
    pending_amount: Math.max(0, settle.total.venue_share_due - (entry.paid_amount || 0)),
  }
}

/**
 * 補錄店家自賣量（督導現場盤點後填）
 *   selfSaleQtyByProduct: { product_key: qty }
 */
export function setSelfSaleQty(period, venueId, selfSaleQtyByProduct, actor) {
  const store = readStore()
  const key = makeKey(period, venueId)
  const entry = store[key] || { period, venue_id: venueId, paid_amount: 0, note: '', status: 'pending' }
  entry.self_sale_qty_by_product = selfSaleQtyByProduct || {}
  entry.updated_at = new Date().toISOString()
  entry.updated_by = actor?.id || actor?.name || null
  store[key] = entry
  writeStore(store)
  return { success: true }
}

/**
 * 督導確認收款（標記已收 / 部分收 / 異常）
 */
export function recordCollectionPayment(period, venueId, { paid_amount, note, status }, actor) {
  const store = readStore()
  const key = makeKey(period, venueId)
  const entry = store[key] || { period, venue_id: venueId, self_sale_qty_by_product: {} }
  entry.paid_amount = Math.max(0, Number(paid_amount) || 0)
  entry.note = note || ''
  entry.status = status || 'collected'
  entry.collected_at = new Date().toISOString()
  entry.collected_by = actor?.name || null
  store[key] = entry
  writeStore(store)
  return { success: true }
}

/**
 * 取得某 period × supervisor 負責的所有店結帳狀況
 */
export function listCollectionsForSupervisor(period, venueIds, ambassadorSalesByVenue, venuesById) {
  return venueIds.map(vid => {
    const venue = venuesById[vid]
    const ambSales = ambassadorSalesByVenue[vid] || {}
    const hasSelfSale = !!venue?.has_self_sale
    const c = getMonthlyCollection(period, vid, ambSales, hasSelfSale)
    return {
      ...c,
      venue_name: venue?.name || vid,
      venue_region: venue?.region,
    }
  })
}

// ---------- Backward compat ----------

export async function listCollections() { return [] }
export async function submitCollection() { return { success: true } }

export function _clearCollectionsStore() {
  if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
}
