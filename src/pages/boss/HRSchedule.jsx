import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { SHIFTS, LEAVE_TYPES } from '../../lib/constants'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfWeek, addDays, addWeeks, subWeeks } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function HRSchedule() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(),{weekStartsOn:1}))
  const [emps, setEmps] = useState([])
  const [scheds, setScheds] = useState([])
  const [loading, setLoading] = useState(true)
  const days = Array.from({length:7},(_,i) => addDays(weekStart,i))

  useEffect(() => { load() }, [weekStart])
  async function load() {
    setLoading(true)
    const [eR,sR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled',true).order('name'),
      supabase.from('schedules').select('*').gte('date',format(weekStart,'yyyy-MM-dd')).lte('date',format(addDays(weekStart,6),'yyyy-MM-dd')),
    ])
    setEmps(eR.data||[]); setScheds(sR.data||[]); setLoading(false)
  }

  function getShift(eid,date) { return scheds.find(s=>s.employee_id===eid&&s.date===format(date,'yyyy-MM-dd')) }
  async function setShift(eid,date,val) {
    const d=format(date,'yyyy-MM-dd'), ex=getShift(eid,date)
    if (ex) await supabase.from('schedules').update({shift:val}).eq('id',ex.id)
    else await supabase.from('schedules').insert({employee_id:eid,date:d,shift:val})
    load()
  }

  const opts = [...Object.keys(SHIFTS), ...LEAVE_TYPES]
  const sc = {'早班':'#c9a84c','晚班':'#4d8ac4','休假':'#5a554e'}

  return (
    <div className="page-container fade-in">
      <div className="section-title">人事排班</div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
        <button style={nb} onClick={() => setWeekStart(subWeeks(weekStart,1))}><ChevronLeft size={18}/></button>
        <span style={{fontSize:14,fontWeight:500}}>{format(weekStart,'M/d')} — {format(addDays(weekStart,6),'M/d')}</span>
        <button style={nb} onClick={() => setWeekStart(addWeeks(weekStart,1))}><ChevronRight size={18}/></button>
      </div>
      {loading ? <div className="loading-shimmer" style={{height:300}}/> : (
        <div style={{overflowX:'auto'}}>
          <table style={{minWidth:600}}>
            <thead><tr>
              <th style={{minWidth:70,position:'sticky',left:0,background:'var(--black-card)',zIndex:1}}>員工</th>
              {days.map(d => <th key={d.toISOString()} style={{textAlign:'center',minWidth:60}}><div>{format(d,'EEE',{locale:zhTW})}</div><div style={{fontSize:11}}>{format(d,'M/d')}</div></th>)}
            </tr></thead>
            <tbody>{emps.filter(e=>!e.is_admin).map(e => (
              <tr key={e.id}>
                <td style={{fontWeight:500,fontSize:13,position:'sticky',left:0,background:'var(--black-card)',zIndex:1}}>{e.name}</td>
                {days.map(d => {
                  const s = getShift(e.id,d), v = s?.shift||''
                  return <td key={d.toISOString()} style={{textAlign:'center',padding:4}}>
                    <select value={v} onChange={ev => setShift(e.id,d,ev.target.value)} style={{background:v?(sc[v]||'var(--gold)')+'20':'var(--black)',color:sc[v]||'var(--text)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 4px',fontSize:11,width:'100%',textAlign:'center',cursor:'pointer'}}>
                      <option value="">—</option>
                      {opts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
const nb = {background:'var(--black-card)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}
