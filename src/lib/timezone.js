// Convert UTC timestamp string to Taipei time string
// Usage: toTaipei('2026-04-12T03:30:00Z') → '11:30'
//        toTaipei('2026-04-12T03:30:00Z', true) → '11:30:00'
export function toTaipei(utcStr, showSeconds = false) {
  if (!utcStr) return ''
  return new Date(utcStr).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  })
}

// Extract Taipei hour and minute as numbers (for overtime/payroll computation)
// Usage: const [h, m] = taipeiHM('2026-04-12T03:30:00Z') → [11, 30]
export function taipeiHM(utcStr) {
  if (!utcStr) return [0, 0]
  const d = new Date(utcStr)
  const taipei = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
  return [taipei.getHours(), taipei.getMinutes()]
}
