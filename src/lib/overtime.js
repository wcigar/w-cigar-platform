// 加班費計算（2026 勞基法）
// 平日加班前2小時 × 1.34 倍時薪
// 平日加班超過2小時 × 1.67 倍時薪
// 遲到寬限 5 分鐘，加班起算寬限 15 分鐘

const SHIFTS = {
  '早班': { startH: 12, startM: 0, endH: 21, endM: 0, hours: 9 },
  '晚班': { startH: 15, startM: 0, endH: 24, endM: 0, hours: 9 },
}

const LATE_GRACE_MIN = 5
const OT_GRACE_MIN = 15

export function calcAttendanceDetail(schedules, punches, monthlysalary) {
  const hourlyRate = monthlyRate(monthlyRate)
  const result = {
    workDays: 0, sickDays: 0, personalDays: 0, specialDays: 0, offDays: 0,
    lateCount: 0, lateMinutes: 0,
    otHours: 0, otPay: 0, otDetails: [],
  }

  const dateMap = {}
  schedules.forEach(s => { dateMap[s.date] = s })

  // Group punches by date
  const punchMap = {}
  punches.forEach(p => {
    if (!p.is_valid) return
    if (!punchMap[p.date]) punchMap[p.date] = []
    punchMap[p.date].push(p)
  })

  schedules.forEach(s => {
    const v = s.shift || ''
    if (v === '早班' || v === '晚班') {
      result.workDays++
      const shift = SHIFTS[v]
      if (!shift) return

      const dayPunches = punchMap[s.date] || []
      const clockIn = dayPunches.find(p => p.punch_type === '上班')
      const clockOut = dayPunches.find(p => p.punch_type === '下班')

      // Late check
      if (clockIn?.time) {
        const [h, m] = clockIn.time.slice(11, 16).split(':').map(Number)
        const punchMin = h * 60 + m
        const shiftStartMin = shift.startH * 60 + shift.startM + LATE_GRACE_MIN
        if (punchMin > shiftStartMin) {
          result.lateCount++
          result.lateMinutes += punchMin - shiftStartMin
        }
      }

      // Overtime check
      if (clockOut?.time) {
        const [h, m] = clockOut.time.slice(11, 16).split(':').map(Number)
        let punchMin = h * 60 + m
        // Handle midnight crossing for 晚班
        if (v === '晚班' && h < 12) punchMin += 24 * 60
        const shiftEndMin = shift.endH * 60 + shift.endM + OT_GRACE_MIN
        if (punchMin > shiftEndMin) {
          const otMinutes = punchMin - (shift.endH * 60 + shift.endM)
          const otHrs = otMinutes / 60
          result.otHours += otHrs
          result.otDetails.push({ date: s.date, minutes: otMinutes, hours: +otHrs.toFixed(2) })
        }
      }
    } else if (v === '病假') result.sickDays++
    else if (v === '事假') result.personalDays++
    else if (v === '特休') result.specialDays++
    else result.offDays++
  })

  // Calculate OT pay
  const hrRate = monthlyRate > 0 ? Math.round(monthlyRate / 30 / 8) : 0
  result.otDetails.forEach(d => {
    const hrs = d.hours
    if (hrs <= 2) {
      d.pay = Math.round(hrRate * hrs * 1.34)
    } else {
      d.pay = Math.round(hrRate * 2 * 1.34 + hrRate * (hrs - 2) * 1.67)
    }
    result.otPay += d.pay
  })
  result.hourlyRate = hrRate

  return result
}

function monthlyRate(v) { return v }
