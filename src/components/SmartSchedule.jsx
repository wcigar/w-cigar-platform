import { useState } from 'react'
import { generateSchedule } from '../lib/scheduler'
import { Zap } from 'lucide-react'
import { format } from 'date-fns'

export default function SmartScheduleBtn({ month, onDone }) {
  const [loading, setLoading] = useState(false)
  const ym = format(month, 'yyyy-MM')

  async function run() {
    if (!confirm(`智能排班 ${ym}\n\n🏷 排班規則：\n• 週二全員上班\n• Ricky 固定休三+六\n• Daniel 月連休3天 / Jessica 連休2天\n• 週五至少2人（老闆宴客日）\n\n💰 國假省錢策略：\n• 國定假日只排1人上班\n• 其他人排休（省雙倍工資）\n• 輪流制，公平分配\n\n⚠ 將覆蓋現有排班`)) return
    setLoading(true)
    const res = await generateSchedule(ym)
    setLoading(false)
    alert(res.message || '完成')
    if (res.ok && onDone) onDone()
  }

  return (
    <button className="btn-gold" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: 14, fontWeight: 600, opacity: loading ? .6 : 1 }} onClick={run} disabled={loading}>
      <Zap size={16} /> {loading ? '排班中...' : '⚡ 智能排班'}
    </button>
  )
}
