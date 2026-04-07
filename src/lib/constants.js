export const SHIFTS = {
  '早班': { start: '12:00', end: '21:00', hours: 9, startH: 12, startM: 0, endH: 21, endM: 0 },
  '晚班': { start: '15:00', end: '00:00', hours: 9, startH: 15, startM: 0, endH: 24, endM: 0 },
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
export function calcLaborIns(ms) { return Math.round(findBracket(ms, LABOR_INS_BRACKETS) * LABOR_INS_RATE * 0.2) }
export function calcHealthIns(ms) { return Math.round(findBracket(ms, HEALTH_INS_BRACKETS) * HEALTH_INS_RATE * 0.3) }
export function calcLaborPension(ms) { return Math.round(findBracket(ms, HEALTH_INS_BRACKETS) * LABOR_PENSION_RATE) }
export function calcLaborInsER(ms) { return Math.round(findBracket(ms, LABOR_INS_BRACKETS) * LABOR_INS_RATE * 0.7) }
export function calcHealthInsER(ms) { return Math.round(findBracket(ms, HEALTH_INS_BRACKETS) * HEALTH_INS_RATE * 0.6 * 1.56) }

// 加班費計算
export function calcOvertimePay(hourlyRate, otMinutes) {
  const hrs = otMinutes / 60
  if (hrs <= 0) return 0
  if (hrs <= 2) return Math.round(hourlyRate * hrs * 1.34)
  return Math.round(hourlyRate * 2 * 1.34 + hourlyRate * (hrs - 2) * 1.67)
}
