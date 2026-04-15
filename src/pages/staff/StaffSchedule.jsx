import LeaveRequest from './LeaveRequest'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { SHIFTS, LEAVE_TYPES } from '../../lib/constants'
import { toTaipei } from '../../lib/timezone'
import { isHoliday, getHolidayName, calcMonthRestDays } from '../../lib/holidays'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, eachDayOfInterval, isSameDay, getDay } from 'date-fns'
import { zhTW } from 'date-fns/locale'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function ScheduleContent() {
  const { user } = useAuth()
  const [month, setMonth] = useState(new Date())
  const [schedules, setSchedules] = useState([])
  const [allSchedules, setAllSchedules] = useState([])
  const [emps, setEmps] = useState([])
  const [punchMonth, setPunchMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [punches, setPunches] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageMode, setPageMode] = useState('schedule')

  const start = startOfMonth(month), end = endOfMonth(month)
  const days = eachDayOfInterval({ start, end })
  const yr = month.getFullYear(), mo = month.getMonth() + 1
  const restQuota = calcMonthRestDays(yr, mo)

  useEffect(() => { load() }, [month])
  useEffect(() => { loadPunches() }, [punchMonth])

  async function load() {
    setLoading(true)
    const s = format(start, 'yyyy-MM-dd'), e = format(end, 'yyyy-MM-dd')
    const [myR, allR, empR] = await Promise.all([
      supabase.from('schedules').select('*').eq('employee_id', user.employee_id).gte('date', s).lte('date', e).order('date'),
      supabase.from('schedules').select('*').gte('date', s).lte('date', e),
      supabase.from('employees').select('id, name').eq('enabled', true),
    ])
    setSchedules(myR.data || []); setAllSchedules(allR.data || [])
    setEmps((empR.data || []).filter(x => x.id !== 'ADMIN'))
    setLoading(false)
  }

  async function loadPunches() {
    const { data } = await supabase.from('punch_records').select('*').eq('employee_id', user.employee_id).gte('date', punchMonth + '-01').lte('date', format(endOfMonth(new Date(punchMonth + '-01')), 'yyyy-MM-dd')).order('date', { ascending: false }).order('time', { ascending: false })
    setPunches(data || [])
  }

  async function requestLeave(dateStr, leaveType) {
    const needsApproval = ['臨時請假','病假','事假','特休','調班']
    if (needsApproval.includes(leaveType)) {
      const existing = await supabase.from('leave_requests').select('id').eq('employee_id', user.employee_id).eq('date', dateStr).eq('status', '待審核').maybeSingle()
      if (existing?.data) { alert('該日已有待審核申請'); return }
      const { error } = await supabase.from('leave_requests').insert({
        employee_id: user.employee_id,
        employee_name: user.name,
        date: dateStr,
        leave_type: leaveType,
        original_shift: getMyShift(dateStr) || '',
        reason: leaveType === '調班' ? prompt('請輸入調班原因：') || '' : prompt('請輸入請假原因：') || '',
        status: '待審核'
      })
      if (error) { alert('申請失敗: ' + error.message); return }
      alert('已送出' + leaveType + '申請，等待老闆審核')
    } else {
      const existing = schedules.find(s => s.date === dateStr)
      if (existing) await supabase.from('schedules').update({ shift: leaveType }).eq('id', existing.id)
      else await supabase.from('schedules').insert({ date: dateStr, employee_id: user.employee_id, shift: leaveType })
    }
    load()
  }

  function getMyShift(ds) { return schedules.find(s => s.date === ds)?.shift || '' }
  const dc = schedules.filter(s => s.shift === '早班').length
  const nc = schedules.filter(s => s.shift === '晚班').length
  const oc = schedules.filter(s => LEAVE_TYPES.includes(s.shift) || s.shift === '休假').length
  const shiftColors = { '早班': 'var(--green)', '晚班': 'var(--blue)', '休假': 'var(--red)', '臨時請假': 'var(--red)', '病假': '#ffb347', '事假': '#ffd700', '特休': '#64c8ff', '調班': '#c896ff' }

  // Group punches by date
  const punchByDate = {}
  punches.forEach(p => { if (!punchByDate[p.date]) punchByDate[p.date] = []; punchByDate[p.date].push(p) })

  if (loading) return <div className="page-container"><div className="loading-shimmer" style={{ height: 300 }} /></div>

  return (
    <div className="fade-in">
      <div className="section-title">我的排班</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button style={nb} onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft size={18} /></button>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--gold)' }}>{format(month, 'yyyy年M月')}</span>
        <button style={nb} onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={18} /></button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <ST label="早班" value={dc} color="var(--green)" /><ST label="晚班" value={nc} color="var(--blue)" /><ST label="已休" value={oc + '/' + restQuota} color="var(--text)" />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>🔴 = 國定假日 · 點班別可申請休假</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 16 }}>
        {WEEKDAYS.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', padding: 4 }}>{w}</div>)}
        {Array.from({ length: getDay(start) }).map((_, i) => <div key={'p' + i} />)}
        {days.map(day => {
          const ds = format(day, 'yyyy-MM-dd'), shift = getMyShift(ds), td = isSameDay(day, new Date()), past = day < new Date() && !td
          const hol = isHoliday(ds), holName = getHolidayName(ds), color = shiftColors[shift] || 'var(--text-muted)', isWeekend = day.getDay() === 0 || day.getDay() === 6
          return (
            <div key={ds} style={{ padding: 3, textAlign: 'center', borderRadius: 8, background: td ? 'var(--gold-glow)' : hol ? 'rgba(196,77,77,.06)' : 'var(--black-card)', border: td ? '1px solid var(--border-gold)' : hol ? '1px solid rgba(196,77,77,.2)' : '1px solid var(--border)', opacity: past ? 0.4 : 1, minHeight: 52, display: 'flex', flexDirection: 'column', justifyContent: 'center', cursor: shift && !past && shift !== '休假' ? 'pointer' : 'default' }}
              onClick={() => {
                if (past || !shift || shift === '休假') return
                const choice = prompt(`${ds}${holName ? ' 🔴' + holName : ''}\n目前: ${shift}\n\n1=休假 2=臨時請假 3=病假 4=事假 5=特休 6=調班`)
                const map = { '1': '休假', '2': '臨時請假', '3': '病假', '4': '事假', '5': '特休', '6': '調班' }
                if (choice && map[choice]) requestLeave(ds, map[choice])
              }}>
              <div style={{ fontSize: 12, fontWeight: td ? 700 : 400, color: td ? 'var(--gold)' : isWeekend ? 'var(--red)' : 'var(--text)' }}>{format(day, 'd')}</div>
              {hol && <div style={{ fontSize: 7, color: 'var(--red)', fontWeight: 600, lineHeight: 1, marginTop: 1 }}>{holName.slice(0, 3)}</div>}
              {shift && <div style={{ fontSize: 8, fontWeight: 700, color, marginTop: 1 }}>{shift}</div>}
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', marginBottom: 8 }}>同事今日班別</div>
      {emps.filter(e => e.id !== user.employee_id).map(emp => {
        const ts = allSchedules.find(s => s.employee_id === emp.id && s.date === format(new Date(), 'yyyy-MM-dd'))?.shift
        return <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
          <span>{emp.name}</span><span style={{ color: shiftColors[ts] || 'var(--text-muted)', fontWeight: 600 }}>{ts || '未排'}</span>
        </div>
      })}

      {/* 打卡歷史 */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button style={nb} onClick={() => setPunchMonth(format(subMonths(new Date(punchMonth + '-01'), 1), 'yyyy-MM'))}><ChevronLeft size={16} /></button>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} /> {punchMonth} 打卡紀錄</span>
          <button style={nb} onClick={() => { const d = new Date(punchMonth + '-01'); d.setMonth(d.getMonth() + 1); setPunchMonth(format(d, 'yyyy-MM')) }}><ChevronRight size={16} /></button>
        </div>
        {Object.keys(punchByDate).length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)', fontSize: 13 }}>本月無打卡紀錄</div> :
          Object.entries(punchByDate).map(([date, recs]) => (
            <div key={date} className="card" style={{ padding: 12, marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', marginBottom: 6 }}>{date}</div>
              {recs.map(r => <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px dotted var(--border)' }}>
                <span>{r.punch_type} {toTaipei(r.time, true)}</span>
                <span style={{ color: r.is_valid ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{r.distance_m}m {r.is_valid ? '✓' : '✗'}</span>
              </div>)}
            </div>
          ))}
      </div>
    </div>
  )
}

function ST({ label, value, color }) {
  return <div className="card" style={{ flex: 1, padding: 8, textAlign: 'center', minWidth: 60 }}>
    <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{label}</div>
    <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', color, fontWeight: 600 }}>{value}</div>
  </div>
}
const nb = { background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }

const PREF_OPTIONS = [
  { value: '', label: '—', color: 'var(--text-muted)', bg: 'transparent' },
  { value: '早班', label: '早', color: '#3dd68c', bg: 'rgba(61,214,140,.15)' },
  { value: '晚班', label: '晚', color: '#4d8ac4', bg: 'rgba(77,138,196,.15)' },
  { value: '都可', label: '都可', color: 'var(--gold)', bg: 'var(--gold-glow)' },
  { value: '休假', label: '休', color: '#ff9a9a', bg: 'rgba(255,154,154,.15)' },
  { value: '不可', label: '✗', color: 'var(--red)', bg: 'rgba(196,77,77,.15)' },
]

function PreferenceContent() {
  const { user } = useAuth()
  const nextMonth = addMonths(new Date(), 1)
  const [month] = useState(nextMonth)
  const monthStr = format(month, 'yyyy-MM')
  const [prefs, setPrefs] = useState({})
  const [monthInfo, setMonthInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const start = startOfMonth(month), end = endOfMonth(month)
  const days = eachDayOfInterval({ start, end })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const s = format(start, 'yyyy-MM-dd'), e = format(end, 'yyyy-MM-dd')
    const [pR, mR] = await Promise.all([
      supabase.from('schedule_preferences').select('*').eq('employee_id', user.employee_id).gte('date', s).lte('date', e),
      supabase.from('schedule_months').select('*').eq('month', monthStr).maybeSingle(),
    ])
    const map = {}
    ;(pR.data || []).forEach(p => { map[p.date] = p.preference })
    setPrefs(map)
    setMonthInfo(mR.data || null)
    setLoading(false)
  }

  const status = monthInfo?.status || 'collecting'
  const locked = status === 'published' || status === 'draft'

  function cycle(ds) {
    if (locked) return
    const cur = prefs[ds] || ''
    const idx = PREF_OPTIONS.findIndex(o => o.value === cur)
    const next = PREF_OPTIONS[(idx + 1) % PREF_OPTIONS.length].value
    setPrefs({ ...prefs, [ds]: next })
  }

  async function saveDraft() {
    setSaving(true)
    const rows = Object.entries(prefs).filter(([_, v]) => v).map(([date, preference]) => ({
      employee_id: user.employee_id, employee_name: user.name, date, preference, month: monthStr, submitted: false,
    }))
    await supabase.from('schedule_preferences').delete().eq('employee_id', user.employee_id).gte('date', format(start, 'yyyy-MM-dd')).lte('date', format(end, 'yyyy-MM-dd'))
    if (rows.length) await supabase.from('schedule_preferences').insert(rows)
    setSaving(false)
    alert('已暫存')
  }

  async function submit() {
    if (!confirm('提交後將鎖定，確定？')) return
    setSaving(true)
    const rows = Object.entries(prefs).filter(([_, v]) => v).map(([date, preference]) => ({
      employee_id: user.employee_id, employee_name: user.name, date, preference, month: monthStr, submitted: true,
    }))
    await supabase.from('schedule_preferences').delete().eq('employee_id', user.employee_id).gte('date', format(start, 'yyyy-MM-dd')).lte('date', format(end, 'yyyy-MM-dd'))
    if (rows.length) await supabase.from('schedule_preferences').insert(rows)
    setSaving(false)
    alert('已提交，老闆會根據你的意願排班')
    load()
  }

  if (loading) return <div className="loading-shimmer" style={{ height: 300 }} />

  const filled = Object.values(prefs).filter(Boolean).length
  const total = days.length
  const pct = Math.round(filled * 100 / total)

  return (
    <div className="fade-in">
      <div className="section-title">📝 填寫希望班表</div>
      <div style={{ fontSize: 13, color: 'var(--gold)', textAlign: 'center', marginBottom: 6, fontWeight: 600 }}>{format(month, 'yyyy年M月')}</div>

      {status === 'published' && (
        <div style={{ padding: 10, marginBottom: 10, borderRadius: 10, background: 'var(--gold-glow)', border: '1px solid var(--border-gold)', fontSize: 12, color: 'var(--gold)', textAlign: 'center', fontWeight: 600 }}>
          ✅ 此月已發布正式排班，請以正式排班為準
        </div>
      )}
      {status === 'draft' && (
        <div style={{ padding: 10, marginBottom: 10, borderRadius: 10, background: 'rgba(196,77,77,.06)', border: '1px solid rgba(196,77,77,.2)', fontSize: 12, color: 'var(--red)', textAlign: 'center' }}>
          🔒 老闆排班中，已鎖定無法修改
        </div>
      )}

      <div className="card" style={{ padding: 10, marginBottom: 10, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
        <div><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>已填</div><div style={{ fontSize: 18, color: 'var(--gold)', fontWeight: 700 }}>{filled}</div></div>
        <div><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>總天數</div><div style={{ fontSize: 18, color: 'var(--text)', fontWeight: 700 }}>{total}</div></div>
        <div><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>進度</div><div style={{ fontSize: 18, color: pct === 100 ? 'var(--green)' : 'var(--gold)', fontWeight: 700 }}>{pct}%</div></div>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'center' }}>
        點日期循環：早 → 晚 → 都可 → 休 → ✗ → 清除
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 14 }}>
        {WEEKDAYS.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', padding: 4 }}>{w}</div>)}
        {Array.from({ length: getDay(start) }).map((_, i) => <div key={'p' + i} />)}
        {days.map(day => {
          const ds = format(day, 'yyyy-MM-dd')
          const pref = prefs[ds] || ''
          const opt = PREF_OPTIONS.find(o => o.value === pref) || PREF_OPTIONS[0]
          const hol = isHoliday(ds)
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          return (
            <div key={ds} onClick={() => cycle(ds)} style={{
              padding: 4, textAlign: 'center', borderRadius: 8,
              background: pref ? opt.bg : (hol ? 'rgba(196,77,77,.06)' : 'var(--black-card)'),
              border: '1px solid ' + (pref ? opt.color : 'var(--border)'),
              minHeight: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center',
              cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.6 : 1,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: isWeekend || hol ? 'var(--red)' : 'var(--text)' }}>{format(day, 'd')}</div>
              {pref && <div style={{ fontSize: 11, fontWeight: 700, color: opt.color, marginTop: 2 }}>{opt.label}</div>}
            </div>
          )
        })}
      </div>

      {!locked && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={saveDraft} disabled={saving} className="btn-outline" style={{ flex: 1, padding: 12, fontSize: 13 }}>
            {saving ? '儲存中...' : '💾 暫存'}
          </button>
          <button onClick={submit} disabled={saving} style={{ flex: 1, padding: 12, fontSize: 13, fontWeight: 700, background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
            {saving ? '送出中...' : '✅ 提交（鎖定）'}
          </button>
        </div>
      )}
    </div>
  )
}


export default function StaffSchedule() {
  const [pageMode, setPageMode] = useState('schedule')
  const tabs = [{ id: 'schedule', l: '排班表' }, { id: 'preference', l: '📝 填寫希望' }, { id: 'leave', l: '請假' }]
  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setPageMode(t.id)} style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: pageMode === t.id ? 'var(--gold-glow)' : 'transparent', color: pageMode === t.id ? 'var(--gold)' : 'var(--text-dim)', border: pageMode === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{t.l}</button>
        ))}
      </div>
      {pageMode === 'leave' ? <LeaveRequest /> : pageMode === 'preference' ? <PreferenceContent /> : <ScheduleContent />}
    </div>
  )
}
