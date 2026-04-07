import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { SHIFTS, LEAVE_TYPES } from '../../lib/constants'
import { isHoliday, getHolidayName, calcMonthRestDays, TW_HOLIDAYS_2026 } from '../../lib/holidays'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval } from 'date-fns'

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
  const yr = month.getFullYear(), mo = month.getMonth() + 1
  const restQuota = calcMonthRestDays(yr, mo)
  const monthStr = format(month, 'yyyy-MM')

  // List holidays this month
  const monthHolidays = Object.entries(TW_HOLIDAYS_2026).filter(([d]) => d.startsWith(monthStr)).map(([d, info]) => ({ date: d, ...info }))

  useEffect(() => { load() }, [month])
  async function load() {
    setLoading(true)
    const s = format(start, 'yyyy-MM-dd'), e = format(end, 'yyyy-MM-dd')
    const [eR, sR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true).order('name'),
      supabase.from('schedules').select('*').gte('date', s).lte('date', e),
    ])
    setEmps((eR.data || []).filter(x => !x.is_admin)); setScheds(sR.data || [])
    setLoading(false)
  }

  function getShift(eid, ds) { return scheds.find(s => s.employee_id === eid && s.date === ds) }
  async function setShift(eid, ds, val) {
    const ex = getShift(eid, ds)
    if (ex) await supabase.from('schedules').update({ shift: val }).eq('id', ex.id)
    else if (val) await supabase.from('schedules').insert({ employee_id: eid, date: ds, shift: val })
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

  // Audit
  const [logs, setLogs] = useState([])
  async function loadLogs() { const { data } = await supabase.from('audit_logs').select('*').order('time', { ascending: false }).limit(50); setLogs(data || []) }
  useEffect(() => { if (tab === 'audit') loadLogs() }, [tab])

  const shiftColors = { '早班': '#3dd68c', '晚班': '#4d8ac4', '休假': '#ff9a9a' }
  const tabs = [{ id: 'schedule', l: '排班表' }, { id: 'holidays', l: `國定假日 (${monthHolidays.length})` }, { id: 'punch', l: '打卡紀錄' }, { id: 'audit', l: '稽核日誌' }]

  if (loading && tab === 'schedule') return <div className="page-container"><div className="loading-shimmer" style={{ height: 400 }} /></div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">人事排班</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '7px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: tab === t.id ? 'var(--gold-glow)' : 'transparent', color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)', border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{t.l}</button>)}
      </div>

      {tab === 'schedule' && (<>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button style={nb} onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft size={18} /></button>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--gold)' }}>{format(month, 'yyyy年M月')}</span>
          <button style={nb} onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={18} /></button>
        </div>

        {/* Per-employee stats */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 4 }}>
          <div style={{ padding: '6px 10px', background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11, whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>可休 {restQuota}天</span>
          </div>
          {emps.map(emp => {
            const es = scheds.filter(s => s.employee_id === emp.id)
            const work = es.filter(s => s.shift === '早班' || s.shift === '晚班').length
            const off = es.filter(s => LEAVE_TYPES.includes(s.shift) || s.shift === '休假').length
            const holWork = es.filter(s => (s.shift === '早班' || s.shift === '晚班') && isHoliday(s.date)).length
            return <div key={emp.id} style={{ padding: '6px 10px', background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 10, whiteSpace: 'nowrap', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, color: 'var(--gold)' }}>{emp.name}</div>
              <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>
                上{work} 休{off}/{restQuota}
                {holWork > 0 && <span style={{ color: 'var(--red)' }}> 國假{holWork}</span>}
              </div>
            </div>
          })}
        </div>

        {/* Warnings */}
        {monthHolidays.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={12} color="var(--red)" /> 🔴紅色 = 國定假日（上班需給雙倍工資）
          </div>
        )}

        {/* Schedule table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: Math.max(500, emps.length * 80 + 120) }}>
            <thead><tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--black-card)', zIndex: 1, minWidth: 80 }}>日期</th>
              <th style={{ width: 30 }}>星期</th>
              {emps.map(e => <th key={e.id} style={{ minWidth: 75, textAlign: 'center', color: 'var(--gold)' }}>{e.name}</th>)}
            </tr></thead>
            <tbody>
              {days.map(day => {
                const ds = format(day, 'yyyy-MM-dd')
                const dow = day.getDay()
                const isWeekend = dow === 0 || dow === 6
                const isFri = dow === 5
                const hol = isHoliday(ds)
                const holName = getHolidayName(ds)
                return (
                  <tr key={ds} style={{ background: hol ? 'rgba(196,77,77,.06)' : isFri ? 'rgba(201,168,76,.03)' : undefined }}>
                    <td style={{ position: 'sticky', left: 0, background: hol ? 'rgba(196,77,77,.08)' : 'var(--black-card)', zIndex: 1, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {ds.slice(5)}
                      {hol && <span style={{ color: 'var(--red)', marginLeft: 4 }}>🔴{holName.length > 4 ? holName.slice(0, 4) : holName}</span>}
                      {isFri && !hol && <span style={{ marginLeft: 2 }}>🍷</span>}
                    </td>
                    <td style={{ textAlign: 'center', color: isWeekend || hol ? 'var(--red)' : 'var(--text-muted)', fontSize: 12, fontWeight: hol ? 700 : 400 }}>{WEEKDAYS[dow]}</td>
                    {emps.map(emp => {
                      const s = getShift(emp.id, ds), v = s?.shift || ''
                      const c = shiftColors[v] || 'var(--text-muted)'
                      const isHolWork = hol && (v === '早班' || v === '晚班')
                      return <td key={emp.id} style={{ padding: 3, textAlign: 'center', background: isHolWork ? 'rgba(196,77,77,.12)' : undefined }}>
                        <select value={v} onChange={e => setShift(emp.id, ds, e.target.value)} style={{
                          background: v ? c + '20' : 'var(--black)', color: isHolWork ? 'var(--red)' : c,
                          border: isHolWork ? '1px solid rgba(196,77,77,.4)' : '1px solid var(--border)',
                          borderRadius: 6, padding: '4px 2px', fontSize: 11, width: '100%', cursor: 'pointer', textAlign: 'center',
                          fontWeight: isHolWork ? 700 : 400
                        }}>
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

      {/* Holidays tab */}
      {tab === 'holidays' && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 12 }}>{format(month, 'yyyy年')} 台灣法定假日</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, padding: 10, background: 'rgba(196,77,77,.06)', borderRadius: 10, border: '1px solid rgba(196,77,77,.15)' }}>
            ⚠️ 服務業國定假日上班 = <strong style={{ color: 'var(--red)' }}>雙倍工資</strong>（勞基法§39）
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>本月可休天數：<strong style={{ color: 'var(--gold)' }}>{restQuota} 天</strong>（週末 + 國定假日）</div>

          {Object.entries(TW_HOLIDAYS_2026).map(([date, info]) => {
            const d = new Date(date)
            const dow = WEEKDAYS[d.getDay()]
            const isThisMonth = date.startsWith(monthStr)
            return (
              <div key={date} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', marginBottom: 4, borderRadius: 10, fontSize: 13, background: isThisMonth ? 'rgba(196,77,77,.06)' : 'var(--black-card)', border: '1px solid ' + (isThisMonth ? 'rgba(196,77,77,.2)' : 'var(--border)'), opacity: isThisMonth ? 1 : 0.5 }}>
                <div>
                  <span style={{ fontWeight: 600, color: isThisMonth ? 'var(--red)' : 'var(--text)' }}>🔴 {info.name}</span>
                  {info.type === 'makeup' && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>補假</span>}
                </div>
                <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{date.slice(5)} ({dow})</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Punch records */}
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

      {/* Audit logs */}
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
