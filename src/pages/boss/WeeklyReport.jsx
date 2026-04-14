import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { toTaipei } from '../../lib/timezone'
import { SHIFTS } from '../../lib/constants'
import { format, startOfWeek, endOfWeek, addWeeks, eachDayOfInterval } from 'date-fns'
import { zhTW } from 'date-fns/locale'

const STAFF = ['RICKY', 'DANIEL', 'JESSICA']
const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

export default function WeeklyReport() {
  const [weekOffset, setWeekOffset] = useState(-1)
  const [tab, setTab] = useState('attendance')
  const [schedules, setSchedules] = useState([])
  const [punches, setPunches] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  // Meeting tab state
  const [notes, setNotes] = useState([])
  const [summary, setSummary] = useState(null)
  const [bossNotes, setBossNotes] = useState('')
  const [decisions, setDecisions] = useState('')
  const [bossComments, setBossComments] = useState({})
  const [meetingSaving, setMeetingSaving] = useState(false)

  const baseDate = addWeeks(new Date(), weekOffset)
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })
  const startStr = format(weekStart, 'yyyy-MM-dd')
  const endStr = format(weekEnd, 'yyyy-MM-dd')

  useEffect(() => { load() }, [weekOffset])

  async function load() {
    setLoading(true)
    const [sR, pR, tR, nR, smR] = await Promise.all([
      supabase.from('schedules').select('*').gte('date', startStr).lte('date', endStr),
      supabase.from('punch_records').select('*').gte('date', startStr).lte('date', endStr),
      supabase.from('task_status').select('*').gte('date', startStr).lte('date', endStr),
      supabase.from('weekly_meeting_notes').select('*').eq('week', startStr),
      supabase.from('weekly_meeting_summary').select('*').eq('week', startStr).maybeSingle(),
    ])
    setSchedules(sR.data || [])
    setPunches(pR.data || [])
    setTasks(tR.data || [])
    setNotes(nR.data || [])
    const sm = smR.data
    setSummary(sm)
    setBossNotes(sm?.boss_notes || '')
    setDecisions(Array.isArray(sm?.decisions) ? sm.decisions.join('\n') : sm?.decisions || '')
    // Init boss comments from notes
    const bc = {}
    ;(nR.data || []).forEach(n => { bc[n.employee_id] = n.boss_comment || '' })
    setBossComments(bc)
    setLoading(false)
  }

  function getStaffDay(name, dateStr) {
    const sched = schedules.find(s => s.employee_id === name && s.date === dateStr)
    const dayPunches = punches.filter(p => p.employee_id === name && p.date === dateStr)
    const clockIn = dayPunches.find(p => p.punch_type === '上班')
    const clockOut = dayPunches.find(p => p.punch_type === '下班')
    const dayTasks = tasks.filter(t => (t.owner === name || t.owner === 'ALL') && t.date === dateStr)
    const doneCount = dayTasks.filter(t => t.completed).length
    const shift = sched?.shift || '—'
    const shiftInfo = SHIFTS[shift]
    return {
      shift,
      clockIn: clockIn ? toTaipei(clockIn.time) : '—',
      clockOut: clockOut ? toTaipei(clockOut.time) : '—',
      late: clockIn?.is_late,
      absent: shiftInfo?.start && !clockIn && shift !== '休假' && shift !== '臨時請假',
      sopTotal: dayTasks.length,
      sopDone: doneCount,
      sopPct: dayTasks.length > 0 ? Math.round(doneCount / dayTasks.length * 100) : null,
    }
  }

  function getStaffSummary(name) {
    let totalDays = 0, lateDays = 0, absentDays = 0, sopTotal = 0, sopDone = 0
    days.forEach(d => {
      const ds = format(d, 'yyyy-MM-dd')
      const info = getStaffDay(name, ds)
      if (info.shift !== '休假' && info.shift !== '臨時請假' && info.shift !== '—') {
        totalDays++
        if (info.late) lateDays++
        if (info.absent) absentDays++
      }
      sopTotal += info.sopTotal
      sopDone += info.sopDone
    })
    return { totalDays, lateDays, absentDays, sopTotal, sopDone, sopPct: sopTotal > 0 ? Math.round(sopDone / sopTotal * 100) : 0 }
  }

  async function saveMeeting() {
    setMeetingSaving(true)
    // Save boss comments on each note
    for (const n of notes) {
      if (bossComments[n.employee_id] !== (n.boss_comment || '')) {
        await supabase.from('weekly_meeting_notes').update({ boss_comment: bossComments[n.employee_id], updated_at: new Date().toISOString() }).eq('id', n.id)
      }
    }
    // Save summary
    const decisionsArr = decisions.split('\n').map(s => s.trim()).filter(Boolean)
    await supabase.from('weekly_meeting_summary').upsert({
      week: startStr, boss_notes: bossNotes, decisions: decisionsArr,
      attendees: STAFF, updated_at: new Date().toISOString()
    }, { onConflict: 'week' })
    setMeetingSaving(false)
    alert('已儲存')
    load()
  }

  const tabs = [
    { key: 'attendance', label: '📊 出勤 & SOP' },
    { key: 'meeting', label: '📝 會議記錄' },
  ]

  return (
    <div>
      <style>{`@media print { body * { visibility:hidden; } #weekly-report, #weekly-report * { visibility:visible; } #weekly-report { position:absolute; left:0; top:0; width:100%; color:#000; background:#fff; padding:12px; font-size:11px; } .no-print { display:none !important; } }`}</style>

      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--black-card)', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>‹ 上週</button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>{format(weekStart, 'M/d', { locale: zhTW })} — {format(weekEnd, 'M/d', { locale: zhTW })}</span>
          <button onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--black-card)', color: weekOffset >= 0 ? 'var(--text-muted)' : 'var(--text)', cursor: weekOffset >= 0 ? 'default' : 'pointer', fontSize: 13 }}>下週 ›</button>
          <button onClick={() => setWeekOffset(-1)} style={{ fontSize: 11, color: weekOffset === -1 ? '#000' : 'var(--gold)', background: weekOffset === -1 ? 'var(--gold)' : 'none', border: '1px solid var(--border-gold)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: weekOffset === -1 ? 700 : 400 }}>上週（開會用）</button>
          <button onClick={() => setWeekOffset(0)} style={{ fontSize: 11, color: weekOffset === 0 ? '#000' : 'var(--gold)', background: weekOffset === 0 ? 'var(--gold)' : 'none', border: '1px solid var(--border-gold)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: weekOffset === 0 ? 700 : 400 }}>本週</button>
        </div>
        <button onClick={() => window.print()} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--gold)', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>🖨️ 列印</button>
      </div>

      {/* Tabs */}
      <div className="no-print" style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: tab === t.key ? 700 : 400, color: tab === t.key ? 'var(--gold)' : 'var(--text-muted)', background: 'transparent', border: 'none', borderBottom: tab === t.key ? '2px solid var(--gold)' : '2px solid transparent', cursor: 'pointer', marginBottom: -2 }}>{t.label}</button>
        ))}
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>載入中…</div> : (
        <>
          {tab === 'attendance' && (
            <div id="weekly-report">
              <div style={{ textAlign: 'center', marginBottom: 12, fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>W CIGAR BAR 週會報表 — {format(weekStart, 'yyyy/M/d')} ~ {format(weekEnd, 'M/d')}</div>

              {STAFF.map(name => {
                const summary = getStaffSummary(name)
                return (
                  <div key={name} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>出勤{summary.totalDays}天 · 遲到{summary.lateDays} · 缺勤{summary.absentDays} · SOP {summary.sopPct}%</span>
                    </div>
                    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '60px 50px 50px 50px 50px 1fr', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--black-card)', padding: '6px 8px', gap: 4 }}>
                        <span>日期</span><span>班別</span><span>上班</span><span>下班</span><span>狀態</span><span>SOP</span>
                      </div>
                      {days.map(d => {
                        const ds = format(d, 'yyyy-MM-dd')
                        const info = getStaffDay(name, ds)
                        const isOff = info.shift === '休假' || info.shift === '臨時請假'
                        return (
                          <div key={ds} style={{ display: 'grid', gridTemplateColumns: '60px 50px 50px 50px 50px 1fr', fontSize: 11, padding: '5px 8px', gap: 4, borderTop: '1px solid var(--border)', background: isOff ? 'rgba(77,140,196,.04)' : 'transparent' }}>
                            <span style={{ color: 'var(--text-dim)' }}>{format(d, 'M/d')}({DAY_NAMES[d.getDay()]})</span>
                            <span style={{ color: isOff ? 'var(--blue)' : 'var(--text)' }}>{info.shift}</span>
                            <span style={{ color: info.clockIn === '—' ? 'var(--text-muted)' : 'var(--green)', fontFamily: 'var(--font-mono)' }}>{info.clockIn}</span>
                            <span style={{ color: info.clockOut === '—' ? 'var(--text-muted)' : 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{info.clockOut}</span>
                            <span>
                              {info.absent && <span style={{ color: 'var(--red)', fontWeight: 700 }}>缺勤</span>}
                              {info.late && <span style={{ color: '#f59e0b', fontWeight: 600 }}>遲到</span>}
                              {!info.absent && !info.late && !isOff && info.clockIn !== '—' && <span style={{ color: 'var(--green)' }}>✓</span>}
                            </span>
                            <span>
                              {info.sopPct !== null ? (
                                <span style={{ color: info.sopPct === 100 ? 'var(--green)' : info.sopPct >= 80 ? 'var(--gold)' : 'var(--red)' }}>{info.sopDone}/{info.sopTotal} ({info.sopPct}%)</span>
                              ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'meeting' && (
            <div id="weekly-report">
              <div style={{ textAlign: 'center', marginBottom: 16, fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>W CIGAR BAR 週會記錄 — {format(weekStart, 'yyyy/M/d')} ~ {format(weekEnd, 'M/d')}</div>

              {/* Submit status */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {STAFF.map(name => {
                  const note = notes.find(n => n.employee_id === name)
                  const submitted = !!note?.submitted_at
                  return (
                    <div key={name} style={{ flex: 1, background: 'var(--black-card)', borderRadius: 8, padding: '10px 12px', textAlign: 'center', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 4 }}>{name}</div>
                      <div style={{ fontSize: 12, color: submitted ? 'var(--green)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {submitted ? '✅ 已提交' : '⏳ 未提交'}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Each staff's notes */}
              {STAFF.map(name => {
                const note = notes.find(n => n.employee_id === name)
                if (!note?.submitted_at) return (
                  <div key={name} style={{ marginBottom: 16, borderRadius: 8, border: '1px solid var(--border)', padding: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>{name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>尚未提交</div>
                  </div>
                )
                const fields = [
                  { label: '工作回顧', value: note.review },
                  { label: '遇到的問題', value: note.issues },
                  { label: '建議 / 想法', value: note.suggestions },
                  { label: '下週目標', value: note.next_goals },
                ]
                return (
                  <div key={name} style={{ marginBottom: 16, borderRadius: 8, border: '1px solid var(--border)', padding: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{new Date(note.submitted_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                    </div>
                    {fields.map(f => (
                      f.value ? (
                        <div key={f.label} style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3 }}>{f.label}</div>
                          <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{f.value}</div>
                        </div>
                      ) : null
                    ))}
                    {/* Boss comment input */}
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold)', marginBottom: 4 }}>老闆批註</div>
                      <textarea
                        value={bossComments[name] || ''}
                        onChange={e => setBossComments(prev => ({ ...prev, [name]: e.target.value }))}
                        rows={2} placeholder="輸入批註…"
                        style={{ width: '100%', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, color: 'var(--text)', fontSize: 12, resize: 'vertical' }}
                      />
                    </div>
                  </div>
                )
              })}

              {/* Boss summary */}
              <div style={{ borderRadius: 8, border: '1px solid var(--border-gold)', padding: 14, marginBottom: 16, background: 'rgba(201,168,76,.03)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 12 }}>老闆綜合備註</div>
                <textarea
                  value={bossNotes} onChange={e => setBossNotes(e.target.value)}
                  rows={4} placeholder="本週總結、觀察、要特別注意的事項…"
                  style={{ width: '100%', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, color: 'var(--text)', fontSize: 13, resize: 'vertical', marginBottom: 12 }}
                />
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>決議事項</div>
                <textarea
                  value={decisions} onChange={e => setDecisions(e.target.value)}
                  rows={4} placeholder="每行一條決議…"
                  style={{ width: '100%', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, color: 'var(--text)', fontSize: 13, resize: 'vertical' }}
                />
              </div>

              <button onClick={saveMeeting} disabled={meetingSaving} style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700, cursor: meetingSaving ? 'default' : 'pointer', background: 'var(--gold)', border: 'none', borderRadius: 10, color: '#000' }}>
                {meetingSaving ? '儲存中…' : '💾 儲存會議記錄'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
