import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { SHIFTS, LEAVE_TYPES } from '../../lib/constants'
import { Calendar, ChevronLeft, ChevronRight, Check, X, UserPlus } from 'lucide-react'
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function BossHR() {
  const [tab, setTab] = useState('schedule')
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [employees, setEmployees] = useState([])
  const [schedules, setSchedules] = useState([])
  const [leaveRequests, setLeaveRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => { loadData() }, [weekStart])

  async function loadData() {
    setLoading(true)
    const start = format(weekStart, 'yyyy-MM-dd')
    const end = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const [empRes, schedRes, leaveRes] = await Promise.all([
      supabase.from('employees').select('*').eq('is_active', true).order('name'),
      supabase.from('schedules').select('*').gte('date', start).lte('date', end),
      supabase.from('leave_requests').select('*, employees(name)').eq('status', 'pending').order('created_at', { ascending: false }),
    ])
    setEmployees(empRes.data || [])
    setSchedules(schedRes.data || [])
    setLeaveRequests(leaveRes.data || [])
    setLoading(false)
  }

  function getShift(empId, date) {
    const dateStr = format(date, 'yyyy-MM-dd')
    return schedules.find(s => s.employee_id === empId && s.date === dateStr)
  }

  async function setShift(empId, date, shiftType) {
    const dateStr = format(date, 'yyyy-MM-dd')
    const existing = getShift(empId, date)
    if (existing) {
      await supabase.from('schedules').update({ shift_type: shiftType }).eq('id', existing.id)
    } else {
      await supabase.from('schedules').insert({ employee_id: empId, date: dateStr, shift_type: shiftType })
    }
    loadData()
  }

  async function handleLeave(id, approved) {
    await supabase.from('leave_requests').update({ status: approved ? 'approved' : 'rejected' }).eq('id', id)
    loadData()
  }

  const shiftOptions = Object.keys(SHIFTS)
  const shiftColors = { '早班': '#c9a84c', '晚班': '#4d8ac4', '休假': '#5a554e' }

  return (
    <div className="page-container fade-in">
      <div className="section-title">人事排班</div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[{ id: 'schedule', label: '排班表' }, { id: 'leaves', label: `假單 (${leaveRequests.length})` }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            background: tab === t.id ? 'var(--gold-glow)' : 'transparent',
            color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)',
            border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'schedule' && (
        <>
          {/* Week nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button style={navBtn} onClick={() => setWeekStart(subWeeks(weekStart, 1))}><ChevronLeft size={18}/></button>
            <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
              {format(weekStart, 'M/d')} — {format(addDays(weekStart, 6), 'M/d')}
            </span>
            <button style={navBtn} onClick={() => setWeekStart(addWeeks(weekStart, 1))}><ChevronRight size={18}/></button>
          </div>

          {loading ? (
            <div className="loading-shimmer" style={{ height: 300 }} />
          ) : (
            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 70, position: 'sticky', left: 0, background: 'var(--black-card)', zIndex: 1 }}>員工</th>
                    {days.map(d => (
                      <th key={d.toISOString()} style={{ textAlign: 'center', minWidth: 60 }}>
                        <div>{format(d, 'EEE', { locale: zhTW })}</div>
                        <div style={{ fontSize: 11 }}>{format(d, 'M/d')}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
                    <tr key={emp.employee_id}>
                      <td style={{ fontWeight: 500, fontSize: 13, position: 'sticky', left: 0, background: 'var(--black-card)', zIndex: 1 }}>
                        {emp.name}
                      </td>
                      {days.map(d => {
                        const sched = getShift(emp.employee_id, d)
                        const shift = sched?.shift_type || ''
                        return (
                          <td key={d.toISOString()} style={{ textAlign: 'center', padding: 4 }}>
                            <select
                              value={shift}
                              onChange={e => setShift(emp.employee_id, d, e.target.value)}
                              style={{
                                background: shift ? `${shiftColors[shift] || 'var(--gold)'}20` : 'var(--black)',
                                color: shiftColors[shift] || 'var(--text)',
                                border: '1px solid var(--border)',
                                borderRadius: 6, padding: '6px 4px', fontSize: 11,
                                width: '100%', textAlign: 'center', cursor: 'pointer',
                              }}
                            >
                              <option value="">—</option>
                              {shiftOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-dim)' }}>
            {shiftOptions.map(s => (
              <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: shiftColors[s] }} />
                {s}
              </span>
            ))}
          </div>
        </>
      )}

      {tab === 'leaves' && (
        <div>
          {leaveRequests.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>無待審假單</div>
          ) : (
            leaveRequests.map(lr => (
              <div key={lr.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{lr.employees?.name || lr.employee_id}</span>
                    <span className="badge badge-gold" style={{ marginLeft: 8 }}>
                      {LEAVE_TYPES.find(t => t.id === lr.leave_type)?.name || lr.leave_type}
                    </span>
                  </div>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{lr.date}</span>
                </div>
                {lr.reason && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>{lr.reason}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-gold" style={{ flex: 1, padding: '8px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={() => handleLeave(lr.id, true)}>
                    <Check size={14}/> 核准
                  </button>
                  <button className="btn-outline" style={{ flex: 1, padding: '8px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--red)', borderColor: 'rgba(196,77,77,0.3)' }} onClick={() => handleLeave(lr.id, false)}>
                    <X size={14}/> 駁回
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

const navBtn = {
  background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
}
