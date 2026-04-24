// src/lib/services/venueSales.js
// HQ/Staff 酒店銷售 key-in。MVP 使用 mock，RPC 還沒部署。
import { supabase } from '../supabase'

const USE_MOCK = true // 等 RPC 部署後改 false

export async function listVenueSales({ date, venueId } = {}) {
  if (USE_MOCK) return mockList
  const { data, error } = await supabase
    .from('venue_sales_daily')
    .select('*, venue:venues(name), ambassador:ambassadors(name)')
    .eq('sale_date', date || todayISO())
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function submitVenueSales(payload) {
  if (USE_MOCK) {
    mockList.unshift({ id: `mock-${Date.now()}`, ...payload, created_at: new Date().toISOString() })
    return { success: true, sale_id: `mock-${Date.now()}` }
  }
  const { data, error } = await supabase.rpc('hq_submit_venue_sales', payload)
  if (error) throw error
  return data
}

export function todayISO() { return new Date().toISOString().slice(0, 10) }

const mockList = [
  { id: 'm1', sale_date: todayISO(), venue_name: '君悅酒店', ambassador_name: '王大明', total_amount: 12800, cash_amount: 8000, transfer_amount: 4800, unpaid_amount: 0, payment_status: 'paid' },
  { id: 'm2', sale_date: todayISO(), venue_name: '文華東方', ambassador_name: '陳小華', total_amount: 24500, cash_amount: 0, transfer_amount: 0, unpaid_amount: 24500, payment_status: 'unpaid' },
]
