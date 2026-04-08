import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { SHIFTS } from '../../lib/constants'
import { Clock, CheckCircle2, Circle, AlertCircle, MapPin, AlertTriangle, Trophy } from 'lucide-react'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import AbnormalReport from '../../components/AbnormalReport'
import { markNoticesRead } from '../../lib/noticeUtils'

export default function StaffHome() {
  const { user } = useAuth()
  const [shift, setShift] = useState(null)
  const [tasks, setTasks] = useState([])
  const [punch, setPunch] = useState(null)
  const [notices, setNotices] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [showAbnormal, setShowAbnormal] = useState(false)
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = format(new Date(), 'yyyy-MM')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [sRes, tRes, pRes, nRes, lbRes] = await Promise.all([
      supabase.from('schedules').select('*').eq('employee_id', user.employee_id).eq('date', today).maybeSingle(),
      supabase.from('task_status').select('*').eq('owner', user.employee_id).eq('date', today).order('task_id'),
      supabase.from('punch_records').select('*').eq('employee_id', user.employee_id).eq('date', today).order('time', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('notices').select('*').eq('enabled', true).order('created_at', { ascending: false }).limit(3),
      supabase.from('task_status').select('completed_by').eq('owner', 'ALL').eq('completed', true).gte('date', month + '-01').lte('date', month + '-31'),
    ])
    setShift(sRes.data); setTasks(tRes.data || []); setPunch(pRes.data); setNotices(nRes.data || [])
    const counts = {}
    ;(lbRes.data || []).forEach(r => { if (r.completed_by) counts[r.completed_by] = (counts[r.completed_by] || 0) + 1 })
    setLeaderboard(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
    setLoading(false)
  }

  async function handlePunch(type) {
    if (!navigator.geolocation) return alert('請開啟定位')
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords
      const R = 6371000, dLat = (25.0269184 - lat) * Math.PI / 180, dLng = (121.5419774 - lng) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(25.0269184 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      const valid = dist <= 100
      await supabase.from('punch_records').insert({ date: today, employee_id: user.employee_id, name: user.name, punch_type: type, lat, lng, distance_m: Math.round(dist), is_valid: valid })
      alert(valid ? `${type}打卡成功！距離 ${Math.round(dist)}m` : `距離店面 ${Math.round(dist)}m，超出範圍`)
      load()
    }, () => alert('請開啟GPS'))
  }

  const shiftName = shift?.shift
  const shiftInfo = shiftName ? SHIFTS[shiftName] : null
  const done = tasks.filter(t => t.completed).length
  const h = new Date().getHours()
  const greeting = h < 12 ? '早安' : h < 18 ? '午安' : '晚安'
  const myGrabs = leaderboard.find(x => x.name === user.name)?.count || 0

  if (loading) return <div className="page-container"><div className="loading-shimmer" style={{ height: 120, marginBottom: 12 }} /><div className="loading-shimmer" style={{ height: 80 }} /></div>

  return (
    <div className="page-container fade-in">
      <AbnormalReport show={showAbnormal} onClose={() => setShowAbnormal(false)} />

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', fontWeight: 600 }}>{greeting}，{user.name}</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhTW })}</p>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>SOP 進度</div>
          <div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 600, color: done >= tasks.length && tasks.length > 0 ? 'var(--green)' : 'var(--gold)', marginTop: 4 }}>{done}/{tasks.length}</div>
        </div>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>本月搶單</div>
          <div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)', marginTop: 4 }}>{myGrabs} 單</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, borderColor: 'var(--border-gold)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={16} color="var(--gold)" /><span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)' }}>今日班別</span></div>
          {shiftName && <span className={`badge ${shiftName === '休假' || shiftName === '臨時請假' ? 'badge-blue' : 'badge-gold'}`}>{shiftName}</span>}
        </div>
        {shiftInfo?.start ? (
          <div style={{ fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{shiftInfo.start} — {shiftInfo.end}</div>
        ) : shiftName ? (
          <div style={{ fontSize: 16, color: 'var(--blue)' }}>今日{shiftName}</div>
        ) : <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>尚未排班</div>}
        {shiftInfo?.start && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn-gold" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => handlePunch('上班')}><MapPin size={14} />上班打卡</button>
            <button className="btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => handlePunch('下班')}><MapPin size={14} />下班打卡</button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>今日 SOP</span>
          <span style={{ fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{done}/{tasks.length}</span>
        </div>
        <div style={{ height: 6, background: 'var(--black)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ height: '100%', borderRadius: 3, width: tasks.length ? (done / tasks.length * 100) + '%' : '0%', background: 'linear-gradient(90deg,var(--gold-dim),var(--gold))', transition: 'width .5s' }} />
        </div>
        {tasks.slice(0, 5).map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0' }}>
            {t.completed ? <CheckCircle2 size={14} color="var(--green)" /> : <Circle size={14} color="var(--text-muted)" />}
            <span style={{ color: t.completed ? 'var(--text-dim)' : 'var(--text)' }}>{t.title}</span>
          </div>
        ))}
      </div>

      <button style={{ width: '100%', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, background: 'rgba(196,77,77,.1)', border: '1px solid rgba(196,77,77,.25)', borderRadius: 'var(--radius-sm)', color: 'var(--red)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }} onClick={() => setShowAbnormal(true)}>
        <AlertTriangle size={18} /> 🚨 突發異常回報
      </button>

      {leaderboard.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Trophy size={16} color="var(--gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>搶單排行榜</span></div>
          {leaderboard.slice(0, 5).map((x, i) => (
            <div key={x.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
              <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {x.name}</span>
              <strong style={{ color: 'var(--gold)' }}>{x.count} 單</strong>
            </div>
          ))}
        </div>
      )}

      {notices.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><AlertCircle size={16} color="var(--gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>公告</span></div>
          {notices.map(n => <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{n.content}<div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{n.publisher}</div></div>)}
        </div>
      )}
    </div>
  )
}
