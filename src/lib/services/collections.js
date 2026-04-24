// src/lib/services/collections.js
// 督導收帳
import { supabase } from '../supabase'

const USE_MOCK = true

export const COLLECTION_STATUSES = {
  pending: { label: '待收', color: '#f59e0b' },
  partial: { label: '部分收款', color: '#fbbf24' },
  collected: { label: '已收齊', color: '#10b981' },
  exception: { label: '差額異常', color: '#dc2626' },
}

export async function listCollections({ supervisorId, venueIds } = {}) {
  if (USE_MOCK) return mockCollections
  const { data, error } = await supabase.rpc('supervisor_get_collection_status', { p_supervisor_id: supervisorId, p_venue_ids: venueIds })
  if (error) throw error
  return data || []
}

export async function submitCollection({ saleId, method, amount, proofUrl, note }) {
  if (USE_MOCK) return { success: true }
  const { data, error } = await supabase.rpc('supervisor_submit_collection', {
    p_sale_id: saleId, p_method: method, p_amount: amount, p_proof_url: proofUrl, p_note: note,
  })
  if (error) throw error
  return data
}

const mockCollections = [
  { id: 'c1', sale_id: 's1', venue_name: '文華東方', ambassador_name: '陳小華', due_amount: 24500, collected_amount: 0, status: 'pending', due_date: '2026-04-28' },
  { id: 'c2', sale_id: 's2', venue_name: '君悅', ambassador_name: '王大明', due_amount: 18000, collected_amount: 10000, status: 'partial', due_date: '2026-04-27' },
]
