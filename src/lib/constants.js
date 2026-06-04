export const SHIFTS = {
  '早班': { start: '12:00', end: '21:00', hours: 9, startH: 12, startM: 0, endH: 21, endM: 0 },
  '晚班': { start: '15:00', end: '00:00', hours: 9, startH: 15, startM: 0, endH: 24, endM: 0 },
  '單人班': { start: '14:00', end: '23:00', hours: 9, startH: 14, startM: 0, endH: 23, endM: 0 },  // 1 人值班日：14:00-23:00 固定，照常判遲到/早退
  'PT早班': { start: '12:00', end: '15:00', hours: 3, startH: 12, startM: 0, endH: 15, endM: 0 },  // PT 時薪短班 12-15
  'PT午班': { start: '14:00', end: '18:00', hours: 4, startH: 14, startM: 0, endH: 18, endM: 0 },  // PT 時薪短班 14-18
  'PT晚班': { start: '18:00', end: '22:00', hours: 4, startH: 18, startM: 0, endH: 22, endM: 0 },  // PT 時薪短班 18-22
  '彈性班': { start: null, end: null, hours: 9, flexible: true },  // 不固定時段、不判遲到/早退（少用，PT 已有自己的彈性路徑）
  '休假': { start: null, end: null, hours: 0 },
}

export const LEAVE_TYPES = ['休假','臨時請假','病假','事假','特休','調班']
export const STORE_LOCATION = { lat: 25.0269184, lng: 121.5419774, radius: 100 }
export const LATE_GRACE_MIN = 5
export const OT_GRACE_MIN = 15

export const LABOR_INS_BRACKETS = [29500,30300,31800,33300,34800,36300,38200,40100,42000,43900,45800]
export const HEALTH_INS_BRACKETS = [29500,30300,31800,33300,34800,36300,38200,40100,42000,43900,45800,48200,50600,53000,55400,57800,60800,63800,66800,69800,72800,76500,80200,83900,87600,92100,96600,101100,105600,110100,115500,120900,126300,131700,137100,142500,147900,150000]
export const LABOR_INS_RATE = 0.125
export const HEALTH_INS_RATE = 0.0517
export const LABOR_PENSION_RATE = 0.06

export function findBracket(salary, brackets) { for (const b of brackets) { if (salary <= b) return b } return brackets[brackets.length - 1] }
export function calcLaborIns(ms) { if (!ms || ms <= 0) return 0; return Math.round(findBracket(ms, LABOR_INS_BRACKETS) * LABOR_INS_RATE * 0.2) }
export function calcHealthIns(ms) { if (!ms || ms <= 0) return 0; return Math.round(findBracket(ms, HEALTH_INS_BRACKETS) * HEALTH_INS_RATE * 0.3) }
export function calcLaborPension(ms) { return Math.round(findBracket(ms, HEALTH_INS_BRACKETS) * LABOR_PENSION_RATE) }
export function calcLaborInsER(ms) { if (!ms || ms <= 0) return 0; return Math.round(findBracket(ms, LABOR_INS_BRACKETS) * LABOR_INS_RATE * 0.7) }
export function calcHealthInsER(ms) { if (!ms || ms <= 0) return 0; return Math.round(findBracket(ms, HEALTH_INS_BRACKETS) * HEALTH_INS_RATE * 0.6) }

// 加班費計算（平日延長工時、勞基法 §24）
export function calcOvertimePay(hourlyRate, otMinutes) {
  const hrs = otMinutes / 60
  if (hrs <= 0) return 0
  if (hrs <= 2) return Math.round(hourlyRate * hrs * 1.34)
  return Math.round(hourlyRate * 2 * 1.34 + hourlyRate * (hrs - 2) * 1.67)
}

/**
 * 加班費分倍率（依當日類型）勞基法 §24 / §39 / §40
 *   dayType:
 *     '平日'   = 工作日延長工時（前2hr ×1.34、第3-4hr ×1.67）
 *     '休息日' = 通常週六（前2hr ×1.34、第3-8hr ×1.67、第9-12hr ×2.67）
 *     '國定'   = 國定假日 / 特休日（1-8hr 一律一日工資、第9-10hr ×1.34、第11-12hr ×1.67）
 *     '例假'   = 通常週日，禁加班；若加班 8hr 內「做1給8」、8hr+ 另計（罕用）
 *   返回 { otPay, dailyBase, breakdown[] } 拆解每段倍率
 */
export function calcOvertimePayByDayType(hourlyRate, otMinutes, dayType = '平日') {
  const otHrs = otMinutes / 60
  const breakdown = []
  let dailyBase = 0
  let otPay = 0
  if (otHrs <= 0 && dayType !== '國定' && dayType !== '例假') return { otPay: 0, dailyBase: 0, breakdown: [] }

  if (dayType === '國定') {
    // 1-8hr 一律一日工資 = 8 × hourlyRate (即使只做 1hr 也給滿)
    dailyBase = Math.round(hourlyRate * 8)
    breakdown.push({ label: '國定基本工資（1日）', hours: 8, rate: 1, amount: dailyBase })
    if (otHrs > 8) {
      const tier1 = Math.min(otHrs - 8, 2)
      const t1Pay = Math.round(hourlyRate * tier1 * 1.34)
      otPay += t1Pay
      breakdown.push({ label: '國定加班 第1-2hr', hours: +tier1.toFixed(2), rate: 1.34, amount: t1Pay })
      if (otHrs > 10) {
        const tier2 = Math.min(otHrs - 10, 2)
        const t2Pay = Math.round(hourlyRate * tier2 * 1.67)
        otPay += t2Pay
        breakdown.push({ label: '國定加班 第3-4hr', hours: +tier2.toFixed(2), rate: 1.67, amount: t2Pay })
      }
    }
    return { otPay: dailyBase + otPay, dailyBase, breakdown }
  }

  if (dayType === '休息日') {
    if (otHrs > 0) {
      const t1 = Math.min(otHrs, 2)
      const p1 = Math.round(hourlyRate * t1 * 1.34)
      otPay += p1
      breakdown.push({ label: '休息日 前2hr', hours: +t1.toFixed(2), rate: 1.34, amount: p1 })
    }
    if (otHrs > 2) {
      const t2 = Math.min(otHrs - 2, 6)
      const p2 = Math.round(hourlyRate * t2 * 1.67)
      otPay += p2
      breakdown.push({ label: '休息日 第3-8hr', hours: +t2.toFixed(2), rate: 1.67, amount: p2 })
    }
    if (otHrs > 8) {
      const t3 = Math.min(otHrs - 8, 4)
      const p3 = Math.round(hourlyRate * t3 * 2.67)
      otPay += p3
      breakdown.push({ label: '休息日 第9-12hr', hours: +t3.toFixed(2), rate: 2.67, amount: p3 })
    }
    return { otPay, dailyBase: 0, breakdown }
  }

  if (dayType === '例假') {
    // 罕用：勞基法 §40 規定例假禁加班、若實際加班「做 1 給 8」
    if (otHrs > 0) {
      dailyBase = Math.round(hourlyRate * 8)
      breakdown.push({ label: '例假日 做1給8（一日工資）', hours: 8, rate: 1, amount: dailyBase })
      if (otHrs > 8) {
        const extra = otHrs - 8
        const p = Math.round(hourlyRate * extra * 1.67)
        otPay += p
        breakdown.push({ label: '例假 8hr+', hours: +extra.toFixed(2), rate: 1.67, amount: p })
      }
    }
    return { otPay: dailyBase + otPay, dailyBase, breakdown }
  }

  // 平日延長工時（預設）
  if (otHrs > 0) {
    const t1 = Math.min(otHrs, 2)
    const p1 = Math.round(hourlyRate * t1 * 1.34)
    otPay += p1
    breakdown.push({ label: '平日延長 前2hr', hours: +t1.toFixed(2), rate: 1.34, amount: p1 })
  }
  if (otHrs > 2) {
    const t2 = Math.min(otHrs - 2, 2)
    const p2 = Math.round(hourlyRate * t2 * 1.67)
    otPay += p2
    breakdown.push({ label: '平日延長 第3-4hr', hours: +t2.toFixed(2), rate: 1.67, amount: p2 })
  }
  return { otPay, dailyBase: 0, breakdown }
}

/**
 * 補休折算（勞基法 §32-1）— 加班時數 × 倍率 = 補休時數
 * 例：休息日加班 2hr × 1.34 = 2.68hr 補休
 */
export function calcCompLeaveHours(otMinutes, dayType = '平日') {
  const otHrs = otMinutes / 60
  if (otHrs <= 0 && dayType !== '國定' && dayType !== '例假') return 0
  if (dayType === '國定' || dayType === '例假') {
    let h = 8 // 一日工資對應 8hr 補休
    if (otHrs > 8) h += (otHrs - 8) * 1.34
    return +h.toFixed(2)
  }
  // 休息日 / 平日：按倍率累加（簡化版、與加班費同樣分段）
  let h = 0
  if (dayType === '休息日') {
    if (otHrs > 0) h += Math.min(otHrs, 2) * 1.34
    if (otHrs > 2) h += Math.min(otHrs - 2, 6) * 1.67
    if (otHrs > 8) h += Math.min(otHrs - 8, 4) * 2.67
  } else {
    if (otHrs > 0) h += Math.min(otHrs, 2) * 1.34
    if (otHrs > 2) h += Math.min(otHrs - 2, 2) * 1.67
  }
  return +h.toFixed(2)
}

/**
 * 從 schedule.shift / national_holidays / dayOfWeek 推算當日類型
 * @param dateStr - 'YYYY-MM-DD'
 * @param holidayMap - { [date]: { type: '國定假日'|'補假'|...,name } }
 * @returns '平日' | '休息日' | '例假' | '國定'
 */
export function inferDayType(dateStr, holidayMap = {}) {
  const h = holidayMap[dateStr]
  if (h && (h.type === '國定假日' || h.type === '補假')) return '國定'
  const dow = new Date(dateStr + 'T00:00:00+08:00').getDay()  // 0=Sun 6=Sat
  if (dow === 0) return '例假'
  if (dow === 6) return '休息日'
  return '平日'
}
export const SCHED_RULES = {
  tuesdayAllWork: true,
  rickyFixedOff: [0, 6],
  danielConsecRest: 2,
  jessicaConsecRest: 2,
}
