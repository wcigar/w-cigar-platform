import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { SHIFTS, LEAVE_TYPES } from '../../lib/constants'
import { isHoliday, getHolidayName, calcMonthRestDays, TW_HOLIDAYS_2026 } from '../../lib/holidays'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval } from 'date-fns'
import SmartScheduleBtn from '../../components/SmartSchedule'

const WEEKDAYS = ['日','一','二','三','四','五','六']
const ALL_SHIFTS = ['早班','晚班',...LEAVE_TYPES,'']

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
  async function setShiftVal(eid, ds, val) {
    const ex = getShift(eid, ds)
    if (ex) await supabase.from('schedules').update({ shift: val }).eq('id', ex.id)
    else if (val) await supabase.from('schedules').insert({ employee_id: eid, date: ds, shift: val })
    load()
  }

  // Punch records
  const [punches, setPunches] = useState([])
  const [punchDate, setPunchDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  async function loadPunches() { const { data } = await supabase.from('punch_records').select('*').eq('date', punchDate).order('time'); setPunches(data || []) }
  useEffect(() => { if (tab === 'punch') loadPunches() }, [tab, punchDate])

  // Audit
  const [logs, setLogs] = useState([])
  async function loadLogs() { const { data } = await supabase.from('audit_logs').select('*').order('time', { ascending: false }).limit(50); setLogs(data || []) }
  useEffect(() => { if (tab === 'audit') loadLogs() }, [tab])

  const shiftColors = { '早班': '#3dd68c', '晚班': '#4d8ac4', '休假': '#ff9a9a', '臨時請假': '#ff9a9a', '病假': '#ffb347', '事假': '#ffd700', '特休': '#64c8ff' }
  const tabs = [{ id: 'schedule', l: '排班表' }, { id: 'holidays', l: `國定假日 (${monthHolidays.length})` }, { id: 'punch', l: '打卡紀錄' }, { id: 'audit', l: '稽核日誌' }]

  // Holiday cost analysis
  const holWorkCount = scheds.filter(s => (s.shift === '早班' || s.shift === '晚班') && isHoliday(s.date)).length
  const holRestCount = scheds.filter(s => s.shift === '休假' && isHoliday(s.date)).length

  if (loading && tab === 'schedule') return <div className="page-container"><div className="loading-shimmer" style={{ height: 400 }} /></div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">人事排班</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '7px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: tab === t.id ? 'var(--gold-glow)' : 'transparent', color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)', border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{t.l}</button>)}
      </div>

      {tab === 'schedule' && (<>
        {/* Month nav + Smart Schedule */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button style={nb} onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft size={18} /></button>
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--gold)' }}>{format(month, 'yyyy年M月')}</span>
            <button style={nb} onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={18} /></button>
          </div>
          <SmartScheduleBtn month={month} onDone={load} />
        </div>

        {/* Employee stats bar */}
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

        {/* Holiday cost banner */}
        {monthHolidays.length > 0 && (
          <div style={{ fontSize: 11, padding: '8px 12px', marginBottom: 10, borderRadius: 10, background: 'rgba(196,77,77,.06)', border: '1px solid rgba(196,77,77,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} color="var(--red)" /> 本月{monthHolidays.length}天國假</span>
            <span>
              <span style={{ color: 'var(--red)', fontWeight: 600 }}>{holWorkCount}人次上班(2倍)</span>
              <span style={{ color: 'var(--green)', fontWeight: 600, marginLeft: 8 }}>{holRestCount}人次排休(省$)</span>
            </span>
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
                const working = emps.filter(e => { const s = getShift(e.id, ds); return s?.shift === '早班' || s?.shift === '晚班' }).length
                return (
                  <tr key={ds} style={{ background: hol ? 'rgba(196,77,77,.06)' : isFri ? 'rgba(201,168,76,.03)' : undefined }}>
                    <td style={{ position: 'sticky', left: 0, background: hol ? 'rgba(196,77,77,.08)' : 'var(--black-card)', zIndex: 1, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {ds.slice(5)}
                      {hol && <span style={{ color: 'var(--red)', marginLeft: 3 }}>🔴</span>}
                      {isFri && !hol && <span style={{ marginLeft: 2 }}>🍷</span>}
                      {holName && <div style={{ fontSize: 8, color: 'var(--red)', fontWeight: 400 }}>{holName.length > 5 ? holName.slice(0, 5) : holName}</div>}
                    </td>
                    <td style={{ textAlign: 'center', color: isWeekend || hol ? 'var(--red)' : 'var(--text-muted)', fontSize: 12, fontWeight: hol ? 700 : 400 }}>
                      {WEEKDAYS[dow]}
                      {working === 0 && <div style={{ fontSize: 8, color: 'var(--red)' }}>⚠️</div>}
                    </td>
                    {emps.map(emp => {
                      const s = getShift(emp.id, ds), v = s?.shift || ''
                      const c = shiftColors[v] || 'var(--text-muted)'
                      const isHolWork = hol && (v === '早班' || v === '晚班')
                      return <td key={emp.id} style={{ padding: 3, textAlign: 'center', background: isHolWork ? 'rgba(196,77,77,.12)' : undefined }}>
                        <select value={v} onChange={e => setShiftVal(emp.id, ds, e.target.value)} style={{
                          background: v ? c + '20' : 'var(--black)', color: isHolWork ? 'var(--red)' : c,
                          border: isHolWork ? '1px solid rgba(196,77,77,.4)' : '1px solid var(--border)',
                          borderRadius: 6, padding: '4px 2px', fontSize: 11, width: '100%', cursor: 'pointer', textAlign: 'center',
                          fontWeight: isHolWork ? 700 : 400
                        }}>
                          <option value="">—</option>
                          {ALL_SHIFTS.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        {isHolWork && <div style={{ fontSize: 7, color: 'var(--red)', fontWeight: 700 }}>2倍薪</div>}
                      </td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </>)}

      {tab === 'holidays' && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 12 }}>{format(month, 'yyyy年')} 台灣法定假日</div>
          <div style={{ padding: 12, marginBottom: 14, borderRadius: 12, background: 'rgba(196,77,77,.06)', border: '1px solid rgba(196,77,77,.15)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>⚠️ 服務業國假上班 = 雙倍工資（勞基法§39）</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              💡 <strong>省錢策略</strong>：國假只排最少人力上班，其他人排休替補。
              智能排班已自動套用此策略。
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
            本月可休天數：<strong style={{ color: 'var(--gold)' }}>{restQuota} 天</strong>（週末{restQuota - monthHolidays.length} + 國假{monthHolidays.length}）
          </div>

          {monthHolidays.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>本月國假 ({monthHolidays.length}天)</div>
              {monthHolidays.map(h => {
                const d = new Date(h.date), dow = WEEKDAYS[d.getDay()]
                const workers = scheds.filter(s => s.date === h.date && (s.shift === '早班' || s.shift === '晚班'))
                const resters = scheds.filter(s => s.date === h.date && s.shift === '休假')
                return <div key={h.date} className="card" style={{ padding: 12, marginBottom: 6, borderColor: 'rgba(196,77,77,.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--red)' }}>🔴 {h.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{h.date.slice(5)} ({dow})</span>
                  </div>
                  {(workers.length > 0 || resters.length > 0) && (
                    <div style={{ fontSize: 11, marginTop: 6, display: 'flex', gap: 10 }}>
                      {workers.length > 0 && <span style={{ color: 'var(--red)' }}>上班(2倍)：{workers.map(w => emps.find(e => e.id === w.employee_id)?.name || w.employee_id).join('、')}</span>}
                      {resters.length > 0 && <span style={{ color: 'var(--green)' }}>排休：{resters.map(r => emps.find(e => e.id === r.employee_id)?.name || r.employee_id).join('、')}</span>}
                    </div>
                  )}
                </div>
              })}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>全年國定假日一覽</div>
          {Object.entries(TW_HOLIDAYS_2026).map(([date, info]) => {
            const d = new Date(date), dow = WEEKDAYS[d.getDay()]
            const isThisMonth = date.startsWith(monthStr)
            return <div key={date} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', marginBottom: 3, borderRadius: 8, fontSize: 12, background: isThisMonth ? 'rgba(196,77,77,.06)' : 'var(--black-card)', border: '1px solid ' + (isThisMonth ? 'rgba(196,77,77,.2)' : 'var(--border)'), opacity: isThisMonth ? 1 : 0.4 }}>
              <span style={{ fontWeight: isThisMonth ? 600 : 400, color: isThisMonth ? 'var(--red)' : 'var(--text-dim)' }}>{info.name}{info.type === 'makeup' ? ' (補假)' : ''}</span>
              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{date.slice(5)} ({dow})</span>
            </div>
          })}
        </div>
      )}

      {tab === 'punch' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <input type="date" value={punchDate} onChange={e => setPunchDate(e.target.value)} style={{ width: 160, fontSize: 14, padding: 8 }} />
            <button className="btn-outline" style={{ padding: '8px 14px', fontSize: 13 }} onClick={loadPunches}>查詢</button>
          </div>
          {punches.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>無打卡紀錄</div> :
            punches.map(p => (
              <div key={p.id} className="card" style={{ padding: 12, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name} · {p.punch_type}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.time?.slice(11, 19)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: p.is_valid ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{p.distance_m}m</div>
                  <div style={{ fontSize: 11, color: p.is_valid ? 'var(--green)' : 'var(--red)' }}>{p.is_valid ? '✓ 有效' : '✗ 無效'}</div>
                </div>
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
                <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>{l.description?.slice(0, 100)}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>{l.time?.slice(0, 19)}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

const nb = { background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
