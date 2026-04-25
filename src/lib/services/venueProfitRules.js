// src/lib/services/venueProfitRules.js
// === 重做：每店每品的「每根利潤模型」===
// 取代舊的 % 分潤。每筆 = 一個 (venue_id × product_key) 組合。
//
//   sale_price             售價（公開，員工/大使都可看）
//   cost_price             進貨成本（boss-only，敏感資料）
//   venue_share_per_unit   場域抽成 — 每賣 1 根給酒店多少錢
//   company_profit_per_unit  公司毛利 = sale_price − cost_price − venue_share（自動）
//
// localStorage key: 'wcigar_venue_pricing_v1' = { "<venue>:<product>": entry, ... }

import { supabase } from '../supabase'
import { listVenues } from './venues'

const USE_MOCK = true
const STORAGE_KEY = 'wcigar_venue_pricing_v1'

function readStore() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}
function writeStore(s) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}
function makeKey(venueId, productKey) { return `${venueId}:${productKey}` }

// ---------- Permissions ----------

/**
 * 判斷當前登入者是否可以看到「進貨成本」欄位
 * boss / admin 可以看；其他角色看不到（顯示 ***）
 */
export function canSeeCostPrice(session) {
  if (!session) return false
  const role = (session.role || '').toLowerCase()
  return session.is_admin === true || role === 'boss' || role === 'admin'
}

// ---------- Public API ----------

/**
 * 取得單筆定價
 */
export function getVenuePricing(venueId, productKey) {
  const store = readStore()
  return store[makeKey(venueId, productKey)] || null
}

/**
 * upsert 單筆。可只更新部分欄位。
 * 若 cost_price 同時提供 → 自動重算 company_profit_per_unit
 */
export function upsertVenuePricing(venueId, productKey, patch, actor) {
  const store = readStore()
  const key = makeKey(venueId, productKey)
  const existing = store[key] || {
    venue_id: venueId,
    product_key: productKey,
    sale_price: 0,
    cost_price: 0,
    venue_share_per_unit: 0,
    company_profit_per_unit: 0,
  }
  const merged = {
    ...existing,
    ...patch,
    venue_id: venueId,
    product_key: productKey,
  }
  // 自動重算 company_profit_per_unit
  merged.company_profit_per_unit = Math.max(0,
    Number(merged.sale_price || 0)
    - Number(merged.cost_price || 0)
    - Number(merged.venue_share_per_unit || 0))
  merged.updated_at = new Date().toISOString()
  if (actor) merged.updated_by_name = actor.name || null
  store[key] = merged
  writeStore(store)
  return merged
}

/**
 * 批次寫入（給矩陣頁批次儲存用）
 * payload: [{ venue_id, product_key, sale_price, cost_price, venue_share_per_unit }, ...]
 */
export function bulkSetVenuePricing(payload, actor) {
  const store = readStore()
  payload.forEach(p => {
    if (!p.venue_id || !p.product_key) return
    const key = makeKey(p.venue_id, p.product_key)
    const sale = Number(p.sale_price) || 0
    const cost = Number(p.cost_price) || 0
    const share = Number(p.venue_share_per_unit) || 0
    store[key] = {
      venue_id: p.venue_id,
      product_key: p.product_key,
      sale_price: sale,
      cost_price: cost,
      venue_share_per_unit: share,
      company_profit_per_unit: Math.max(0, sale - cost - share),
      note: p.note || '',
      updated_at: new Date().toISOString(),
      updated_by_name: actor?.name || null,
    }
  })
  writeStore(store)
  return { success: true, count: payload.length }
}

/**
 * 列出所有定價（用於矩陣頁）
 *   templateByVenueId: { venueId: { products: [{key, name, price, category}, ...] } }
 *   session: 用於判斷是否可看 cost
 */
export function buildPricingMatrix(venues, templateByVenueId, session) {
  const store = readStore()
  const seeCost = canSeeCostPrice(session)
  return venues
    .filter(v => v.is_active !== false)
    .map(v => {
      const products = templateByVenueId[v.id]?.products || []
      const rows = products.map(p => {
        const entry = store[makeKey(v.id, p.key)]
        const sale = entry?.sale_price ?? p.price ?? 0
        const cost = entry?.cost_price ?? 0
        const share = entry?.venue_share_per_unit ?? 0
        const profit = Math.max(0, sale - cost - share)
        return {
          venue_id: v.id, product_key: p.key,
          product_name: p.name, category: p.category || 'non_cuban_cigar',
          sale_price: sale,
          cost_price: cost,                          // 實際值（畫面要不要顯示由 see_cost 控制）
          cost_price_visible: seeCost,                // UI 用此 flag 決定渲染
          venue_share_per_unit: share,
          company_profit_per_unit: profit,
          margin_rate: sale > 0 ? (profit / sale) : 0,
          note: entry?.note || '',
          configured: !!entry,
          updated_at: entry?.updated_at || null,
        }
      })
      const setCount = rows.filter(r => r.configured).length
      const totalProfit = rows.reduce((s, r) => s + r.company_profit_per_unit, 0)
      return {
        venue_id: v.id, venue_name: v.name, region: v.region,
        rows,
        product_count: rows.length,
        set_count: setCount,
        unset_count: rows.length - setCount,
        sum_profit_per_unit: totalProfit,
      }
    })
}

/**
 * 結算試算：給定該店指定期間的銷售（按 product key 累計），算公司毛利、場域應付、毛利率
 *   salesByProduct: { product_key: qty }
 */
export function settleVenueSales(venueId, salesByProduct) {
  const store = readStore()
  let revenue = 0, totalCost = 0, totalVenueShare = 0, totalCompanyProfit = 0
  const lines = []
  Object.entries(salesByProduct || {}).forEach(([pk, qty]) => {
    const entry = store[makeKey(venueId, pk)]
    if (!entry) return
    const q = Number(qty) || 0
    const r = entry.sale_price * q
    const c = entry.cost_price * q
    const s = entry.venue_share_per_unit * q
    const p = entry.company_profit_per_unit * q
    revenue += r; totalCost += c; totalVenueShare += s; totalCompanyProfit += p
    lines.push({ product_key: pk, qty: q, revenue: r, cost: c, venue_share: s, company_profit: p })
  })
  return {
    venue_id: venueId,
    revenue, total_cost: totalCost,
    venue_share_due: totalVenueShare,
    company_gross_profit: totalCompanyProfit,
    lines,
  }
}

// ---------- Backward compat（舊 service 簽名，避免其他頁面崩）----------

export async function listVenueProfitRules() {
  // 重做後不再使用此 API；回傳空避免崩
  return []
}
export async function getVenueProfitRule() { return null }
export async function upsertVenueProfitRule() { return { success: false, error: '已改用 venue-pricing 模型' } }
export async function deactivateVenueProfitRule() { return { success: false, error: '已改用 venue-pricing 模型' } }
export async function getVenueProfitSummary() { return [] }
export const SETTLEMENT_TYPES = {}
export const COMMISSION_BASIS = {}
export const SETTLEMENT_CYCLES = {}
export function simulateProfit() { return {} }

export function _clearVenuePricingStore() {
  if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
}
