import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { toTaipei } from '../../lib/timezone'
import { SHIFTS } from '../../lib/constants'
import { format, startOfWeek, endOfWeek, addWeeks, eachDayOfInterval } from 'date-fns'
import { zhTW } from 'date-fns/locale'

const STAFF = ['RICKY', 'DANIEL', 'JESSICA']
const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

export default function WeeklyReport() {
  const [weekOffset, setWeekOffset] = useState(-1)
  const [schedules, setSchedules] = useState([])
  const [punches, setPunches] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const baseDate = addWeeks(new Date(), weekOffset)
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })
  const startStr = format(weekStart, 'yyyy-MM-dd')
  const endStr = format(weekEnd, 'yyyy-MM-dd')

  useEffect(() => { load() }, [weekOffset])

  async function load() {
    setLoading(true)
    const [sR, pR, tR] = await Promise.all([
      supabase.from('schedules').select('*').gte('date', startStr).lte('date', endStr),
      supabase.from('punch_records').select('*').gte('date', startStr).lte('date', endStr),
      supabase.from('task_status').select('*').gte('date', startStr).lte('date', endStr),
    ])
    setSchedules(sR.data || [])
    setPunches(pR.data || [])
    setTasks(tR.data || [])
    setLoading(false)
  }

  function getStaffDay(name, dateStr) {
    const sched = schedules.find(s => s.employee_id === name && s.date === dateStr)
    const dayPunches = punches.filter(p => p.employee_id === name && p.date === dateStr)
    const clockIn = dayPunches.find(p => p.punch_type === '上班')
    const clockOut = dayPunches.find(p => p.punch_type === '下班')
    const dayTasks = tasks.filter(t => (t.owner === name || t.owner === 'ALL') && t.date === dateStr)
    const doneCount = dayTasks.filter(t => t.completed).length

    const shift = sched?.shift || '—'
    const shiftInfo = SHIFTS[shift]
    let late = false, early = false, absent = false

    if (shiftInfo?.start && !clockIn) absent = true
    if (clockIn?.time && shiftInfo) {
      const inTime = toTaipei(clockIn.time)
      // Simple late detection: compare HH:MM
    }

    return {
      shift,
      clockIn: clockIn ? toTaipei(clockIn.time) : '—',
      clockOut: clockOut ? toTaipei(clockOut.time) : '—',
      late: clockIn?.is_late,
      absent: shiftInfo?.start && !clockIn && shift !== '休假' && shift !== '臨時請假',
      sopTotal: dayTasks.length,
      sopDone: doneCount,
      sopPct: dayTasks.length > 0 ? Math.round(doneCount / dayTasks.length * 100) : null,
    }
  }

  function getStaffSummary(name) {
    let totalDays = 0, lateDays = 0, absentDays = 0, sopTotal = 0, sopDone = 0
    days.forEach(d => {
      const ds = format(d, 'yyyy-MM-dd')
      const info = getStaffDay(name, ds)
      if (info.shift !== '休假' && info.shift !== '臨時請假' && info.shift !== '—') {
        totalDays++
        if (info.late) lateDays++
        if (info.absent) absentDays++
      }
      sopTotal += info.sopTotal
      sopDone += info.sopDone
    })
    return { totalDays, lateDays, absentDays, sopTotal, sopDone, sopPct: sopTotal > 0 ? Math.round(sopDone / sopTotal * 100) : 0 }
  }

  return (
    <div>
      <style>{`@media print { body * { visibility:hidden; } #weekly-report, #weekly-report * { visibility:visible; } #weekly-report { position:absolute; left:0; top:0; width:100%; color:#000; background:#fff; padding:12px; font-size:11px; } .no-print { display:none !important; } }`}</style>

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--black-card)', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>‹ 上週</button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>{format(weekStart, 'M/d', { locale: zhTW })} — {format(weekEnd, 'M/d', { locale: zhTW })}</span>
          <button onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--black-card)', color: weekOffset >= 0 ? 'var(--text-muted)' : 'var(--text)', cursor: weekOffset >= 0 ? 'default' : 'pointer', fontSize: 13 }}>下週 ›</button>
          <button onClick={() => setWeekOffset(-1)} style={{ fontSize: 11, color: weekOffset === -1 ? '#000' : 'var(--gold)', background: weekOffset === -1 ? 'var(--gold)' : 'none', border: '1px solid var(--border-gold)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: weekOffset === -1 ? 700 : 400 }}>上週（開會用）</button>
          <button onClick={() => setWeekOffset(0)} style={{ fontSize: 11, color: weekOffset === 0 ? '#000' : 'var(--gold)', background: weekOffset === 0 ? 'var(--gold)' : 'none', border: '1px solid var(--border-gold)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: weekOffset === 0 ? 700 : 400 }}>本週</button>
        </div>
        <button onClick={() => window.print()} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>🖨️ 列印</button>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>載入中…</div> : (
        <div id="weekly-report">
          <div style={{ textAlign: 'center', marginBottom: 12, fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>W CIGAR BAR 週會報表 — {format(weekStart, 'yyyy/M/d')} ~ {format(weekEnd, 'M/d')}</div>

          {STAFF.map(name => {
            const summary = getStaffSummary(name)
            return (
              <div key={name} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>出勤{summary.totalDays}天 · 遲到{summary.lateDays} · 缺勤{summary.absentDays} · SOP {summary.sopPct}%</span>
                </div>
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '60px 50px 50px 50px 50px 1fr', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--black-card)', padding: '6px 8px', gap: 4 }}>
                    <span>日期</span><span>班別</span><span>上班</span><span>下班</span><span>狀態</span><span>SOP</span>
                  </div>
                  {/* Rows */}
                  {days.map(d => {
                    const ds = format(d, 'yyyy-MM-dd')
                    const info = getStaffDay(name, ds)
                    const isOff = info.shift === '休假' || info.shift === '臨時請假'
                    return (
                      <div key={ds} style={{ display: 'grid', gridTemplateColumns: '60px 50px 50px 50px 50px 1fr', fontSize: 11, padding: '5px 8px', gap: 4, borderTop: '1px solid var(--border)', background: isOff ? 'rgba(77,140,196,.04)' : 'transparent' }}>
                        <span style={{ color: 'var(--text-dim)' }}>{format(d, 'M/d')}({DAY_NAMES[d.getDay()]})</span>
                        <span style={{ color: isOff ? 'var(--blue)' : 'var(--text)' }}>{info.shift}</span>
                        <span style={{ color: info.clockIn === '—' ? 'var(--text-muted)' : 'var(--green)', fontFamily: 'var(--font-mono)' }}>{info.clockIn}</span>
                        <span style={{ color: info.clockOut === '—' ? 'var(--text-muted)' : 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{info.clockOut}</span>
                        <span>
                          {info.absent && <span style={{ color: 'var(--red)', fontWeight: 700 }}>缺勤</span>}
                          {info.late && <span style={{ color: '#f59e0b', fontWeight: 600 }}>遲到</span>}
                          {!info.absent && !info.late && !isOff && info.clockIn !== '—' && <span style={{ color: 'var(--green)' }}>✓</span>}
                        </span>
                        <span>
                          {info.sopPct !== null ? (
                            <span style={{ color: info.sopPct === 100 ? 'var(--green)' : info.sopPct >= 80 ? 'var(--gold)' : 'var(--red)' }}>{info.sopDone}/{info.sopTotal} ({info.sopPct}%)</span>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
