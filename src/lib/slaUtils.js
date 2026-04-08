export function getSlaStatus(report) {
  if (report.status === '已解決') return { status: 'resolved', remaining: '已解決', color: 'var(--green)' }
  if (!report.sla_deadline) return { status: 'ok', remaining: '無SLA', color: 'var(--text-muted)' }
  const now = new Date()
  const deadline = new Date(report.sla_deadline)
  const diffMs = deadline - now
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const remainMin = diffMin % 60
  if (diffMs < 0) {
    const overHr = Math.floor(-diffMin / 60)
    const overMin = (-diffMin) % 60
    return { status: 'overdue', remaining: '逾期 ' + overHr + 'h' + overMin + 'm', color: 'var(--red)' }
  }
  if (diffHr < 4) return { status: 'warning', remaining: '剩 ' + diffHr + 'h' + remainMin + 'm', color: '#f59e0b' }
  return { status: 'ok', remaining: '剩 ' + diffHr + 'h' + remainMin + 'm', color: 'var(--green)' }
}
