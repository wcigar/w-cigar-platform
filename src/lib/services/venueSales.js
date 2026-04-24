// src/lib/services/venueSales.js
// HQ/Staff 酒店銷售 key-in。MVP 使用 mock，RPC 還沒部署。
import { supabase } from '../supabase'
import { newIdempotencyKey } from './idempotency'

const USE_MOCK = true // 等 RPC 部署後改 false

// ============ List / Fetch ============

export async function listVenueSales({ date, venueId } = {}) {
  if (USE_MOCK) {
    if (date) return mockSales.filter(s => s.sale_date === date)
    return mockSales
  }
  const { data, error } = await supabase
    .from('venue_sales_daily')
    .select('*, venue:venues(name), ambassador:ambassadors(name)')
    .eq('sale_date', date || todayISO())
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getVenues() {
  if (USE_MOCK) return mockVenues
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, type, supervisor_id')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data || []
}

export async function getAmbassadors() {
  if (USE_MOCK) return mockAmbassadors
  const { data, error } = await supabase
    .from('ambassadors')
    .select('id, ambassador_code, name, default_venue_id')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data || []
}

export async function getProductsForVenueSales() {
  if (USE_MOCK) return mockProducts
  const { data, error } = await supabase
    .from('inventory_master')
    .select('id, name, category, unit_price, cost_price')
    .eq('is_active', true)
    .order('category')
    .order('name')
  if (error) throw error
  return data || []
}

// ============ Submit ============

/**
 * payload 結構（對應未來 hq_submit_venue_sales RPC）：
 * {
 *   sale_date, venue_id, ambassador_id, source_type,
 *   items: [{ product_id, product_name, category, quantity, unit_price, subtotal }],
 *   payment: { cash_amount, bank_transfer_amount, monthly_settlement_amount, unpaid_amount, payment_status },
 *   note, idempotency_key
 * }
 */
export async function submitVenueSales(payload) {
  // 確保 idempotency_key 存在
  const withKey = {
    ...payload,
    idempotency_key: payload.idempotency_key || newIdempotencyKey(),
  }

  if (USE_MOCK) {
    const saleId = `mock-${Date.now()}`
    const venue = mockVenues.find(v => v.id === withKey.venue_id)
    const amb = mockAmbassadors.find(a => a.id === withKey.ambassador_id)
    const p = withKey.payment || {}
    mockSales.unshift({
      id: saleId,
      sale_date: withKey.sale_date,
      venue_name: venue?.name || '—',
      ambassador_name: amb?.name || '—',
      total_amount: withKey.items.reduce((sum, it) => sum + (it.subtotal || 0), 0),
      cash_amount: p.cash_amount || 0,
      transfer_amount: p.bank_transfer_amount || 0,
      monthly_amount: p.monthly_settlement_amount || 0,
      unpaid_amount: p.unpaid_amount || 0,
      payment_status: p.payment_status || 'paid',
      note: withKey.note || null,
      created_at: new Date().toISOString(),
    })
    return { success: true, sale_id: saleId, mock: true }
  }

  // 正式 RPC call — 跟 hq_submit_venue_sales (hardening v2) 對接
  const { data, error } = await supabase.rpc('hq_submit_venue_sales', {
    payload: withKey,
    p_idempotency_key: withKey.idempotency_key,
    p_actor_id: withKey.created_by, // 前端要傳登入員工 id
  })
  if (error) throw error
  return data
}

// ============ Utils ============

export function todayISO() {
  const d = new Date()
  d.setHours(d.getHours() + 8) // Taipei timezone
  return d.toISOString().slice(0, 10)
}

// ============ Mock Data ============

const today = todayISO()

const mockVenues = [
  { id: 'v1', name: '君悅酒店', type: 'hotel' },
  { id: 'v2', name: '文華東方', type: 'hotel' },
  { id: 'v3', name: '寒舍艾美', type: 'hotel' },
  { id: 'v4', name: '晶華酒店', type: 'hotel' },
  { id: 'v5', name: '遠東香格里拉', type: 'hotel' },
]

const mockAmbassadors = [
  { id: 'a1', ambassador_code: 'A001', name: '王大明', default_venue_id: 'v1' },
  { id: 'a2', ambassador_code: 'A002', name: '陳小華', default_venue_id: 'v2' },
  { id: 'a3', ambassador_code: 'A003', name: '林志強', default_venue_id: 'v3' },
  { id: 'a4', ambassador_code: 'A004', name: '張雅婷', default_venue_id: 'v4' },
]

const mockProducts = [
  { id: 'p1',  name: 'Cohiba Siglo VI',         category: 'cuban_cigar',     unit_price: 3000 },
  { id: 'p2',  name: 'Cohiba Robusto',          category: 'cuban_cigar',     unit_price: 2200 },
  { id: 'p3',  name: 'Montecristo No.2',        category: 'cuban_cigar',     unit_price: 1500 },
  { id: 'p4',  name: 'Montecristo Edmundo',     category: 'cuban_cigar',     unit_price: 1300 },
  { id: 'p5',  name: 'Davidoff Nicaragua',      category: 'non_cuban_cigar', unit_price: 1600 },
  { id: 'p6',  name: 'Padron Anniversary',      category: 'non_cuban_cigar', unit_price: 1800 },
  { id: 'p7',  name: 'Arturo Fuente OpusX',     category: 'non_cuban_cigar', unit_price: 2400 },
  { id: 'p8',  name: '雪松木包',                 category: 'accessory',       unit_price: 100 },
  { id: 'p9',  name: 'Cohiba 打火機',            category: 'accessory',       unit_price: 2800 },
  { id: 'p10', name: '保濕包',                   category: 'accessory',       unit_price: 120 },
]

const mockSales = [
  { id: 'm1', sale_date: today, venue_name: '君悅酒店', ambassador_name: '王大明', total_amount: 12800, cash_amount: 8000, transfer_amount: 4800, monthly_amount: 0, unpaid_amount: 0, payment_status: 'paid' },
  { id: 'm2', sale_date: today, venue_name: '文華東方', ambassador_name: '陳小華', total_amount: 24500, cash_amount: 0, transfer_amount: 0, monthly_amount: 0, unpaid_amount: 24500, payment_status: 'unpaid' },
]

// 匯出分類 label，供 UI 使用
export const PRODUCT_CATEGORIES = {
  cuban_cigar: '古巴',
  non_cuban_cigar: '非古',
  accessory: '配件',
  drink: '飲品',
  other: '其他',
}

export const PAYMENT_STATUSES = {
  paid: '已收齊',
  partial: '部分收款',
  monthly: '月結',
  unpaid: '未收款',
}

export const SOURCE_TYPES = {
  hotel_manual: '酒店手動',
  venue_visit: '場域實訪',
  phone_order: '電話訂購',
  messenger_order: 'LINE / 通訊軟體',
  other: '其他',
}
