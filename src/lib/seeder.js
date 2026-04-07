import { supabase } from './supabase'
import { format } from 'date-fns'

export async function seedTodayTasks() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const key = 'seeded_' + today
  if (sessionStorage.getItem(key)) return

  const { data: existing } = await supabase.from('task_status').select('task_id').eq('date', today).limit(1)
  if (existing && existing.length > 0) { sessionStorage.setItem(key, '1'); return }

  const { data: defs } = await supabase.from('sop_definitions').select('*')
  if (!defs || !defs.length) return

  // frequency filter
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun
  const dayOfMonth = now.getDate()
  const weekMap = {'每週一':1,'每週二':2,'每週三':3,'每週四':4,'每週五':5,'每週六':6,'每週日':0}

  const rows = defs.filter(d => {
    const f = (d.frequency || '每日').trim()
    if (!f || f === '每日') return true
    if (weekMap[f] !== undefined) return dayOfWeek === weekMap[f]
    const mm = f.match(/每月(\d+)/)
    if (mm) return dayOfMonth === Number(mm[1])
    return true
  }).map(d => ({
    date: today, task_id: d.task_id, category: d.category || '', title: d.title || '',
    owner: d.owner || 'ALL', completed: false
  }))

  if (rows.length) {
    await supabase.from('task_status').insert(rows)
  }
  sessionStorage.setItem(key, '1')
}
