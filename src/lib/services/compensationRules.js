// src/lib/services/compensationRules.js
// === 重做：時薪 + 每日門檻獎金 ===
// Wilson 業務邏輯：
//   - 每位大使：時薪（個別設定）
//   - 全公司共用：每日門檻獎金（古巴/非古巴各一條）
//     例如：非古巴 ≥ 7 根，每多 1 根 +NT$50
//           古巴   ≥ 3 根，每多 1 根 +NT$100
//   - 月薪 = (時薪 × 上班時數) + Σ每日獎金
//
// localStorage:
//   wcigar_compensation_thresholds_v1 = [{ id, category, threshold_qty, bonus_per_extra, enabled }]
//   wcigar_compensation_hourly_v1 = { [ambassador_id]: hourly_rate }

import { supabase } from '../supabase'
import { getAllAmbassadors } from './venueSales'

const USE_MOCK = true
const TH_KEY = 'wcigar_compensation_thresholds_v1'
const HR_KEY = 'wcigar_compensation_hourly_v1'

const DEFAULT_THRESHOLDS = [
  {
    id: 'th_non_cuban',
    name: '非古巴雪茄獎金',
    category: 'non_cuban_cigar',
    threshold_qty: 7,        // 每日 ≥ 7 根
    bonus_per_extra: 50,     // 每多賣 1 根 +NT$50
    enabled: true,
  },
  {
    id: 'th_cuban',
    name: '古巴雪茄獎金',
    category: 'cuban_cigar',
    threshold_qty: 3,        // 每日 ≥ 3 根
    bonus_per_extra: 100,    // 每多賣 1 根 +NT$100
    enabled: true,
  },
]

const DEFAULT_HOURLY = 200

function readThresholds() {
  if (typeof window === 'undefined') return DEFAULT_THRESHOLDS
  try {
    const raw = localStorage.getItem(TH_KEY)
    if (!raw) return DEFAULT_THRESHOLDS
    const arr = JSON.parse(raw)
    return Array.isArray(arr) && arr.length > 0 ? arr : DEFAULT_THRESHOLDS
  } catch { return DEFAULT_THRESHOLDS }
}
function writeThresholds(list) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(TH_KEY, JSON.stringify(list)) } catch {}
}

function readHourly() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(HR_KEY) || '{}') } catch { return {} }
}
function writeHourly(map) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(HR_KEY, JSON.stringify(map)) } catch {}
}

// ---------- Public API: thresholds ----------

export function listThresholds() {
  return readThresholds()
}

export function upsertThreshold(threshold) {
  const list = readThresholds()
  const idx = list.findIndex(t => t.id === threshold.id)
  if (idx >= 0) list[idx] = { ...list[idx], ...threshold }
  else list.push({ ...threshold, id: threshold.id || `th_${Date.now().toString(36)}` })
  writeThresholds(list)
  return { success: true }
}

export function removeThreshold(id) {
  const list = readThresholds().filter(t => t.id !== id)
  writeThresholds(list)
  return { success: true }
}

export function resetDefaultThresholds() {
  writeThresholds(DEFAULT_THRESHOLDS)
  return { success: true, list: DEFAULT_THRESHOLDS }
}

// ---------- Public API: hourly rates ----------

/**
 * 取所有大使列表 + 各自時薪
 */
export async function listAmbassadorsWithHourly() {
  const ambs = await getAllAmbassadors()
  const map = readHourly()
  return ambs.map(a => ({
    ...a,
    hourly_rate: map[a.id] ?? DEFAULT_HOURLY,
    is_default: map[a.id] == null,
  }))
}

export function setAmbassadorHourly(ambassadorId, rate) {
  const map = readHourly()
  map[ambassadorId] = Math.max(0, Number(rate) || 0)
  writeHourly(map)
  return { success: true, hourly_rate: map[ambassadorId] }
}

export function getAmbassadorHourly(ambassadorId) {
  const map = readHourly()
  return map[ambassadorId] ?? DEFAULT_HOURLY
}

// ---------- Calculation engine ----------

/**
 * 算單日獎金。
 *   dailySales: { cuban_cigar: 8, non_cuban_cigar: 12 }（賣的根數）
 * 回傳：{ total_bonus, lines: [{ category, threshold, qty, extra, bonus }] }
 */
export function calcDailyBonus(dailySales) {
  const ths = readThresholds().filter(t => t.enabled)
  const lines = []
  let total = 0
  ths.forEach(t => {
    const qty = Number(dailySales?.[t.category]) || 0
    const extra = Math.max(0, qty - t.threshold_qty)
    const bonus = extra * (Number(t.bonus_per_extra) || 0)
    if (qty > 0 || bonus > 0) {
      lines.push({
        category: t.category, name: t.name,
        threshold_qty: t.threshold_qty,
        qty, extra, bonus_per_extra: t.bonus_per_extra, bonus,
      })
    }
    total += bonus
  })
  return { total_bonus: total, lines }
}

/**
 * 算月薪。
 *   ambassadorId
 *   monthlyHours: 累計上班時數
 *   dailySalesArr: [{ cuban_cigar, non_cuban_cigar }, ...]（每天一筆，30 天）
 */
export function calcMonthlySalary({ ambassadorId, monthlyHours = 0, dailySalesArr = [] }) {
  const hourly = getAmbassadorHourly(ambassadorId)
  const hourlyTotal = hourly * monthlyHours
  let bonusTotal = 0
  const dailyBonuses = dailySalesArr.map(d => {
    const r = calcDailyBonus(d)
    bonusTotal += r.total_bonus
    return r
  })
  return {
    ambassador_id: ambassadorId,
    hourly_rate: hourly,
    monthly_hours: monthlyHours,
    hourly_total: hourlyTotal,
    bonus_total: bonusTotal,
    daily_bonus_lines: dailyBonuses,
    total_salary: hourlyTotal + bonusTotal,
  }
}

// ---------- Backward compat ----------

export async function listCompensationProfiles() {
  // 舊頁面可能 import；回傳空避免崩
  const ambs = await listAmbassadorsWithHourly()
  return ambs.map(a => ({
    id: a.id, ambassador_id: a.id, ambassador: { name: a.displayName },
    profile_name: `${a.displayName} 時薪+獎金`,
    employment_type: 'hourly_plus_threshold',
    base_salary: 0, hourly_rate: a.hourly_rate,
    status: 'active',
  }))
}
export async function getAmbassadorProfile() { return null }
export async function upsertProfile() { return { success: false, error: '已改用新模型' } }
export async function approveProfile() { return { success: true } }

export function _clearCompensationStore() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TH_KEY)
    localStorage.removeItem(HR_KEY)
  }
}
