// src/lib/services/venues.js
// 店家（Venue）後台管理 service。
// Phase 1: 已接 Supabase venues 表（DB 為唯一來源）。
import { supabase } from '../supabase'

const REGIONS = { taipei: '台北', taoyuan: '桃園', hsinchu: '新竹', taichung: '台中', tainan: '台南', kaohsiung: '高雄' }

let _cache = []

function syncCache(rows) {
  _cache = (rows || []).map(r => ({
    id: r.id,
    name: r.name,
    region: r.region,
    address: r.address || '',
    is_active: r.is_active !== false,
    assigned_ambassador_codes: r.assigned_ambassador_codes || [],
    default_alert_threshold: r.default_alert_threshold ?? 3,
    has_self_sale: !!r.has_self_sale,
    supervisor_id: r.supervisor_id || null,
    source: r.source || 'manual',
  }))
}

export async function listVenues() {
  const { data, error } = await supabase
    .from('venues').select('*').order('region').order('name')
  if (error) throw error
  syncCache(data)
  return _cache.slice()
}

export async function getVenueById(id) {
  const cached = _cache.find(v => v.id === id)
  if (cached) return cached
  const { data, error } = await supabase.from('venues').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function upsertVenue(payload) {
  const id = payload.id || slugify(payload.name)
  const row = {
    id,
    name: String(payload.name || '').trim(),
    region: payload.region || 'taipei',
    address: String(payload.address || '').trim(),
    is_active: payload.is_active !== false,
    assigned_ambassador_codes: Array.isArray(payload.assigned_ambassador_codes)
      ? [...new Set(payload.assigned_ambassador_codes.filter(Boolean))]
      : [],
    default_alert_threshold: payload.default_alert_threshold != null
      ? Math.max(0, Number(payload.default_alert_threshold))
      : 3,
    has_self_sale: !!payload.has_self_sale,
    supervisor_id: payload.supervisor_id || null,
    source: payload.source || 'manual',
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('venues').upsert(row).select().single()
  if (error) throw error
  const idx = _cache.findIndex(v => v.id === id)
  if (idx >= 0) _cache[idx] = data
  else _cache.push(data)
  return { success: true, venue: data }
}

export async function deactivateVenue(id) {
  const { error } = await supabase.from('venues').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  const v = _cache.find(x => x.id === id)
  if (v) v.is_active = false
  return { success: true }
}

export async function activateVenue(id) {
  const { error } = await supabase.from('venues').update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  const v = _cache.find(x => x.id === id)
  if (v) v.is_active = true
  return { success: true }
}

export function getAssignedAmbassadorCodes(venueId) {
  const v = _cache.find(x => x.id === venueId)
  return v?.assigned_ambassador_codes || []
}

export function getDefaultAlertThreshold(venueId) {
  const v = _cache.find(x => x.id === venueId)
  return v?.default_alert_threshold ?? 3
}

export function getDefaultAlertMap() {
  const map = {}
  _cache.forEach(v => { map[v.id] = v.default_alert_threshold ?? 3 })
  return map
}

export const REGION_OPTIONS = REGIONS

function slugify(name) {
  if (!name) return 'venue_' + Date.now()
  return String(name).toLowerCase().trim()
    .replace(/[^a-z0-9_一-龥]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || ('venue_' + Date.now())
}
