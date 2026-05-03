// src/services/salesInputService.js
// 給 /admin/sales-input 頁專用的 Service 層
// 透過 RPC submit_venue_sale 一次寫入 venue_sales_daily + 扣 inventory + UPSERT monthly_collections
import { supabase } from '../lib/supabase'

export async function submitSale({
  saleDate,
  venueId,
  ambassadorId,
  items,
  totalAmount,
  submittedBy,
  notes,
}) {
  const { data, error } = await supabase.rpc('submit_venue_sale', {
    p_sale_date: saleDate,
    p_venue_id: venueId,
    p_ambassador_id: ambassadorId,
    p_items: items,
    p_total_amount: totalAmount,
    p_submitted_by: submittedBy,
    p_notes: notes,
  })
  if (error) throw error
  if (!data?.success) throw new Error(data?.error || 'RPC 回傳 success=false')
  return data
}

export async function getVenuePricing(venueId) {
  const { data, error } = await supabase
    .from('venue_pricing')
    .select('product_key, sale_price, venue_share_per_unit')
    .eq('venue_id', venueId)
    .gt('sale_price', 0)
    .order('product_key')
  if (error) throw error
  return data || []
}

export async function listVenues() {
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, region, supervisor_id')
    .eq('is_active', true)
    .order('region')
    .order('name')
  if (error) throw error
  return data || []
}

export async function listAmbassadors() {
  const { data, error } = await supabase
    .from('ambassadors')
    .select('id, ambassador_code, name')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data || []
}
