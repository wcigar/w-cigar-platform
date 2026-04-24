// src/lib/services/replenishment.js
import { supabase } from '../supabase'

const USE_MOCK = true

export async function listReplenishmentRuns({ date } = {}) {
  if (USE_MOCK) return mockRuns
  const { data, error } = await supabase
    .from('replenishment_runs')
    .select('*')
    .order('run_date', { ascending: false })
    .limit(30)
  if (error) throw error
  return data || []
}

export async function getReplenishmentRun(id) {
  if (USE_MOCK) return mockRuns.find(r => r.id === id) || null
  const { data, error } = await supabase
    .from('replenishment_runs')
    .select('*, items:replenishment_items(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function generateDailyReplenishment(runDate) {
  if (USE_MOCK) return { success: true, run_id: 'mock-run', items_count: 8 }
  const { data, error } = await supabase.rpc('generate_daily_replenishment', { p_run_date: runDate })
  if (error) throw error
  return data
}

const mockRuns = [
  { id: 'run-1', run_date: new Date().toISOString().slice(0,10), status: 'draft', total_items: 12, total_qty: 85 },
  { id: 'run-2', run_date: '2026-04-24', status: 'shipped', total_items: 9, total_qty: 64 },
]
