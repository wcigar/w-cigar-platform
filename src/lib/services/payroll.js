// src/lib/services/payroll.js
// 大使薪資：期、薪資單、調整
import { supabase } from '../supabase'
import { newIdempotencyKey } from './idempotency'

const USE_MOCK = true

// ---------- periods ----------
export async function listPayrollPeriods() {
  if (USE_MOCK) return mockPeriods
  const { data, error } = await supabase
    .from('ambassador_payroll_periods')
    .select('*')
    .order('period_start', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getPeriod(id) {
  if (USE_MOCK) return mockPeriods.find(p => p.id === id)
  const { data, error } = await supabase
    .from('ambassador_payroll_periods')
    .select('*')
    .eq('id', id).single()
  if (error) throw error
  return data
}

export async function calculatePayroll(periodId, actorId) {
  if (USE_MOCK) return { success: true, items_created: 5 }
  const { data, error } = await supabase.rpc('calculate_ambassador_payroll', {
    p_period_id: periodId, p_actor_id: actorId,
  })
  if (error) throw error
  return data
}

// ---------- items ----------
export async function listPayrollItems(periodId) {
  if (USE_MOCK) return mockItems
  const { data, error } = await supabase
    .from('ambassador_payroll_items')
    .select('*, ambassador:ambassadors(name)')
    .eq('payroll_period_id', periodId)
    .order('total_payable_amount', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getPayrollItem(periodId, ambassadorId) {
  if (USE_MOCK) return mockItems.find(i => i.ambassador_id === ambassadorId) || mockItems[0]
  const { data, error } = await supabase
    .from('ambassador_payroll_items')
    .select('*, details:ambassador_payroll_item_details(*)')
    .eq('payroll_period_id', periodId)
    .eq('ambassador_id', ambassadorId).single()
  if (error) throw error
  return data
}

// ---------- workflow transitions ----------
export async function bossApprove(periodId, actorId) {
  return wrapRpc(USE_MOCK, 'boss_approve_ambassador_payroll', { p_period_id: periodId, p_actor_id: actorId })
}
export async function accountingConfirm(periodId, actorId) {
  return wrapRpc(USE_MOCK, 'accounting_confirm_payroll', { p_period_id: periodId, p_actor_id: actorId })
}
export async function schedulePayment(periodId, actorId) {
  return wrapRpc(USE_MOCK, 'schedule_payroll_payment', { p_period_id: periodId, p_actor_id: actorId })
}
export async function markPaid(periodId, actorId) {
  return wrapRpc(USE_MOCK, 'mark_payroll_paid', { p_period_id: periodId, p_actor_id: actorId })
}
export async function lockPeriod(periodId, actorId) {
  return wrapRpc(USE_MOCK, 'lock_ambassador_payroll_period', { p_period_id: periodId, p_actor_id: actorId })
}

// ---------- adjustments ----------
export async function createAdjustment({ periodId, ambassadorId, type, amount, reason, actorId }) {
  if (USE_MOCK) return { success: true, adjustment_id: 'adj-mock' }
  const { data, error } = await supabase.rpc('create_payroll_adjustment', {
    p_period_id: periodId, p_ambassador_id: ambassadorId,
    p_type: type, p_amount: amount, p_reason: reason,
    p_actor_id: actorId, p_idempotency_key: newIdempotencyKey(),
  })
  if (error) throw error
  return data
}

// ---------- dashboard ----------
export async function getPayrollDashboard() {
  if (USE_MOCK) return {
    current_period: mockPeriods[0],
    collection_impact: [
      { venue_name: '君悅', outstanding: 24500, affected_ambassadors: 2, pending_commission_total: 4900 },
    ],
  }
  const { data, error } = await supabase.rpc('get_boss_payroll_dashboard')
  if (error) throw error
  return data
}

// ---------- helpers ----------
async function wrapRpc(mock, name, args) {
  if (mock) return { success: true, mock: true }
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

// ---------- mock ----------
const mockPeriods = [
  { id: 'p1', period_name: '2026-04', period_start: '2026-04-01', period_end: '2026-04-30',
    status: 'calculated', total_payable: 184000, total_sales: 1240000, ambassador_count: 5 },
  { id: 'p2', period_name: '2026-03', period_start: '2026-03-01', period_end: '2026-03-31',
    status: 'locked', total_payable: 162000, total_sales: 1090000, ambassador_count: 5 },
]
const mockItems = [
  { id: 'i1', ambassador_id: 'a1', ambassador: { name: '王大明' },
    hourly_rate_snapshot: 250, approved_hours: 80, hourly_pay: 20000,
    sales_amount: 420000, collected_amount: 360000, pending_collection_amount: 60000,
    commission_amount: 21000, pending_commission_amount: 3000, payable_commission_amount: 18000,
    bonus_amount: 0, deduction_amount: 0, adjustment_amount: 0,
    total_estimated_pay: 41000, total_recognized_pay: 41000, total_payable_amount: 38000,
    status: 'calculated' },
  { id: 'i2', ambassador_id: 'a2', ambassador: { name: '陳小華' },
    hourly_rate_snapshot: 230, approved_hours: 72, hourly_pay: 16560,
    sales_amount: 286000, collected_amount: 286000, pending_collection_amount: 0,
    commission_amount: 14300, pending_commission_amount: 0, payable_commission_amount: 14300,
    bonus_amount: 2000, deduction_amount: 0, adjustment_amount: 0,
    total_estimated_pay: 32860, total_recognized_pay: 32860, total_payable_amount: 32860,
    status: 'calculated' },
]
