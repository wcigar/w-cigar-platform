// src/lib/services/venues.js
// 店家（Venue）後台管理 service。
//
// MVP 策略：
//   - USE_MOCK=true（與 venueSales.js 一致），資料以 localStorage 持久化
//     localStorage key: 'wcigar_venues_admin_v1'
//   - 列表來源 = TAIPEI/TAICHUNG_VENUE_TEMPLATE（read-only baseline）
//                ∪ localStorage 「新增/編輯」覆寫層
//   - 同一 venue id：localStorage > template
//   - assigned_ambassador_codes 也存在這層
//
// 未來切到正式 DB：USE_MOCK=false 後直接 query `venues` table，
// 大使綁定改 query `ambassador_assignments` join。UI 不需要動。

import { supabase } from '../supabase'

const USE_MOCK = true

const VENUES_OVERRIDE_KEY = 'wcigar_venues_admin_v1'
const REGIONS = { taipei: '台北', taichung: '台中' }

// ---------- localStorage layer ----------

function readOverrides() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(VENUES_OVERRIDE_KEY) || '{}') } catch { return {} }
}

function writeOverrides(map) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(VENUES_OVERRIDE_KEY, JSON.stringify(map)) } catch {}
}

// 把 base template 的 venue 拉出簡單欄位（不含 products），給 Venues 後台使用
function templateBaseVenues() {
  // 動態 import 避免 circular（venueSales.js 也 import 我）
  // 改用 require-style：把 template 直接複製成 plain data。
  // 為了避免 circular，這份 baseline 暫存於本檔常數中（與 venueSales.js 同步維護）。
  return TEMPLATE_BASE_VENUES
}

// ---------- 模板基線（與 venueSales.js TAIPEI/TAICHUNG_VENUE_TEMPLATE 同步）----------
// 只記 metadata（id/name/region），不含 products；products 留在 venueSales.js
const TEMPLATE_BASE_VENUES = [
  // 台北 22 家
  { id: 'westin',           name: '威士登',     region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'royal',            name: '皇家',       region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'hongxin',          name: '鴻欣',       region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'focus',            name: 'Focus',      region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'haosheng',         name: '豪昇',       region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'weijing',          name: '威晶',       region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'haowei',           name: '豪威',       region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'ziteng',           name: '紫藤',       region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'zongcai',          name: '總裁',       region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'zhongguocheng',    name: '中國城',     region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'xiangge',          name: '香閣',       region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'baida',            name: '百達',       region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'trans',            name: '特蘭斯',     region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'm_nanmo',          name: 'Ｍ男模',     region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'xiangshui',        name: '香水',       region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'shouxi',           name: '首席',       region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'xin_hao_marriott', name: '新濠(萬豪)', region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'nanmo_502',        name: '502男模',    region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'longsheng',        name: '龍昇',       region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'flare',            name: 'Flare',      region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'jinsha',           name: '金沙',       region: 'taipei',   address: '', is_active: true, source: 'template' },
  { id: 'jinnadu',          name: '金拿督',     region: 'taipei',   address: '', is_active: true, source: 'template' },
  // 台中 5 家
  { id: 'zijue',            name: '紫爵',       region: 'taichung', address: '', is_active: true, source: 'template' },
  { id: 'jinlidu',          name: '金麗都',     region: 'taichung', address: '', is_active: true, source: 'template' },
  { id: 'soak',             name: 'soak',       region: 'taichung', address: '', is_active: true, source: 'template' },
  { id: 'shenhua',          name: '神話',       region: 'taichung', address: '', is_active: true, source: 'template' },
  { id: 'pink',             name: 'pink',       region: 'taichung', address: '', is_active: true, source: 'template' },
]

// ---------- 公開 API ----------

/**
 * 列出所有店家（template ∪ localStorage 覆寫）
 * 回傳：[{ id, name, region, address, is_active, assigned_ambassador_codes:[], source: 'template'|'custom', is_overridden: bool }]
 */
export async function listVenues() {
  if (USE_MOCK) return mergeVenues()
  const { data, error } = await supabase
    .from('venues').select('id, name, region, address, is_active')
    .order('region').order('name')
  if (error) throw error
  return data || []
}

export async function getVenueById(id) {
  if (USE_MOCK) return mergeVenues().find(v => v.id === id) || null
  const { data, error } = await supabase
    .from('venues').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/**
 * 新增 / 更新店家（含 assigned_ambassador_codes）
 * payload: { id?, name, region, address, is_active, assigned_ambassador_codes }
 *   - id 缺省 → 從 name 自動 slug；若已存在 id → update
 */
export async function upsertVenue(payload) {
  if (USE_MOCK) {
    const overrides = readOverrides()
    const id = payload.id || slugify(payload.name)
    overrides[id] = {
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
        : (overrides[id]?.default_alert_threshold ?? 3),
      updated_at: new Date().toISOString(),
    }
    writeOverrides(overrides)
    return { success: true, venue_id: id }
  }
  const { data, error } = await supabase.rpc('upsert_venue', { payload })
  if (error) throw error
  return data
}

/**
 * 軟刪除（deactivate）。template 預設店家不能真刪，只能 deactivate。
 */
export async function deactivateVenue(id) {
  if (USE_MOCK) {
    const overrides = readOverrides()
    const base = mergeVenues().find(v => v.id === id)
    if (!base) return { success: false, error: '店家不存在' }
    overrides[id] = { ...overrides[id], ...base, is_active: false, updated_at: new Date().toISOString() }
    writeOverrides(overrides)
    return { success: true }
  }
  const { data, error } = await supabase.from('venues').update({ is_active: false }).eq('id', id)
  if (error) throw error
  return data
}

/**
 * 重新啟用
 */
export async function activateVenue(id) {
  if (USE_MOCK) {
    const overrides = readOverrides()
    const base = mergeVenues().find(v => v.id === id)
    if (!base) return { success: false, error: '店家不存在' }
    overrides[id] = { ...overrides[id], ...base, is_active: true, updated_at: new Date().toISOString() }
    writeOverrides(overrides)
    return { success: true }
  }
  const { data, error } = await supabase.from('venues').update({ is_active: true }).eq('id', id)
  if (error) throw error
  return data
}

/**
 * 取得單店的綁定大使 code 陣列（給 venueSales.js 用）
 */
export function getAssignedAmbassadorCodes(venueId) {
  const v = mergeVenues().find(x => x.id === venueId)
  return v?.assigned_ambassador_codes || []
}

export function getDefaultAlertThreshold(venueId) {
  const v = mergeVenues().find(x => x.id === venueId)
  return v?.default_alert_threshold ?? 3
}

export function getDefaultAlertMap() {
  const map = {}
  mergeVenues().forEach(v => { map[v.id] = v.default_alert_threshold ?? 3 })
  return map
}

export const REGION_OPTIONS = REGIONS

// ---------- 內部 helper ----------

function mergeVenues() {
  const overrides = readOverrides()
  const base = templateBaseVenues()
  const baseIds = new Set(base.map(v => v.id))

  // 1. base + override
  const merged = base.map(v => {
    const o = overrides[v.id]
    if (!o) return { ...v, assigned_ambassador_codes: [], default_alert_threshold: 3, is_overridden: false }
    return {
      id: v.id,
      name: o.name || v.name,
      region: o.region || v.region,
      address: o.address || v.address || '',
      is_active: o.is_active !== false,
      assigned_ambassador_codes: o.assigned_ambassador_codes || [],
      default_alert_threshold: o.default_alert_threshold ?? 3,
      source: 'template',
      is_overridden: true,
    }
  })

  // 2. 純 custom 新增（不在 baseIds 內）
  Object.values(overrides).forEach(o => {
    if (!baseIds.has(o.id)) {
      merged.push({
        id: o.id,
        name: o.name,
        region: o.region || 'taipei',
        address: o.address || '',
        is_active: o.is_active !== false,
        assigned_ambassador_codes: o.assigned_ambassador_codes || [],
        default_alert_threshold: o.default_alert_threshold ?? 3,
        source: 'custom',
        is_overridden: true,
      })
    }
  })

  // 排序：region → name
  return merged.sort((a, b) => {
    if (a.region !== b.region) return a.region === 'taipei' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-Hant')
  })
}

function slugify(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
  return base ? `custom_${base}_${Date.now().toString(36).slice(-4)}` : `custom_${Date.now().toString(36)}`
}
