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

const LEAVE_MENU = [
  { key: '休假', label: '休假', color: 'var(--red)' },
  { key: '臨時請假', label: '臨時請假', color: 'var(--red)' },
  { key: '病假', label: '病假', color: '#ffb347' },
  { key: '事假', label: '事假', color: '#ffd700' },
  { key: '特休', label: '特休', color: '#64c8ff' },
  { key: '調班', label: '調班', color: '#c896ff' },
]

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
  const [leaveMenu, setLeaveMenu] = useState(null)
  const [reasonInput, setReasonInput] = useState({ show: false, ds: '', type: '', text: '' })

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
    const needsApproval = ['臨時請假','病假','事假','特休','調班','申請上班']
    if (needsApproval.includes(leaveType)) {
      const existing = await supabase.from('leave_requests').select('id').eq('employee_id', user.employee_id).eq('date', dateStr).eq('status', '待審核').maybeSingle()
      if (existing?.data) { alert('該日已有待審核申請'); return }
      const { error } = await supabase.from('leave_requests').insert({
        employee_id: user.employee_id,
        employee_name: user.name,
        date: dateStr,
        leave_type: leaveType,
        original_shift: getMyShift(dateStr) || '',
        reason: reasonInput.text || '',
        status: '待審核'
      })
      if (error) { alert('申請失敗: ' + error.message); return }
      alert('已送出' + leaveType + '申請，等待老闆審核')
    } else {
      const existing = schedules.find(s => s.date === dateStr)
      if (existing) {
        if (existing.shift === leaveType) return
        await supabase.from('schedules').update({ shift: leaveType }).eq('id', existing.id)
      } else {
        await supabase.from('schedules').insert({ date: dateStr, employee_id: user.employee_id, shift: leaveType })
      }
    }
    load()
  }

  function getMyShift(ds) { return schedules.find(s => s.date === ds)?.shift || '' }
  const dc = schedules.filter(s => s.shift === '早班').length
  const nc = schedules.filter(s => s.shift === '晚班').length
  const oc = schedules.filter(s => LEAVE_TYPES.includes(s.shift) || s.shift === '休假').length
  const shiftColors = { '早班': 'var(--green)', '晚班': 'var(--blue)', '休假': 'var(--red)', '臨時請假': 'var(--red)', '病假': '#ffb347', '事假': '#ffd700', '特休': '#64c8ff', '調班': '#c896ff' }

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
            <div key={ds} style={{ padding: 3, textAlign: 'center', borderRadius: 8, background: td ? 'var(--gold-glow)' : hol ? 'rgba(196,77,77,.06)' : 'var(--black-card)', border: td ? '1px solid var(--border-gold)' : hol ? '1px solid rgba(196,77,77,.2)' : '1px solid var(--border)', opacity: past ? 0.4 : 1, minHeight: 52, display: 'flex', flexDirection: 'column', justifyContent: 'center', cursor: !past && shift ? 'pointer' : 'default' }}
              onClick={() => {
                if (past || !shift) return
                setLeaveMenu({ ds, shift, holName, isOff: shift === '休假' })
              }}>
              <div style={{ fontSize: 12, fontWeight: td ? 700 : 400, color: td ? 'var(--gold)' : isWeekend ? 'var(--red)' : 'var(--text)' }}>{format(day, 'd')}</div>
              {hol && <div style={{ fontSize: 7, color: 'var(--red)', fontWeight: 600, lineHeight: 1, marginTop: 1 }}>{holName.slice(0, 3)}</div>}
              {shift && <div style={{ fontSize: 8, fontWeight: 700, color, marginTop: 1 }}>{shift}</div>}
            </div>
          )
        })}
      </div>

      {leaveMenu && !reasonInput.show && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.7)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setLeaveMenu(null)}>
          <div style={{ width: '100%', maxWidth: 400, background: 'var(--black-card)', borderRadius: '16px 16px 0 0', padding: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 4 }}>{leaveMenu.ds}</div>
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>目前：{leaveMenu.shift}{leaveMenu.holName ? ' 🔴' + leaveMenu.holName : ''}</div>
            {leaveMenu.isOff && (<button onClick={() => { setReasonInput({ show: true, ds: leaveMenu.ds, type: '申請上班', text: '' }) }} style={{ width: '100%', padding: '14px 0', fontSize: 15, fontWeight: 700, borderRadius: 10, border: '1px solid var(--green)', background: 'rgba(77,168,108,.12)', color: 'var(--green)', cursor: 'pointer', marginBottom: 10 }}>💪 申請上班</button>)}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {LEAVE_MENU.filter(opt => !leaveMenu.isOff || opt.key !== '休假').map(opt => {
                const needsReason = ['臨時請假','病假','事假','特休','調班'].includes(opt.key)
                return (<button key={opt.key} onClick={() => { if (needsReason) { setReasonInput({ show: true, ds: leaveMenu.ds, type: opt.key, text: '' }) } else { requestLeave(leaveMenu.ds, opt.key); setLeaveMenu(null) } }} style={{ padding: '14px 0', fontSize: 14, fontWeight: 600, borderRadius: 10, border: '1px solid ' + opt.color + '40', background: opt.color + '15', color: opt.color, cursor: 'pointer' }}>{opt.label}</button>)
              })}
            </div>
            <button onClick={() => setLeaveMenu(null)} style={{ width: '100%', marginTop: 10, padding: 12, fontSize: 14, fontWeight: 600, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--black)', color: 'var(--text-muted)', cursor: 'pointer' }}>取消</button>
          </div>
        </div>
      )}

      {reasonInput.show && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => { setReasonInput({ show: false, ds: '', type: '', text: '' }); setLeaveMenu(null) }}>
          <div style={{ width: '100%', maxWidth: 360, background: 'var(--black-card)', borderRadius: 16, padding: 20 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gold)', marginBottom: 4, textAlign: 'center' }}>{reasonInput.type}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, textAlign: 'center' }}>{reasonInput.ds}</div>
            <textarea autoFocus value={reasonInput.text} onChange={e => setReasonInput(prev => ({ ...prev, text: e.target.value }))} placeholder={reasonInput.type === '調班' ? '請輸入調班原因…' : '請輸入請假原因…'} rows={3} style={{ width: '100%', fontSize: 14, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--black)', color: 'var(--text)', resize: 'none', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => { setReasonInput({ show: false, ds: '', type: '', text: '' }); setLeaveMenu(null) }} style={{ flex: 1, padding: 12, fontSize: 14, fontWeight: 600, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--black)', color: 'var(--text-muted)', cursor: 'pointer' }}>取消</button>
              <button onClick={() => { requestLeave(reasonInput.ds, reasonInput.type); setReasonInput({ show: false, ds: '', type: '', text: '' }); setLeaveMenu(null) }} style={{ flex: 1, padding: 12, fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', background: 'var(--gold)', color: 'var(--black)', cursor: 'pointer' }}>送出申請</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', marginBottom: 8 }}>同事今日班別</div>
      {emps.filter(e => e.id !== user.employee_id).map(emp => {
        const ts = allSchedules.find(s => s.employee_id === emp.id && s.date === format(new Date(), 'yyyy-MM-dd'))?.shift
        return <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
          <span>{emp.name}</span><span style={{ color: shiftColors[ts] || 'var(--text-muted)', fontWeight: 600 }}>{ts || '未排'}</span>
        </div>
      })}

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
  const [month, setMonth] = useState(addMonths(new Date(), 1))
  const monthStr = format(month, 'yyyy-MM')
  const [prefs, setPrefs] = useState({})
  const [monthInfo, setMonthInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const start = startOfMonth(month), end = endOfMonth(month)
  const days = eachDayOfInterval({ start, end })

  useEffect(() => { load() }, [month])

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
        <button onClick={() => setMonth(subMonths(month, 1))} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text)', cursor: 'pointer' }}><ChevronLeft size={14} /></button>
        <div style={{ fontSize: 16, color: 'var(--gold)', fontWeight: 700, minWidth: 110, textAlign: 'center' }}>{format(month, 'yyyy年M月')}</div>
        <button onClick={() => setMonth(addMonths(month, 1))} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text)', cursor: 'pointer' }}><ChevronRight size={14} /></button>
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10 }}>
        <button onClick={() => setMonth(new Date())} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 14, background: format(month, 'yyyy-MM') === format(new Date(), 'yyyy-MM') ? 'var(--gold)' : 'rgba(255,255,255,0.05)', color: format(month, 'yyyy-MM') === format(new Date(), 'yyyy-MM') ? '#000' : 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600 }}>本月</button>
        <button onClick={() => setMonth(addMonths(new Date(), 1))} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 14, background: format(month, 'yyyy-MM') === format(addMonths(new Date(), 1), 'yyyy-MM') ? 'var(--gold)' : 'rgba(255,255,255,0.05)', color: format(month, 'yyyy-MM') === format(addMonths(new Date(), 1), 'yyyy-MM') ? '#000' : 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600 }}>下月</button>
      </div>
      {status === 'published' && (<div style={{ padding: 10, marginBottom: 10, borderRadius: 10, background: 'var(--gold-glow)', border: '1px solid var(--border-gold)', fontSize: 12, color: 'var(--gold)', textAlign: 'center', fontWeight: 600 }}>✅ 此月已發布正式排班，請以正式排班為準</div>)}
      {status === 'draft' && (<div style={{ padding: 10, marginBottom: 10, borderRadius: 10, background: 'rgba(196,77,77,.06)', border: '1px solid rgba(196,77,77,.2)', fontSize: 12, color: 'var(--red)', textAlign: 'center' }}>🔒 老闆排班中，已鎖定無法修改</div>)}
      <div className="card" style={{ padding: 10, marginBottom: 10, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
        <div><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>已填</div><div style={{ fontSize: 18, color: 'var(--gold)', fontWeight: 700 }}>{filled}</div></div>
        <div><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>總天數</div><div style={{ fontSize: 18, color: 'var(--text)', fontWeight: 700 }}>{total}</div></div>
        <div><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>進度</div><div style={{ fontSize: 18, color: pct === 100 ? 'var(--green)' : 'var(--gold)', fontWeight: 700 }}>{pct}%</div></div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'center' }}>點日期循環：早 → 晚 → 都可 → 休 → ✗ → 清除</div>
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
            <div key={ds} onClick={() => cycle(ds)} style={{ padding: 4, textAlign: 'center', borderRadius: 8, background: pref ? opt.bg : (hol ? 'rgba(196,77,77,.06)' : 'var(--black-card)'), border: '1px solid ' + (pref ? opt.color : 'var(--border)'), minHeight: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center', cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.6 : 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: isWeekend || hol ? 'var(--red)' : 'var(--text)' }}>{format(day, 'd')}</div>
              {pref && <div style={{ fontSize: 11, fontWeight: 700, color: opt.color, marginTop: 2 }}>{opt.label}</div>}
            </div>
          )
        })}
      </div>
      {!locked && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={saveDraft} disabled={saving} className="btn-outline" style={{ flex: 1, padding: 12, fontSize: 13 }}>{saving ? '儲存中...' : '💾 暫存'}</button>
          <button onClick={submit} disabled={saving} style={{ flex: 1, padding: 12, fontSize: 13, fontWeight: 700, background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: 10, cursor: 'pointer' }}>{saving ? '送出中...' : '✅ 提交（鎖定）'}</button>
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
