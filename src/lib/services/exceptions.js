// src/lib/services/exceptions.js
// exception_events (新表，不沿用 abnormal_reports)
import { supabase } from '../supabase'

const USE_MOCK = true

export const EXCEPTION_CATEGORIES = {
  shipment_qty_mismatch: '出貨數量不符',
  receipt_qty_mismatch: '大使收貨不符',
  venue_inventory: '酒店庫存異常',
  collection_short: '收款金額不符',
  replenishment_overdue: '補貨單未處理',
  receipt_overdue: '大使未確認收貨',
  collection_overdue: '督導未收帳',
  supply_receipt: '耗材收貨異常',
  high_risk_supply: '高風險耗材異常申請',
}

export async function listExceptions({ status = 'open' } = {}) {
  if (USE_MOCK) return mockList
  const { data, error } = await supabase
    .from('exception_events')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function resolveException(id, resolution) {
  if (USE_MOCK) return { success: true }
  const { error } = await supabase
    .from('exception_events')
    .update({ status: 'resolved', resolution, resolved_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  return { success: true }
}

const mockList = [
  { id: 'e1', category: 'receipt_qty_mismatch', severity: 'warning', title: '君悅酒店 Cohiba Siglo VI 實收少 2 支', status: 'open', created_at: new Date().toISOString() },
  { id: 'e2', category: 'collection_short', severity: 'critical', title: '文華東方 4/24 短收 NT$4,500', status: 'open', created_at: new Date().toISOString() },
  { id: 'e3', category: 'high_risk_supply', severity: 'warning', title: '王大明 連續 3 次申請瓦斯罐', status: 'open', created_at: new Date().toISOString() },
]
