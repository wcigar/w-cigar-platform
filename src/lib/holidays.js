// 2026 台灣法定假日（行政院人事行政總處）
// 服務業適用：國定假日上班需給加倍工資

export const TW_HOLIDAYS_2026 = {
  '2026-01-01': { name: '元旦', type: 'national' },
  '2026-01-02': { name: '元旦補假', type: 'makeup' },
  '2026-02-15': { name: '小年夜', type: 'national' },
  '2026-02-16': { name: '除夕', type: 'national' },
  '2026-02-17': { name: '春節(初一)', type: 'national' },
  '2026-02-18': { name: '春節(初二)', type: 'national' },
  '2026-02-19': { name: '春節(初三)', type: 'national' },
  '2026-02-20': { name: '春節補假', type: 'makeup' },
  '2026-02-27': { name: '和平紀念日補假', type: 'makeup' },
  '2026-02-28': { name: '和平紀念日', type: 'national' },
  '2026-04-03': { name: '兒童節補假', type: 'makeup' },
  '2026-04-04': { name: '兒童節', type: 'national' },
  '2026-04-05': { name: '清明節', type: 'national' },
  '2026-04-06': { name: '清明節補假', type: 'makeup' },
  '2026-05-01': { name: '勞動節', type: 'national' },
  '2026-06-19': { name: '端午節', type: 'national' },
  '2026-09-25': { name: '中秋節', type: 'national' },
  '2026-09-28': { name: '教師節', type: 'national' },
  '2026-10-09': { name: '國慶日補假', type: 'makeup' },
  '2026-10-10': { name: '國慶日', type: 'national' },
  '2026-10-25': { name: '台灣光復節', type: 'national' },
  '2026-10-26': { name: '光復節補假', type: 'makeup' },
  '2026-12-25': { name: '行憲紀念日', type: 'national' },
}

// 2026 補班日（服務業可能不適用，但標記）
export const TW_MAKEUP_WORKDAYS_2026 = {
  '2026-02-14': '補班(小年夜)',
  '2026-06-20': '補班(端午)',
}

export function isHoliday(dateStr) {
  return !!TW_HOLIDAYS_2026[dateStr]
}

export function getHolidayName(dateStr) {
  return TW_HOLIDAYS_2026[dateStr]?.name || ''
}

export function getHolidayType(dateStr) {
  return TW_HOLIDAYS_2026[dateStr]?.type || ''
}

// 計算某月國定假日天數
export function countMonthHolidays(yearMonth) {
  return Object.keys(TW_HOLIDAYS_2026).filter(d => d.startsWith(yearMonth)).length
}

// 計算某月可休天數 = 週六日 + 國定假日(不重複)
export function calcMonthRestDays(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (dow === 0 || dow === 6) count++
    else if (isHoliday(ds)) count++ // 國定假日落在平日才加
  }
  return count
}

// 服務業：國定假日上班 = 雙倍工資
export function calcHolidayOTPay(hourlyRate, hoursWorked) {
  return Math.round(hourlyRate * hoursWorked * 2)
}
