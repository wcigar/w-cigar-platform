import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { SHIFTS, LEAVE_TYPES } from '../../lib/constants'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function StaffSchedule() {
  const { user } = useAuth()
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => { load() }, [weekStart])
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('schedules').select('*').eq('employee_id', user.employee_id)
      .gte('date', format(weekStart,'yyyy-MM-dd')).lte('date', format(addDays(weekStart,6),'yyyy-MM-dd')).order('date')
    setSchedules(data || []); setLoading(false)
  }

  return (
    <div className="page-container fade-in">
      <div className="section-title">我的排班</div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <button style={nb} onClick={() => setWeekStart(subWeeks(weekStart,1))}><ChevronLeft size={18}/></button>
        <span style={{fontSize:14,fontWeight:500}}>{format(weekStart,'M/d')} — {format(addDays(weekStart,6),'M/d')}</span>
        <button style={nb} onClick={() => setWeekStart(addWeeks(weekStart,1))}><ChevronRight size={18}/></button>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {days.map(day => {
          const s = schedules.find(s => s.date === format(day,'yyyy-MM-dd'))
          const shift = s?.shift
          const si = shift ? SHIFTS[shift] : null
          const td = isSameDay(day, new Date())
          return (
            <div key={day.toISOString()} className="card" style={{padding:'12px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',borderColor:td?'var(--border-gold)':undefined,background:td?'rgba(201,168,76,.04)':undefined}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:36,height:36,borderRadius:8,background:td?'var(--gold-glow)':'var(--black)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',border:td?'1px solid var(--border-gold)':'1px solid var(--border)'}}>
                  <span style={{fontSize:14,fontWeight:600,color:td?'var(--gold)':'var(--text)',lineHeight:1}}>{format(day,'d')}</span>
                  <span style={{fontSize:9,color:'var(--text-dim)'}}>{format(day,'EEE',{locale:zhTW})}</span>
                </div>
                <div>{shift ? (<><span className={`badge ${shift==='休假'?'badge-blue':'badge-gold'}`}>{shift}</span>{si?.start && <span style={{fontSize:12,color:'var(--text-dim)',marginLeft:8,fontFamily:'var(--font-mono)'}}>{si.start}–{si.end}</span>}</>) : <span style={{fontSize:13,color:'var(--text-muted)'}}>未排班</span>}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
const nb = {background:'var(--black-card)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}
