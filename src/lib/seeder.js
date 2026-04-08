import { supabase } from './supabase'
import { format } from 'date-fns'
import { markNoticesRead } from './noticeUtils'

export async function seedTodayTasks() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const key = 'seeded_' + today
  if (sessionStorage.getItem(key)) return

  // SOP: incremental seed - add missing tasks
  const { data: defs } = await supabase.from('sop_definitions').select('*')
  if (defs && defs.length) {
    const now = new Date(), dow = now.getDay(), dom = now.getDate()
    const wm = {'每週一':1,'每週二':2,'每週三':3,'每週四':4,'每週五':5,'每週六':6,'每週日':0}
    const todayDefs = defs.filter(d => {
      const f = (d.frequency || '每日').trim()
      if (!f || f === '每日') return true
      if (wm[f] !== undefined) return dow === wm[f]
      const mm = f.match(/每月(\d+)/); if (mm) return dom === Number(mm[1])
      return true
    })

    const { data: existing } = await supabase.from('task_status').select('task_id').eq('date', today)
    const existingIds = new Set((existing || []).map(e => e.task_id))

    const newRows = todayDefs
      .filter(d => !existingIds.has(d.task_id))
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
