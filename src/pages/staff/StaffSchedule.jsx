import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { SHIFTS, LEAVE_TYPES } from '../../lib/constants'
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

  const start = startOfMonth(month)
  const end = endOfMonth(month)
  const days = eachDayOfInterval({ start, end })

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = format(start, 'yyyy-MM-dd'), e = format(end, 'yyyy-MM-dd')
    const [myRes, allRes, empRes] = await Promise.all([
      supabase.from('schedules').select('*').eq('employee_id', user.employee_id).gte('date', s).lte('date', e).order('date'),
      supabase.from('schedules').select('*').gte('date', s).lte('date', e),
      supabase.from('employees').select('id, name').eq('enabled', true),
    ])
    setSchedules(myRes.data || [])
    setAllSchedules(allRes.data || [])
    setEmps((empRes.data || []).filter(x => x.id !== 'ADMIN'))
    setLoading(false)
  }

  async function requestLeave(dateStr, leaveType) {
    const existing = schedules.find(s => s.date === dateStr)
    if (existing) {
      await supabase.from('schedules').update({ shift: leaveType }).eq('id', existing.id)
    } else {
      await supabase.from('schedules').insert({ date: dateStr, employee_id: user.employee_id, shift: leaveType })
    }
    load()
  }

  function getMyShift(dateStr) { return schedules.find(s => s.date === dateStr)?.shift || '' }

  // Stats
  const dc = schedules.filter(s => s.shift === '早班').length
  const nc = schedules.filter(s => s.shift === '晚班').length
  const oc = schedules.filter(s => LEAVE_TYPES.includes(s.shift) || s.shift === '休假').length

  const shiftColors = { '早班': 'var(--green)', '晚班': 'var(--blue)', '休假': 'var(--red)', '臨時請假': 'var(--red)', '病假': '#ffb347', '事假': '#ffd700', '特休': '#64c8ff', '調班': '#c896ff' }

  if (loading) return <div className="page-container"><div className="loading-shimmer" style={{height:300}}/></div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">我的排班</div>

      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button style={nb} onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft size={18} /></button>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--gold)' }}>{format(month, 'yyyy年M月')}</span>
        <button style={nb} onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={18} /></button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div className="card" style={{ flex: 1, padding: 10, textAlign: 'center' }}><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>早班</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', color: 'var(--green)', fontWeight: 600 }}>{dc}</div></div>
        <div className="card" style={{ flex: 1, padding: 10, textAlign: 'center' }}><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>晚班</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', color: 'var(--blue)', fontWeight: 600 }}>{nc}</div></div>
        <div className="card" style={{ flex: 1, padding: 10, textAlign: 'center' }}><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>休假</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>{oc}</div></div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>點擊班別可申請休假（週二不可休、週五至少2人）</div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 16 }}>
        {WEEKDAYS.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', padding: 4 }}>{w}</div>)}
        {/* Pad first week */}
        {Array.from({ length: getDay(start) }).map((_, i) => <div key={'p' + i} />)}
        {days.map(day => {
          const ds = format(day, 'yyyy-MM-dd')
          const shift = getMyShift(ds)
          const isToday = isSameDay(day, new Date())
          const isPast = day < new Date() && !isToday
          const color = shiftColors[shift] || 'var(--text-muted)'
          return (
            <div key={ds} style={{ padding: 4, textAlign: 'center', borderRadius: 8, background: isToday ? 'var(--gold-glow)' : 'var(--black-card)', border: isToday ? '1px solid var(--border-gold)' : '1px solid var(--border)', opacity: isPast ? 0.4 : 1, minHeight: 52, display: 'flex', flexDirection: 'column', justifyContent: 'center', cursor: shift && !isPast ? 'pointer' : 'default' }}
              onClick={() => {
                if (isPast || !shift || shift === '休假') return
                const choice = prompt(`${ds}\n目前: ${shift}\n\n輸入假別:\n1=休假 2=臨時請假 3=病假 4=事假 5=特休 6=調班\n\n或按取消`)
                const map = { '1': '休假', '2': '臨時請假', '3': '病假', '4': '事假', '5': '特休', '6': '調班' }
                if (choice && map[choice]) requestLeave(ds, map[choice])
              }}>
              <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--gold)' : 'var(--text)' }}>{format(day, 'd')}</div>
              {shift && <div style={{ fontSize: 9, fontWeight: 700, color, marginTop: 2 }}>{shift}</div>}
            </div>
          )
        })}
      </div>

      {/* Other employees schedule */}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', marginBottom: 8 }}>同事排班</div>
      {emps.filter(e => e.id !== user.employee_id).map(emp => {
        const todayShift = allSchedules.find(s => s.employee_id === emp.id && s.date === format(new Date(), 'yyyy-MM-dd'))?.shift
        return (
          <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span>{emp.name}</span>
            <span style={{ color: shiftColors[todayShift] || 'var(--text-muted)', fontWeight: 600 }}>{todayShift || '未排'}</span>
          </div>
        )
      })}
    </div>
  )
}

const nb = { background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
