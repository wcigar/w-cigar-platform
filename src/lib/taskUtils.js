import { format } from 'date-fns'

export function getTaskUrgency(task) {
  if (task.completed) return 'completed'
  if (!task.due_time) return 'normal'
  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  if (task.date && task.date !== today) return 'normal'
  const [h, m] = task.due_time.split(':').map(Number)
  const due = new Date()
  due.setHours(h, m, 0, 0)
  const diffMin = (due - now) / 60000
  if (diffMin < 0) return 'overdue'
  if (diffMin <= 30) return 'warning'
  return 'normal'
}

export const URGENCY_COLORS = {
  completed: 'var(--green)',
  normal: 'var(--text-muted)',
  warning: '#f59e0b',
  overdue: 'var(--red)',
}
