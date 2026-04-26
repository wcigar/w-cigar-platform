// src/lib/services/supervisors.js
// 督導 service：4 位督導 hardcoded（KELLY、IRIS、NANA 台北 / BOA 台中）
//
// 督導職責：每月去自己負責的店家收帳，分兩段確認：
//   1. 大使賣的銷量（從 KEY-in 累計）→ 系統自動算
//   2. 店家少爺自賣的銷量（盤點時補錄）→ 督導現場填
//
// localStorage:
//   wcigar_supervisor_assignments_v1 = { [venue_id]: supervisor_id }

const USE_MOCK = true
const STORAGE_KEY = 'wcigar_supervisor_assignments_v1'

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

// ---------- localStorage layer ----------

function readAssignments() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}

function writeAssignments(map) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)) } catch {}
}

/**
 * 取得單店指派的督導 id
 */
export function getSupervisorOfVenue(venueId) {
  const map = readAssignments()
  return map[venueId] || null
}

/**
 * 指派/變更店家督導
 */
export function assignVenueToSupervisor(venueId, supervisorId) {
  const map = readAssignments()
  if (supervisorId) map[venueId] = supervisorId
  else delete map[venueId]
  writeAssignments(map)
  return { success: true }
}

/**
 * 取得某督導負責的所有 venue id
 */
export function getVenuesBySupervisor(supervisorId) {
  const map = readAssignments()
  return Object.keys(map).filter(vid => map[vid] === supervisorId)
}

/**
 * 取得 supervisor → venueIds 的反向 map（給統計用）
 */
export function getSupervisorVenueMap() {
  const assignments = readAssignments()
  const out = {}
  SUPERVISORS.forEach(s => { out[s.id] = [] })
  Object.entries(assignments).forEach(([vid, sid]) => {
    if (out[sid]) out[sid].push(vid)
  })
  return out
}

/**
 * 自動建議：如果某店未指派督導，按 region 自動分配
 *   台中所有店 → BOA
 *   台北店 → 平均分給 KELLY/IRIS/NANA
 */
export function autoAssignByRegion(venues) {
  const map = readAssignments()
  const taipeiUnassigned = venues.filter(v => v.region === 'taipei' && !map[v.id])
  const taichungUnassigned = venues.filter(v => v.region === 'taichung' && !map[v.id])
  const taipeiSupers = ['KELLY', 'IRIS', 'NANA']
  taipeiUnassigned.forEach((v, i) => {
    map[v.id] = taipeiSupers[i % 3]
  })
  taichungUnassigned.forEach(v => {
    map[v.id] = 'BOA'
  })
  writeAssignments(map)
  return { success: true, assigned: taipeiUnassigned.length + taichungUnassigned.length }
}
