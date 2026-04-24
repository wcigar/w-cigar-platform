// src/lib/services/warehouse.js
import { supabase } from '../supabase'

const USE_MOCK = true

export async function listPickLists() {
  if (USE_MOCK) return mockPickLists
  const { data, error } = await supabase.from('replenishment_runs').select('*').in('status', ['draft', 'confirmed']).order('run_date', { ascending: true })
  if (error) throw error
  return data || []
}

export async function listSupplyPickLists() {
  if (USE_MOCK) return mockSupplyPickLists
  const { data, error } = await supabase.rpc('warehouse_get_supply_pick_list')
  if (error) throw error
  return data || []
}

export async function listShipments() {
  if (USE_MOCK) return mockShipments
  const { data, error } = await supabase.from('warehouse_shipments').select('*').order('shipped_at', { ascending: false }).limit(50)
  if (error) throw error
  return data || []
}

export async function confirmPick({ runId, items }) {
  if (USE_MOCK) return { success: true, shipment_id: 'ws-mock' }
  const { data, error } = await supabase.rpc('warehouse_confirm_pick', { p_run_id: runId, p_items: items })
  if (error) throw error
  return data
}

const mockPickLists = [
  { id: 'run-1', run_date: '2026-04-25', venue_count: 3, total_items: 12, total_qty: 85, status: 'draft' },
]
const mockSupplyPickLists = [
  { request_id: 'sr-1', ambassador_name: '王大明', venue_name: '君悅', items_count: 3, urgency: 'urgent' },
  { request_id: 'sr-2', ambassador_name: '陳小華', venue_name: '文華東方', items_count: 5, urgency: 'normal' },
]
const mockShipments = [
  { id: 'ws-1', shipment_no: 'WS-260425-0001', run_date: '2026-04-25', status: 'shipped', items_count: 12 },
]
