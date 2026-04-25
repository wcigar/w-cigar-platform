// src/lib/services/accountingReports.js
import { supabase } from '../supabase'

const USE_MOCK = true

export async function listReports() {
  if (USE_MOCK) return mockReports
  const { data, error } = await supabase
    .from('accounting_payroll_reports')
    .select('*, period:ambassador_payroll_periods(period_name)')
    .order('generated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getReport(id) {
  if (USE_MOCK) return { ...mockReports[0], items: mockReportItems }
  const { data, error } = await supabase
    .from('accounting_payroll_reports')
    .select('*, items:accounting_payroll_report_items(*, ambassador:ambassadors(name))')
    .eq('id', id).single()
  if (error) throw error
  return data
}

export async function generateReport(periodId, actorId) {
  if (USE_MOCK) return { success: true, report_id: 'apr-mock' }
  const { data, error } = await supabase.rpc('generate_accounting_payroll_report', {
    p_period_id: periodId, p_actor_id: actorId,
  })
  if (error) throw error
  return data
}

export async function finalizeReport(reportId, actorId) {
  if (USE_MOCK) return { success: true }
  const { data, error } = await supabase.rpc('finalize_accounting_payroll_report', {
    p_report_id: reportId, p_actor_id: actorId,
  })
  if (error) throw error
  return data
}

const mockReports = [
  { id: 'r1', report_no: 'APR-260425-0001', payroll_period_id: 'p1',
    status: 'generated', report_version: 1,
    total_payable: 184000, total_pending: 3000, total_adjustments: 2000,
    period: { period_name: '2026-04' }, generated_at: new Date().toISOString() },
]

const mockReportItems = [
  { id: 'ri1', ambassador: { name: '王大明' }, hourly_pay: 20000, commission_amount: 21000,
    pending_commission: 3000, payable_commission: 18000, bonus_amount: 0, deduction_amount: 0,
    adjustment_amount: 0, total_payable: 38000, payment_status: 'calculated', accounting_note: null },
  { id: 'ri2', ambassador: { name: '陳小華' }, hourly_pay: 16560, commission_amount: 14300,
    pending_commission: 0, payable_commission: 14300, bonus_amount: 2000, deduction_amount: 0,
    adjustment_amount: 0, total_payable: 32860, payment_status: 'calculated', accounting_note: null },
]
