import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { SHIFTS, LEAVE_TYPES } from '../../lib/constants'
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval } from 'date-fns'
import { zhTW } from 'date-fns/locale'

const WEEKDAYS = ['日','一','二','三','四','五','六']
const ALL_SHIFTS = ['早班', '晚班', ...LEAVE_TYPES, '']

export default function HRSchedule() {
  const [month, setMonth] = useState(new Date())
  const [emps, setEmps] = useState([])
  const [scheds, setScheds] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('schedule')

  const start = startOfMonth(month), end = endOfMonth(month)
  const days = eachDayOfInterval({ start, end })

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = format(start, 'yyyy-MM-dd'), e = format(end, 'yyyy-MM-dd')
    const [eR, sR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true).order('name'),
      supabase.from('schedules').select('*').gte('date', s).lte('date', e),
    ])
    setEmps((eR.data || []).filter(x => !x.is_admin))
    setScheds(sR.data || [])
    setLoading(false)
  }

  function getShift(eid, dateStr) { return scheds.find(s => s.employee_id === eid && s.date === dateStr) }

  async function setShift(eid, dateStr, val) {
    const ex = getShift(eid, dateStr)
    if (ex) await supabase.from('schedules').update({ shift: val }).eq('id', ex.id)
    else if (val) await supabase.from('schedules').insert({ employee_id: eid, date: dateStr, shift: val })
    load()
  }

  // Punch records
  const [punches, setPunches] = useState([])
  const [punchDate, setPunchDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  async function loadPunches() {
    const { data } = await supabase.from('punch_records').select('*').eq('date', punchDate).order('time')
    setPunches(data || [])
  }

  useEffect(() => { if (tab === 'punch') loadPunches() }, [tab, punchDate])

  // Audit logs
  const [logs, setLogs] = useState([])
  async function loadLogs() {
    const { data } = await supabase.from('audit_logs').select('*').order('time', { ascending: false }).limit(50)
    setLogs(data || [])
  }
  useEffect(() => { if (tab === 'audit') loadLogs() }, [tab])

  const shiftColors = { '早班': '#3dd68c', '晚班': '#4d8ac4', '休假': '#ff9a9a' }
  const tabs = [{ id: 'schedule', l: '排班表' }, { id: 'punch', l: '打卡紀錄' }, { id: 'audit', l: '稽核日誌' }]

  if (loading && tab === 'schedule') return <div className="page-container"><div className="loading-shimmer" style={{ height: 400 }} /></div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">人事排班</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: tab === t.id ? 'var(--gold-glow)' : 'transparent', color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)', border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{t.l}</button>)}
      </div>

      {tab === 'schedule' && (<>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button style={nb} onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft size={18} /></button>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--gold)' }}>{format(month, 'yyyy年M月')}</span>
          <button style={nb} onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={18} /></button>
        </div>

        {/* Stats per employee */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
          {emps.map(emp => {
            const empScheds = scheds.filter(s => s.employee_id === emp.id)
            const work = empScheds.filter(s => s.shift === '早班' || s.shift === '晚班').length
            const off = empScheds.filter(s => LEAVE_TYPES.includes(s.shift) || s.shift === '休假').length
            return <div key={emp.id} style={{ padding: '8px 12px', background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11, whiteSpace: 'nowrap', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, color: 'var(--gold)' }}>{emp.name}</div>
              <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>上{work} 休{off}</div>
            </div>
          })}
        </div>

        {/* Schedule table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: Math.max(500, emps.length * 80 + 100) }}>
            <thead><tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--black-card)', zIndex: 1, minWidth: 70 }}>日期</th>
              <th style={{ width: 30 }}>星期</th>
              {emps.map(e => <th key={e.id} style={{ minWidth: 75, textAlign: 'center', color: 'var(--gold)' }}>{e.name}</th>)}
            </tr></thead>
            <tbody>
              {days.map(day => {
                const ds = format(day, 'yyyy-MM-dd')
                const dow = day.getDay()
                const isWeekend = dow === 0 || dow === 6
                const isFri = dow === 5
                return (
                  <tr key={ds} style={{ background: isFri ? 'rgba(201,168,76,.03)' : undefined }}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--black-card)', zIndex: 1, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{ds.slice(5)}{isFri ? ' 🍷' : ''}</td>
                    <td style={{ textAlign: 'center', color: isWeekend ? 'var(--red)' : 'var(--text-muted)', fontSize: 12 }}>{WEEKDAYS[dow]}</td>
                    {emps.map(emp => {
                      const s = getShift(emp.id, ds)
                      const v = s?.shift || ''
                      const c = shiftColors[v] || 'var(--text-muted)'
                      return <td key={emp.id} style={{ padding: 3, textAlign: 'center' }}>
                        <select value={v} onChange={e => setShift(emp.id, ds, e.target.value)} style={{ background: v ? c + '20' : 'var(--black)', color: c, border: '1px solid var(--border)', borderRadius: 6, padding: '4px 2px', fontSize: 11, width: '100%', cursor: 'pointer', textAlign: 'center' }}>
                          <option value="">—</option>
                          {ALL_SHIFTS.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </>)}

      {tab === 'punch' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <input type="date" value={punchDate} onChange={e => setPunchDate(e.target.value)} style={{ width: 160, fontSize: 14, padding: 8 }} />
            <button className="btn-outline" style={{ padding: '8px 14px', fontSize: 13 }} onClick={loadPunches}>查詢</button>
          </div>
          {punches.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>無打卡紀錄</div> :
            punches.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span>{p.time?.slice(11, 19)} · {p.name} · {p.punch_type}</span>
                <span style={{ color: p.is_valid ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{p.distance_m}m {p.is_valid ? '有效' : '無效'}</span>
              </div>
            ))}
        </div>
      )}

      {tab === 'audit' && (
        <div>
          {logs.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>無日誌</div> :
            logs.map(l => (
              <div key={l.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{l.event}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{l.operator}</span>
                </div>
                <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>{l.description?.slice(0, 80)}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>{l.time?.slice(0, 19)}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

const nb = { background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
