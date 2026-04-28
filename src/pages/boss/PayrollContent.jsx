import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { CigarRewardPayrollStatus } from '../../components/CigarRewardCard'
import { calcLaborIns, calcHealthIns, calcLaborPension, calcLaborInsER, calcHealthInsER, findBracket, calcOvertimePay, LABOR_INS_BRACKETS, HEALTH_INS_BRACKETS, SHIFTS, LATE_GRACE_MIN, OT_GRACE_MIN } from '../../lib/constants'
import { ChevronDown, ChevronUp, Plus, Trash2, Save, FileText, Printer, Edit3, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { taipeiHM } from '../../lib/timezone'
import { format, subMonths, endOfMonth } from 'date-fns'

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
function getAttendanceData(eid, schedules, punches) {
  const es = schedules.filter(s => s.employee_id === eid)
  const ep = punches.filter(p => p.employee_id === eid && p.is_valid)
  let work = 0, sick = 0, personal = 0, off = 0, special = 0, absent = 0
  let lateCount = 0, lateMinutes = 0, earlyCount = 0, earlyMinutes = 0
  let otTotalMin = 0, otDetails = [], lateDetails = [], earlyDetails = []
  let overrideCount = 0, missingPunch = []

  es.forEach(s => {
    const v = s.shift || ''
    if (v === '早班' || v === '晚班') {
      const shift = SHIFTS[v]
      if (!shift) { work++; return }
      const dayPunches = ep.filter(p => p.date === s.date)
      const clockInPunch = dayPunches.find(p => p.punch_type === '上班')
      const clockOutPunch = dayPunches.find(p => p.punch_type === '下班')
      const resolved = clockInPunch ? resolvePunch(clockInPunch) : null
      const resolvedOut = clockOutPunch ? resolvePunch(clockOutPunch) : null
      if (resolved?.overridden || resolvedOut?.overridden) overrideCount++
      const countsAsWorked = resolved ? (resolved.countsAsWorked !== false) : true
      if (countsAsWorked) work++

      // 遲到檢查（用 taipeiHM 轉換時區）
      const clockInTime = resolved?.clockIn || clockInPunch?.time
      if (clockInTime) {
        const [h, m] = typeof clockInTime === 'string' && clockInTime.includes('T') ? taipeiHM(clockInTime) : (clockInTime || '').slice(0, 5).split(':').map(Number)
        if (!isNaN(h) && !isNaN(m)) {
          const pm = h * 60 + m, sm = shift.startH * 60 + shift.startM + LATE_GRACE_MIN
          if (resolved?.overridden && resolved.isLate === false) { /* 已取消遲到 */ }
          else if (pm > sm) {
            const mins = pm - sm
            lateCount++; lateMinutes += mins
            lateDetails.push({ date: s.date, minutes: mins, time: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`, overridden: resolved?.overridden })
          }
        }
      }

      // 早退檢查（用 taipeiHM 轉換時區，修正跨日判斷）
      const clockOutTime = resolvedOut?.clockOut || clockOutPunch?.time
      if (clockOutTime) {
        const [h, m] = typeof clockOutTime === 'string' && clockOutTime.includes('T') ? taipeiHM(clockOutTime) : (clockOutTime || '').slice(0, 5).split(':').map(Number)
        if (!isNaN(h) && !isNaN(m)) {
          let pm = h * 60 + m
          if (v === '晚班' && h < 12) pm += 1440
          const endMin = shift.endH * 60 + shift.endM
          if (resolvedOut?.overridden && resolvedOut.isEarly === false) { /* 已取消早退 */ }
          else if (pm < endMin) {
            const mins = endMin - pm
            earlyCount++; earlyMinutes += mins
            earlyDetails.push({ date: s.date, minutes: mins, time: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`, overridden: resolvedOut?.overridden })
          }
          const graceMin = endMin + OT_GRACE_MIN
          if (pm > graceMin) {
            const otMin = pm - endMin
            otTotalMin += otMin
            otDetails.push({ date: s.date, minutes: otMin, hours: +(otMin / 60).toFixed(1) })
          }
        }
      }

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
  return { work, sick, personal, off, special, absent, total: es.length, lateCount, lateMinutes, lateDetails, earlyCount, earlyMinutes, earlyDetails, otTotalMin, otDetails, overrideCount, missingPunch }
}

/* ================================================================
   薪資計算（統一實際出勤天數）
   ================================================================ */
function calcSalaryToDate(emp, cfg, bonusDefs, att, isCurrentMonth, targetDate) {
  const year = targetDate.getFullYear(), monthNum = targetDate.getMonth() + 1
  const daysInMonth = new Date(year, monthNum, 0).getDate()
  const dayOfMonth = targetDate.getDate()
  const monthlyBase = cfg.monthly_salary || 0
  const dailyBase = monthlyBase > 0 ? Math.round(monthlyBase / daysInMonth) : 0
  const hourlyBase = dailyBase > 0 ? Math.round(dailyBase / 8) : 0
  const proratedBase = dailyBase * att.work

  let otPay = 0
  att.otDetails.forEach(d => { d.pay = calcOvertimePay(hourlyBase, d.minutes); otPay += d.pay })

  const empBonuses = bonusDefs.filter(b => b.employee_id === emp.id && b.enabled)
  const attendanceBonusDef = empBonuses.find(b => b.bonus_name && b.bonus_name.includes('全勤'))
  const otherBonuses = empBonuses.filter(b => !b.bonus_name?.includes('全勤'))
  let attendanceBonusStatus = 'pending'
  if (att.lateCount > 0 || att.earlyCount > 0 || att.sick > 0 || att.personal > 0 || att.absent > 0 || att.missingPunch?.length > 0) attendanceBonusStatus = 'lost'
  else if (!isCurrentMonth) attendanceBonusStatus = 'eligible'
  const attendanceBonusAmount = attendanceBonusDef?.amount || 0
  const effectiveAttendanceBonus = attendanceBonusStatus === 'lost' ? 0 : attendanceBonusAmount
  const otherBonusTotal = otherBonuses.reduce((s, b) => s + (b.amount || 0), 0)
  const totalBonuses = effectiveAttendanceBonus + otherBonusTotal + otPay

  const sickDeduct = Math.round(att.sick * dailyBase * 0.5)
  const personalDeduct = att.personal * dailyBase
  const absentDeduct = att.absent * dailyBase
  const li = calcLaborIns(monthlyBase), hi = calcHealthIns(monthlyBase)
  const lp = calcLaborPension(monthlyBase), liER = calcLaborInsER(monthlyBase), hiER = calcHealthInsER(monthlyBase)
  const lb = findBracket(monthlyBase, LABOR_INS_BRACKETS)
  const totalDeductions = li + hi + sickDeduct + personalDeduct + absentDeduct
  const currentPayable = proratedBase + totalBonuses - totalDeductions
  const erCost = proratedBase + totalBonuses + liER + hiER + lp

  return {
    monthlyBase, daysInMonth, dayOfMonth, dailyBase, hourlyBase,
    actualWorkedDays: att.work, proratedBase, empBonuses, otherBonuses,
    attendanceBonus: { def: attendanceBonusDef, amount: attendanceBonusAmount, status: attendanceBonusStatus, effective: effectiveAttendanceBonus },
    otPay, otDetails: att.otDetails, sickDeduct, personalDeduct, absentDeduct,
    li, hi, lp, liER, hiER, lb, totalBonuses, totalDeductions, currentPayable, erCost, att,
  }
}

/* ================================================================
   主元件
   ================================================================ */
export default function Payroll() {
  const [tab, setTab] = useState('payroll')
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [emps, setEmps] = useState([])
  const [salConfigs, setSalConfigs] = useState([])
  const [bonuses, setBonuses] = useState([])
  const [expenses, setExpenses] = useState([])
  const [schedules, setSchedules] = useState([])
  const [punches, setPunches] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [editingSal, setEditingSal] = useState(null)
  const [newBonus, setNewBonus] = useState({ employee_id: '', bonus_name: '', amount: '' })
  const [showBonusForm, setShowBonusForm] = useState(false)
  const [newExp, setNewExp] = useState({ category: '', item: '', amount: '', payment: '現金', date: format(new Date(), 'yyyy-MM-dd') })
  const [showExpForm, setShowExpForm] = useState(false)
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

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01'
    const e = isCurrentMonth ? todayStr : format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const [eR, sR, bR, xR, scR, pR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true).order('name'),
      supabase.from('salary_config').select('*'),
      supabase.from('bonus_definitions').select('*'),
      supabase.from('expenses').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }),
      supabase.from('schedules').select('*').gte('date', s).lte('date', e),
      supabase.from('punch_records').select('*').gte('date', s).lte('date', e),
    ])
    setEmps((eR.data || []).filter(x => !x.is_admin))
    setSalConfigs(sR.data || []); setBonuses(bR.data || [])
    setExpenses(xR.data || []); setSchedules(scR.data || []); setPunches(pR.data || [])
    // 載入薪資手動調整
    try {
      const { data: adjData } = await supabase.from('payroll_adjustments').select('*').eq('month', month)
      const adjMap = {}
      ;(adjData || []).forEach(a => { adjMap[a.employee_id] = { id: a.id, base: a.base_override, bonus: a.bonus_override, deduction: a.deduction_override, final_pay: a.final_pay_override, amount: a.amount, reason: a.reason } })
      setAdjustments(adjMap)
    } catch { setAdjustments({}) }
    setLoading(false)
  }

  function getCfg(eid) { return salConfigs.find(s => s.employee_id === eid) || {} }
  function getCalc(emp) {
    const cfg = getCfg(emp.id)
    const att = getAttendanceData(emp.id, schedules, punches)
    const targetDate = isCurrentMonth ? today : new Date(yr, mo - 1, daysInMonth)
    return calcSalaryToDate(emp, cfg, bonuses, att, isCurrentMonth, targetDate)
  }

  async function saveSalConfig(eid) {
    if (!editingSal) return
    const existing = salConfigs.find(s => s.employee_id === eid)
    if (existing) await supabase.from('salary_config').update({ monthly_salary: +editingSal.monthly_salary, salary_type: editingSal.salary_type }).eq('id', existing.id)
    else await supabase.from('salary_config').insert({ employee_id: eid, monthly_salary: +editingSal.monthly_salary, salary_type: editingSal.salary_type })
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
    const existing = adjustments[eid]
    if (existing?.id) {
      await supabase.from('payroll_adjustments').update(row).eq('id', existing.id)
    } else {
      await supabase.from('payroll_adjustments').insert({ employee_id: eid, month, ...row })
    }
    logAudit('PayrollAdjust', `${eid} 覆寫 底薪:${row.base_override||'-'} 獎金:${row.bonus_override||'-'} 扣款:${row.deduction_override||'-'} 實發:${row.final_pay_override||'-'} ${row.reason}`, 'ADMIN')
    setEditingAdj(null); setAdjForm({ base: '', bonus: '', deduction: '', final_pay: '', reason: '' }); load()
  }

  async function deleteAdjustment(eid) {
    const existing = adjustments[eid]
    if (!existing?.id) return
    if (!confirm('確定移除此調整？')) return
    await supabase.from('payroll_adjustments').delete().eq('id', existing.id)
    setEditingAdj(null); load()
  }

  async function addBonus() {
    if (!newBonus.employee_id || !newBonus.bonus_name || !newBonus.amount) return alert('請填完')
    const name = emps.find(e => e.id === newBonus.employee_id)?.name || ''
    await supabase.from('bonus_definitions').insert({ bonus_id: `B_${newBonus.employee_id}_${Date.now()}`, employee_id: newBonus.employee_id, name, bonus_name: newBonus.bonus_name, amount: +newBonus.amount, calc_method: '固定月額', enabled: true })
    setNewBonus({ employee_id: '', bonus_name: '', amount: '' }); setShowBonusForm(false); load()
  }
  async function toggleBonus(id, en) { await supabase.from('bonus_definitions').update({ enabled: en }).eq('id', id); load() }
  async function deleteBonus(id) { if (!confirm('刪除？')) return; await supabase.from('bonus_definitions').delete().eq('id', id); load() }
  async function addExpense() {
    if (!newExp.category || !newExp.amount) return
    await supabase.from('expenses').insert({ date: newExp.date, category: newExp.category, item: newExp.item, amount: +newExp.amount, payment: newExp.payment, handler: 'ADMIN' })
    setNewExp({ category: '', item: '', amount: '', payment: '現金', date: format(new Date(), 'yyyy-MM-dd') }); setShowExpForm(false); load()
  }
  async function deleteExpense(id) { if (!confirm('刪除？')) return; await supabase.from('expenses').delete().eq('id', id); load() }

  /* === 出勤修正操作 === */
  async function overridePunch(punchId, updates) {
    setOverrideSaving(punchId)
    await supabase.from('punch_records').update({
      manual_override: true,
      ...updates,
      override_by: 'ADMIN',
      override_at: new Date().toISOString(),
    }).eq('id', punchId)
    await logAudit('AttendanceOverride', `修正打卡 #${punchId}: ${JSON.stringify(updates)}`, 'ADMIN')
    setOverrideSaving(null)
    load()
  }

  async function cancelOverride(punchId) {
    setOverrideSaving(punchId)
    await supabase.from('punch_records').update({
      manual_override: false,
      corrected_clock_in: null, corrected_clock_out: null,
      corrected_is_late: null, corrected_is_early: null,
      corrected_late_deduction: 0, corrected_early_deduction: 0,
      override_reason: null, override_by: null, override_at: null,
    }).eq('id', punchId)
    setOverrideSaving(null)
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
    w.document.close(); setTimeout(() => w.print(), 300)
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
        if (s.shift === '晚班' && h < 12) pm += 1440
        const endMin = shift.endH * 60 + shift.endM
        if (pm < endMin) { autoEarly = true; earlyMins = endMin - pm }
      }

      return {
        date: s.date, shift: s.shift,
        clockInTime: clockIn?.time ? new Date(clockIn.time).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }) : null,
        clockOutTime: clockOut?.time ? new Date(clockOut.time).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }) : null,
        clockInId: clockIn?.id, clockOutId: clockOut?.id,
        clockInPunch: clockIn, clockOutPunch: clockOut,
        autoLate, autoEarly, lateMins, earlyMins,
        inOverridden: clockIn?.manual_override || false,
        outOverridden: clockOut?.manual_override || false,
        inCorrectedLate: clockIn?.corrected_is_late,
        outCorrectedEarly: clockOut?.corrected_is_early,
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
            <R label={`出勤${payslip.p.actualWorkedDays}天 底薪`} value={payslip.p.proratedBase}/>
            {payslip.p.attendanceBonus.amount>0&&<R label={`全勤獎金（${payslip.p.attendanceBonus.status==='lost'?'已失效':'暫符合'}）`} value={payslip.p.attendanceBonus.effective} positive={payslip.p.attendanceBonus.status!=='lost'}/>}
            {payslip.p.otherBonuses.map(b=><R key={b.id} label={`+ ${b.bonus_name}`} value={b.amount} positive/>)}
            {payslip.p.otPay>0&&<R label="+ 加班費" value={payslip.p.otPay} positive/>}
            <R label="- 勞保" value={-payslip.p.li} negative/><R label="- 健保" value={-payslip.p.hi} negative/>
            {payslip.p.sickDeduct>0&&<R label="- 病假" value={-payslip.p.sickDeduct} negative/>}
            <div style={{height:2,background:'var(--gold)',margin:'10px 0'}}/>
            <R label="截至今日可領" value={payslip.p.currentPayable} highlight/>
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
              {p.otDetails.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:11,color:'var(--green)',fontWeight:600,marginBottom:4}}>⏰ 加班（時薪${p.hourlyBase}）</div>{p.otDetails.map((d,i)=><div key={i} style={{fontSize:11,color:'var(--text-dim)',display:'flex',justifyContent:'space-between',padding:'2px 0'}}><span>{d.date} {d.hours}hr</span><span style={{color:'var(--green)'}}>+${d.pay.toLocaleString()}</span></div>)}</div>}
              <CigarRewardPayrollStatus employeeId={emp.id} month={month} />
              <SH>薪資明細</SH>
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
              <button className="btn-outline" style={{width:'100%',marginTop:10,display:'flex',alignItems:'center',justifyContent:'center',gap:6,fontSize:13}} onClick={()=>setPayslip({emp,p})}><FileText size={14}/> 生成薪資條</button>
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
          const isWorkDay = day.shift === '早班' || day.shift === '晚班'
          const hasIssue = day.autoLate || day.autoEarly
          const isFixed = day.inOverridden || day.outOverridden
          const lateFixed = day.inOverridden && day.inCorrectedLate === false
          const earlyFixed = day.outOverridden && day.outCorrectedEarly === false

          return <div key={day.date} className="card" style={{padding:12,marginBottom:6,borderColor:isFixed?'rgba(77,138,196,.3)':hasIssue?'rgba(196,77,77,.3)':'var(--border)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:isWorkDay&&(hasIssue||isFixed)?8:0}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                  {day.date.slice(5)}
                  <span style={{fontSize:10,padding:'2px 6px',borderRadius:6,background: !isWorkDay?'rgba(138,130,120,.1)':hasIssue&&!isFixed?'rgba(196,77,77,.1)':isFixed?'rgba(77,138,196,.1)':'rgba(77,168,108,.1)', color: !isWorkDay?'var(--text-muted)':hasIssue&&!isFixed?'var(--red)':isFixed?'var(--blue)':'var(--green)'}}>{!isWorkDay?day.shift:isFixed?'⚙️已修正':hasIssue?'異常':'正常'}</span>
                </div>
                {isWorkDay&&<div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                  {day.shift} · 上班 {day.clockInTime||'未打'} · 下班 {day.clockOutTime||'未打'}
                </div>}
              </div>
              {isWorkDay && !hasIssue && !isFixed && <CheckCircle2 size={16} color="var(--green)"/>}
              {isWorkDay && hasIssue && !isFixed && <AlertTriangle size={16} color="var(--red)"/>}
              {isFixed && <span style={{fontSize:10,color:'var(--blue)',fontWeight:700}}>⚙️</span>}
            </div>

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
        {emps.map(emp=>{const eb=bonuses.filter(b=>b.employee_id===emp.id);if(!eb.length)return null;return <div key={emp.id} style={{marginBottom:12}}><div style={{fontSize:13,fontWeight:700,color:'var(--gold)',marginBottom:4}}>{emp.name}</div>{eb.map(b=><div key={b.id} className="card" style={{padding:12,marginBottom:4,display:'flex',justifyContent:'space-between',alignItems:'center',opacity:b.enabled?1:.5}}><span style={{fontSize:13}}>{b.bonus_name} <strong style={{color:'var(--green)'}}>+${(b.amount||0).toLocaleString()}</strong></span><div style={{display:'flex',gap:4}}><button style={{...ib,color:b.enabled?'var(--red)':'var(--green)'}} onClick={()=>toggleBonus(b.id,!b.enabled)}>{b.enabled?'停':'啟'}</button><button style={{...ib,color:'var(--red)'}} onClick={()=>deleteBonus(b.id)}><Trash2 size={12}/></button></div></div>)}</div>})}
      </div>)}

      {/* ===== 支出管理 ===== */}
      {tab==='expenses'&&(<div>
        <div className="card" style={{padding:14,marginBottom:16}}><div style={{fontSize:11,color:'var(--text-dim)'}}>本月支出</div><div style={{fontSize:22,fontFamily:'var(--font-mono)',color:'var(--red)',fontWeight:600}}>${totalExp.toLocaleString()}</div></div>
        <button className="btn-outline" style={{marginBottom:16,display:'flex',alignItems:'center',gap:6}} onClick={()=>setShowExpForm(!showExpForm)}><Plus size={14}/> 新增</button>
        {showExpForm&&<div className="card" style={{marginBottom:16,padding:16}}><div style={{display:'flex',gap:8,marginBottom:8}}><input type="date" value={newExp.date} onChange={e=>setNewExp(p=>({...p,date:e.target.value}))} style={{flex:1,fontSize:13,padding:8}}/><select value={newExp.category} onChange={e=>setNewExp(p=>({...p,category:e.target.value}))} style={{flex:1,fontSize:13,padding:8}}><option value="">分類</option>{['食材','酒水','雪茄進貨','設備','房租','水電','人事','行銷','雜支'].map(c=><option key={c}>{c}</option>)}</select></div><input value={newExp.item} onChange={e=>setNewExp(p=>({...p,item:e.target.value}))} placeholder="項目" style={{marginBottom:8}}/><div style={{display:'flex',gap:8,marginBottom:8}}><input type="number" inputMode="numeric" value={newExp.amount} onChange={e=>setNewExp(p=>({...p,amount:e.target.value}))} placeholder="金額" style={{flex:1}} pattern="[0-9]*"/><select value={newExp.payment} onChange={e=>setNewExp(p=>({...p,payment:e.target.value}))} style={{width:100,fontSize:13,padding:8}}>{['現金','刷卡','轉帳','LINE Pay'].map(p=><option key={p}>{p}</option>)}</select></div><button className="btn-gold" onClick={addExpense}>儲存</button></div>}
        {expenses.map(e=><div key={e.id} className="card" style={{padding:12,marginBottom:6,display:'flex',justifyContent:'space-between'}}><div><div style={{fontSize:13,fontWeight:500}}>{e.item||e.category}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{e.date} · {e.category} · {e.payment}</div></div><div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:15,fontFamily:'var(--font-mono)',color:'var(--red)',fontWeight:600}}>-${(e.amount||0).toLocaleString()}</span><button style={{...ib,color:'var(--red)'}} onClick={()=>deleteExpense(e.id)}><Trash2 size={12}/></button></div></div>)}
      </div>)}
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
