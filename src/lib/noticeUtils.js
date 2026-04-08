import { supabase } from './supabase'

export async function markNoticesRead(notices, employeeId, employeeName) {
  if (!notices?.length || !employeeId) return
  for (const n of notices) {
    await supabase.from('notice_reads').upsert(
      { notice_id: n.id, employee_id: employeeId, employee_name: employeeName },
      { onConflict: 'notice_id,employee_id' }
    )
  }
}

export async function getReadStatus(noticeIds) {
  if (!noticeIds?.length) return {}
  const { data } = await supabase.from('notice_reads').select('*').in('notice_id', noticeIds)
  const map = {}
  ;(data || []).forEach(r => {
    if (!map[r.notice_id]) map[r.notice_id] = []
    map[r.notice_id].push({ employee_id: r.employee_id, name: r.employee_name, read_at: r.read_at })
  })
  return map
}
