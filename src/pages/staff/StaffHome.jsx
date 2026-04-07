import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { SHIFTS } from '../../lib/constants'
import { Clock, CheckCircle2, Circle, AlertCircle, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function StaffHome() {
  const { user } = useAuth()
  const [todayShift, setTodayShift] = useState(null)
  const [tasks, setTasks] = useState([])
  const [punchStatus, setPunchStatus] = useState(null)
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [schedRes, taskRes, punchRes, noticeRes] = await Promise.all([
        supabase.from('schedules').select('*').eq('employee_id', user.employee_id).eq('date', today).maybeSingle(),
        supabase.from('task_status').select('*').eq('employee_id', user.employee_id).eq('date', today).order('task_order'),
        supabase.from('punch_records').select('*').eq('employee_id', user.employee_id).eq('date', today).maybeSingle(),
        supabase.from('notices').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(3),
      ])
      setTodayShift(schedRes.data)
      setTasks(taskRes.data || [])
      setPunchStatus(punchRes.data)
      setNotices(noticeRes.data || [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  async function handlePunch(type) {
    const now = new Date()
    // GPS check
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords
        const dist = getDistance(latitude, longitude, 25.0269184, 121.5419774)
        if (dist > 100) {
          alert(`距離店面 ${Math.round(dist)}m，超出打卡範圍 (100m)`)
          return
        }
        const update = type === 'in'
          ? { clock_in: now.toISOString(), clock_in_lat: latitude, clock_in_lng: longitude }
          : { clock_out: now.toISOString(), clock_out_lat: latitude, clock_out_lng: longitude }

        if (punchStatus?.id) {
          await supabase.from('punch_records').update(update).eq('id', punchStatus.id)
        } else {
          await supabase.from('punch_records').insert({
            employee_id: user.employee_id, date: today, ...update
          })
        }
        loadData()
      }, () => alert('請開啟 GPS 定位'))
    }
  }

  function getDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  }

  const shiftInfo = todayShift?.shift_type ? SHIFTS[todayShift.shift_type] : null
  const completedTasks = tasks.filter(t => t.status === 'done').length
  const totalTasks = tasks.length

  if (loading) return <div className="page-container"><div className="loading-shimmer" style={{height:120,marginBottom:12}}/><div className="loading-shimmer" style={{height:80,marginBottom:12}}/><div className="loading-shimmer" style={{height:80}}/></div>

  return (
    <div className="page-container fade-in">
      {/* Greeting */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', fontWeight: 600 }}>
          {getGreeting()}，{user.name || user.employee_id}
        </h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>
          {format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhTW })}
        </p>
      </div>

      {/* Today's Shift Card */}
      <div className="card" style={{ marginBottom: 16, borderColor: 'var(--border-gold)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} color="var(--gold)" />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)' }}>今日班別</span>
          </div>
          {todayShift?.shift_type && (
            <span className={`badge ${todayShift.shift_type === '休假' ? 'badge-blue' : 'badge-gold'}`}>
              {todayShift.shift_type}
            </span>
          )}
        </div>
        {shiftInfo?.start ? (
          <div style={{ fontSize: 28, fontFamily: 'var(--font-mono)', color: 'var(--text)', fontWeight: 500 }}>
            {shiftInfo.start} — {shiftInfo.end}
          </div>
        ) : todayShift?.shift_type === '休假' ? (
          <div style={{ fontSize: 16, color: 'var(--blue)' }}>今日休假 🎉</div>
        ) : (
          <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>尚未排班</div>
        )}

        {/* Punch buttons */}
        {shiftInfo?.start && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              className="btn-gold"
              style={{ flex: 1, opacity: punchStatus?.clock_in ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => handlePunch('in')}
              disabled={!!punchStatus?.clock_in}
            >
              <MapPin size={14} />
              {punchStatus?.clock_in ? `已上班 ${format(new Date(punchStatus.clock_in), 'HH:mm')}` : '上班打卡'}
            </button>
            <button
              className="btn-outline"
              style={{ flex: 1, opacity: !punchStatus?.clock_in || punchStatus?.clock_out ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => handlePunch('out')}
              disabled={!punchStatus?.clock_in || !!punchStatus?.clock_out}
            >
              <MapPin size={14} />
              {punchStatus?.clock_out ? `已下班 ${format(new Date(punchStatus.clock_out), 'HH:mm')}` : '下班打卡'}
            </button>
          </div>
        )}
      </div>

      {/* SOP Progress */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>今日 SOP 進度</span>
          <span style={{ fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>
            {completedTasks}/{totalTasks}
          </span>
        </div>
        {/* Progress bar */}
        <div style={{ height: 6, background: 'var(--black)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: totalTasks ? `${(completedTasks/totalTasks)*100}%` : '0%',
            background: 'linear-gradient(90deg, var(--gold-dim), var(--gold))',
            transition: 'width 0.5s ease',
          }} />
        </div>
        {tasks.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>今日無 SOP 任務</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasks.slice(0, 5).map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                {t.status === 'done' ? <CheckCircle2 size={16} color="var(--green)" /> : <Circle size={16} color="var(--text-muted)" />}
                <span style={{ color: t.status === 'done' ? 'var(--text-dim)' : 'var(--text)', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>
                  {t.task_name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notices */}
      {notices.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <AlertCircle size={16} color="var(--gold)" />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>公告</span>
          </div>
          {notices.map(n => (
            <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <div style={{ color: 'var(--text)', marginBottom: 2 }}>{n.title}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{n.content?.slice(0, 60)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return '早安'
  if (h < 18) return '午安'
  return '晚安'
}
