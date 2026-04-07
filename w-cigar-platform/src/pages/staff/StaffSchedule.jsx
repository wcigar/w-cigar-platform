import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { SHIFTS, LEAVE_TYPES } from '../../lib/constants'
import { Calendar, ChevronLeft, ChevronRight, Send } from 'lucide-react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function StaffSchedule() {
  const { user } = useAuth()
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [schedules, setSchedules] = useState([])
  const [leaveForm, setLeaveForm] = useState(null)
  const [loading, setLoading] = useState(true)

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => { loadSchedule() }, [weekStart])

  async function loadSchedule() {
    setLoading(true)
    const start = format(weekStart, 'yyyy-MM-dd')
    const end = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('schedules')
      .select('*')
      .eq('employee_id', user.employee_id)
      .gte('date', start)
      .lte('date', end)
      .order('date')
    setSchedules(data || [])
    setLoading(false)
  }

  function getScheduleForDay(date) {
    return schedules.find(s => s.date === format(date, 'yyyy-MM-dd'))
  }

  async function submitLeave() {
    if (!leaveForm) return
    await supabase.from('leave_requests').insert({
      employee_id: user.employee_id,
      date: leaveForm.date,
      leave_type: leaveForm.type,
      reason: leaveForm.reason,
      status: 'pending',
    })
    setLeaveForm(null)
    alert('請假申請已送出')
  }

  const isToday = (d) => isSameDay(d, new Date())

  return (
    <div className="page-container fade-in">
      <div className="section-title">我的排班</div>

      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button style={navBtn} onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
          {format(weekStart, 'M/d', { locale: zhTW })} — {format(addDays(weekStart, 6), 'M/d', { locale: zhTW })}
        </span>
        <button style={navBtn} onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Week grid */}
      {loading ? (
        [1,2,3,4,5,6,7].map(i => <div key={i} className="loading-shimmer" style={{height:56,marginBottom:6}}/>)
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
          {days.map(day => {
            const sched = getScheduleForDay(day)
            const shift = sched?.shift_type
            const shiftInfo = shift ? SHIFTS[shift] : null
            const today = isToday(day)
            return (
              <div
                key={day.toISOString()}
                className="card"
                style={{
                  padding: '12px 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  borderColor: today ? 'var(--border-gold)' : undefined,
                  background: today ? 'rgba(201,168,76,0.04)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: today ? 'var(--gold-glow)' : 'var(--black)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    border: today ? '1px solid var(--border-gold)' : '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: today ? 'var(--gold)' : 'var(--text)', lineHeight: 1 }}>
                      {format(day, 'd')}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{format(day, 'EEE', { locale: zhTW })}</span>
                  </div>
                  <div>
                    {shift ? (
                      <>
                        <span className={`badge ${shift === '休假' ? 'badge-blue' : 'badge-gold'}`}>{shift}</span>
                        {shiftInfo?.start && (
                          <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>
                            {shiftInfo.start}–{shiftInfo.end}
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>未排班</span>
                    )}
                  </div>
                </div>
                {shift && shift !== '休假' && (
                  <button
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
                    onClick={() => setLeaveForm({ date: format(day, 'yyyy-MM-dd'), type: 'personal', reason: '' })}
                  >
                    請假
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Leave request modal */}
      {leaveForm && (
        <div style={modalOverlay} onClick={() => setLeaveForm(null)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, color: 'var(--gold)', marginBottom: 16 }}>請假申請 — {leaveForm.date}</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>假別</label>
              <select value={leaveForm.type} onChange={e => setLeaveForm(p => ({ ...p, type: e.target.value }))}>
                {LEAVE_TYPES.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>事由</label>
              <textarea
                rows={3}
                value={leaveForm.reason}
                onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))}
                style={{ resize: 'none' }}
              />
            </div>
            <button className="btn-gold" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={submitLeave}>
              <Send size={14} /> 送出申請
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const navBtn = {
  background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
}

const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
}

const modalBox = {
  background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 16,
  padding: 24, width: '100%', maxWidth: 360,
}
