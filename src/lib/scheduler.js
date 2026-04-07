import { supabase } from './supabase'
import { SCHED_RULES } from './constants'
import { isHoliday, getHolidayName } from './holidays'
import { format, getDaysInMonth } from 'date-fns'

export async function generateSchedule(yearMonth) {
  const [yr, mo] = yearMonth.split('-').map(Number)
  const dim = getDaysInMonth(new Date(yr, mo - 1))
  const { data: emps } = await supabase.from('employees').select('id, name, emp_type').eq('enabled', true)
  const team = (emps || []).filter(e => e.id !== 'ADMIN' && e.emp_type === '正職')
  if (!team.length) return { ok: false, message: '無正職員工' }

  // 修復 #3: 先刪除再插入，不依賴 upsert
  await supabase.from('schedules').delete().gte('date', `${yearMonth}-01`).lte('date', `${yearMonth}-${dim}`)

  const shifts = ['早班', '晚班']
  const rows = [], warnings = []
  const restUsed = {}
  team.forEach(e => { restUsed[e.id] = 0 })

  let restQuota = 0
  for (let d = 1; d <= dim; d++) {
    const dow = new Date(yr, mo - 1, d).getDay()
    const ds = `${yearMonth}-${String(d).padStart(2, '0')}`
    if (dow === 0 || dow === 6) restQuota++
    else if (isHoliday(ds)) restQuota++
  }

  // 第一輪：國假（只留1人上班）
  for (let d = 1; d <= dim; d++) {
    const ds = `${yearMonth}-${String(d).padStart(2, '0')}`
    if (!isHoliday(ds)) continue
    const holWorkerIdx = d % team.length
    team.forEach((emp, idx) => {
      if (idx === holWorkerIdx) {
        rows.push({ date: ds, employee_id: emp.id, shift: shifts[(idx + Math.floor((d - 1) / 7)) % 2], note: getHolidayName(ds) + ' 🔴雙倍' })
      } else {
        rows.push({ date: ds, employee_id: emp.id, shift: '休假', note: getHolidayName(ds) + ' 國假休' })
        restUsed[emp.id]++
      }
    })
  }

  // 第二輪：一般日
  for (let d = 1; d <= dim; d++) {
    const ds = `${yearMonth}-${String(d).padStart(2, '0')}`
    if (isHoliday(ds)) continue
    const dow = new Date(yr, mo - 1, d).getDay()
    const wk = Math.floor((d - 1) / 7)
    team.forEach((emp, idx) => {
      let shift = ''
      if (SCHED_RULES.tuesdayAllWork && dow === 2) shift = shifts[(idx + wk) % 2]
      else if (emp.id === 'RICKY' && SCHED_RULES.rickyFixedOff.includes(dow) && restUsed[emp.id] < restQuota) { shift = '休假'; restUsed[emp.id]++ }
      else if (dow === 0 && restUsed[emp.id] < restQuota) {
        const sunW = rows.filter(r => r.date === ds && (r.shift === '早班' || r.shift === '晚班')).length
        if (sunW >= 1) { shift = '休假'; restUsed[emp.id]++ } else shift = shifts[(idx + wk) % 2]
      } else if (dow === 6 && emp.id !== 'RICKY' && restUsed[emp.id] < restQuota) {
        const satW = rows.filter(r => r.date === ds && (r.shift === '早班' || r.shift === '晚班')).length
        if (satW >= 1) { shift = '休假'; restUsed[emp.id]++ } else shift = shifts[(idx + wk) % 2]
      } else shift = shifts[(idx + wk) % 2]
      rows.push({ date: ds, employee_id: emp.id, shift, note: dow === 5 ? '老闆宴客日' : '' })
    })
  }

  // 第三輪：連休
  function setConsecRest(empId, days) {
    for (let start = 8; start <= dim - days; start++) {
      let ok = true
      for (let i = 0; i < days; i++) {
        const cd = start + i, cds = `${yearMonth}-${String(cd).padStart(2, '0')}`, cdow = new Date(yr, mo - 1, cd).getDay()
        if (cdow === 2 || isHoliday(cds)) { ok = false; break }
        if (cdow === 5) { const fw = rows.filter(r => r.date === cds && r.employee_id !== empId && (r.shift === '早班' || r.shift === '晚班')).length; if (fw < 2) { ok = false; break } }
        const ex = rows.find(r => r.date === cds && r.employee_id === empId); if (ex?.shift === '休假') { ok = false; break }
      }
      if (ok) { for (let i = 0; i < days; i++) { const sds = `${yearMonth}-${String(start + i).padStart(2, '0')}`; const row = rows.find(r => r.date === sds && r.employee_id === empId); if (row && row.shift !== '休假') { row.shift = '休假'; row.note = '連休'; restUsed[empId]++ } }; break }
    }
  }
  if (SCHED_RULES.danielConsecRest > 0) setConsecRest('DANIEL', SCHED_RULES.danielConsecRest)
  if (SCHED_RULES.jessicaConsecRest > 0) setConsecRest('JESSICA', SCHED_RULES.jessicaConsecRest)

  // 第四輪：超額補回
  team.forEach(emp => {
    while (restUsed[emp.id] > restQuota) {
      for (let d = dim; d >= 1; d--) {
        const ds = `${yearMonth}-${String(d).padStart(2, '0')}`; if (isHoliday(ds) || new Date(yr, mo - 1, d).getDay() === 2) continue
        const row = rows.find(r => r.date === ds && r.employee_id === emp.id)
        if (row?.shift === '休假' && row.note !== '國假休') { row.shift = '早班'; row.note = '補班'; restUsed[emp.id]--; break }
      }
      break
    }
  })

  // 警告
  for (let d = 1; d <= dim; d++) {
    const ds = `${yearMonth}-${String(d).padStart(2, '0')}`, dow = new Date(yr, mo - 1, d).getDay()
    const working = rows.filter(r => r.date === ds && (r.shift === '早班' || r.shift === '晚班')).length
    if (dow === 5 && working < 2) warnings.push(`${ds.slice(5)} (五) 僅${working}人`)
    if (working === 0) warnings.push(`${ds.slice(5)} 無人上班！`)
  }

  let holWorkDays = 0, holRestDays = 0
  rows.forEach(r => { if (isHoliday(r.date)) { if (r.shift === '早班' || r.shift === '晚班') holWorkDays++; else holRestDays++ } })

  // 插入
  if (rows.length) {
    const { error } = await supabase.from('schedules').insert(rows)
    if (error) return { ok: false, message: '寫入失敗: ' + error.message }
  }

  const restSummary = team.map(e => `${e.name}:休${restUsed[e.id]}/${restQuota}天`).join(' · ')
  return { ok: true, message: `✅ ${yearMonth} 排班完成\n\n📊 可休: ${restQuota}天/人\n${restSummary}\n\n🔴 國假: ${holWorkDays}人次上班(2倍)，${holRestDays}人次排休${warnings.length ? '\n\n⚠ ' + warnings.join('\n⚠ ') : ''}`, restQuota, warnings }
}
