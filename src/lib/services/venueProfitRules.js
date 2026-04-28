// src/lib/services/venueProfitRules.js
// 每店每品的「每根利潤模型」— Phase 2 已接 Supabase。
// table: venue_pricing (venue_id, product_key) PK
//   sale_price, cost_price, venue_share_per_unit, venue_share_self_per_unit,
//   updated_at, updated_by_name
// company_profit_per_unit / company_profit_self_per_unit 由 caller 在讀取時計算（不存 DB）。

import { supabase } from '../supabase'

// ---------- Permissions ----------

export function canSeeCostPrice(session) {
  if (!session) return false
  const role = (session.role || '').toLowerCase()
  return session.is_admin === true || role === 'boss' || role === 'admin'
}

// ---------- Public API ----------

export async function getVenuePricing(venueId, productKey) {
  const { data, error } = await supabase
    .from('venue_pricing')
    .select('*')
    .eq('venue_id', venueId)
    .eq('product_key', productKey)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listVenuePricing() {
  const { data, error } = await supabase.from('venue_pricing').select('*')
  if (error) throw error
  return data || []
}

export async function upsertVenuePricing(venueId, productKey, patch, actor) {
  const existing = await getVenuePricing(venueId, productKey)
  const row = {
    venue_id: venueId,
    product_key: productKey,
    sale_price: patch.sale_price ?? existing?.sale_price ?? 0,
    cost_price: patch.cost_price ?? existing?.cost_price ?? 0,
    venue_share_per_unit: patch.venue_share_per_unit ?? existing?.venue_share_per_unit ?? 0,
    venue_share_self_per_unit: patch.venue_share_self_per_unit ?? existing?.venue_share_self_per_unit ?? 0,
    updated_at: new Date().toISOString(),
    updated_by_name: actor?.name || existing?.updated_by_name || null,
  }
  const { data, error } = await supabase
    .from('venue_pricing')
    .upsert(row, { onConflict: 'venue_id,product_key' })
    .select()
    .single()
  if (error) throw error
  // 回傳含計算欄位（caller 端 compute）
  return enrichPricing(data)
}

export async function bulkSetVenuePricing(payload, actor) {
  if (!Array.isArray(payload) || payload.length === 0) return { success: true, count: 0 }
  const rows = payload
    .filter(p => p.venue_id && p.product_key)
    .map(p => ({
      venue_id: p.venue_id,
      product_key: p.product_key,
      sale_price: Number(p.sale_price) || 0,
      cost_price: Number(p.cost_price) || 0,
      venue_share_per_unit: Number(p.venue_share_per_unit) || 0,
      venue_share_self_per_unit: Number(p.venue_share_self_per_unit) || 0,
      updated_at: new Date().toISOString(),
      updated_by_name: actor?.name || null,
    }))
  const { error } = await supabase
    .from('venue_pricing')
    .upsert(rows, { onConflict: 'venue_id,product_key' })
  if (error) throw error
  return { success: true, count: rows.length }
}

/**
 * 矩陣頁用：fetch 全部 pricing 一次，再對每店每品 enrich。
 *   templateByVenueId: { venueId: { products: [{key, name, price, category}, ...] } }
 *   session: 用於判斷是否可看 cost
 */
export async function buildPricingMatrix(venues, templateByVenueId, session) {
  const seeCost = canSeeCostPrice(session)
  const all = await listVenuePricing()
  const byKey = {}
  all.forEach(r => { byKey[r.venue_id + ':' + r.product_key] = r })

  return venues
    .filter(v => v.is_active !== false)
    .map(v => {
      const products = templateByVenueId[v.id]?.products || []
      const hasSelfSale = v.has_self_sale === true
      const rows = products.map(p => {
        const entry = byKey[v.id + ':' + p.key]
        const sale = entry?.sale_price ?? p.price ?? 0
        const cost = entry?.cost_price ?? 0
        const share = entry?.venue_share_per_unit ?? 0
        const shareSelf = entry?.venue_share_self_per_unit ?? 0
        const profit = Math.max(0, sale - cost - share)
        const profitSelf = Math.max(0, sale - cost - shareSelf)
        return {
          venue_id: v.id, product_key: p.key,
          product_name: p.name, category: p.category || 'non_cuban_cigar',
          sale_price: sale,
          cost_price: cost,
          cost_price_visible: seeCost,
          venue_share_per_unit: share,
          venue_share_self_per_unit: shareSelf,
          company_profit_per_unit: profit,
          company_profit_self_per_unit: profitSelf,
          margin_rate: sale > 0 ? (profit / sale) : 0,
          margin_rate_self: sale > 0 ? (profitSelf / sale) : 0,
          has_self_sale: hasSelfSale,
          configured: !!entry,
          updated_at: entry?.updated_at || null,
        }
      })
      const setCount = rows.filter(r => r.configured).length
      const totalProfit = rows.reduce((s, r) => s + r.company_profit_per_unit, 0)
      return {
        venue_id: v.id, venue_name: v.name, region: v.region,
        has_self_sale: hasSelfSale,
        rows,
        product_count: rows.length,
        set_count: setCount,
        unset_count: rows.length - setCount,
        sum_profit_per_unit: totalProfit,
      }
    })
}

/**
 * 結算試算：給定該店指定期間的銷售（按 product key 累計）
 *   salesByProduct.ambassador: { product_key: qty }  (大使賣的)
 *   salesByProduct.self_sale:   { product_key: qty }  (店家少爺自賣)
 */
export async function settleVenueSales(venueId, salesByProduct) {
  const { data, error } = await supabase
    .from('venue_pricing')
    .select('*')
    .eq('venue_id', venueId)
  if (error) throw error
  const byProductKey = {}
  ;(data || []).forEach(r => { byProductKey[r.product_key] = r })

  function calc(map, useSelf) {
    let revenue = 0, totalCost = 0, totalShare = 0, totalProfit = 0
    const lines = []
    Object.entries(map || {}).forEach(([pk, qty]) => {
      const entry = byProductKey[pk]
      if (!entry) return
      const q = Number(qty) || 0
      const r = (entry.sale_price || 0) * q
      const c = (entry.cost_price || 0) * q
      const sharePerUnit = useSelf ? (entry.venue_share_self_per_unit || 0) : (entry.venue_share_per_unit || 0)
      const s = sharePerUnit * q
      const profitPerUnit = Math.max(0, (entry.sale_price || 0) - (entry.cost_price || 0) - sharePerUnit)
      const p = profitPerUnit * q
      revenue += r; totalCost += c; totalShare += s; totalProfit += p
      lines.push({ product_key: pk, qty: q, revenue: r, cost: c, venue_share: s, company_profit: p })
    })
    return { revenue, total_cost: totalCost, venue_share_due: totalShare, company_gross_profit: totalProfit, lines }
  }

  let amb, self
  if (salesByProduct && (salesByProduct.ambassador || salesByProduct.self_sale)) {
    amb = calc(salesByProduct.ambassador, false)
    self = calc(salesByProduct.self_sale, true)
  } else {
    amb = calc(salesByProduct, false)
    self = { revenue: 0, total_cost: 0, venue_share_due: 0, company_gross_profit: 0, lines: [] }
  }
  return {
    venue_id: venueId,
    ambassador: amb,
    self_sale: self,
    total: {
      revenue: amb.revenue + self.revenue,
      total_cost: amb.total_cost + self.total_cost,
      venue_share_due: amb.venue_share_due + self.venue_share_due,
      company_gross_profit: amb.company_gross_profit + self.company_gross_profit,
    },
  }
}

function enrichPricing(row) {
  if (!row) return row
  const sale = Number(row.sale_price || 0)
  const cost = Number(row.cost_price || 0)
  const share = Number(row.venue_share_per_unit || 0)
  const shareSelf = Number(row.venue_share_self_per_unit || 0)
  return {
    ...row,
    company_profit_per_unit: Math.max(0, sale - cost - share),
    company_profit_self_per_unit: Math.max(0, sale - cost - shareSelf),
  }
}

// ---------- Backward compat ----------

export async function listVenueProfitRules() { return [] }
export async function getVenueProfitRule() { return null }
export async function upsertVenueProfitRule() { return { success: false, error: '已改用 venue-pricing 模型' } }
export async function deactivateVenueProfitRule() { return { success: false, error: '已改用 venue-pricing 模型' } }
export async function getVenueProfitSummary() { return [] }
export const SETTLEMENT_TYPES = {}
export const COMMISSION_BASIS = {}
export const SETTLEMENT_CYCLES = {}
export function simulateProfit() { return {} }
