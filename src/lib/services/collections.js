// src/lib/services/collections.js
// 督導月度結帳 service — Phase 2 已接 Supabase。
// table: monthly_collections (period text, venue_id text) PK
//   columns: supervisor_id, ambassador_total, self_sale_total,
//            self_sale_items jsonb, stocktake_items jsonb,
//            venue_share_due_ambassador, venue_share_due_self,
//            paid_amount, paid_at, paid_method,
//            signature_supervisor, signature_venue,
//            status, notes, created_at, updated_at
//
// accountant_name 沒有獨立欄位，存在 notes 內：
//   notes = JSON.stringify({ accountant_name, user_note })

import { supabase } from '../supabase'
import { settleVenueSales } from './venueProfitRules'

export const COLLECTION_STATUSES = {
  pending:   { label: '待收',     color: '#f59e0b' },
  partial:   { label: '部分收款', color: '#fbbf24' },
  collected: { label: '已收齊',   color: '#10b981' },
  exception: { label: '差額異常', color: '#dc2626' },
}

export function currentPeriod() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function packNotes({ accountant_name, user_note }) {
  return JSON.stringify({
    accountant_name: accountant_name || null,
    user_note: user_note || '',
  })
}

function unpackNotes(s) {
  if (!s) return { accountant_name: null, user_note: '' }
  try {
    const o = JSON.parse(s)
    if (o && typeof o === 'object') {
      return { accountant_name: o.accountant_name || null, user_note: o.user_note || '' }
    }
  } catch { /* legacy plain string */ }
  return { accountant_name: null, user_note: String(s) }
}

async function fetchRow(period, venueId) {
  const { data, error } = await supabase
    .from('monthly_collections')
    .select('*')
    .eq('period', period)
    .eq('venue_id', venueId)
    .maybeSingle()
  if (error) throw error
  return data
}

// ---------- Public API ----------

/**
 * 取得單筆月度結帳資料（含結算試算）
 *   ambassadorSalesByProduct: { product_key: total_qty }
 */
export async function getMonthlyCollection(period, venueId, ambassadorSalesByProduct = {}, hasSelfSale = false) {
  const row = await fetchRow(period, venueId)
  const settle = await settleVenueSales(venueId, {
    ambassador: ambassadorSalesByProduct || {},
    self_sale: row?.self_sale_items || {},
  })
  const noteParts = unpackNotes(row?.notes)

  const base = row || {
    period, venue_id: venueId,
    supervisor_id: null,
    ambassador_total: 0, self_sale_total: 0,
    self_sale_items: {}, stocktake_items: {},
    venue_share_due_ambassador: 0, venue_share_due_self: 0,
    paid_amount: 0, paid_at: null, paid_method: null,
    signature_supervisor: null, signature_venue: null,
    status: 'pending',
    notes: null,
  }
  const paid = Number(base.paid_amount || 0)
  return {
    ...base,
    period, venue_id: venueId,
    has_self_sale: hasSelfSale,
    ambassador: settle.ambassador,
    self_sale: settle.self_sale,
    total: settle.total,
    venue_share_due_total: settle.total.venue_share_due,
    company_gross_profit_total: settle.total.company_gross_profit,
    pending_amount: Math.max(0, settle.total.venue_share_due - paid),
    // legacy field aliases for existing UI
    self_sale_qty_by_product: base.self_sale_items || {},
    stocktake_qty_by_product: base.stocktake_items || {},
    stocktake_discrepancies: [],
    supervisor_signature: base.signature_supervisor,
    accountant_signature: base.signature_venue,
    accountant_name: noteParts.accountant_name,
    note: noteParts.user_note,
    collected_at: base.paid_at,
    signed_at: base.updated_at,
  }
}

export async function setSelfSaleQty(period, venueId, selfSaleQtyByProduct, actor) {
  const existing = await fetchRow(period, venueId)
  const row = {
    period, venue_id: venueId,
    self_sale_items: selfSaleQtyByProduct || {},
    self_sale_total: Object.values(selfSaleQtyByProduct || {}).reduce((s, q) => s + (Number(q) || 0), 0),
    status: existing?.status || 'pending',
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('monthly_collections').upsert(row, { onConflict: 'period,venue_id' })
  if (error) throw error
  return { success: true }
}

/**
 * 督導現場盤點：填「實際剩餘」+ 系統反推自賣量
 */
export async function setStocktake(period, venueId, stocktakeQtyByProduct, currentInventoryByProduct, actor) {
  const existing = await fetchRow(period, venueId)
  const stocktake = {}
  const selfSale = {}
  const discrepancies = []
  Object.entries(stocktakeQtyByProduct || {}).forEach(([pk, actualStr]) => {
    const actual = Math.max(0, Number(actualStr) || 0)
    const current = Number(currentInventoryByProduct?.[pk]) || 0
    stocktake[pk] = actual
    if (current > actual) {
      selfSale[pk] = current - actual
    } else if (current < actual) {
      discrepancies.push({ product_key: pk, current, actual, diff: actual - current })
    }
  })
  const selfTotal = Object.values(selfSale).reduce((s, q) => s + q, 0)
  const row = {
    period, venue_id: venueId,
    stocktake_items: stocktake,
    self_sale_items: selfSale,
    self_sale_total: selfTotal,
    status: existing?.status || 'pending',
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('monthly_collections').upsert(row, { onConflict: 'period,venue_id' })
  if (error) throw error
  return { success: true, self_sale: selfSale, discrepancies }
}

/**
 * 督導 + 酒店會計簽名（base64 PNG dataURL）
 *   accountant_name 包進 notes JSON（沒有獨立欄位）
 */
export async function setSignatures(period, venueId, { supervisor_signature, accountant_signature, accountant_name }, actor) {
  const existing = await fetchRow(period, venueId)
  const prevNotes = unpackNotes(existing?.notes)
  const newNotes = packNotes({
    accountant_name: accountant_name ?? prevNotes.accountant_name,
    user_note: prevNotes.user_note,
  })
  const row = {
    period, venue_id: venueId,
    status: existing?.status || 'pending',
    notes: newNotes,
    updated_at: new Date().toISOString(),
  }
  if (supervisor_signature) row.signature_supervisor = supervisor_signature
  if (accountant_signature) row.signature_venue = accountant_signature
  const { error } = await supabase
    .from('monthly_collections').upsert(row, { onConflict: 'period,venue_id' })
  if (error) throw error
  return { success: true }
}

export async function recordCollectionPayment(period, venueId, { paid_amount, note, status, paid_method }, actor) {
  const existing = await fetchRow(period, venueId)
  const prevNotes = unpackNotes(existing?.notes)
  const newNotes = packNotes({
    accountant_name: prevNotes.accountant_name,
    user_note: note ?? prevNotes.user_note,
  })
  const row = {
    period, venue_id: venueId,
    paid_amount: Math.max(0, Number(paid_amount) || 0),
    paid_at: new Date().toISOString(),
    paid_method: paid_method || existing?.paid_method || null,
    status: status || 'collected',
    notes: newNotes,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('monthly_collections').upsert(row, { onConflict: 'period,venue_id' })
  if (error) throw error
  return { success: true }
}

/**
 * 取得某 period × supervisor 負責的所有店結帳狀況
 */
export async function listCollectionsForSupervisor(period, venueIds, ambassadorSalesByVenue, venuesById) {
  const out = []
  for (const vid of venueIds) {
    const venue = venuesById[vid]
    const ambSales = ambassadorSalesByVenue[vid] || {}
    const hasSelfSale = !!venue?.has_self_sale
    const c = await getMonthlyCollection(period, vid, ambSales, hasSelfSale)
    out.push({
      ...c,
      venue_name: venue?.name || vid,
      venue_region: venue?.region,
    })
  }
  return out
}

// ---------- Backward compat ----------

export async function listCollections() {
  const { data, error } = await supabase.from('monthly_collections').select('*')
  if (error) throw error
  return data || []
}

export async function submitCollection() { return { success: true } }
