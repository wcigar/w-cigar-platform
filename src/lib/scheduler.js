import { supabase } from './supabase'
import { SCHED_RULES } from './constants'
import { isHoliday, getHolidayName } from './holidays'
import { format, getDaysInMonth } from 'date-fns'

export async function generateSchedule(yearMonth) {
  const [yr, mo] = yearMonth.split('-').map(Number)
  const dim = getDaysInMonth(new Date(yr, mo - 1))

  const { data: emps } = await supabase.from('employees').select('id, name, emp_type').eq('enabled', true)
  const team = (emps || []).filter(e => e.id !== 'ADMIN' && e.emp_type === '正職')
  const pts = (emps || []).filter(e => e.id !== 'ADMIN' && e.emp_type === 'PT')
  if (!team.length) return { ok: false, message: '無正職員工' }

  // Delete existing
  await supabase.from('schedules').delete().gte('date', `${yearMonth}-01`).lte('date', `${yearMonth}-${dim}`)

  const shifts = ['早班', '晚班']
  const rows = [], warnings = []
  const restUsed = {}
  team.forEach(e => { restUsed[e.id] = 0 })

  // Rest quota = weekends + national holidays on weekdays
  let restQuota = 0
  for (let d = 1; d <= dim; d++) {
    const dow = new Date(yr, mo - 1, d).getDay()
    const ds = `${yearMonth}-${String(d).padStart(2, '0')}`
    if (dow === 0 || dow === 6) restQuota++
    else if (isHoliday(ds)) restQuota++
  }

  // 第一輪：先排國定假日（優先排休，只留1人上班）
  for (let d = 1; d <= dim; d++) {
    const ds = `${yearMonth}-${String(d).padStart(2, '0')}`
    if (!isHoliday(ds)) continue

    // 輪流安排誰國假上班（每次不同人）
    const holWorkerIdx = d % team.length
    team.forEach((emp, idx) => {
      if (idx === holWorkerIdx) {
        // 這個人國假上班（拿雙倍薪）
        const weekNum = Math.floor((d - 1) / 7)
        rows.push({ date: ds, employee_id: emp.id, shift: shifts[(idx + weekNum) % 2], note: getHolidayName(ds) + ' 🔴雙倍' })
      } else {
        // 其他人排休（省雙倍成本）
        rows.push({ date: ds, employee_id: emp.id, shift: '休假', note: getHolidayName(ds) + ' 國假休' })
        restUsed[emp.id]++
      }
    })
  }

  // 第二輪：排一般日
  for (let d = 1; d <= dim; d++) {
    const ds = `${yearMonth}-${String(d).padStart(2, '0')}`
    if (isHoliday(ds)) continue // 已排

    const dow = new Date(yr, mo - 1, d).getDay()
    const weekNum = Math.floor((d - 1) / 7)

    team.forEach((emp, idx) => {
      let shift = ''

      // 週二全員上班
      if (SCHED_RULES.tuesdayAllWork && dow === 2) {
        shift = shifts[(idx + weekNum) % 2]
      }
      // Ricky 固定休三+六
      else if (emp.id === 'RICKY' && SCHED_RULES.rickyFixedOff.includes(dow)) {
        if (restUsed[emp.id] < restQuota) {
          shift = '休假'; restUsed[emp.id]++
        } else {
          shift = shifts[(idx + weekNum) % 2]
        }
      }
      // 週日優先休（降低假日人力成本）
      else if (dow === 0 && restUsed[emp.id] < restQuota) {
        // 留至少1人上班
        const sundayWorkers = rows.filter(r => r.date === ds && (r.shift === '早班' || r.shift === '晚班')).length
        if (sundayWorkers >= 1) {
          shift = '休假'; restUsed[emp.id]++
        } else {
          shift = shifts[(idx + weekNum) % 2]
        }
      }
      // 週六也優先休
      else if (dow === 6 && emp.id !== 'RICKY' && restUsed[emp.id] < restQuota) {
        const satWorkers = rows.filter(r => r.date === ds && (r.shift === '早班' || r.shift === '晚班')).length
        if (satWorkers >= 1) {
          shift = '休假'; restUsed[emp.id]++
        } else {
          shift = shifts[(idx + weekNum) % 2]
        }
      }
      // 一般上班
      else {
        shift = shifts[(idx + weekNum) % 2]
      }

      rows.push({ date: ds, employee_id: emp.id, shift, note: dow === 5 ? '老闆宴客日' : '' })
    })
  }

  // 第三輪：Daniel 連休3天 / Jessica 連休2天（避開週二和國假）
  function setConsecRest(empId, days) {
    for (let start = 8; start <= dim - days; start++) {
      let ok = true
      for (let i = 0; i < days; i++) {
        const checkDay = start + i
        const checkDs = `${yearMonth}-${String(checkDay).padStart(2, '0')}`
        const checkDow = new Date(yr, mo - 1, checkDay).getDay()
        if (checkDow === 2) { ok = false; break }
        if (isHoliday(checkDs)) { ok = false; break }
        if (checkDow === 5) {
          const friWorkers = rows.filter(r => r.date === checkDs && r.employee_id !== empId && (r.shift === '早班' || r.shift === '晚班')).length
          if (friWorkers < SCHED_RULES.fridayMinStaff) { ok = false; break }
        }
        const existing = rows.find(r => r.date === checkDs && r.employee_id === empId)
        if (existing?.shift === '休假') { ok = false; break } // 已經是休假不需要再設
      }
      if (ok) {
        for (let i = 0; i < days; i++) {
          const setDs = `${yearMonth}-${String(start + i).padStart(2, '0')}`
          const row = rows.find(r => r.date === setDs && r.employee_id === empId)
          if (row && row.shift !== '休假') { row.shift = '休假'; row.note = '連休'; restUsed[empId]++ }
        }
        break
      }
    }
  }
  if (SCHED_RULES.danielConsecRest > 0) setConsecRest('DANIEL', SCHED_RULES.danielConsecRest)
  if (SCHED_RULES.jessicaConsecRest > 0) setConsecRest('JESSICA', SCHED_RULES.jessicaConsecRest)

  // 第四輪：超出可休天數的補回上班
  team.forEach(emp => {
    if (restUsed[emp.id] > restQuota) {
      const diff = restUsed[emp.id] - restQuota
      let fixed = 0
      for (let d = dim; d >= 1 && fixed < diff; d--) {
        const ds = `${yearMonth}-${String(d).padStart(2, '0')}`
        const dow = new Date(yr, mo - 1, d).getDay()
        if (dow === 2) continue
        if (isHoliday(ds)) continue
        const row = rows.find(r => r.date === ds && r.employee_id === emp.id)
        if (row?.shift === '休假' && row.note !== '國假休') {
          row.shift = '早班'; row.note = '補班'; restUsed[emp.id]--; fixed++
        }
      }
    }
  })

  // Validate & warnings
  for (let d = 1; d <= dim; d++) {
    const ds = `${yearMonth}-${String(d).padStart(2, '0')}`
    const dow = new Date(yr, mo - 1, d).getDay()
    const working = rows.filter(r => r.date === ds && (r.shift === '早班' || r.shift === '晚班')).length
    if (dow === 5 && working < SCHED_RULES.fridayMinStaff) warnings.push(`${ds.slice(5)} (五) 僅${working}人`)
    if (working === 0) warnings.push(`${ds.slice(5)} 無人上班！`)
  }

  // Holiday cost summary
  let holWorkDays = 0, holRestDays = 0
  rows.forEach(r => {
    if (isHoliday(r.date)) {
      if (r.shift === '早班' || r.shift === '晚班') holWorkDays++
      else holRestDays++
    }
  })

  // Insert
  if (rows.length) {
    const { error } = await supabase.from('schedules').upsert(rows, { onConflict: 'date,employee_id' })
    if (error) return { ok: false, message: '寫入失敗: ' + error.message }
  }

  const restSummary = team.map(e => `${e.name}:休${restUsed[e.id]}/${restQuota}天`).join(' · ')

  return {
    ok: true,
    message: `✅ ${yearMonth} 排班完成（${dim}天）\n\n📊 可休天數: ${restQuota}天/人\n${restSummary}\n\n🔴 國假策略: 只排${holWorkDays}人次上班(雙倍薪)，${holRestDays}人次排休(省成本)\n${warnings.length ? '\n⚠ ' + warnings.join('\n⚠ ') : ''}`,
    restQuota, warnings, holWorkDays, holRestDays
  }
}
