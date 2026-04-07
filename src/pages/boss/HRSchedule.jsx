import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { SHIFTS } from '../../lib/constants'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function BossHR() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [employees, setEmployees] = useState([])
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => { loadData() }, [weekStart])

  async function loadData() {
    setLoading(true)
    const start = format(weekStart, 'yyyy-MM-dd')
    const end = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const [empRes, schedRes] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true).order('name'),
      supabase.from('schedules').select('*').gte('date', start).lte('date', end),
    ])
    setEmployees(empRes.data || [])
    setSchedules(schedRes.data || [])
    setLoading(false)
  }

  function getShift(empId, date) {
    return schedules.find(s => s.employee_id === empId && s.date === format(date, 'yyyy-MM-dd'))
  }

  async function setShift(empId, date, shiftVal) {
    const dateStr = format(date, 'yyyy-MM-dd')
    const existing = getShift(empId, date)
    if (existing) {
      await supabase.from('schedules').update({ shift: shiftVal }).eq('id', existing.id)
    } else {
      await supabase.from('schedules').insert({ employee_id: empId, date: dateStr, shift: shiftVal })
    }
    loadData()
  }

  const shiftOptions = Object.keys(SHIFTS)
  const shiftColors = { '早班': '#c9a84c', '晚班': '#4d8ac4', '休假': '#5a554e' }

  return (
    <div className="page-container fade-in">
      <div className="section-title">人事排班</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button style={navBtn} onClick={() => setWeekStart(subWeeks(weekStart, 1))}><ChevronLeft size={18}/></button>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{format(weekStart, 'M/d')}  {format(addDays(weekStart, 6), 'M/d')}</span>
        <button style={navBtn} onClick={() => setWeekStart(addWeeks(weekStart, 1))}><ChevronRight size={18}/></button>
      </div>
      {loading ? <div className="loading-shimmer" style={{ height: 300 }} /> : (
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ minWidth: 600 }}>
            <thead><tr>
              <th style={{ minWidth: 70, position: 'sticky', left: 0, background: 'var(--black-card)', zIndex: 1 }}>員工</th>
              {days.map(d => <th key={d.toISOString()} style={{ textAlign: 'center', minWidth: 60 }}><div>{format(d, 'EEE', { locale: zhTW })}</div><div style={{ fontSize: 11 }}>{format(d, 'M/d')}</div></th>)}
            </tr></thead>
            <tbody>{employees.map(emp => (
              <tr key={emp.id}>
                <td style={{ fontWeight: 500, fontSize: 13, position: 'sticky', left: 0, background: 'var(--black-card)', zIndex: 1 }}>{emp.name}</td>
                {days.map(d => {
                  const sched = getShift(emp.id, d)
                  const shift = sched?.shift || ''
                  return (
                    <td key={d.toISOString()} style={{ textAlign: 'center', padding: 4 }}>
                      <select value={shift} onChange={e => setShift(emp.id, d, e.target.value)} style={{ background: shift ? (shiftColors[shift] || 'var(--gold)') + '20' : 'var(--black)', color: shiftColors[shift] || 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 4px', fontSize: 11, width: '100%', textAlign: 'center', cursor: 'pointer' }}>
                        <option value=""></option>
                        {shiftOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  )
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const navBtn = { background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
