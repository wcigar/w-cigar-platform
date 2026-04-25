// src/lib/services/supplies.js
// 大使耗材申請 + HQ 審核 + 收貨
import { supabase } from '../supabase'

const USE_MOCK = true

// 高風險耗材（需主管核准）
export const HIGH_RISK_SUPPLIES = ['gas', 'flat_cutter', 'v_cutter', 'drill', 'pin']

export const SUPPLY_CATEGORIES = [
  { code: 'cedar', name: '雪松木', unit: '包' },
  { code: 'humidity_pack', name: '保濕包', unit: '個' },
  { code: 'zip_bag', name: '夾鏈袋', unit: '包' },
  { code: 'gas', name: '瓦斯罐', unit: '罐', highRisk: true },
  { code: 'flat_cutter', name: '平剪', unit: '支', highRisk: true },
  { code: 'v_cutter', name: 'V 剪', unit: '支', highRisk: true },
  { code: 'drill', name: '鑽孔器', unit: '支', highRisk: true },
  { code: 'pin', name: '通針', unit: '支', highRisk: true },
  { code: 'other', name: '其他', unit: '-' },
]

export const SUPPLY_STATUSES = {
  draft: { label: '草稿', color: '#6b7280' },
  submitted: { label: '已送出', color: '#3b82f6' },
  approved: { label: '已核准', color: '#10b981' },
  adjusted_approved: { label: '調整後核准', color: '#14b8a6' },
  rejected: { label: '已駁回', color: '#ef4444' },
  picking: { label: '總倉備貨中', color: '#f59e0b' },
  shipped: { label: '已出貨', color: '#c9a84c' },
  received: { label: '已簽收', color: '#22c55e' },
  discrepancy: { label: '收貨異常', color: '#dc2626' },
  closed: { label: '已結案', color: '#71717a' },
}

// ============ 大使端 ============
export async function myRequests(ambassadorId) {
  if (USE_MOCK) return mockMyRequests
  const { data, error } = await supabase.rpc('ambassador_get_my_supply_requests', { p_ambassador_id: ambassadorId })
  if (error) throw error
  return data || []
}

export async function submitRequest(payload) {
  if (USE_MOCK) {
    mockMyRequests.unshift({ id: `mock-${Date.now()}`, ...payload, status: 'submitted', created_at: new Date().toISOString() })
    return { success: true, request_id: `mock-${Date.now()}` }
  }
  const { data, error } = await supabase.rpc('ambassador_submit_supply_request', payload)
  if (error) throw error
  return data
}

export async function myPendingSupplyReceipts(ambassadorId) {
  if (USE_MOCK) return mockPendingSupplyReceipts
  const { data, error } = await supabase.rpc('ambassador_get_pending_supply_receipts', { p_ambassador_id: ambassadorId })
  if (error) throw error
  return data || []
}

export async function confirmSupplyReceipt(shipmentId) {
  if (USE_MOCK) return { success: true }
  const { data, error } = await supabase.rpc('ambassador_confirm_supply_receipt', { p_shipment_id: shipmentId })
  if (error) throw error
  return data
}

// ============ HQ 端 ============
export async function listSupplyRequestsForHQ(filter = {}) {
  if (USE_MOCK) return mockHQRequests
  const { data, error } = await supabase.rpc('hq_get_supply_requests', filter)
  if (error) throw error
  return data || []
}

export async function reviewRequest({ requestId, decision, overrides, reason }) {
  if (USE_MOCK) return { success: true }
  const rpcName = decision === 'reject'
    ? 'hq_reject_supply_request'
    : (overrides ? 'hq_adjust_and_approve_supply_request' : 'hq_review_supply_request')
  const { data, error } = await supabase.rpc(rpcName, { p_request_id: requestId, p_overrides: overrides, p_reason: reason })
  if (error) throw error
  return data
}

// ============ Mock ============
const today = new Date().toISOString().slice(0,10)
const mockMyRequests = [
  { id: 'sr-1', request_date: today, urgency: 'urgent', status: 'approved', items_count: 2, reason: '下週客戶團訂桌' },
  { id: 'sr-2', request_date: '2026-04-20', urgency: 'normal', status: 'received', items_count: 4, reason: '例行補貨' },
]
const mockPendingSupplyReceipts = [
  { shipment_id: 'ss-1', shipment_no: 'SS-260425-0001', items_count: 3, shipped_at: new Date().toISOString() },
]
const mockHQRequests = [
  { id: 'sr-1', ambassador_name: '王大明', venue_name: '君悅', request_date: today, urgency: 'urgent', status: 'submitted', items_count: 2, has_high_risk: true },
  { id: 'sr-2', ambassador_name: '陳小華', venue_name: '文華東方', request_date: today, urgency: 'normal', status: 'submitted', items_count: 4, has_high_risk: false },
]
