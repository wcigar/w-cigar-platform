import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { SHIFTS, LEAVE_TYPES } from '../../lib/constants'
import { isHoliday, getHolidayName, calcMonthRestDays } from '../../lib/holidays'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, isSameDay, getDay } from 'date-fns'
import { zhTW } from 'date-fns/locale'

const WEEKDAYS = ['日','一','二','三','四','五','六']

export default function StaffSchedule() {
  const { user } = useAuth()
  const [month, setMonth] = useState(new Date())
  const [schedules, setSchedules] = useState([])
  const [allSchedules, setAllSchedules] = useState([])
  const [emps, setEmps] = useState([])
  const [loading, setLoading] = useState(true)

  const start = startOfMonth(month), end = endOfMonth(month)
  const days = eachDayOfInterval({ start, end })
  const yr = month.getFullYear(), mo = month.getMonth() + 1
  const restQuota = calcMonthRestDays(yr, mo)

  useEffect(() => { load() }, [month])
  async function load() {
    setLoading(true)
    const s = format(start, 'yyyy-MM-dd'), e = format(end, 'yyyy-MM-dd')
    const [myR, allR, empR] = await Promise.all([
      supabase.from('schedules').select('*').eq('employee_id', user.employee_id).gte('date', s).lte('date', e).order('date'),
      supabase.from('schedules').select('*').gte('date', s).lte('date', e),
      supabase.from('employees').select('id, name').eq('enabled', true),
    ])
    setSchedules(myR.data || []); setAllSchedules(allR.data || [])
    setEmps((empR.data || []).filter(x => x.id !== 'ADMIN'))
    setLoading(false)
  }

  async function requestLeave(dateStr, leaveType) {
    const existing = schedules.find(s => s.date === dateStr)
    if (existing) await supabase.from('schedules').update({ shift: leaveType }).eq('id', existing.id)
    else await supabase.from('schedules').insert({ date: dateStr, employee_id: user.employee_id, shift: leaveType })
    load()
  }

  function getMyShift(ds) { return schedules.find(s => s.date === ds)?.shift || '' }

  const dc = schedules.filter(s => s.shift === '早班').length
  const nc = schedules.filter(s => s.shift === '晚班').length
  const oc = schedules.filter(s => LEAVE_TYPES.includes(s.shift) || s.shift === '休假').length
  // 國定假日上班天數
  const holidayWork = schedules.filter(s => {
    return (s.shift === '早班' || s.shift === '晚班') && isHoliday(s.date)
  }).length

  const shiftColors = { '早班': 'var(--green)', '晚班': 'var(--blue)', '休假': 'var(--red)', '臨時請假': 'var(--red)', '病假': '#ffb347', '事假': '#ffd700', '特休': '#64c8ff', '調班': '#c896ff' }

  if (loading) return <div className="page-container"><div className="loading-shimmer" style={{ height: 300 }} /></div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">我的排班</div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button style={nb} onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft size={18} /></button>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--gold)' }}>{format(month, 'yyyy年M月')}</span>
        <button style={nb} onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={18} /></button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
        <ST label="早班" value={dc} color="var(--green)" />
        <ST label="晚班" value={nc} color="var(--blue)" />
        <ST label="已休" value={oc + '/' + restQuota} color={oc > restQuota ? 'var(--red)' : 'var(--text)'} />
        {holidayWork > 0 && <ST label="國假上班" value={holidayWork} color="var(--red)" />}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>🔴 = 國定假日 · 點班別可申請休假</div>

      {/* Calendar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 16 }}>
        {WEEKDAYS.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', padding: 4 }}>{w}</div>)}
        {Array.from({ length: getDay(start) }).map((_, i) => <div key={'p' + i} />)}
        {days.map(day => {
          const ds = format(day, 'yyyy-MM-dd')
          const shift = getMyShift(ds)
          const td = isSameDay(day, new Date())
          const past = day < new Date() && !td
          const hol = isHoliday(ds)
          const holName = getHolidayName(ds)
          const color = shiftColors[shift] || 'var(--text-muted)'
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          return (
            <div key={ds} style={{
              padding: 3, textAlign: 'center', borderRadius: 8,
              background: td ? 'var(--gold-glow)' : hol ? 'rgba(196,77,77,.06)' : 'var(--black-card)',
              border: td ? '1px solid var(--border-gold)' : hol ? '1px solid rgba(196,77,77,.2)' : '1px solid var(--border)',
              opacity: past ? 0.4 : 1, minHeight: 52, display: 'flex', flexDirection: 'column', justifyContent: 'center',
              cursor: shift && !past && shift !== '休假' ? 'pointer' : 'default'
            }} onClick={() => {
              if (past || !shift || shift === '休假') return
              const choice = prompt(`${ds}${holName ? ' 🔴' + holName : ''}\n目前: ${shift}\n\n1=休假 2=臨時請假 3=病假 4=事假 5=特休 6=調班`)
              const map = { '1': '休假', '2': '臨時請假', '3': '病假', '4': '事假', '5': '特休', '6': '調班' }
              if (choice && map[choice]) requestLeave(ds, map[choice])
            }}>
              <div style={{ fontSize: 12, fontWeight: td ? 700 : 400, color: td ? 'var(--gold)' : isWeekend ? 'var(--red)' : 'var(--text)' }}>
                {format(day, 'd')}
              </div>
              {hol && <div style={{ fontSize: 7, color: 'var(--red)', fontWeight: 600, lineHeight: 1, marginTop: 1 }}>{holName.slice(0, 3)}</div>}
              {shift && <div style={{ fontSize: 8, fontWeight: 700, color, marginTop: 1 }}>{shift}</div>}
            </div>
          )
        })}
      </div>

      {/* Other employees */}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', marginBottom: 8 }}>同事今日班別</div>
      {emps.filter(e => e.id !== user.employee_id).map(emp => {
        const ts = allSchedules.find(s => s.employee_id === emp.id && s.date === format(new Date(), 'yyyy-MM-dd'))?.shift
        return <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
          <span>{emp.name}</span><span style={{ color: shiftColors[ts] || 'var(--text-muted)', fontWeight: 600 }}>{ts || '未排'}</span>
        </div>
      })}
    </div>
  )
}

function ST({ label, value, color }) {
  return <div className="card" style={{ flex: 1, padding: 8, textAlign: 'center', minWidth: 60 }}>
    <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{label}</div>
    <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', color, fontWeight: 600 }}>{value}</div>
  </div>
}
const nb = { background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
