import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { CigarRewardPayrollStatus } from '../../components/CigarRewardCard'
import { calcLaborIns, calcHealthIns, calcLaborPension, calcLaborInsER, calcHealthInsER, findBracket, calcOvertimePay, calcOvertimePayByDayType, calcCompLeaveHours, inferDayType, LABOR_INS_BRACKETS, HEALTH_INS_BRACKETS, SHIFTS, LATE_GRACE_MIN, OT_GRACE_MIN } from '../../lib/constants'
import { ChevronDown, ChevronUp, Plus, Trash2, Save, FileText, Printer, Edit3, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { taipeiHM } from '../../lib/timezone'
import { format, subMonths, endOfMonth } from 'date-fns'
import { useAuth } from '../../lib/auth'

/* ================================================================
   resolvePunch — 人工修正優先
   ================================================================ */
function resolvePunch(punch) {
  if (punch.manual_override) {
    return {
      clockIn: punch.corrected_clock_in ?? punch.clock_in,
      clockOut: punch.corrected_clock_out ?? punch.clock_out,
      isLate: punch.corrected_is_late ?? punch.is_late,
      isEarly: punch.corrected_is_early ?? false,
      isPayable: punch.is_payable !== false,
      countsAsWorked: punch.counts_as_worked !== false,
      lateDeduction: punch.corrected_late_deduction ?? punch.late_deduction ?? 0,
      earlyDeduction: punch.corrected_early_deduction ?? punch.early_deduction ?? 0,
      overrideReason: punch.override_reason || '',
      overridden: true,
    }
  }
  return {
    clockIn: punch.clock_in, clockOut: punch.clock_out,
    isLate: punch.is_late, isEarly: false,
    isPayable: true, countsAsWorked: true,
    lateDeduction: 0, earlyDeduction: 0, overrideReason: '', overridden: false,
  }
}

/* ================================================================
   出勤統計
   ================================================================ */
export function getAttendanceData(eid, schedules, punches, emp, holidayMap = {}) {
  const es = schedules.filter(s => s.employee_id === eid)
  const ep = punches.filter(p => p.employee_id === eid && p.is_valid)
  const isPT = emp?.emp_type === 'PT'

  // PT：彈性工時，依打卡 in/out 累計時數，不計遲到/早退/缺勤扣款
  if (isPT) {
    let totalMinutes = 0, workDays = 0
    let missingPunch = []
    let overrideCount = 0
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
    const dates = [...new Set(ep.map(p => p.date))].sort()
    const dailyHours = []
    const dailyPunches = []
    dates.forEach(d => {
      const day = ep.filter(p => p.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      const ins = day.filter(p => p.punch_type === '上班')
      const outs = day.filter(p => p.punch_type === '下班')
      if (ins.length === 0 && outs.length === 0) return
      const sch = schedules.find(s => s.employee_id === eid && s.date === d)
      const shiftName = sch?.shift || 'PT'
      const inP = ins[0], outP = outs[outs.length - 1]
      const inHM = inP ? (() => { const [h, m] = taipeiHM(inP.time); return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` })() : null
      const outHM = outP ? (() => { const [h, m] = taipeiHM(outP.time); return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` })() : null
      const override = !!(inP?.manual_override || outP?.manual_override)
      if (override) overrideCount++
      let hours = null
      if (inP && outP) {
        const inT = new Date(inP.time).getTime()
        const outT = new Date(outP.time).getTime()
        const mins = Math.max(0, Math.round((outT - inT) / 60000))
        if (mins > 0) {
          totalMinutes += mins; workDays++
          hours = +(mins / 60).toFixed(2)
          dailyHours.push({ date: d, hours, minutes: mins })
        }
      } else if (d < today) {
        missingPunch.push({ date: d, missing: ins.length ? '下班' : '上班' })
      }
      dailyPunches.push({
        date: d, shift: shiftName, clockIn: inHM, clockOut: outHM, hours,
        isLate: false, lateMin: 0, isEarly: false, earlyMin: 0,
        override, missingIn: !inP, missingOut: !outP,
      })
    })
    dailyPunches.sort((a, b) => a.date.localeCompare(b.date))
    return {
      isPT: true, work: workDays, sick: 0, personal: 0, off: 0, special: 0, absent: 0, total: es.length,
      lateCount: 0, lateMinutes: 0, lateDetails: [], earlyCount: 0, earlyMinutes: 0, earlyDetails: [],
      otTotalMin: 0, otDetails: [], overrideCount, missingPunch,
      totalPunchMinutes: totalMinutes, totalPunchHours: +(totalMinutes / 60).toFixed(2),
      dailyHours, dailyPunches,
    }
  }

  let work = 0, sick = 0, personal = 0, off = 0, special = 0, absent = 0
  let lateCount = 0, lateMinutes = 0, earlyCount = 0, earlyMinutes = 0
  let otTotalMin = 0, otDetails = [], lateDetails = [], earlyDetails = []
  let overrideCount = 0, missingPunch = []
  const dailyPunches = []  // 每日打卡明細：{ date, shift, clockIn, clockOut, hours, isLate, lateMin, isEarly, earlyMin, override, missing }

  es.forEach(s => {
    const v = s.shift || ''
    if (v === '早班' || v === '晚班' || v === '彈性班' || v === '單人班') {
      const shift = SHIFTS[v]
      if (!shift) { work++; return }
      const isFlexible = shift.flexible === true
      const dayPunches = ep.filter(p => p.date === s.date)
      const clockInPunch = dayPunches.find(p => p.punch_type === '上班')
      const clockOutPunch = dayPunches.find(p => p.punch_type === '下班')
      const resolved = clockInPunch ? resolvePunch(clockInPunch) : null
      const resolvedOut = clockOutPunch ? resolvePunch(clockOutPunch) : null
      if (resolved?.overridden || resolvedOut?.overridden) overrideCount++
      const countsAsWorked = resolved ? (resolved.countsAsWorked !== false) : true
      if (countsAsWorked) work++

      // 彈性班：不判遲到/早退，只記錄打卡時間
      if (isFlexible) {
        let inHM = null, outHM = null, hours = null
        const inTime = resolved?.clockIn || clockInPunch?.time
        const outTime = resolvedOut?.clockOut || clockOutPunch?.time
        if (inTime) { const [h, m] = taipeiHM(inTime); inHM = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` }
        if (outTime) { const [h, m] = taipeiHM(outTime); outHM = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` }
        if (inTime && outTime) {
          const inT = new Date(inTime).getTime(), outT = new Date(outTime).getTime()
          if (outT > inT) hours = +((outT - inT) / 3600000).toFixed(2)
        }
        dailyPunches.push({
          date: s.date, shift: v, clockIn: inHM, clockOut: outHM, hours,
          isLate: false, lateMin: 0, isEarly: false, earlyMin: 0,
          override: !!(resolved?.overridden || resolvedOut?.overridden),
          missingIn: !clockInPunch, missingOut: !clockOutPunch, flexible: true,
        })
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
        if (s.date < today) {
          if (clockInPunch && !clockOutPunch) missingPunch.push({ date: s.date, missing: '下班' })
          else if (!clockInPunch && clockOutPunch) missingPunch.push({ date: s.date, missing: '上班' })
          else if (!clockInPunch && !clockOutPunch) missingPunch.push({ date: s.date, missing: '全缺' })
        }
        return
      }

      let dayIsLate = false, dayLateMin = 0, dayIsEarly = false, dayEarlyMin = 0
      let inHM = null, outHM = null

      // 遲到檢查（用 taipeiHM 轉換時區）
      const clockInTime = resolved?.clockIn || clockInPunch?.time
      if (clockInTime) {
        const [h, m] = typeof clockInTime === 'string' && clockInTime.includes('T') ? taipeiHM(clockInTime) : (clockInTime || '').slice(0, 5).split(':').map(Number)
        if (!isNaN(h) && !isNaN(m)) {
          inHM = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
          const pm = h * 60 + m, sm = shift.startH * 60 + shift.startM + LATE_GRACE_MIN
          if (resolved?.overridden && resolved.isLate === false) { /* 已取消遲到 */ }
          else if (pm > sm) {
            const mins = pm - sm
            lateCount++; lateMinutes += mins
            dayIsLate = true; dayLateMin = mins
            lateDetails.push({ date: s.date, minutes: mins, time: inHM, overridden: resolved?.overridden })
          }
        }
      }

      // 早退檢查（用 taipeiHM 轉換時區，修正跨日判斷）
      const clockOutTime = resolvedOut?.clockOut || clockOutPunch?.time
      if (clockOutTime) {
        const [h, m] = typeof clockOutTime === 'string' && clockOutTime.includes('T') ? taipeiHM(clockOutTime) : (clockOutTime || '').slice(0, 5).split(':').map(Number)
        if (!isNaN(h) && !isNaN(m)) {
          outHM = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
          let pm = h * 60 + m
          const endMin = shift.endH * 60 + shift.endM
          // 跨日判斷（雙重保險）：
          //   A. 下班時刻 < 上班時刻 → 一定跨日（最可靠）
          //   B. 沒有上班時刻時 fallback：下班時刻 + 12hr 還小於預定下班
          // Daniel 5/25 晚班 15:00 補卡 → 下班 00:24 補卡，舊規則 12:24+720=1464 > endMin=1440 不跨日，誤判早退 696 分
          // 新規則：00:24 (24) < 15:00 (900) → 跨日 +1440 → pm=1464、加班 24 分
          if (inHM) {
            const [ih, im] = inHM.split(':').map(Number)
            const inPm = ih * 60 + im
            if (pm < inPm) pm += 1440
          } else if (pm + 720 < endMin) {
            pm += 1440
          }
          if (resolvedOut?.overridden && resolvedOut.isEarly === false) { /* 已取消早退 */ }
          else if (pm < endMin) {
            const mins = endMin - pm
            earlyCount++; earlyMinutes += mins
            dayIsEarly = true; dayEarlyMin = mins
            earlyDetails.push({ date: s.date, minutes: mins, time: outHM, overridden: resolvedOut?.overridden })
          }
          const graceMin = endMin + OT_GRACE_MIN
          if (pm > graceMin) {
            const otMin = pm - endMin
            otTotalMin += otMin
            const dt = inferDayType(s.date, holidayMap)
            const otChoice = resolvedOut?.otChoice || clockOutPunch?.ot_choice || 'pay'
            otDetails.push({
              date: s.date, minutes: otMin, hours: +(otMin / 60).toFixed(2),
              dayType: dt, otChoice,
              compLeaveHours: otChoice === 'comp_leave' ? calcCompLeaveHours(otMin, dt) : 0,
            })
          }
          // 國定假日 / 例假即使沒超時加班、整日工資也應加計
          const dt0 = inferDayType(s.date, holidayMap)
          if ((dt0 === '國定' || dt0 === '例假') && countsAsWorked && !otDetails.find(d => d.date === s.date)) {
            const otChoice = resolvedOut?.otChoice || clockOutPunch?.ot_choice || 'pay'
            otDetails.push({
              date: s.date, minutes: 0, hours: 0,
              dayType: dt0, otChoice,
              compLeaveHours: otChoice === 'comp_leave' ? calcCompLeaveHours(0, dt0) : 0,
            })
          }
        }
      }

      // 計算當日工時：
      //   - 5min 上班彈性 + 15min 下班加班閾值內 → 視為標準 9hr (不顯示 8.97/9.01 之類零頭)
      //   - 真遲到/真早退/真加班才用打卡實算
      let hours = null
      if (clockInTime && clockOutTime) {
        const inT = new Date(clockInTime).getTime()
        const outT = new Date(clockOutTime).getTime()
        if (outT > inT) {
          const punchHours = (outT - inT) / 3600000
          const targetHours = shift.hours || 9
          // 無遲到 + 無早退 + 加班未達 15min → 視為標準工時
          const otMin = otDetails.find(d => d.date === s.date)?.minutes || 0
          if (!dayIsLate && !dayIsEarly && otMin < OT_GRACE_MIN && Math.abs(punchHours - targetHours) < 0.35) {
            hours = targetHours
          } else {
            hours = +punchHours.toFixed(2)
          }
        }
      }

      dailyPunches.push({
        date: s.date, shift: v, clockIn: inHM, clockOut: outHM, hours,
        isLate: dayIsLate, lateMin: dayLateMin, isEarly: dayIsEarly, earlyMin: dayEarlyMin,
        override: !!(resolved?.overridden || resolvedOut?.overridden),
        missingIn: !clockInPunch, missingOut: !clockOutPunch,
      })

      // 缺打卡檢查（有上班卡沒下班卡、或反之，且非今天）
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
      if (s.date < today) {
        if (clockInPunch && !clockOutPunch) missingPunch.push({ date: s.date, missing: '下班' })
        else if (!clockInPunch && clockOutPunch) missingPunch.push({ date: s.date, missing: '上班' })
        else if (!clockInPunch && !clockOutPunch) missingPunch.push({ date: s.date, missing: '全缺' })
      }
    } else if (v === '病假') sick++
    else if (v === '事假') personal++
    else if (v === '特休') special++
    else if (v === '曠職') absent++
    else off++
  })
  // 日期由舊到新
  dailyPunches.sort((a, b) => a.date.localeCompare(b.date))
  return { work, sick, personal, off, special, absent, total: es.length, lateCount, lateMinutes, lateDetails, earlyCount, earlyMinutes, earlyDetails, otTotalMin, otDetails, overrideCount, missingPunch, dailyPunches }
}

/* ================================================================
   勞健保按日比例（台灣勞保條例 §12、健保法 §13 — 部分月按日計、分母 30）
   - 全月在保 → 全額保費
   - 部分月在保 → full × overlapDays / 30
   - 完全沒在保 → 0
   - 加退保日皆 inclusive
   ================================================================ */
export function prorateInsurance(fullAmount, insStart, insEnd, monthStart, monthEnd) {
  if (!insStart && !insEnd) return fullAmount
  const s = insStart ? new Date(insStart) : new Date('1900-01-01')
  const e = insEnd ? new Date(insEnd) : new Date('9999-12-31')
  if (e < monthStart || s > monthEnd) return 0
  if (s <= monthStart && e >= monthEnd) return fullAmount
  const effStart = s > monthStart ? s : monthStart
  const effEnd = e < monthEnd ? e : monthEnd
  const days = Math.floor((effEnd - effStart) / 86400000) + 1
  return Math.round(fullAmount * days / 30)
}

/* ================================================================
   薪資計算（統一實際出勤天數）
   ================================================================ */
export function calcSalaryToDate(emp, cfg, bonusDefs, att, isCurrentMonth, targetDate, empPenalties = []) {
  const year = targetDate.getFullYear(), monthNum = targetDate.getMonth() + 1
  const daysInMonth = new Date(year, monthNum, 0).getDate()
  const dayOfMonth = targetDate.getDate()
  const sopPenaltyTotal = (empPenalties || []).reduce((s, p) => s + (+p.amount || 0), 0)
  // 勞健保按日比例計算（月初到月底範圍）
  const monthStartDt = new Date(year, monthNum - 1, 1)
  const monthEndDt = new Date(year, monthNum - 1, daysInMonth)

  // PT：純時薪制 — 打卡時數 × 時薪，無遲到/早退/勞健保扣款；SOP 罰款仍扣
  if (att?.isPT || emp?.emp_type === 'PT') {
    // fallback chain: salary_config.hourly_rate > salary_config.monthly_salary（誤填）> employees.salary_amount（時薪型）> 200 預設
    const hourlyFromEmp = (emp?.salary_type === '時薪' && +emp?.salary_amount > 0) ? +emp.salary_amount : 0
    const hourlyBase = +(cfg.hourly_rate || cfg.monthly_salary || hourlyFromEmp || 0)
    const totalHours = +att.totalPunchHours || 0
    const proratedBase = Math.round(totalHours * hourlyBase)
    const empBonuses = (bonusDefs || []).filter(b => b.employee_id === emp.id && b.enabled)
    const otherBonuses = empBonuses.map(b => ({ ...b, originalAmount: b.amount || 0, amount: b.amount || 0 }))
    const otherBonusTotal = otherBonuses.reduce((s, b) => s + (b.amount || 0), 0)
    return {
      monthlyBase: 0, daysInMonth, dayOfMonth, dailyBase: 0, hourlyBase,
      actualWorkedDays: att.work, proratedBase,
      empBonuses, otherBonuses,
      attendanceBonus: { def: null, amount: 0, status: 'na', effective: 0 },
      otPay: 0, otDetails: [],
      sickDeduct: 0, personalDeduct: 0, absentDeduct: 0,
      li: 0, hi: 0, lp: 0, liER: 0, hiER: 0, lb: 0,
      sopPenalties: empPenalties || [], sopPenaltyTotal,
      totalBonuses: otherBonusTotal, totalDeductions: sopPenaltyTotal,
      currentPayable: proratedBase + otherBonusTotal - sopPenaltyTotal,
      erCost: proratedBase + otherBonusTotal,
      att, isPT: true,
    }
  }

  const monthlyBase = cfg.monthly_salary || 0
  // 平日每小時工資 = 月薪 / 240（勞基法標準 240 小時月工時）
  const hourlyBase = monthlyBase > 0 ? Math.round(monthlyBase / 240) : 0
  // 每日底薪 = 月薪 × 8 / 240（先乘除再 round、避免 154×8=1232 而非 1233）
  const dailyBase = monthlyBase > 0 ? Math.round(monthlyBase * 8 / 240) : 0
  // 月薪：給整月 monthlyBase（含週休）。請假/曠職由 sickDeduct/personalDeduct/absentDeduct 個別扣。
  // 本月未結束 → 仍按到今日比例（避免月初就顯示整月）
  const proratedBase = isCurrentMonth
    ? Math.round(monthlyBase * dayOfMonth / daysInMonth)
    : monthlyBase

  // 加班費按日類型分倍率、且員工可選「補休」→ 不計入加班費（轉計入 comp_leave_balance）
  const otDetails = att.otDetails.map(d => {
    const dt = d.dayType || '平日'
    if (d.otChoice === 'comp_leave') {
      // 補休：不發加班費（但仍記錄時數）
      return { ...d, dayType: dt, pay: 0, breakdown: [], compLeaveHours: d.compLeaveHours || calcCompLeaveHours(d.minutes, dt) }
    }
    const r = calcOvertimePayByDayType(hourlyBase, d.minutes, dt)
    return { ...d, dayType: dt, pay: r.otPay, dailyBase: r.dailyBase, breakdown: r.breakdown }
  })
  const otPay = otDetails.reduce((s, d) => s + (d.pay || 0), 0)
  const compLeaveEarned = otDetails.reduce((s, d) => s + (d.otChoice === 'comp_leave' ? (d.compLeaveHours || 0) : 0), 0)

  // 加給：只算 enabled=true、不按出勤天 prorate（整月固定發）
  // 本月未結束時仍按今日比例顯示
  const empBonuses = bonusDefs.filter(b => b.employee_id === emp.id && b.enabled === true)
  const attendanceBonusDef = empBonuses.find(b => b.bonus_name && b.bonus_name.includes('全勤'))
  const monthRatio = isCurrentMonth && daysInMonth > 0 ? dayOfMonth / daysInMonth : 1
  const otherBonuses = empBonuses
    .filter(b => !b.bonus_name?.includes('全勤'))
    .map(b => ({ ...b, originalAmount: b.amount || 0, amount: Math.round((b.amount || 0) * monthRatio) }))
  let attendanceBonusStatus = 'pending'
  if (att.lateCount > 0 || att.earlyCount > 0 || att.sick > 0 || att.personal > 0 || att.absent > 0 || att.missingPunch?.length > 0) attendanceBonusStatus = 'lost'
  else if (!isCurrentMonth) attendanceBonusStatus = 'eligible'
  const attendanceBonusAmount = Math.round((attendanceBonusDef?.amount || 0) * monthRatio)
  const effectiveAttendanceBonus = attendanceBonusStatus === 'lost' ? 0 : attendanceBonusAmount
  const otherBonusTotal = otherBonuses.reduce((s, b) => s + (b.amount || 0), 0)
  const totalBonuses = effectiveAttendanceBonus + otherBonusTotal + otPay

  const sickDeduct = Math.round(att.sick * dailyBase * 0.5)
  const personalDeduct = att.personal * dailyBase
  const absentDeduct = att.absent * dailyBase
  // 勞健保按日比例計算（台灣法規）
  // ⚠️ 加保基數可被 employees.labor_ins_grade_override / health_ins_grade_override 分別覆寫
  //    - null = 自動分級（用月薪）
  //    - 0    = 不加保（PT 常見）
  //    - 有值 = 強制此基數
  const laborOv = emp?.labor_ins_grade_override
  const healthOv = emp?.health_ins_grade_override
  const laborBase  = laborOv === null || laborOv === undefined  ? monthlyBase : +laborOv
  const healthBase = healthOv === null || healthOv === undefined ? monthlyBase : +healthOv
  const li_full = calcLaborIns(laborBase), hi_full = calcHealthIns(healthBase)
  const lp_full = calcLaborPension(laborBase), liER_full = calcLaborInsER(laborBase), hiER_full = calcHealthInsER(healthBase)
  const li   = prorateInsurance(li_full,   emp?.labor_ins_date,  emp?.labor_ins_end_date,  monthStartDt, monthEndDt)
  const liER = prorateInsurance(liER_full, emp?.labor_ins_date,  emp?.labor_ins_end_date,  monthStartDt, monthEndDt)
  const lp   = prorateInsurance(lp_full,   emp?.labor_ins_date,  emp?.labor_ins_end_date,  monthStartDt, monthEndDt)
  const hi   = prorateInsurance(hi_full,   emp?.health_ins_date, emp?.health_ins_end_date, monthStartDt, monthEndDt)
  const hiER = prorateInsurance(hiER_full, emp?.health_ins_date, emp?.health_ins_end_date, monthStartDt, monthEndDt)
  const lb = findBracket(laborBase, LABOR_INS_BRACKETS)
  const totalDeductions = li + hi + sickDeduct + personalDeduct + absentDeduct + sopPenaltyTotal
  const currentPayable = proratedBase + totalBonuses - totalDeductions
  const erCost = proratedBase + totalBonuses + liER + hiER + lp

  return {
    monthlyBase, daysInMonth, dayOfMonth, dailyBase, hourlyBase,
    actualWorkedDays: att.work, proratedBase, empBonuses, otherBonuses,
    attendanceBonus: { def: attendanceBonusDef, amount: attendanceBonusAmount, status: attendanceBonusStatus, effective: effectiveAttendanceBonus },
    otPay, otDetails, compLeaveEarned, sickDeduct, personalDeduct, absentDeduct,
    sopPenalties: empPenalties || [], sopPenaltyTotal,
    li, hi, lp, liER, hiER, lb, totalBonuses, totalDeductions, currentPayable, erCost, att,
  }
}

/* ================================================================
   主元件
   ================================================================ */
export default function Payroll() {
  const { user } = useAuth()
  const [tab, setTab] = useState('payroll')
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [emps, setEmps] = useState([])
  const [salConfigs, setSalConfigs] = useState([])
  const [bonuses, setBonuses] = useState([])
  const [expenses, setExpenses] = useState([])
  const [schedules, setSchedules] = useState([])
  const [punches, setPunches] = useState([])
  const [sopPenalties, setSopPenalties] = useState([])
  const [holidayMap, setHolidayMap] = useState({}) // { 'YYYY-MM-DD': { name, type } }
  const [compLeaveBalance, setCompLeaveBalance] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [editingSal, setEditingSal] = useState(null)
  const [newBonus, setNewBonus] = useState({ employee_id: '', bonus_name: '', amount: '' })
  const [showBonusForm, setShowBonusForm] = useState(false)
  const [newExp, setNewExp] = useState({ category: '', item: '', amount: '', payment: '現金', date: format(new Date(), 'yyyy-MM-dd') })
  const [showExpForm, setShowExpForm] = useState(false)
  const [expenseSubmitterFilter, setExpenseSubmitterFilter] = useState('ALL')
  const [payslip, setPayslip] = useState(null)
  const [loading, setLoading] = useState(true)
  // 出勤修正
  const [overrideEmp, setOverrideEmp] = useState('')
  const [overrideSaving, setOverrideSaving] = useState(null)
  // 薪資手動調整
  const [adjustments, setAdjustments] = useState({})
  const [editingAdj, setEditingAdj] = useState(null)
  const [adjForm, setAdjForm] = useState({ base: '', bonus: '', deduction: '', final_pay: '', reason: '' })

  const isCurrentMonth = month === format(new Date(), 'yyyy-MM')
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const todayDay = today.getDate()
  const [yr, mo] = month.split('-').map(Number)
  const daysInMonth = new Date(yr, mo, 0).getDate()

  useEffect(() => {
    load()
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01'
    const e = isCurrentMonth ? todayStr : format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const [eR, sR, bR, xR, scR, pR, penR, hR, clR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true).order('name'),
      supabase.rpc('get_salary_configs', { p_admin_id: user?.employee_id }),
      supabase.rpc('get_bonus_definitions', { p_admin_id: user?.employee_id }),
      supabase.from('expenses').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }),
      supabase.from('schedules').select('*').gte('date', s).lte('date', e),
      supabase.from('punch_records').select('*').gte('date', s).lte('date', e),
      supabase.from('sop_penalties').select('*').gte('date', s).lte('date', e),
      supabase.from('national_holidays').select('*').gte('date', s).lte('date', e),
      supabase.from('comp_leave_balance').select('*').order('source_date', { ascending: false }),
    ])
    setEmps((eR.data || []).filter(x => !x.is_admin))
    setSalConfigs(sR.data || []); setBonuses(bR.data || [])
    setExpenses(xR.data || []); setSchedules(scR.data || []); setPunches(pR.data || [])
    setSopPenalties(penR?.data || [])
    const hmap = {}; (hR.data || []).forEach(h => { hmap[h.date] = { name: h.name, type: h.type } })
    setHolidayMap(hmap)
    setCompLeaveBalance(clR.data || [])
    // 載入薪資手動調整
    try {
      const { data: adjData } = await supabase.rpc('get_payroll_adjustments', { p_admin_id: user?.employee_id, p_month: month })
      const adjMap = {}
      ;(adjData || []).forEach(a => { adjMap[a.employee_id] = { id: a.id, base: a.base_override, bonus: a.bonus_override, deduction: a.deduction_override, final_pay: a.final_pay_override, amount: a.amount, reason: a.reason } })
      setAdjustments(adjMap)
    } catch { setAdjustments({}) }
    setLoading(false)
  }

  function getCfg(eid) { return salConfigs.find(s => s.employee_id === eid) || {} }
  function getCalc(emp) {
    const cfg = getCfg(emp.id)
    const att = getAttendanceData(emp.id, schedules, punches, emp, holidayMap)
    const targetDate = isCurrentMonth ? today : new Date(yr, mo - 1, daysInMonth)
    const empPenalties = sopPenalties.filter(p => p.employee_id === emp.id)
    return calcSalaryToDate(emp, cfg, bonuses, att, isCurrentMonth, targetDate, empPenalties)
  }

  async function saveSalConfig(eid) {
    if (!editingSal) return
    const { error } = await supabase.rpc('upsert_salary_config', {
      p_admin_id: user?.employee_id, p_employee_id: eid,
      p_monthly_salary: +editingSal.monthly_salary, p_salary_type: editingSal.salary_type
    })
    if (error) { alert('❌ 薪資設定失敗：' + error.message); return }
    logAudit('Salary', `更新 ${eid} $${editingSal.monthly_salary}`, 'ADMIN')
    setEditingSal(null); load()
  }
  async function saveAdjustment(eid) {
    const row = {
      base_override: adjForm.base ? +adjForm.base : null,
      bonus_override: adjForm.bonus ? +adjForm.bonus : null,
      deduction_override: adjForm.deduction ? +adjForm.deduction : null,
      final_pay_override: adjForm.final_pay ? +adjForm.final_pay : null,
      amount: +adjForm.final_pay || +adjForm.base || 0,
      reason: adjForm.reason,
    }
    if (!row.base_override && !row.bonus_override && !row.deduction_override && !row.final_pay_override) return alert('請至少填寫一項覆寫')
    const { error } = await supabase.rpc('upsert_payroll_adjustment', {
      p_admin_id: user?.employee_id, p_employee_id: eid, p_month: month,
      p_base_override: row.base_override, p_bonus_override: row.bonus_override,
      p_deduction_override: row.deduction_override, p_final_pay_override: row.final_pay_override,
      p_amount: row.amount, p_reason: row.reason
    })
    if (error) { alert('❌ 薪資覆寫失敗：' + error.message); return }
    logAudit('PayrollAdjust', `${eid} 覆寫 底薪:${row.base_override||'-'} 獎金:${row.bonus_override||'-'} 扣款:${row.deduction_override||'-'} 實發:${row.final_pay_override||'-'} ${row.reason}`, 'ADMIN')
    setEditingAdj(null); setAdjForm({ base: '', bonus: '', deduction: '', final_pay: '', reason: '' }); load()
  }

  async function deleteAdjustment(eid) {
    const existing = adjustments[eid]
    if (!existing?.id) return
    if (!confirm('確定移除此調整？')) return
    const { error } = await supabase.rpc('delete_payroll_adjustment', { p_admin_id: user?.employee_id, p_id: existing.id })
    if (error) { alert('❌ 移除失敗：' + error.message); return }
    setEditingAdj(null); load()
  }

  async function addBonus() {
    if (!newBonus.employee_id || !newBonus.bonus_name || !newBonus.amount) return alert('請填完')
    const name = emps.find(e => e.id === newBonus.employee_id)?.name || ''
    const { error } = await supabase.rpc('add_bonus_definition', {
      p_admin_id: user?.employee_id, p_employee_id: newBonus.employee_id,
      p_name: name, p_bonus_name: newBonus.bonus_name, p_amount: +newBonus.amount
    })
    if (error) { alert('❌ 加給新增失敗：' + error.message); return }
    setNewBonus({ employee_id: '', bonus_name: '', amount: '' }); setShowBonusForm(false); load()
  }
  async function toggleBonus(id, en) {
    const { error } = await supabase.rpc('toggle_bonus_definition', { p_admin_id: user?.employee_id, p_id: id, p_enabled: en })
    if (error) { alert('❌ 切換失敗：' + error.message); return }
    load()
  }
  async function deleteBonus(id) {
    if (!confirm('刪除？')) return
    const { error } = await supabase.rpc('delete_bonus_definition', { p_admin_id: user?.employee_id, p_id: id })
    if (error) { alert('❌ 刪除失敗：' + error.message); return }
    load()
  }
  async function addExpense() {
    if (!newExp.category || !newExp.amount) return alert('請填分類 + 金額')
    const { error } = await supabase.from('expenses').insert({ date: newExp.date, category: newExp.category, item: newExp.item, amount: +newExp.amount, payment: newExp.payment, handler: 'ADMIN' })
    if (error) { alert('❌ 新增支出失敗：' + error.message); return }
    setNewExp({ category: '', item: '', amount: '', payment: '現金', date: format(new Date(), 'yyyy-MM-dd') }); setShowExpForm(false); load()
  }
  async function deleteExpense(id) { if (!confirm('刪除？')) return; await supabase.from('expenses').delete().eq('id', id); load() }

  // 薪資結轉：mark 薪資已結算 + 推 LINE 通知員工
  async function finalizeOne(emp, p) {
    if (!confirm(`確認結轉 ${emp.name} ${month} 月薪資 $${(p.currentPayable || 0).toLocaleString()}？\n\n結轉後會：\n1. 寫入 payroll_records 表（狀態=已結轉）\n2. 推 LINE 群通知該員工\n3. 顯示在「薪資總表」`)) return
    const adminId = user?.employee_id || 'ADMIN'
    const records = [{
      employee_id: emp.id,
      base_amount: p.proratedBase || 0,
      bonus_amount: p.totalBonuses || 0,
      deduction_amount: p.totalDeductions || 0,
      net_amount: p.currentPayable || 0,
      details: { li: p.li, hi: p.hi, lp: p.lp, liER: p.liER, hiER: p.hiER, lb: p.lb, sopPenaltyTotal: p.sopPenaltyTotal || 0, otPay: p.otPay || 0 }
    }]
    const { data, error } = await supabase.rpc('payroll_finalize', { p_admin_id: adminId, p_month: month, p_records: records })
    if (error) { alert('結轉失敗: ' + error.message); return }
    if (data && data.ok === false) { alert('結轉失敗: ' + (data.error || '未知原因')); return }

    // LINE 個人私推（鐵律：薪資資料絕不進員工群）
    // 抓員工的 line_user_id、直接推他個人 → 只有他自己看得到
    const { data: empRow } = await supabase.from('employees').select('line_user_id').eq('id', emp.id).maybeSingle()
    if (!empRow?.line_user_id) {
      alert(`⚠️ ${emp.name} 還沒綁定 LINE（請他在群裡發「我是 ${emp.name}」綁定後再結轉）\n薪資已寫入系統、未推 LINE 通知`)
      load()
      return
    }
    const privateMsg = `💰 薪資已結算（${month}）\n━━━━━━━━━━\n\n${emp.name} 您好：\n本月薪資已由老闆確認\n\n實發金額：$${(p.currentPayable || 0).toLocaleString()}\n月份：${month}\n\n明細請查員工系統薪資頁面。\n有疑問請當面或私訊老闆、勿在群組討論。\n\n（此訊息私下發送、僅你可見）`
    try {
      const { error: lineErr } = await supabase.functions.invoke('staff-reminders', {
        body: { target_user_id: empRow.line_user_id, message: privateMsg }
      })
      if (lineErr) throw lineErr
    } catch (e) {
      console.error('LINE private push error:', e)
      alert(`⚠️ ${emp.name} 薪資已結轉、但 LINE 通知失敗：` + (e.message || ''))
      load()
      return
    }

    alert(`✅ ${emp.name} 薪資已結轉、LINE 私人通知已推（僅員工本人收到、不進群組）`)
    load()
  }

  /* === 出勤修正操作 === */
  async function overridePunch(punchId, updates) {
    setOverrideSaving(punchId)
    const { error } = await supabase.from('punch_records').update({
      manual_override: true,
      ...updates,
      override_by: 'ADMIN',
      override_at: new Date().toISOString(),
    }).eq('id', punchId)
    setOverrideSaving(null)
    if (error) { alert('❌ 修正失敗：' + error.message); return }
    await logAudit('AttendanceOverride', `修正打卡 #${punchId}: ${JSON.stringify(updates)}`, 'ADMIN')
    load()
  }

  // 補卡：未打卡日新增 punch 紀錄
  async function addMissingPunch(eid, date, type) {
    const t = window.prompt(`輸入 ${date} ${type}打卡時間 (HH:MM，下班可跨日填如 01:11):`)
    if (!t) return
    const mm = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
    if (!mm) { alert('格式錯誤，例：14:00 或 01:11'); return }
    const hh = +mm[1], mn = +mm[2]
    if (hh > 47 || mn > 59) { alert('時間範圍錯誤'); return }
    // 跨日下班：用次日的 00-12:00 + hh:mm
    const punchDate = new Date(date + 'T00:00:00+08:00')
    if (type === '下班' && hh < 12) punchDate.setDate(punchDate.getDate() + 1)
    punchDate.setHours(hh, mn, 0, 0)
    setOverrideSaving(`new-${date}-${type}`)
    const { error } = await supabase.from('punch_records').insert({
      employee_id: eid,
      date,
      punch_type: type,
      time: punchDate.toISOString(),
      is_valid: true,
      manual_override: true,
      override_reason: `補卡 (${type} ${t})`,
      override_by: 'ADMIN',
      override_at: new Date().toISOString(),
    })
    setOverrideSaving(null)
    if (error) { alert('❌ 補卡失敗：' + error.message); return }
    await logAudit('AttendanceAddPunch', `補卡 ${eid} ${date} ${type} ${t}`, 'ADMIN')
    alert(`✅ 已補卡 ${date} ${type} ${t}`)
    load()
  }

  // 加班選擇切換：pay = 領加班費（預設）/ comp_leave = 換補休
  async function setOtChoice(punchId, choice) {
    setOverrideSaving(punchId)
    const { error } = await supabase.from('punch_records').update({ ot_choice: choice }).eq('id', punchId)
    setOverrideSaving(null)
    if (error) { alert('❌ 失敗：' + error.message); return }
    load()
  }

  async function cancelOverride(punchId) {
    setOverrideSaving(punchId)
    const { error } = await supabase.from('punch_records').update({
      manual_override: false,
      corrected_clock_in: null, corrected_clock_out: null,
      corrected_is_late: null, corrected_is_early: null,
      corrected_late_deduction: 0, corrected_early_deduction: 0,
      override_reason: null, override_by: null, override_at: null,
    }).eq('id', punchId)
    setOverrideSaving(null)
    if (error) { alert('❌ 還原失敗：' + error.message); return }
    load()
  }

  function printPayslip() {
    if (!payslip) return
    const { emp, p } = payslip
    const label = isCurrentMonth ? `（截至${todayDay}日）` : ''
    const abLabel = p.attendanceBonus.status === 'lost' ? '❌已失效' : p.attendanceBonus.status === 'pending' ? '⏳暫符合' : '✅已確認'
    const w = window.open('', '_blank', 'width=520,height=900')
    w.document.write(`<html><head><title>薪資條 ${emp.name}</title><style>body{font-family:'Noto Sans TC',sans-serif;padding:30px;color:#333;max-width:500px;margin:0 auto}h1{font-size:20px;border-bottom:2px solid #c9a84c;padding-bottom:8px}h2{font-size:13px;color:#666;margin:14px 0 6px;border-bottom:1px solid #eee;padding-bottom:4px}.r{display:flex;justify-content:space-between;padding:3px 0;font-size:13px;border-bottom:1px dotted #eee}.r.bold{font-weight:700;font-size:14px;border-bottom:2px solid #333;padding:6px 0}.g{color:#2d8a4e}.rd{color:#c44d4d}.gl{color:#9a7d2e}.dim{color:#999}.ft{margin-top:20px;font-size:10px;color:#999;text-align:center;border-top:1px solid #ddd;padding-top:10px}</style></head><body><h1>W Cigar Bar — ${month} 薪資條${label}</h1><div class="r bold"><span>${emp.name} (${emp.id})</span><span>${emp.emp_type}</span></div><h2>📅 出勤</h2><div class="r"><span>實際出勤</span><span>${p.actualWorkedDays} 天</span></div><div class="r"><span>休假</span><span>${p.att.off} 天</span></div>${p.att.sick?`<div class="r"><span>病假</span><span>${p.att.sick} 天</span></div>`:''}${p.att.lateCount?`<div class="r rd"><span>遲到</span><span>${p.att.lateCount}次 ${p.att.lateMinutes}分</span></div>`:''}${p.att.earlyCount?`<div class="r rd"><span>早退</span><span>${p.att.earlyCount}次 ${p.att.earlyMinutes}分</span></div>`:''}${p.att.missingPunch?.length?`<div class="r rd"><span>⚠️ 缺打卡</span><span>${p.att.missingPunch.length} 天</span></div>`:''}${p.att.overrideCount?`<div class="r"><span>⚙️ 人工修正</span><span>${p.att.overrideCount} 筆</span></div>`:''}
<h2>💰 薪資（依實際出勤）</h2><div class="r dim"><span>月底薪</span><span>$${p.monthlyBase.toLocaleString()}</span></div><div class="r dim"><span>當月${p.daysInMonth}天 · 日薪</span><span>$${p.dailyBase.toLocaleString()}</span></div><div class="r"><span>出勤${p.actualWorkedDays}天 底薪</span><span>$${p.proratedBase.toLocaleString()}</span></div>${p.attendanceBonus.amount?`<div class="r ${p.attendanceBonus.status==='lost'?'rd':'g'}"><span>全勤獎金 ${abLabel}</span><span>${p.attendanceBonus.status==='lost'?'$0':'+$'+p.attendanceBonus.effective.toLocaleString()}</span></div>`:''}${p.otherBonuses.map(b=>`<div class="r g"><span>+ ${b.bonus_name}</span><span>+$${b.amount.toLocaleString()}</span></div>`).join('')}${p.otPay?`<div class="r g"><span>+ 加班費</span><span>+$${p.otPay.toLocaleString()}</span></div>`:''}
<div class="r rd"><span>勞保20%</span><span>-$${p.li.toLocaleString()}</span></div><div class="r rd"><span>健保30%</span><span>-$${p.hi.toLocaleString()}</span></div>${p.sickDeduct?`<div class="r rd"><span>病假扣薪</span><span>-$${p.sickDeduct.toLocaleString()}</span></div>`:''}${p.personalDeduct?`<div class="r rd"><span>事假扣薪</span><span>-$${p.personalDeduct.toLocaleString()}</span></div>`:''}
<div class="r bold gl"><span>✦ 截至今日可領</span><span>$${p.currentPayable.toLocaleString()}</span></div><div class="r bold"><span>雇主總成本</span><span>$${p.erCost.toLocaleString()}</span></div>
<div class="ft">W Cigar Bar · ${format(new Date(),'yyyy-MM-dd HH:mm')}<br>${isCurrentMonth?'⚠️ 依實際出勤，非月底應發':'已結算'}</div></body></html>`)
    w.document.close(); setTimeout(() => { try { if (!w.closed) w.print() } catch {} }, 300)
  }

  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))
  const totalExp = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const allCalcs = emps.map(e => ({ emp: e, calc: getCalc(e) }))
  function getFinalPay(emp, calc) {
    const adj = adjustments[emp.id]
    if (adj?.final_pay != null) return adj.final_pay
    const base = adj?.base != null ? adj.base : calc.proratedBase
    const bonus = adj?.bonus != null ? adj.bonus : calc.totalBonuses
    const deduct = adj?.deduction != null ? adj.deduction : calc.totalDeductions
    return base + bonus - deduct
  }
  const totalPayable = allCalcs.reduce((s, { emp, calc }) => s + getFinalPay(emp, calc), 0)
  const totalER = allCalcs.reduce((s, { calc }) => s + calc.erCost, 0)
  const tabList = [
    { id: 'payroll', l: '薪資明細' },
    { id: 'override', l: '⚙️出勤修正' },
    { id: 'config', l: '薪資設定' },
    { id: 'bonus', l: '加給管理' },
    { id: 'expenses', l: '支出管理' },
  ]

  if (loading) return <div className="page-container">{[1,2,3].map(i => <div key={i} className="loading-shimmer" style={{height:80,marginBottom:10}}/>)}</div>

  /* === 出勤修正 — 組合日資料 === */
  function getDayRows(eid) {
    const empScheds = schedules.filter(s => s.employee_id === eid).sort((a, b) => a.date.localeCompare(b.date))
    const empPunches = punches.filter(p => p.employee_id === eid)
    return empScheds.map(s => {
      const dayP = empPunches.filter(p => p.date === s.date && p.is_valid)
      const clockIn = dayP.find(p => p.punch_type === '上班')
      const clockOut = dayP.find(p => p.punch_type === '下班')
      const shift = SHIFTS[s.shift]
      let autoLate = false, autoEarly = false, lateMins = 0, earlyMins = 0

      if (shift && clockIn?.time) {
        const [h, m] = taipeiHM(clockIn.time)
        const pm = h * 60 + m, sm = shift.startH * 60 + shift.startM + LATE_GRACE_MIN
        if (pm > sm) { autoLate = true; lateMins = pm - sm }
      }
      if (shift && clockOut?.time) {
        const [h, m] = taipeiHM(clockOut.time)
        let pm = h * 60 + m
        const endMin = shift.endH * 60 + shift.endM
        // 跨日判斷：下班時刻 < 上班時刻 → 跨日（含補卡 12:24 = 00:24 凌晨情境）
        if (clockIn?.time) {
          const [ih, im] = taipeiHM(clockIn.time)
          const inPm = ih * 60 + im
          if (pm < inPm) pm += 1440
        } else if (pm + 720 < endMin) {
          pm += 1440
        }
        if (pm < endMin) { autoEarly = true; earlyMins = endMin - pm }
      }

      const dayType = inferDayType(s.date, holidayMap)
      const holiday = holidayMap[s.date]
      return {
        date: s.date, shift: s.shift, dayType, holidayName: holiday?.name || null,
        clockInTime: clockIn?.time ? new Date(clockIn.time).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }) : null,
        clockOutTime: clockOut?.time ? new Date(clockOut.time).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }) : null,
        clockInId: clockIn?.id, clockOutId: clockOut?.id,
        clockInPunch: clockIn, clockOutPunch: clockOut,
        autoLate, autoEarly, lateMins, earlyMins,
        inOverridden: clockIn?.manual_override || false,
        outOverridden: clockOut?.manual_override || false,
        inCorrectedLate: clockIn?.corrected_is_late,
        outCorrectedEarly: clockOut?.corrected_is_early,
        otChoice: clockOut?.ot_choice || 'pay',
      }
    })
  }

  return (
    <div className="page-container fade-in">
      {payslip && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={() => setPayslip(null)}>
          <div style={{background:'var(--black-card)',border:'1px solid var(--border-gold)',borderRadius:20,padding:24,width:'100%',maxWidth:440,maxHeight:'90vh',overflowY:'auto'}} onClick={e => e.stopPropagation()}>
            <div style={{fontSize:18,fontWeight:700,color:'var(--gold)',marginBottom:4}}>薪資條 — {payslip.emp.name}</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:12}}>{month}{isCurrentMonth?` (截至${todayDay}日)`:''}</div>
            {payslip.p.isPT
              ? <R label={`PT ${payslip.p.att.totalPunchHours||0} hr × $${(payslip.p.hourlyBase||0).toLocaleString()}/hr`} value={payslip.p.proratedBase}/>
              : <R label={`出勤${payslip.p.actualWorkedDays}天 底薪`} value={payslip.p.proratedBase}/>}
            {payslip.p.attendanceBonus.amount>0&&<R label={`全勤獎金（${payslip.p.attendanceBonus.status==='lost'?'已失效':'暫符合'}）`} value={payslip.p.attendanceBonus.effective} positive={payslip.p.attendanceBonus.status!=='lost'}/>}
            {payslip.p.otherBonuses.map(b=><R key={b.id} label={`+ ${b.bonus_name}`} value={b.amount} positive/>)}
            {payslip.p.otPay>0&&<R label="+ 加班費（依勞基法分倍率）" value={payslip.p.otPay} positive/>}
            {(payslip.p.otDetails||[]).map(d => (
              d.pay > 0 && (
                <div key={d.date} style={{paddingLeft:10,fontSize:11,color:'var(--text-dim)',display:'flex',justifyContent:'space-between',padding:'2px 0 2px 10px'}}>
                  <span>{d.date.slice(5)} {d.dayType==='國定'?'🎌':d.dayType==='休息日'?'🛌':d.dayType==='例假'?'⛔':'⌛'} {d.dayType}</span>
                  <span style={{color:'var(--green)'}}>+${d.pay.toLocaleString()}</span>
                </div>
              )
            ))}
            {payslip.p.compLeaveEarned > 0 && (
              <R label={`🌴 補休累積 ${payslip.p.compLeaveEarned.toFixed(1)} hr（已選換補休）`} value="0" dim/>
            )}
            {!payslip.p.isPT && <><R label="- 勞保" value={-payslip.p.li} negative/><R label="- 健保" value={-payslip.p.hi} negative/></>}
            {payslip.p.sickDeduct>0&&<R label="- 病假" value={-payslip.p.sickDeduct} negative/>}
            <div style={{height:2,background:'var(--gold)',margin:'10px 0'}}/>
            <R label="截至今日可領" value={payslip.p.currentPayable} highlight/>
            {payslip.leaveBalance && payslip.leaveBalance.length > 0 && (
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(77,168,108,.05)', borderRadius: 6, border: '1px solid rgba(77,168,108,.2)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>🌴 休假時數</div>
                {payslip.leaveBalance.map(lb => (
                  <div key={lb.leave_type} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-dim)' }}>{lb.leave_type} 餘額{lb.expiring_soon > 0 ? ' ⚠️' : ''}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontWeight: 600 }}>
                      {(+lb.total_hours || 0).toFixed(1)} hr
                      {lb.expiring_soon > 0 && <span style={{ color: '#f59e0b', marginLeft: 6, fontSize: 10 }}>含 {(+lb.expiring_soon).toFixed(1)} hr 60 天內到期</span>}
                    </span>
                  </div>
                ))}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>過期補休不轉加班費、請務必休完。</div>
              </div>
            )}
            <div style={{display:'flex',gap:8,marginTop:16}}>
              <button className="btn-gold" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6}} onClick={printPayslip}><Printer size={14}/> 列印</button>
              <button className="btn-outline" style={{flex:1}} onClick={() => setPayslip(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}

      <div className="section-title">薪資財務</div>
      <div style={{display:'flex',gap:6,marginBottom:10,overflowX:'auto',paddingBottom:4}}>
        {months.map(m=><button key={m} onClick={()=>setMonth(m)} style={{padding:'6px 10px',borderRadius:20,fontSize:11,fontWeight:500,whiteSpace:'nowrap',flexShrink:0,cursor:'pointer',background:m===month?'var(--gold-glow)':'transparent',color:m===month?'var(--gold)':'var(--text-dim)',border:m===month?'1px solid var(--border-gold)':'1px solid var(--border)'}}>{parseInt(m.slice(5))}月</button>)}
      </div>
      {isCurrentMonth&&<div style={{fontSize:11,color:'var(--gold)',background:'var(--gold-glow)',padding:'6px 12px',borderRadius:8,marginBottom:10,display:'flex',alignItems:'center',gap:4,border:'1px solid var(--border-gold)'}}><Clock size={12}/> 依實際出勤天數計算：截至{todayDay}日（每日更新）</div>}
      <div style={{display:'flex',gap:4,marginBottom:16,overflowX:'auto'}}>
        {tabList.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'7px 12px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0,background:tab===t.id?'var(--gold-glow)':'transparent',color:tab===t.id?'var(--gold)':'var(--text-dim)',border:tab===t.id?'1px solid var(--border-gold)':'1px solid var(--border)'}}>{t.l}</button>)}
      </div>

      {/* ===== 薪資明細 ===== */}
      {tab==='payroll'&&(<div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
          <SB label={isCurrentMonth?'累積實領':'員工實領'} value={'$'+totalPayable.toLocaleString()} color="var(--gold)"/>
          <SB label={isCurrentMonth?'累積成本':'雇主成本'} value={'$'+totalER.toLocaleString()} color="var(--red)"/>
          <SB label="本月支出" value={'$'+totalExp.toLocaleString()} color="var(--red)"/>
        </div>
        <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:10}}>薪資 = 日薪 × 實際出勤天數 + 加給 - 扣款 · 當月{daysInMonth}天</div>
        {allCalcs.map(({emp,calc:p})=>{
          const ex=expanded===emp.id, abStatus=p.attendanceBonus.status
          return <div key={emp.id} className="card" style={{marginBottom:8,padding:0,overflow:'hidden'}}>
            <div style={{padding:14,display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'}} onClick={()=>setExpanded(ex?null:emp.id)}>
              <div>
                <div style={{fontSize:14,fontWeight:600}}>{emp.name}</div>
                <div style={{fontSize:11,color:'var(--text-muted)',display:'flex',gap:4,flexWrap:'wrap',marginTop:2}}>
                  <span style={{color:'var(--green)'}}>出勤{p.actualWorkedDays}天</span>
                  <span style={{color:'var(--text-muted)'}}>休{p.att.off}天</span>
                  {p.att.lateCount>0&&<span style={{color:'var(--red)',fontWeight:700}}>🔴遲到{p.att.lateCount}</span>}
                  {p.att.earlyCount>0&&<span style={{color:'#f59e0b',fontWeight:700}}>🟡早退{p.att.earlyCount}</span>}
                  {p.att.missingPunch?.length>0&&<span style={{color:'var(--red)',fontWeight:700}}>⚠️缺卡{p.att.missingPunch.length}</span>}
                  {p.attendanceBonus.amount>0&&<span style={{color:abStatus==='lost'?'var(--red)':'var(--green)',fontSize:10}}>{abStatus==='lost'?'全勤❌':'全勤✓'}</span>}
                  {p.att.overrideCount>0&&<span style={{color:'var(--blue)',fontSize:10}}>⚙️{p.att.overrideCount}</span>}
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:16,fontFamily:'var(--font-mono)',fontWeight:600,color:adjustments[emp.id]?'#f59e0b':'var(--gold)'}}>${getFinalPay(emp, p).toLocaleString()}{adjustments[emp.id]?' ✏️':''}</div>
                  {isCurrentMonth&&<div style={{fontSize:9,color:'var(--text-muted)'}}>出勤{p.actualWorkedDays}天</div>}
                </div>
                {ex?<ChevronUp size={16} color="var(--text-muted)"/>:<ChevronDown size={16} color="var(--text-muted)"/>}
              </div>
            </div>
            {ex&&<div style={{padding:'0 14px 14px',borderTop:'1px solid var(--border)'}}>
              <SH>出勤統計</SH>
              <div style={{display:'flex',gap:6,marginBottom:6,fontSize:12,flexWrap:'wrap'}}>
                <span style={{color:'var(--green)'}}>上班{p.actualWorkedDays}天</span>
                {p.att.sick>0&&<span style={{color:'#ffb347'}}>病假{p.att.sick}</span>}
                {p.att.personal>0&&<span style={{color:'#ffd700'}}>事假{p.att.personal}</span>}
                <span style={{color:'var(--text-muted)'}}>休假{p.att.off}</span>
                {p.att.lateCount>0&&<span style={{color:'var(--red)'}}>遲到{p.att.lateCount}({p.att.lateMinutes}分)</span>}
                {p.att.earlyCount>0&&<span style={{color:'#f59e0b'}}>早退{p.att.earlyCount}({p.att.earlyMinutes}分)</span>}
              </div>
              {p.att.lateDetails.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:11,color:'var(--red)',fontWeight:600,marginBottom:4}}>⚠️ 遲到明細</div>{p.att.lateDetails.map((d,i)=><div key={i} style={{fontSize:11,color:'var(--text-dim)',display:'flex',justifyContent:'space-between',padding:'2px 0'}}><span>{d.date} 打卡{d.time}{d.overridden?' ⚙️':''}</span><span style={{color:'var(--red)'}}>遲{d.minutes}分</span></div>)}</div>}
              {p.att.earlyDetails.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:11,color:'#f59e0b',fontWeight:600,marginBottom:4}}>⚠️ 早退明細</div>{p.att.earlyDetails.map((d,i)=><div key={i} style={{fontSize:11,color:'var(--text-dim)',display:'flex',justifyContent:'space-between',padding:'2px 0'}}><span>{d.date} 下班{d.time}{d.overridden?' ⚙️':''}</span><span style={{color:'#f59e0b'}}>早{d.minutes}分</span></div>)}</div>}
              {p.otDetails.filter(d => d.pay > 0).length > 0 && <div style={{marginBottom:8}}><div style={{fontSize:11,color:'var(--green)',fontWeight:600,marginBottom:4}}>⏰ 加班（時薪${p.hourlyBase}）</div>{p.otDetails.filter(d => d.pay > 0).map((d,i)=><div key={i} style={{fontSize:11,color:'var(--text-dim)',display:'flex',justifyContent:'space-between',padding:'2px 0'}}><span>{d.date} {d.dayType==='國定'?'🎌':d.dayType==='休息日'?'🛌':d.dayType==='例假'?'⛔':''} {d.hours>0?`${d.hours}hr`:''}</span><span style={{color:'var(--green)'}}>+${d.pay.toLocaleString()}</span></div>)}</div>}

              {/* 每日打卡明細（PT 與正職都顯示） */}
              {p.att.dailyPunches?.length>0 && (
                <div style={{marginBottom:10,padding:8,background:'rgba(0,0,0,.25)',borderRadius:6,border:'1px solid var(--border)'}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--gold)',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span>📅 每日打卡明細</span>
                    <a href="/punch-all" style={{fontSize:10,color:'var(--blue)',textDecoration:'none'}}>修正 →</a>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'80px 50px 60px 60px 1fr',gap:4,fontSize:10,color:'var(--text-muted)',padding:'2px 0',borderBottom:'1px solid var(--border)',marginBottom:4}}>
                    <span>日期</span><span>班別</span><span>上班</span><span>下班</span><span style={{textAlign:'right'}}>工時/異常</span>
                  </div>
                  {p.att.dailyPunches.map((d,i)=>(
                    <div key={i} style={{display:'grid',gridTemplateColumns:'80px 50px 60px 60px 1fr',gap:4,fontSize:11,padding:'3px 0',borderBottom:'1px solid rgba(255,255,255,.03)',background:d.isLate?'rgba(196,77,77,.08)':'transparent'}}>
                      <span style={{fontFamily:'var(--font-mono)',color:'var(--text-dim)'}}>{d.date.slice(5)}</span>
                      <span style={{fontSize:10,color:d.shift==='晚班'?'#a78bfa':'#fbbf24'}}>{d.shift}</span>
                      <span style={{fontFamily:'var(--font-mono)',color:d.isLate?'var(--red)':d.missingIn?'#9ca3af':'var(--text)',fontWeight:d.isLate?700:400}}>{d.clockIn || '—'}</span>
                      <span style={{fontFamily:'var(--font-mono)',color:d.isEarly?'#f59e0b':d.missingOut?'#9ca3af':'var(--text)',fontWeight:d.isEarly?700:400}}>{d.clockOut || '—'}</span>
                      <span style={{textAlign:'right',fontFamily:'var(--font-mono)',fontSize:10}}>
                        {d.hours !== null && <span style={{color:'var(--text-dim)'}}>{d.hours}hr </span>}
                        {d.isLate && <span style={{color:'var(--red)',fontWeight:700}}>遲{d.lateMin}分 </span>}
                        {d.isEarly && <span style={{color:'#f59e0b',fontWeight:700}}>早{d.earlyMin}分 </span>}
                        {d.missingIn && !d.missingOut && <span style={{color:'#9ca3af'}}>缺上班 </span>}
                        {d.missingOut && !d.missingIn && <span style={{color:'#9ca3af'}}>缺下班 </span>}
                        {d.missingIn && d.missingOut && <span style={{color:'#9ca3af'}}>未打卡 </span>}
                        {d.override && <span style={{color:'var(--blue)'}}>✏️</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <CigarRewardPayrollStatus employeeId={emp.id} month={month} />
              <SH>薪資明細</SH>
              {p.isPT ? (<>
                <div style={{fontSize:11,color:'var(--gold)',marginBottom:6,fontWeight:600}}>PT 彈性工時（依打卡時數計薪）</div>
                <R label="時薪" value={`$${(p.hourlyBase||0).toLocaleString()}`} dim/>
                <R label="本月累計時數" value={`${p.att.totalPunchHours || 0} hr`} dim/>
                <R label="出勤天數" value={`${p.actualWorkedDays} 天`} dim/>
                {p.att.dailyHours?.length>0 && (
                  <div style={{marginTop:6,marginBottom:6,fontSize:11,color:'var(--text-dim)'}}>
                    <div style={{fontWeight:600,marginBottom:4,color:'var(--gold)'}}>每日打卡時數</div>
                    {p.att.dailyHours.map((d,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',padding:'2px 0'}}><span>{d.date}</span><span style={{fontFamily:'var(--font-mono)'}}>{d.hours} hr</span></div>))}
                  </div>
                )}
                <div style={{height:1,background:'var(--border)',margin:'4px 0'}}/>
                <R label={`${p.att.totalPunchHours || 0} hr × $${(p.hourlyBase||0).toLocaleString()}/hr`} value={p.proratedBase}/>
                {p.otherBonuses.map(b=><R key={b.id} label={`+ ${b.bonus_name}`} value={b.amount} positive/>)}
              </>) : (<>
                <R label="月底薪" value={p.monthlyBase} dim/><R label={`當月天數`} value={`${p.daysInMonth} 天`} dim/><R label="每日底薪" value={p.dailyBase} dim/>
                <R label="實際出勤天數" value={`${p.actualWorkedDays} 天`} dim/>
                <div style={{height:1,background:'var(--border)',margin:'4px 0'}}/>
                <R label={`出勤${p.actualWorkedDays}天 × $${p.dailyBase.toLocaleString()}`} value={p.proratedBase}/>
                {p.attendanceBonus.amount>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',fontSize:13}}><span style={{color:'var(--text-dim)',display:'flex',alignItems:'center',gap:4}}>+ 全勤獎金 <span style={{fontSize:10,padding:'1px 6px',borderRadius:6,background:abStatus==='lost'?'rgba(196,77,77,.15)':'rgba(77,168,108,.15)',color:abStatus==='lost'?'var(--red)':'var(--green)',fontWeight:700}}>{abStatus==='lost'?'已失效':abStatus==='pending'?'暫符合':'已確認'}</span></span><span style={{fontFamily:'var(--font-mono)',color:abStatus==='lost'?'var(--red)':'var(--green)',textDecoration:abStatus==='lost'?'line-through':'none'}}>{abStatus==='lost'?`$${p.attendanceBonus.amount.toLocaleString()}`:`+$${p.attendanceBonus.effective.toLocaleString()}`}</span></div>}
                {p.otherBonuses.map(b=><R key={b.id} label={`+ ${b.bonus_name}`} value={b.amount} positive/>)}
                {p.otPay>0&&<R label="+ 加班費" value={p.otPay} positive/>}
                <div style={{height:1,background:'var(--border)',margin:'6px 0'}}/>
                <R label={`投保 $${p.lb.toLocaleString()}`} value={p.lb} dim/>
                <R label="- 勞保(20%)" value={-p.li} negative/><R label="- 健保(30%)" value={-p.hi} negative/>
                {p.sickDeduct>0&&<R label={`- 病假${p.att.sick}天`} value={-p.sickDeduct} negative/>}
                {p.personalDeduct>0&&<R label={`- 事假${p.att.personal}天`} value={-p.personalDeduct} negative/>}
                {p.absentDeduct>0&&<R label={`- 曠職${p.att.absent}天`} value={-p.absentDeduct} negative/>}
              </>)}
              {p.sopPenaltyTotal > 0 && (
                <div style={{marginTop:8,padding:8,background:'rgba(196,77,77,.08)',borderRadius:6,border:'1px solid rgba(196,77,77,.25)'}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--red)',marginBottom:4}}>📛 SOP 罰款（環境整潔拍照未完成）</div>
                  {(p.sopPenalties || []).map((sp, i) => (
                    <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',fontSize:11,color:'var(--text-dim)'}}>
                      <span>{sp.date} · {sp.task_title}</span>
                      <span style={{fontFamily:'var(--font-mono)',color:'var(--red)',fontWeight:700}}>-${(+sp.amount).toLocaleString()}</span>
                    </div>
                  ))}
                  <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0 0',marginTop:4,borderTop:'1px solid rgba(196,77,77,.2)',fontSize:12,fontWeight:700}}>
                    <span style={{color:'var(--red)'}}>合計</span>
                    <span style={{fontFamily:'var(--font-mono)',color:'var(--red)'}}>-${p.sopPenaltyTotal.toLocaleString()}</span>
                  </div>
                </div>
              )}
              <div style={{height:2,background:'var(--gold)',margin:'8px 0'}}/>
              <R label="＝ 系統計算" value={p.currentPayable} highlight/>
              {/* 手動覆寫摘要 */}
              {adjustments[emp.id] && (() => { const a = adjustments[emp.id]; return (
                <div style={{padding:'6px 0',fontSize:11}}>
                  {a.base != null && <div style={{display:'flex',justifyContent:'space-between',color:'#f59e0b'}}><span>✏️ 底薪覆寫</span><span style={{fontFamily:'var(--font-mono)'}}>${a.base.toLocaleString()}</span></div>}
                  {a.bonus != null && <div style={{display:'flex',justifyContent:'space-between',color:'#f59e0b'}}><span>✏️ 獎金覆寫</span><span style={{fontFamily:'var(--font-mono)'}}>${a.bonus.toLocaleString()}</span></div>}
                  {a.deduction != null && <div style={{display:'flex',justifyContent:'space-between',color:'#f59e0b'}}><span>✏️ 扣款覆寫</span><span style={{fontFamily:'var(--font-mono)'}}>${a.deduction.toLocaleString()}</span></div>}
                  {a.final_pay != null && <div style={{display:'flex',justifyContent:'space-between',color:'#f59e0b'}}><span>✏️ 實發覆寫</span><span style={{fontFamily:'var(--font-mono)'}}>${a.final_pay.toLocaleString()}</span></div>}
                  {a.reason && <div style={{color:'var(--text-muted)',marginTop:2}}>原因：{a.reason}</div>}
                </div>
              )})()}
              {adjustments[emp.id] && <R label="＝ 實際應發" value={getFinalPay(emp, p)} highlight/>}
              {editingAdj === emp.id ? (
                <div style={{marginTop:6,padding:10,background:'rgba(201,168,76,.05)',borderRadius:8,border:'1px solid var(--border-gold)'}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--gold)',marginBottom:6}}>✏️ 手動覆寫（留空 = 不覆寫，用系統計算值）</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:6}}>
                    <div><div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>底薪（系統 ${p.proratedBase.toLocaleString()}）</div><input type="number" value={adjForm.base} onChange={e=>setAdjForm(f=>({...f,base:e.target.value}))} placeholder="不覆寫" style={{width:'100%',fontSize:13,padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--black)',color:'var(--text)',boxSizing:'border-box'}} /></div>
                    <div><div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>獎金（系統 ${p.totalBonuses.toLocaleString()}）</div><input type="number" value={adjForm.bonus} onChange={e=>setAdjForm(f=>({...f,bonus:e.target.value}))} placeholder="不覆寫" style={{width:'100%',fontSize:13,padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--black)',color:'var(--text)',boxSizing:'border-box'}} /></div>
                    <div><div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>扣款（系統 ${p.totalDeductions.toLocaleString()}）</div><input type="number" value={adjForm.deduction} onChange={e=>setAdjForm(f=>({...f,deduction:e.target.value}))} placeholder="不覆寫" style={{width:'100%',fontSize:13,padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--black)',color:'var(--text)',boxSizing:'border-box'}} /></div>
                    <div><div style={{fontSize:10,color:'var(--red)',marginBottom:2,fontWeight:600}}>直接覆寫實發金額</div><input type="number" value={adjForm.final_pay} onChange={e=>setAdjForm(f=>({...f,final_pay:e.target.value}))} placeholder="不覆寫" style={{width:'100%',fontSize:13,padding:'6px 8px',borderRadius:6,border:'1px solid rgba(196,77,77,.3)',background:'var(--black)',color:'var(--text)',boxSizing:'border-box'}} /></div>
                  </div>
                  <input value={adjForm.reason} onChange={e=>setAdjForm(f=>({...f,reason:e.target.value}))} placeholder="覆寫原因（如：談好固定薪、績效獎金等）" style={{width:'100%',fontSize:12,padding:'6px 8px',marginBottom:8,borderRadius:6,border:'1px solid var(--border)',background:'var(--black)',color:'var(--text)',boxSizing:'border-box'}} />
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>saveAdjustment(emp.id)} style={{flex:1,padding:8,fontSize:12,fontWeight:700,borderRadius:6,border:'none',background:'var(--gold)',color:'var(--black)',cursor:'pointer'}}>✅ 儲存</button>
                    {adjustments[emp.id]&&<button onClick={()=>deleteAdjustment(emp.id)} style={{padding:'8px 12px',fontSize:12,fontWeight:600,borderRadius:6,border:'1px solid rgba(196,77,77,.3)',background:'rgba(196,77,77,.08)',color:'var(--red)',cursor:'pointer'}}>🗑</button>}
                    <button onClick={()=>setEditingAdj(null)} style={{padding:'8px 12px',fontSize:12,borderRadius:6,border:'1px solid var(--border)',background:'var(--black-card)',color:'var(--text-muted)',cursor:'pointer'}}>取消</button>
                  </div>
                </div>
              ) : (
                <button onClick={()=>{const a=adjustments[emp.id];setEditingAdj(emp.id);setAdjForm({base:a?.base!=null?String(a.base):'',bonus:a?.bonus!=null?String(a.bonus):'',deduction:a?.deduction!=null?String(a.deduction):'',final_pay:a?.final_pay!=null?String(a.final_pay):'',reason:a?.reason||''})}} style={{width:'100%',marginTop:6,padding:8,fontSize:12,fontWeight:600,borderRadius:6,border:'1px solid var(--border)',background:'var(--black-card)',color:'var(--gold)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>✏️ 手動覆寫薪資</button>
              )}
              {isCurrentMonth&&<div style={{fontSize:10,color:'var(--text-muted)',marginTop:4,textAlign:'center'}}>⚠️ 依實際出勤，非月底應發</div>}
              <div style={{height:1,background:'var(--border)',margin:'8px 0'}}/>
              <SH>雇主負擔</SH>
              <R label="勞保70%" value={p.liER} dim/><R label="健保60%" value={p.hiER} dim/><R label="勞退6%" value={p.lp} dim/>
              <R label="雇主總成本" value={p.erCost} highlight/>
              <button className="btn-outline" style={{width:'100%',marginTop:10,display:'flex',alignItems:'center',justifyContent:'center',gap:6,fontSize:13}} onClick={async()=>{const{data:lb}=await supabase.rpc('leave_balance_get',{p_employee_id:emp.id});setPayslip({emp,p,leaveBalance:lb||[]})}}><FileText size={14}/> 生成薪資條</button>
              <button className="btn-gold" style={{width:'100%',marginTop:6,display:'flex',alignItems:'center',justifyContent:'center',gap:6,fontSize:13,background:'linear-gradient(135deg,#4d8ac4,#3a6f9e)'}} onClick={()=>finalizeOne(emp,p)}>💸 結轉本月薪資 + LINE 通知</button>
            </div>}
          </div>
        })}
      </div>)}

      {/* ===== ⚙️ 出勤修正 ===== */}
      {tab==='override'&&(<div>
        <div style={{fontSize:13,color:'var(--text-dim)',marginBottom:12}}>選擇員工查看每日出勤紀錄，可修正遲到/早退/出勤狀態。修正後薪資立即重算。</div>
        <select value={overrideEmp} onChange={e=>setOverrideEmp(e.target.value)} style={{width:'100%',fontSize:14,padding:10,marginBottom:16}}>
          <option value="">— 選擇員工 —</option>
          {emps.map(e=><option key={e.id} value={e.id}>{e.name} ({e.id})</option>)}
        </select>
        {overrideEmp && getDayRows(overrideEmp).map(day => {
          // 工作日：除「休假/請假類」之外都算（含早班/晚班/單人班/彈性班/PT*）
          const nonWork = ['休假','臨時請假','病假','事假','特休','調班']
          const isWorkDay = !nonWork.includes(day.shift)
          const missingIn = isWorkDay && !day.clockInPunch
          const missingOut = isWorkDay && !day.clockOutPunch
          const hasIssue = day.autoLate || day.autoEarly || missingIn || missingOut
          const isFixed = day.inOverridden || day.outOverridden
          const lateFixed = day.inOverridden && day.inCorrectedLate === false
          const earlyFixed = day.outOverridden && day.outCorrectedEarly === false

          // 日類型 chip 顏色
          const dt = day.dayType
          const dtColor = dt === '國定' ? '#fb923c' : dt === '休息日' ? '#a78bfa' : dt === '例假' ? '#ef4444' : null
          return <div key={day.date} className="card" style={{padding:12,marginBottom:6,borderColor:isFixed?'rgba(77,138,196,.3)':hasIssue?'rgba(196,77,77,.3)':dt==='國定'?'rgba(251,146,60,.35)':'var(--border)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:isWorkDay&&(hasIssue||isFixed)?8:0}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                  {day.date.slice(5)}
                  <span style={{fontSize:10,padding:'2px 6px',borderRadius:6,background: !isWorkDay?'rgba(138,130,120,.1)':hasIssue&&!isFixed?'rgba(196,77,77,.1)':isFixed?'rgba(77,138,196,.1)':'rgba(77,168,108,.1)', color: !isWorkDay?'var(--text-muted)':hasIssue&&!isFixed?'var(--red)':isFixed?'var(--blue)':'var(--green)'}}>{!isWorkDay?day.shift:isFixed?'⚙️已修正':hasIssue?'異常':'正常'}</span>
                  {dtColor && (
                    <span style={{fontSize:9,padding:'2px 7px',borderRadius:10,background:dtColor+'22',color:dtColor,border:`1px solid ${dtColor}55`,fontWeight:700,letterSpacing:1}}>
                      {dt === '國定' ? '🎌 國定' : dt === '休息日' ? '🛌 休息日' : '⛔ 例假'}
                    </span>
                  )}
                  {day.holidayName && <span style={{fontSize:9,color:dtColor||'var(--text-muted)',fontStyle:'italic'}}>{day.holidayName}</span>}
                </div>
                {isWorkDay&&<div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                  {day.shift} · 上班 {day.clockInTime||'未打'} · 下班 {day.clockOutTime||'未打'}
                </div>}
              </div>
              {isWorkDay && !hasIssue && !isFixed && <CheckCircle2 size={16} color="var(--green)"/>}
              {isWorkDay && hasIssue && !isFixed && <AlertTriangle size={16} color="var(--red)"/>}
              {isFixed && <span style={{fontSize:10,color:'var(--blue)',fontWeight:700}}>⚙️</span>}
            </div>
            {/* 加班費 / 補休 切換（國定/休息日/例假 整日工資、或平日有加班）*/}
            {isWorkDay && day.clockOutId && (dt === '國定' || dt === '休息日' || dt === '例假') && (
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderTop:'1px dashed rgba(251,146,60,.3)'}}>
                <div style={{fontSize:11,color:dtColor,fontWeight:600}}>{dt} 加班費結算方式</div>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={()=>setOtChoice(day.clockOutId, 'pay')} disabled={overrideSaving===day.clockOutId}
                    style={{fontSize:11,padding:'5px 10px',borderRadius:8,cursor:'pointer',fontWeight:700,
                      background: day.otChoice==='pay'?'rgba(77,168,108,.25)':'transparent',
                      color: day.otChoice==='pay'?'var(--green)':'var(--text-muted)',
                      border: `1px solid ${day.otChoice==='pay'?'rgba(77,168,108,.5)':'var(--border)'}`}}>
                    💰 領加班費
                  </button>
                  <button onClick={()=>setOtChoice(day.clockOutId, 'comp_leave')} disabled={overrideSaving===day.clockOutId}
                    style={{fontSize:11,padding:'5px 10px',borderRadius:8,cursor:'pointer',fontWeight:700,
                      background: day.otChoice==='comp_leave'?'rgba(167,139,250,.25)':'transparent',
                      color: day.otChoice==='comp_leave'?'#a78bfa':'var(--text-muted)',
                      border: `1px solid ${day.otChoice==='comp_leave'?'rgba(167,139,250,.5)':'var(--border)'}`}}>
                    🌴 換補休
                  </button>
                </div>
              </div>
            )}

            {/* 補卡：上班 */}
            {missingIn && (
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderTop:'1px solid var(--border)'}}>
                <div style={{fontSize:12,color:'var(--red)'}}>⚠️ 缺上班打卡</div>
                <button onClick={()=>addMissingPunch(overrideEmp, day.date, '上班')} disabled={overrideSaving===`new-${day.date}-上班`} style={{fontSize:11,padding:'4px 10px',borderRadius:8,cursor:'pointer',background:'rgba(212,175,55,.12)',color:'var(--gold)',border:'1px solid rgba(212,175,55,.4)',fontWeight:600}}>
                  {overrideSaving===`new-${day.date}-上班`?'...':'✏️ 補打卡'}
                </button>
              </div>
            )}
            {/* 補卡：下班 */}
            {missingOut && (
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderTop:'1px solid var(--border)'}}>
                <div style={{fontSize:12,color:'var(--red)'}}>⚠️ 缺下班打卡</div>
                <button onClick={()=>addMissingPunch(overrideEmp, day.date, '下班')} disabled={overrideSaving===`new-${day.date}-下班`} style={{fontSize:11,padding:'4px 10px',borderRadius:8,cursor:'pointer',background:'rgba(212,175,55,.12)',color:'var(--gold)',border:'1px solid rgba(212,175,55,.4)',fontWeight:600}}>
                  {overrideSaving===`new-${day.date}-下班`?'...':'✏️ 補打卡'}
                </button>
              </div>
            )}
            {/* 遲到修正 */}
            {isWorkDay && day.autoLate && (
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderTop:'1px solid var(--border)'}}>
                <div style={{fontSize:12}}>
                  <span style={{color:'var(--red)'}}>🔴 遲到 {day.lateMins} 分鐘</span>
                  {lateFixed && <span style={{color:'var(--blue)',marginLeft:6,fontSize:11}}>→ 已改正常</span>}
                </div>
                {!lateFixed ? (
                  <button onClick={()=>overridePunch(day.clockInId, { corrected_is_late: false, override_reason: '測試期間取消遲到' })} disabled={overrideSaving===day.clockInId} style={{fontSize:11,padding:'4px 10px',borderRadius:8,cursor:'pointer',background:'rgba(77,168,108,.12)',color:'var(--green)',border:'1px solid rgba(77,168,108,.3)',fontWeight:600}}>
                    {overrideSaving===day.clockInId?'...':'✅ 改正常'}
                  </button>
                ) : (
                  <button onClick={()=>cancelOverride(day.clockInId)} disabled={overrideSaving===day.clockInId} style={{fontSize:11,padding:'4px 10px',borderRadius:8,cursor:'pointer',background:'rgba(196,77,77,.08)',color:'var(--red)',border:'1px solid rgba(196,77,77,.2)',fontWeight:600}}>
                    {overrideSaving===day.clockInId?'...':'↩️ 還原'}
                  </button>
                )}
              </div>
            )}

            {/* 早退修正 */}
            {isWorkDay && day.autoEarly && (
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderTop:'1px solid var(--border)'}}>
                <div style={{fontSize:12}}>
                  <span style={{color:'#f59e0b'}}>🟡 早退 {day.earlyMins} 分鐘</span>
                  {earlyFixed && <span style={{color:'var(--blue)',marginLeft:6,fontSize:11}}>→ 已改正常</span>}
                </div>
                {!earlyFixed ? (
                  <button onClick={()=>overridePunch(day.clockOutId, { corrected_is_early: false, override_reason: '測試期間取消早退' })} disabled={overrideSaving===day.clockOutId} style={{fontSize:11,padding:'4px 10px',borderRadius:8,cursor:'pointer',background:'rgba(77,168,108,.12)',color:'var(--green)',border:'1px solid rgba(77,168,108,.3)',fontWeight:600}}>
                    {overrideSaving===day.clockOutId?'...':'✅ 改正常'}
                  </button>
                ) : (
                  <button onClick={()=>cancelOverride(day.clockOutId)} disabled={overrideSaving===day.clockOutId} style={{fontSize:11,padding:'4px 10px',borderRadius:8,cursor:'pointer',background:'rgba(196,77,77,.08)',color:'var(--red)',border:'1px solid rgba(196,77,77,.2)',fontWeight:600}}>
                    {overrideSaving===day.clockOutId?'...':'↩️ 還原'}
                  </button>
                )}
              </div>
            )}
          </div>
        })}
        {overrideEmp && getDayRows(overrideEmp).length === 0 && <div style={{textAlign:'center',color:'var(--text-muted)',padding:20}}>本月無排班紀錄</div>}
      </div>)}

      {/* ===== 薪資設定 ===== */}
      {tab==='config'&&(<div>
        {emps.map(emp=>{const c=getCfg(emp.id),isE=editingSal?.eid===emp.id;return <div key={emp.id} className="card" style={{padding:14,marginBottom:8}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:isE?10:0}}><div><div style={{fontSize:14,fontWeight:600}}>{emp.name} <span style={{fontSize:10,color:'var(--text-muted)'}}>{emp.emp_type}</span></div><div style={{fontSize:11,color:'var(--text-muted)'}}>{c.salary_type||'月薪'} · ${(c.monthly_salary||0).toLocaleString()}</div></div>{!isE&&<button style={ib} onClick={()=>setEditingSal({eid:emp.id,salary_type:c.salary_type||'月薪',monthly_salary:c.monthly_salary||0})}><Edit3 size={14} color="var(--gold)"/></button>}</div>{isE&&<div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><select value={editingSal.salary_type} onChange={e=>setEditingSal(p=>({...p,salary_type:e.target.value}))} style={{width:80,fontSize:13,padding:8}}><option>月薪</option><option>時薪</option></select><input type="number" inputMode="numeric" value={editingSal.monthly_salary} onChange={e=>setEditingSal(p=>({...p,monthly_salary:e.target.value}))} style={{flex:1,fontSize:13,padding:8}}/><button className="btn-gold" style={{padding:'8px 14px',fontSize:12}} onClick={()=>saveSalConfig(emp.id)}><Save size={12}/></button><button className="btn-outline" style={{padding:'8px 14px',fontSize:12}} onClick={()=>setEditingSal(null)}>取消</button></div>}</div>})}
      </div>)}

      {/* ===== 加給管理 ===== */}
      {tab==='bonus'&&(<div>
        <button className="btn-outline" style={{marginBottom:16,display:'flex',alignItems:'center',gap:6}} onClick={()=>setShowBonusForm(!showBonusForm)}><Plus size={14}/> 新增加給</button>
        {showBonusForm&&<div className="card" style={{marginBottom:16,padding:16}}><select value={newBonus.employee_id} onChange={e=>setNewBonus(p=>({...p,employee_id:e.target.value}))} style={{marginBottom:8}}><option value="">選擇員工</option>{emps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><input value={newBonus.bonus_name} onChange={e=>setNewBonus(p=>({...p,bonus_name:e.target.value}))} placeholder="加給名稱（含「全勤」自動判斷）" style={{marginBottom:8}}/><input type="number" inputMode="numeric" value={newBonus.amount} onChange={e=>setNewBonus(p=>({...p,amount:e.target.value}))} placeholder="金額" style={{marginBottom:8}} pattern="[0-9]*"/><button className="btn-gold" onClick={addBonus}>新增</button></div>}
        {emps.map(emp=>{const eb=bonuses.filter(b=>b.employee_id===emp.id);if(!eb.length)return null;return <div key={emp.id} style={{marginBottom:12}}><div style={{fontSize:13,fontWeight:700,color:'var(--gold)',marginBottom:4}}>{emp.name}</div>{eb.map(b=>(
          <div key={b.id} className="card" style={{padding:12,marginBottom:4,display:'flex',justifyContent:'space-between',alignItems:'center',opacity:b.enabled===true?1:.55,borderColor:b.enabled===true?'rgba(77,168,108,.3)':'var(--border)'}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                {b.bonus_name}
                <span style={{fontSize:9,padding:'2px 8px',borderRadius:10,fontWeight:700,letterSpacing:1, background:b.enabled===true?'rgba(77,168,108,.18)':'rgba(138,130,120,.15)', color:b.enabled===true?'var(--green)':'var(--text-muted)'}}>
                  {b.enabled===true?'● 啟用中':'○ 已停用'}
                </span>
              </div>
              <div style={{fontSize:12,color:b.enabled===true?'var(--green)':'var(--text-muted)',fontWeight:700,marginTop:2}}>+${(b.amount||0).toLocaleString()} / 月</div>
            </div>
            <div style={{display:'flex',gap:4}}>
              <button onClick={()=>toggleBonus(b.id,!b.enabled)} style={{padding:'6px 12px',borderRadius:8,fontSize:11,fontWeight:700,cursor:'pointer',background:b.enabled===true?'rgba(196,77,77,.12)':'rgba(77,168,108,.15)',color:b.enabled===true?'var(--red)':'var(--green)',border:b.enabled===true?'1px solid rgba(196,77,77,.3)':'1px solid rgba(77,168,108,.35)'}}>
                {b.enabled===true?'停用':'啟用'}
              </button>
              <button style={{...ib,color:'var(--red)'}} onClick={()=>deleteBonus(b.id)}><Trash2 size={12}/></button>
            </div>
          </div>
        ))}</div>})}
      </div>)}

      {/* ===== 支出管理 ===== */}
      {tab==='expenses'&&(() => {
        // 統計：依「提交者」分組
        const bySubmitter = {}
        expenses.forEach(x => {
          const k = x.submitted_by || 'ADMIN'
          if (!bySubmitter[k]) bySubmitter[k] = { count: 0, total: 0 }
          bySubmitter[k].count++
          bySubmitter[k].total += +x.amount || 0
        })
        const submitterFilter = expenseSubmitterFilter || 'ALL'
        const filtered = submitterFilter === 'ALL' ? expenses : expenses.filter(x => (x.submitted_by || 'ADMIN') === submitterFilter)
        return (<div>
        <div className="card" style={{padding:14,marginBottom:12}}><div style={{fontSize:11,color:'var(--text-dim)'}}>本月支出（含員工）</div><div style={{fontSize:22,fontFamily:'var(--font-mono)',color:'var(--red)',fontWeight:600}}>${totalExp.toLocaleString()}</div></div>
        {/* 員工 / ADMIN filter chips */}
        <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
          <button onClick={()=>setExpenseSubmitterFilter('ALL')} style={{padding:'6px 12px',borderRadius:18,fontSize:11,fontWeight:600,cursor:'pointer',background:submitterFilter==='ALL'?'var(--gold-glow)':'transparent',color:submitterFilter==='ALL'?'var(--gold)':'var(--text-dim)',border:submitterFilter==='ALL'?'1px solid var(--border-gold)':'1px solid var(--border)'}}>全部 ({expenses.length})</button>
          {Object.entries(bySubmitter).map(([sub, s]) => (
            <button key={sub} onClick={()=>setExpenseSubmitterFilter(sub)} style={{padding:'6px 12px',borderRadius:18,fontSize:11,fontWeight:600,cursor:'pointer',background:submitterFilter===sub?'var(--gold-glow)':'transparent',color:submitterFilter===sub?'var(--gold)':'var(--text-dim)',border:submitterFilter===sub?'1px solid var(--border-gold)':'1px solid var(--border)'}}>
              {sub === 'ADMIN' ? '👑 老闆' : `👤 ${sub}`} ({s.count}) ${s.total.toLocaleString()}
            </button>
          ))}
        </div>
        <button className="btn-outline" style={{marginBottom:16,display:'flex',alignItems:'center',gap:6}} onClick={()=>setShowExpForm(!showExpForm)}><Plus size={14}/> 新增</button>
        {showExpForm&&<div className="card" style={{marginBottom:16,padding:16}}><div style={{display:'flex',gap:8,marginBottom:8}}><input type="date" value={newExp.date} onChange={e=>setNewExp(p=>({...p,date:e.target.value}))} style={{flex:1,fontSize:13,padding:8}}/><select value={newExp.category} onChange={e=>setNewExp(p=>({...p,category:e.target.value}))} style={{flex:1,fontSize:13,padding:8}}><option value="">分類</option>{['食材','酒水','雪茄進貨','設備','房租','水電','人事','行銷','雜支'].map(c=><option key={c}>{c}</option>)}</select></div><input value={newExp.item} onChange={e=>setNewExp(p=>({...p,item:e.target.value}))} placeholder="項目" style={{marginBottom:8}}/><div style={{display:'flex',gap:8,marginBottom:8}}><input type="number" inputMode="numeric" value={newExp.amount} onChange={e=>setNewExp(p=>({...p,amount:e.target.value}))} placeholder="金額" style={{flex:1}} pattern="[0-9]*"/><select value={newExp.payment} onChange={e=>setNewExp(p=>({...p,payment:e.target.value}))} style={{width:100,fontSize:13,padding:8}}>{['現金','刷卡','轉帳','LINE Pay'].map(p=><option key={p}>{p}</option>)}</select></div><button className="btn-gold" onClick={addExpense}>儲存</button></div>}
        {filtered.length === 0 && <div style={{textAlign:'center',padding:30,color:'var(--text-muted)',fontSize:13}}>此區間無支出紀錄</div>}
        {filtered.map(e => {
          const isStaff = e.submitted_by && e.submitted_by !== 'ADMIN'
          return (
          <div key={e.id} className="card" style={{padding:12,marginBottom:8,borderColor: isStaff ? 'rgba(212,175,55,.25)' : 'var(--border)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                  {e.item || e.category}
                  {isStaff && <span style={{fontSize:9,padding:'1px 6px',background:'rgba(212,175,55,.18)',color:'var(--gold)',borderRadius:4,fontWeight:700}}>👤 {e.submitted_by}</span>}
                  {!isStaff && <span style={{fontSize:9,padding:'1px 6px',background:'rgba(77,138,196,.12)',color:'#4d8ac4',borderRadius:4,fontWeight:700}}>👑 老闆</span>}
                </div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>
                  {e.date} · {e.category} · {e.payment}
                  {e.vendor && <span> · 🏪 {e.vendor}</span>}
                  {e.handler && e.handler !== 'ADMIN' && <span> · 💰 {e.handler}</span>}
                </div>
                {e.note && <div style={{fontSize:11,color:'var(--text-dim)',marginTop:4,fontStyle:'italic'}}>📝 {e.note}</div>}
              </div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}>
                <span style={{fontSize:15,fontFamily:'var(--font-mono)',color:'var(--red)',fontWeight:700}}>-${(e.amount||0).toLocaleString()}</span>
                <button style={{...ib,color:'var(--red)'}} onClick={()=>deleteExpense(e.id)}><Trash2 size={12}/></button>
              </div>
            </div>
            {e.photo_url && (
              <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--border)'}}>
                <img src={e.photo_url} alt="收據" onClick={() => window.open(e.photo_url, '_blank')}
                  style={{width:'100%',maxHeight:200,objectFit:'cover',borderRadius:8,cursor:'pointer',border:'1px solid var(--border)'}}/>
                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4,textAlign:'center'}}>🧾 點圖看大張收據</div>
              </div>
            )}
          </div>
          )
        })}
      </div>)
      })()}
    </div>
  )
}

function R({label,value,positive,negative,highlight,dim}) {
  const c=highlight?'var(--gold)':positive?'var(--green)':negative?'var(--red)':dim?'var(--text-muted)':'var(--text)'
  const display=typeof value==='number'?(value<0?`-$${Math.abs(value).toLocaleString()}`:`$${value.toLocaleString()}`):value
  return <div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',fontSize:13}}><span style={{color:dim?'var(--text-muted)':'var(--text-dim)'}}>{label}</span><span style={{fontFamily:'var(--font-mono)',fontWeight:highlight?600:400,color:c}}>{display}</span></div>
}
function SH({children}){return<div style={{fontSize:12,fontWeight:600,color:'var(--gold)',marginBottom:4,marginTop:8}}>{children}</div>}
function SB({label,value,color}){return<div className="card" style={{padding:10,textAlign:'center'}}><div style={{fontSize:9,color:'var(--text-dim)'}}>{label}</div><div style={{fontSize:14,fontFamily:'var(--font-mono)',fontWeight:600,color}}>{value}</div></div>}
const ib={background:'none',border:'none',padding:6,cursor:'pointer',borderRadius:6,fontSize:12,fontWeight:700}
