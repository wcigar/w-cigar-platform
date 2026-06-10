import { supabase } from './supabase'
import { format, startOfWeek } from 'date-fns'
import { markNoticesRead } from './noticeUtils'

export async function seedTodayTasks() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const key = 'seeded_' + today
  if (sessionStorage.getItem(key)) return

  // SOP: incremental seed - add missing tasks
  const { data: defs } = await supabase.from('sop_definitions').select('*')
  if (defs && defs.length) {
    const now = new Date(), dow = now.getDay(), dom = now.getDate()
    const isoDow = dow === 0 ? 7 : dow // 週一=1 ... 週日=7
    const wm = {'每週一':1,'每週二':2,'每週三':3,'每週四':4,'每週五':5,'每週六':6,'每週日':0}
    // 本週(週一起算)已 seed 過的 task — 供「每週X 遇休假往後延」判斷：
    // 排定日休假漏了 → 下個上班日補 seed；且本週只 seed 一次（已 seed 就不再補）
    const weekStartStr = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const { data: weekSeeded } = await supabase.from('task_status').select('task_id, owner').gte('date', weekStartStr).lte('date', today)
    const weekSeededSet = new Set((weekSeeded || []).map(r => `${r.task_id}|${r.owner}`))
    const todayDefs = defs.filter(d => {
      const f = (d.frequency || '每日').trim()
      if (!f || f === '每日') return true
      if (wm[f] !== undefined) {
        const targetIso = wm[f] === 0 ? 7 : wm[f]
        if (isoDow === targetIso) return true // 今天正是排定日
        // 遇休假往後延：排定日已過(本週內)、且本週還沒 seed 過 → 今天補 seed
        // （配合下方 leaveSet：今天若該 owner 休假則仍不 seed，自動再延到下一個上班日）
        if (isoDow > targetIso && !weekSeededSet.has(`${d.task_id}|${d.owner}`)) return true
        return false
      }
      const mm = f.match(/每月(\d+)/); if (mm) return dom === Number(mm[1])
      return true
    })

    // Check who is on leave today - skip their personal tasks
    const { data: schedData } = await supabase.from('schedules').select('employee_id, shift').eq('date', today)
    const leaveSet = new Set((schedData || []).filter(s => s.shift === '休假' || s.shift === '臨時請假').map(s => s.employee_id))
    const { data: existing } = await supabase.from('task_status').select('task_id').eq('date', today)
    const existingIds = new Set((existing || []).map(e => e.task_id))

    const newRows = todayDefs
      .filter(d => !existingIds.has(d.task_id))
      .filter(d => d.owner === 'ALL' || !leaveSet.has(d.owner))
      .map(d => ({
        date: today, task_id: d.task_id, category: d.category || '', title: d.title || '',
        owner: d.owner || 'ALL', completed: false, due_time: d.due_time || null
      }))

    if (newRows.length) {
      await supabase.from('task_status').insert(newRows)
    }
  }

  // Cleaning: incremental seed
  const { data: cleanExist } = await supabase.from('cleaning_status').select('clean_id').eq('date', today)
  const cleanExistIds = new Set((cleanExist || []).map(e => e.clean_id))
  const { data: cleanDefs } = await supabase.from('cleaning_definitions').select('*')
  if (cleanDefs && cleanDefs.length) {
    const newClean = cleanDefs
      .filter(d => !cleanExistIds.has(d.clean_id))
      .map(d => ({ date: today, clean_id: d.clean_id, title: d.title || '', owner: d.owner || '', area: d.area || '', completed: false }))
    if (newClean.length) {
      await supabase.from('cleaning_status').insert(newClean)
    }
  }

  try {
    await supabase.from('audit_logs').insert({ event: 'DailySeed', description: '每日任務播種 ' + today, operator: 'SYSTEM' })
  } catch (e) {}

  sessionStorage.setItem(key, '1')
}
