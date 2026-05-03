// src/lib/services/supervisorHome.js
//
// 督導 Home 頁 service。UI 不直接碰 supabase，全走這層。
// 提供：
//   - getMyVenues(supervisorId)       — 我管的店家清單
//   - getMonthlyDue(period, venueIds) — 本月每店應收明細 (from monthly_collections)
//   - getAuditedVenuesToday(...)      — 我今日已打卡的店 (RPC, cast uuid → text)
//   - recordTransferLog(...)          — 凌晨「我已轉帳」按鈕寫入

import { supabase } from '../supabase'

// ============ 我管的店清單 ============
// 從 venues 表撈 supervisor_id = 當前督導 id 的店
// 只回 is_active = true 的店（避免顯示已停用酒店）
export async function getMyVenues(supervisorId) {
  if (!supervisorId) return []
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, region, address, has_self_sale, supervisor_id')
    .eq('supervisor_id', supervisorId)
    .eq('is_active', true)
    .order('name')
  if (error) {
    console.error('[supervisorHome] getMyVenues error:', error)
    return []
  }
  return data || []
}

// ============ 本月每店應收明細 ============
// 撈 monthly_collections 該期所有我管的店
// 應收 = venue_share_due_ambassador + venue_share_due_self
// 已收 = paid_amount
export async function getMonthlyDue(period, venueIds) {
  if (!period || !venueIds || venueIds.length === 0) return []
  const { data, error } = await supabase
    .from('monthly_collections')
    .select('venue_id, venue_share_due_ambassador, venue_share_due_self, paid_amount, paid_at, status')
    .eq('period', period)
    .in('venue_id', venueIds)
  if (error) {
    console.error('[supervisorHome] getMonthlyDue error:', error)
    return []
  }
  return (data || []).map(r => ({
    venue_id: r.venue_id,
    due_amount: Number(r.venue_share_due_ambassador || 0) + Number(r.venue_share_due_self || 0),
    paid_amount: Number(r.paid_amount || 0),
    paid_at: r.paid_at,
    status: r.status,
  }))
}

// ============ 今日已打卡的店 ============
// supervisor_audits.venue_id 是 uuid 但 venues.id 是 text
// 用 RPC cast::text 後回傳，前端 string 比對
// p_audit_date 用 ISO date 'YYYY-MM-DD'
export async function getAuditedVenuesToday(supervisorId, dateStr) {
  if (!supervisorId || !dateStr) return new Set()
  const { data, error } = await supabase.rpc('get_supervisor_audited_venues_today', {
    p_supervisor_id: supervisorId,
    p_audit_date: dateStr,
  })
  if (error) {
    console.error('[supervisorHome] getAuditedVenuesToday error:', error)
    return new Set()
  }
  return new Set((data || []).map(r => r.venue_id))
}

// ============ 計算每家店狀態 ============
// 規則:
//   - 'paid'      : monthly_collections.paid_amount > 0
//   - 'audited'   : 已有 supervisor_audits 紀錄 但 paid = 0
//   - 'pending'   : 未到店（沒 audit 紀錄 且 paid = 0）
export function venueStatus(dueRow, isAuditedToday) {
  if (dueRow && Number(dueRow.paid_amount || 0) > 0) return 'paid'
  if (isAuditedToday) return 'audited'
  return 'pending'
}

export const STATUS_META = {
  pending: { label: '未到店', color: '#8a8278', bg: '#1a1714' },
  audited: { label: '已打卡', color: '#f59e0b', bg: '#f59e0b22' },
  paid:    { label: '已收款', color: '#10b981', bg: '#10b98122' },
}

// ============ 凌晨轉帳記錄 ============
// 督導當晚收完所有店家後，回家陽信轉帳給公司，按按鈕寫一筆
export async function recordTransferLog({ supervisor_id, period, total_amount, notes }) {
  if (!supervisor_id || !period || !total_amount) {
    return { success: false, error: '缺少必要參數' }
  }
  const { error } = await supabase.from('supervisor_transfer_log').insert({
    supervisor_id,
    period,
    total_amount: Number(total_amount),
    notes: notes || null,
  })
  if (error) {
    console.error('[supervisorHome] recordTransferLog error:', error)
    return { success: false, error: '轉帳記錄寫入失敗，稍後再試' }
  }
  return { success: true }
}

// ============ Today date helper ============
export function todayISO() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
