import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { MapPin, Clock, Camera, CheckCircle2, AlertTriangle } from 'lucide-react'

export default function AmbassadorPunch({ user }) {
  const [venues, setVenues] = useState([])
  const [selectedVenue, setSelectedVenue] = useState(null)
  const [location, setLocation] = useState(null)
  const [locError, setLocError] = useState('')
  const [loading, setLoading] = useState(false)
  const [attendance, setAttendance] = useState([])
  const [msg, setMsg] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data } = await supabase.rpc('ambassador_get_home', { p_ambassador_id: user.id })
    if (data) {
      setVenues(data.venues || [])
      setAttendance(data.today_attendance || [])
      if (data.venues?.length === 1) setSelectedVenue(data.venues[0])
    }
  }

  function getLocation() {
    setLocError('')
    if (!navigator.geolocation) { setLocError('此裝置不支援 GPS'); return }
    navigator.geolocation.getCurrentPosition(
      pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      err => setLocError('無法取得位置: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  useEffect(() => { getLocation() }, [])

  const clockedIn = attendance.some(a => a.type === 'clock_in')
  const clockedOut = attendance.some(a => a.type === 'clock_out')

  async function handlePunch(type) {
    if (!selectedVenue) { setMsg('請選擇駐點'); return }
    if (!location) { setMsg('請先取得 GPS 位置'); getLocation(); return }
    setLoading(true)
    setMsg('')
    const { data, error } = await supabase.rpc('ambassador_punch', {
      p_ambassador_id: user.id,
      p_venue_id: selectedVenue.id,
      p_type: type,
      p_lat: location.lat,
      p_lng: location.lng,
      p_photo_url: null
    })
    setLoading(false)
    if (error) { setMsg('打卡失敗: ' + error.message); return }
    if (data?.success === false) { setMsg(data.error || '打卡失敗'); return }
    setMsg(type === 'clock_in' ? '上班打卡成功！' : '下班打卡成功！')
    loadData()
  }

  const cardStyle = { background: '#1a1714', border: '1px solid #2a2520', borderRadius: 10, padding: 16, marginBottom: 12 }
  const btnBase = { padding: '14px 20px', borderRadius: 10, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }

  return (
    <div style={{ padding: 20, color: '#e8dcc8', maxWidth: 500, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#c9a84c', marginTop: 0, marginBottom: 16 }}>GPS 打卡</h2>

      {/* GPS 狀態 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, color: '#8a8278', marginBottom: 8 }}>GPS 定位</div>
        {location ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4caf50', fontSize: 13 }}>
            <MapPin size={14} /> 已定位 (精度: {Math.round(location.acc)}m)
          </div>
        ) : locError ? (
          <div style={{ color: '#e74c3c', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} /> {locError}
            <button onClick={getLocation} style={{ marginLeft: 8, padding: '4px 10px', background: '#c9a84c', border: 'none', borderRadius: 4, color: '#0a0a0a', fontSize: 11, cursor: 'pointer' }}>重試</button>
          </div>
        ) : (
          <div style={{ color: '#ff9800', fontSize: 13 }}>定位中...</div>
        )}
      </div>

      {/* 駐點選擇 */}
      {venues.length > 1 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, color: '#8a8278', marginBottom: 8 }}>選擇駐點</div>
          {venues.map(v => (
            <button key={v.id} onClick={() => setSelectedVenue(v)} style={{ display: 'block', width: '100%', padding: '10px 12px', marginBottom: 6, background: selectedVenue?.id === v.id ? '#c9a84c22' : 'transparent', border: '1px solid ' + (selectedVenue?.id === v.id ? '#c9a84c' : '#2a2520'), borderRadius: 8, color: selectedVenue?.id === v.id ? '#c9a84c' : '#e8dcc8', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
              {v.name}
            </button>
          ))}
        </div>
      )}

      {selectedVenue && (
        <div style={{ ...cardStyle, borderColor: '#c9a84c33' }}>
          <div style={{ fontSize: 12, color: '#8a8278' }}>目前駐點</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#c9a84c', marginTop: 4 }}>{selectedVenue.name}</div>
          <div style={{ fontSize: 11, color: '#5a554e', marginTop: 2 }}>{selectedVenue.address}</div>
        </div>
      )}

      {/* 打卡按鈕 */}
      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, background: msg.includes('成功') ? '#4caf5022' : '#e74c3c22', color: msg.includes('成功') ? '#4caf50' : '#e74c3c', border: '1px solid ' + (msg.includes('成功') ? '#4caf5044' : '#e74c3c44') }}>
          {msg}
        </div>
      )}

      {!clockedIn ? (
        <button onClick={() => handlePunch('clock_in')} disabled={loading || !location} style={{ ...btnBase, background: '#4caf50', color: '#fff', opacity: (loading || !location) ? 0.5 : 1 }}>
          <Clock size={20} /> {loading ? '打卡中...' : '上班打卡'}
        </button>
      ) : !clockedOut ? (
        <button onClick={() => handlePunch('clock_out')} disabled={loading || !location} style={{ ...btnBase, background: '#e74c3c', color: '#fff', opacity: (loading || !location) ? 0.5 : 1 }}>
          <Clock size={20} /> {loading ? '打卡中...' : '下班打卡'}
        </button>
      ) : (
        <div style={{ ...cardStyle, textAlign: 'center', borderColor: '#4caf5044' }}>
          <CheckCircle2 size={32} color="#4caf50" style={{ marginBottom: 8 }} />
          <div style={{ color: '#4caf50', fontWeight: 600 }}>今日已完成打卡</div>
        </div>
      )}

      {/* 今日紀錄 */}
      {attendance.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: '#8a8278', marginBottom: 8 }}>今日紀錄</div>
          {attendance.map((a, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1714', fontSize: 13 }}>
              <span style={{ color: a.type === 'clock_in' ? '#4caf50' : '#e74c3c' }}>{a.type === 'clock_in' ? '上班' : '下班'}</span>
              <span style={{ color: '#8a8278' }}>{new Date(a.punch_time || a.created_at).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
