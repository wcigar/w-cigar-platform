// src/lib/services/compensationRules.js
import { supabase } from '../supabase'

const USE_MOCK = true

export async function listCompensationProfiles() {
  if (USE_MOCK) return mockProfiles
  const { data, error } = await supabase
    .from('ambassador_compensation_profiles')
    .select('*, ambassador:ambassadors(name)')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getAmbassadorProfile(ambassadorId) {
  if (USE_MOCK) return mockProfiles.find(p => p.ambassador_id === ambassadorId)
  const { data, error } = await supabase
    .from('ambassador_compensation_profiles')
    .select('*, rules:ambassador_commission_rules(*), tiers:ambassador_commission_tiers(*)')
    .eq('ambassador_id', ambassadorId)
    .eq('is_active', true).single()
  if (error) throw error
  return data
}

export async function upsertProfile(payload, actorId) {
  if (USE_MOCK) return { success: true, profile_id: 'prof-mock' }
  const { data, error } = await supabase.rpc('upsert_ambassador_compensation_profile', {
    payload, p_actor_id: actorId,
  })
  if (error) throw error
  return data
}

export async function approveProfile(profileId, actorId) {
  if (USE_MOCK) return { success: true }
  const { data, error } = await supabase.rpc('approve_compensation_profile', {
    p_profile_id: profileId, p_actor_id: actorId,
  })
  if (error) throw error
  return data
}

const mockProfiles = [
  { id: 'p1', ambassador_id: 'a1', ambassador: { name: '王大明' }, profile_name: '王大明 2026-Q2',
    employment_type: 'base_plus_commission', base_salary: 20000, hourly_rate: 250,
    default_commission_type: 'gross_profit', default_commission_rate: 0.05,
    effective_from: '2026-04-01', status: 'active' },
  { id: 'p2', ambassador_id: 'a2', ambassador: { name: '陳小華' }, profile_name: '陳小華 2026-Q2',
    employment_type: 'commission_only', base_salary: 0, hourly_rate: 230,
    default_commission_type: 'revenue', default_commission_rate: 0.05,
    effective_from: '2026-04-01', status: 'active' },
]
