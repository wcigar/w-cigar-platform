// src/lib/services/supervisors.js
// 督導 service：4 位督導 hardcoded（KELLY、IRIS、NANA 台北 / BOA 台中）
// 綁定來源：venues.supervisor_id (DB，TEXT 欄位)
//
// 督導職責：每月去自己負責的店家收帳，分兩段確認：
//   1. 大使賣的銷量（從 KEY-in 累計）→ 系統自動算
//   2. 店家少爺自賣的銷量（盤點時補錄）→ 督導現場填
import { supabase } from '../supabase'

// 4 位督導（hardcoded）
export const SUPERVISORS = [
  { id: 'KELLY', name: 'Kelly', region: 'taipei',   color: '#ef4444' },
  { id: 'IRIS',  name: 'Iris',  region: 'taipei',   color: '#3b82f6' },
  { id: 'NANA',  name: 'Nana',  region: 'taipei',   color: '#a855f7' },
  { id: 'BOA',   name: 'Boa',   region: 'taichung', color: '#10b981' },
]

export function listSupervisors() {
  return SUPERVISORS
}

export function getSupervisorById(id) {
  return SUPERVISORS.find(s => s.id === id) || null
}

// 設定酒店督導（寫 DB）
export async function setVenueSupervisor(venueId, supervisorId) {
  const { error } = await supabase
    .from('venues')
    .update({ supervisor_id: supervisorId || null, updated_at: new Date().toISOString() })
    .eq('id', venueId)
  if (error) throw error
  return { success: true }
}

// 讀取所有綁定（從 DB 讀，回傳 { venueId: supervisorId } map）
export async function loadVenueSupervisors() {
  const { data, error } = await supabase
    .from('venues')
    .select('id, supervisor_id')
    .not('supervisor_id', 'is', null)
  if (error) return {}
  const map = {}
  ;(data || []).forEach(v => { map[v.id] = v.supervisor_id })
  return map
}

// supervisor → venueIds 反向 map（給統計用）
export async function getSupervisorVenueMap() {
  const assignments = await loadVenueSupervisors()
  const out = {}
  SUPERVISORS.forEach(s => { out[s.id] = [] })
  Object.entries(assignments).forEach(([vid, sid]) => {
    if (out[sid]) out[sid].push(vid)
  })
  return out
}

// 自動指派（按地區）— 只填未指派的店；台中 → BOA、台北 KELLY/IRIS/NANA 平均
export async function autoAssignByRegion(venues) {
  const existing = await loadVenueSupervisors()
  const taipeiUnassigned = venues.filter(v => v.region === 'taipei' && !existing[v.id])
  const taichungUnassigned = venues.filter(v => v.region === 'taichung' && !existing[v.id])
  const taipeiSupers = ['KELLY', 'IRIS', 'NANA']
  const writes = []
  taipeiUnassigned.forEach((v, i) => {
    writes.push(setVenueSupervisor(v.id, taipeiSupers[i % 3]))
  })
  taichungUnassigned.forEach(v => {
    writes.push(setVenueSupervisor(v.id, 'BOA'))
  })
  await Promise.all(writes)
  return { success: true, assigned: taipeiUnassigned.length + taichungUnassigned.length }
}
