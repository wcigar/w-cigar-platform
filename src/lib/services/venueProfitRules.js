// src/lib/services/venueProfitRules.js
import { supabase } from '../supabase'

const USE_MOCK = true

export async function listVenueProfitRules() {
  if (USE_MOCK) return mockRules
  const { data, error } = await supabase
    .from('venue_profit_rules')
    .select('*, venue:venues(name)')
    .eq('is_active', true)
  if (error) throw error
  return data || []
}

export async function upsertVenueProfitRule(payload, actorId) {
  if (USE_MOCK) return { success: true, rule_id: 'vp-mock' }
  const { data, error } = await supabase.rpc('upsert_venue_profit_rule', {
    payload, p_actor_id: actorId,
  })
  if (error) throw error
  return data
}

export async function getVenueProfitSummary() {
  if (USE_MOCK) return mockSummary
  const { data, error } = await supabase.from('venue_profit_summary_view').select('*')
  if (error) throw error
  return data || []
}

const mockRules = [
  { id: 'vp1', venue_id: 'v1', venue: { name: '君悅酒店' }, rule_name: '君悅 寄賣 2026',
    settlement_type: 'consignment', venue_share_type: 'percentage', venue_share_rate: 0.25,
    company_margin_rate: 0.4, ambassador_commission_basis: 'gross_profit',
    settlement_cycle: 'monthly', payment_terms_days: 30 },
  { id: 'vp2', venue_id: 'v2', venue: { name: '文華東方' }, rule_name: '文華 拆帳 2026',
    settlement_type: 'revenue_share', venue_share_type: 'percentage', venue_share_rate: 0.30,
    company_margin_rate: 0.35, ambassador_commission_basis: 'gross_profit',
    settlement_cycle: 'monthly', payment_terms_days: 45 },
]

const mockSummary = [
  { venue_name: '君悅酒店', revenue: 480000, cost: 180000, venue_share: 120000, company_gross: 180000, ambassador_commission_cost: 24000, company_net_est: 156000 },
  { venue_name: '文華東方', revenue: 320000, cost: 128000, venue_share: 96000, company_gross: 96000, ambassador_commission_cost: 14300, company_net_est: 81700 },
]
