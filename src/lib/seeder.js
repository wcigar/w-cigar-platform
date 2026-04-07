import { supabase } from './supabase'
import { format } from 'date-fns'

export async function seedTodayTasks() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const key = 'seeded_' + today
  if (sessionStorage.getItem(key)) return

  const { data: existing } = await supabase.from('task_status').select('task_id').eq('date', today).limit(1)
  if (!existing || existing.length === 0) {
    const { data: defs } = await supabase.from('sop_definitions').select('*')
    if (defs && defs.length) {
      const now = new Date(), dow = now.getDay(), dom = now.getDate()
      const wm = {'每週一':1,'每週二':2,'每週三':3,'每週四':4,'每週五':5,'每週六':6,'每週日':0}
      const rows = defs.filter(d => {
        const f = (d.frequency || '每日').trim()
        if (!f || f === '每日') return true
        if (wm[f] !== undefined) return dow === wm[f]
        const mm = f.match(/每月(\d+)/); if (mm) return dom === Number(mm[1])
        return true
      }).map(d => ({ date: today, task_id: d.task_id, category: d.category || '', title: d.title || '', owner: d.owner || 'ALL', completed: false }))
      if (rows.length) await supabase.from('task_status').insert(rows)
    }
  }

  const { data: cleanExist } = await supabase.from('cleaning_status').select('clean_id').eq('date', today).limit(1)
  if (!cleanExist || cleanExist.length === 0) {
    const { data: cleanDefs } = await supabase.from('cleaning_definitions').select('*')
    if (cleanDefs && cleanDefs.length) {
      const rows = cleanDefs.map(d => ({ date: today, clean_id: d.clean_id, title: d.title || '', owner: d.owner || '', area: d.area || '', completed: false }))
      await supabase.from('cleaning_status').insert(rows)
    }
  }

  // Log seed event
  try {
    await supabase.from('audit_logs').insert({ event: 'DailySeed', description: '每日任務自動播種 ' + today, operator: 'SYSTEM' })
  } catch (e) {}

  sessionStorage.setItem(key, '1')
}
