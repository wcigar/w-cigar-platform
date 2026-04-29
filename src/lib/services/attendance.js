// src/lib/services/attendance.js
// 員工/大使打卡 + 月度薪資 service
//
// 資料模型：
//   wcigar_attendance_v1 = {
//     [period]: {
//       [ambassador_id]: {
//         entries: [{ date, venue_id, hours, capa_qty, cuban_qty, transport, deduct, note, perf_note, hourly_rate_used }, ...],
//         monthly_bonuses: [{ name, amount }, ...],
//         monthly_deductions: [{ name, amount }, ...],
//       }
//     }
//   }
//
//   wcigar_hourly_rates_v1 = {
//     [ambassador_id]: { current: 600, history: [{from: '2026-04-01', rate: 500}, {from: '2026-04-11', rate: 600}] }
//   }
//
// MVP: localStorage. 之後切 Supabase ambassador_attendance 表。

const ATTENDANCE_KEY = 'wcigar_attendance_v1'
const HOURLY_KEY = 'wcigar_hourly_rates_v1'

// ============ 11 位大使 4 月時薪 (從 Wilson Excel 推算) ============
const SEED_HOURLY_RATES = {
  xiaoyun:  { current: 650, name: '小雲',  history: [{ from: '2026-04-01', rate: 650 }] },
  luby:     { current: 600, name: 'Luby',  history: [{ from: '2026-04-01', rate: 600 }] },
  sixuan:   { current: 550, name: '思萱',  history: [{ from: '2026-04-01', rate: 550 }] },
  xiao_a:   { current: 450, name: '小A',   history: [{ from: '2026-04-01', rate: 450 }] },
  nana:     { current: 550, name: 'NaNa',  history: [{ from: '2026-04-01', rate: 500 }, { from: '2026-04-11', rate: 550 }] },
  ann:      { current: 500, name: 'Ann',   history: [{ from: '2026-04-01', rate: 500 }] },
  lili:     { current: 500, name: '力力',  history: [{ from: '2026-04-01', rate: 500 }] },
  qianqian: { current: 550, name: '千千',  history: [{ from: '2026-04-01', rate: 550 }] },
  shenshen: { current: 550, name: '深深',  history: [{ from: '2026-04-01', rate: 500 }, { from: '2026-04-03', rate: 550 }] },
  xiaowei:  { current: 450, name: '小薇',  history: [{ from: '2026-04-01', rate: 450 }] },
  jie:      { current: 450, name: '潔',    history: [{ from: '2026-04-01', rate: 450 }] },
}

// ============ 4 月歷史薪資（從 Excel 摘要） ============
// 每位大使一個物件 = 月度匯總（已扣勞保、含獎金/扣款）
const SEED_APRIL_SUMMARY = {
  xiaoyun:  { period: '2026-04', total_hours: 25,   capa_qty: 6,    cuban_qty: 27, leave_days: 2, base_salary: 11700, transport: 2100, bonuses: 0,    deductions: 0,    total: 13800 },
  luby:     { period: '2026-04', total_hours: 9,    capa_qty: 3,    cuban_qty: 3,  leave_days: 3, base_salary: 1200,  transport: 0,    bonuses: 0,    deductions: 0,    total: 1200 },
  sixuan:   { period: '2026-04', total_hours: 7,    capa_qty: 11.5, cuban_qty: 3,  leave_days: 0, base_salary: 6175,  transport: 700,  bonuses: 0,    deductions: 0,    total: 6875 },
  xiao_a:   { period: '2026-04', total_hours: 34,   capa_qty: 40,   cuban_qty: 13, leave_days: 3, base_salary: 18800, transport: 0,    bonuses: 2000, deductions: -250, total: 18550, deduct_note: '未達標 -200; 報表錯 -50' },
  nana:     { period: '2026-04', total_hours: 26.5, capa_qty: 6,    cuban_qty: 67, leave_days: 0, base_salary: 13900, transport: 0,    bonuses: 6000, deductions: -200, total: 19900, deduct_note: '打卡紙未傳 -200', bonus_note: '2月不分品項並列ㄧ名 +2000、2月古巴銷量第二名 +2000、2月根數除時數第ㄧ名 +2000（成功加薪 +50）' },
  ann:      { period: '2026-04', total_hours: 45,   capa_qty: 8,    cuban_qty: 41, leave_days: 0, base_salary: 8775,  transport: 350,  bonuses: 0,    deductions: 0,    total: 9125 },
  lili:     { period: '2026-04', total_hours: 16,   capa_qty: 5,    cuban_qty: 3,  leave_days: 0, base_salary: 5800,  transport: 80,   bonuses: 0,    deductions: -327, total: 5553, deduct_note: '打卡紙未傳 -200; 扣勞保 -127' },
  qianqian: { period: '2026-04', total_hours: 32,   capa_qty: 48.5, cuban_qty: 11, leave_days: 0, base_salary: 25575, transport: 0,    bonuses: 5000, deductions: -200, total: 30375, bonus_note: '2月不分品項並列ㄧ名 +2000、2月古巴銷量第ㄧ名 +3000', deduct_note: '統計錯 -100×2' },
  shenshen: { period: '2026-04', total_hours: 31.5, capa_qty: 10,   cuban_qty: 49, leave_days: 0, base_salary: 14775, transport: 0,    bonuses: 1000, deductions: 0,    total: 15775, bonus_note: '2月根數除時數第二名 +1000（加薪 +50）' },
  xiaowei:  { period: '2026-04', total_hours: 2,    capa_qty: 20,   cuban_qty: 6,  leave_days: 0, base_salary: 5850,  transport: 0,    bonuses: 0,    deductions: -200, total: 5650, deduct_note: '打卡紙未傳 -200' },
  jie:      { period: '2026-04', total_hours: 24,   capa_qty: 41,   cuban_qty: 10, leave_days: 0, base_salary: 17950, transport: 1160, bonuses: 0,    deductions: 0,    total: 19110 },
}

// ============ localStorage ============

function readStore() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(ATTENDANCE_KEY) || '{}') } catch { return {} }
}
function writeStore(s) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(s)) } catch {}
}

function readHourly() {
  if (typeof window === 'undefined') return SEED_HOURLY_RATES
  try {
    const stored = JSON.parse(localStorage.getItem(HOURLY_KEY) || 'null')
    return stored || SEED_HOURLY_RATES
  } catch { return SEED_HOURLY_RATES }
}
function writeHourly(s) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(HOURLY_KEY, JSON.stringify(s)) } catch {}
}

// 第一次載入自動 seed
function ensureSeeded() {
  if (typeof window === 'undefined') return
  const hr = JSON.parse(localStorage.getItem(HOURLY_KEY) || 'null')
  if (!hr) writeHourly(SEED_HOURLY_RATES)
  const att = JSON.parse(localStorage.getItem(ATTENDANCE_KEY) || 'null')
  if (!att) {
    const initial = { '2026-04': {} }
    Object.entries(SEED_APRIL_SUMMARY).forEach(([ambId, sum]) => {
      initial['2026-04'][ambId] = {
        summary: sum,
        entries: [],  // daily entries — 4 月用 summary 直接顯示，5月開始員工填
        monthly_bonuses: sum.bonus_note ? [{ name: sum.bonus_note, amount: sum.bonuses }] : [],
        monthly_deductions: sum.deduct_note ? [{ name: sum.deduct_note, amount: sum.deductions }] : [],
      }
    })
    writeStore(initial)
  }
}

// ============ Public API ============

export function listAmbassadorsWithRates() {
  ensureSeeded()
  const rates = readHourly()
  return Object.entries(rates).map(([id, r]) => ({
    id, name: r.name, current_rate: r.current, history: r.history || [],
  }))
}

export function getHourlyRate(ambassadorId, atDate) {
  const rates = readHourly()
  const r = rates[ambassadorId]
  if (!r) return 500  // default
  if (!atDate) return r.current
  const sortedHist = [...(r.history || [])].sort((a, b) => b.from.localeCompare(a.from))
  for (const h of sortedHist) {
    if (h.from <= atDate) return h.rate
  }
  return r.current
}

export function setHourlyRate(ambassadorId, newRate, effectiveFrom) {
  const rates = readHourly()
  const r = rates[ambassadorId] || { current: 500, name: ambassadorId, history: [] }
  r.history = [...(r.history || []), { from: effectiveFrom || new Date().toISOString().slice(0, 10), rate: Number(newRate) }]
  r.current = Number(newRate)
  rates[ambassadorId] = r
  writeHourly(rates)
  return { success: true }
}

/**
 * 取得月度薪資總表
 *   period: 'YYYY-MM'
 *   回傳：[{ ambassador_id, name, hourly_rate, total_hours, capa_qty, cuban_qty, base_salary, transport, bonuses, deductions, total, ... }]
 */
export function listMonthlyPayroll(period) {
  ensureSeeded()
  const store = readStore()
  const rates = readHourly()
  const monthData = store[period] || {}
  const rows = Object.entries(rates).map(([ambId, rateInfo]) => {
    const data = monthData[ambId]
    if (data?.summary) {
      return {
        ambassador_id: ambId,
        name: rateInfo.name,
        hourly_rate: rateInfo.current,
        ...data.summary,
        bonuses_detail: data.monthly_bonuses || [],
        deductions_detail: data.monthly_deductions || [],
        is_seeded: true,  // 從 Excel 摘要來的
      }
    }
    // 沒 summary → 從 entries 累加
    const entries = data?.entries || []
    const totalHours = entries.reduce((s, e) => s + Number(e.hours || 0), 0)
    const capa = entries.reduce((s, e) => s + Number(e.capa_qty || 0), 0)
    const cuban = entries.reduce((s, e) => s + Number(e.cuban_qty || 0), 0)
    const baseSalary = entries.reduce((s, e) => s + (Number(e.hours || 0) * Number(e.hourly_rate_used || rateInfo.current)), 0)
    const transport = entries.reduce((s, e) => s + Number(e.transport || 0), 0)
    const entryDeduct = entries.reduce((s, e) => s + Number(e.deduct || 0), 0)
    const monthlyBonus = (data?.monthly_bonuses || []).reduce((s, b) => s + Number(b.amount || 0), 0)
    const monthlyDeduct = (data?.monthly_deductions || []).reduce((s, d) => s + Number(d.amount || 0), 0)
    return {
      ambassador_id: ambId,
      name: rateInfo.name,
      hourly_rate: rateInfo.current,
      period,
      total_hours: totalHours,
      capa_qty: capa,
      cuban_qty: cuban,
      base_salary: Math.round(baseSalary),
      transport,
      bonuses: monthlyBonus,
      deductions: entryDeduct + monthlyDeduct,
      total: Math.round(baseSalary) + transport + monthlyBonus + entryDeduct + monthlyDeduct,
      bonuses_detail: data?.monthly_bonuses || [],
      deductions_detail: data?.monthly_deductions || [],
      is_seeded: false,
    }
  })
  return rows
}

/**
 * 取得單位大使的 daily entries
 */
export function listDailyEntries(period, ambassadorId) {
  ensureSeeded()
  const store = readStore()
  return store[period]?.[ambassadorId]?.entries || []
}

/**
 * 新增/更新一筆 daily entry
 */
export function upsertDailyEntry(period, ambassadorId, entry) {
  ensureSeeded()
  const store = readStore()
  if (!store[period]) store[period] = {}
  if (!store[period][ambassadorId]) store[period][ambassadorId] = { entries: [], monthly_bonuses: [], monthly_deductions: [] }
  const list = store[period][ambassadorId].entries
  const idx = entry.id ? list.findIndex(e => e.id === entry.id) : -1
  const rate = getHourlyRate(ambassadorId, entry.date)
  const merged = {
    ...entry,
    id: entry.id || `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    hourly_rate_used: rate,
    hours: Number(entry.hours) || 0,
    capa_qty: Number(entry.capa_qty) || 0,
    cuban_qty: Number(entry.cuban_qty) || 0,
    transport: Number(entry.transport) || 0,
    deduct: Number(entry.deduct) || 0,
  }
  if (idx >= 0) list[idx] = merged
  else list.push(merged)
  writeStore(store)
  return { success: true, entry: merged }
}

export function removeDailyEntry(period, ambassadorId, entryId) {
  ensureSeeded()
  const store = readStore()
  const list = store[period]?.[ambassadorId]?.entries
  if (!list) return { success: false }
  store[period][ambassadorId].entries = list.filter(e => e.id !== entryId)
  writeStore(store)
  return { success: true }
}

/**
 * 設定月度獎金/扣款（不在 daily entry，例如「成功達標獎金」）
 */
export function setMonthlyBonus(period, ambassadorId, bonusList) {
  ensureSeeded()
  const store = readStore()
  if (!store[period]) store[period] = {}
  if (!store[period][ambassadorId]) store[period][ambassadorId] = { entries: [], monthly_bonuses: [], monthly_deductions: [] }
  store[period][ambassadorId].monthly_bonuses = bonusList || []
  writeStore(store)
  return { success: true }
}

export function setMonthlyDeductions(period, ambassadorId, deductList) {
  ensureSeeded()
  const store = readStore()
  if (!store[period]) store[period] = {}
  if (!store[period][ambassadorId]) store[period][ambassadorId] = { entries: [], monthly_bonuses: [], monthly_deductions: [] }
  store[period][ambassadorId].monthly_deductions = deductList || []
  writeStore(store)
  return { success: true }
}

export function _clearAttendanceStore() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ATTENDANCE_KEY)
    localStorage.removeItem(HOURLY_KEY)
  }
}

export function _reseedHistorical() {
  _clearAttendanceStore()
  ensureSeeded()
  return { success: true }
}
