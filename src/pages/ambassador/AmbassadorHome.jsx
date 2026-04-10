import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { MapPin, Trophy, Package, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'

export default function AmbassadorHome({ user }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: d } = await supabase.rpc('ambassador_get_home', { p_ambassador_id: user.id })
    if (d) setData(d)
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8278' }}>載入中...</div>
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#e74c3c' }}>載入失敗</div>

  const { today_attendance, leaderboard_qty, leaderboard_revenue, venues, my_rank_qty, my_rank_revenue } = data
  const clockIn = today_attendance?.find(a => a.type === 'clock_in')
  const clockOut = today_attendance?.find(a => a.type === 'clock_out')

  const cardStyle = { background: '#1a1714', border: '1px solid #2a2520', borderRadius: 10, padding: 14, marginBottom: 10 }
  const secTitle = (icon, text, color) => <div style={{ fontSize: 14, fontWeight: 600, color: color || '#c9a84c', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>{icon} {text}</div>

  return (
    <div style={{ padding: 20, color: '#e8dcc8', maxWidth: 500, margin: '0 auto' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#c9a84c', marginBottom: 4, marginTop: 0 }}>歡迎，{user.name}</h2>
      <p style={{ color: '#8a8278', fontSize: 13, marginBottom: 20, marginTop: 0 }}>{new Date().toLocaleDateString('zh-TW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

      {/* 今日打卡 */}
      {secTitle(<Clock size={16} />, '今日打卡')}
      <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-around' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#8a8278', marginBottom: 4 }}>上班</div>
          {clockIn ? (
            <div style={{ color: '#4caf50', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
              <CheckCircle2 size={14} /> {new Date(clockIn.punch_time || clockIn.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
            </div>
          ) : (
            <div style={{ color: '#ff9800', fontSize: 13 }}>未打卡</div>
          )}
        </div>
        <div style={{ width: 1, background: '#2a2520' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#8a8278', marginBottom: 4 }}>下班</div>
          {clockOut ? (
            <div style={{ color: '#4caf50', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
              <CheckCircle2 size={14} /> {new Date(clockOut.punch_time || clockOut.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
            </div>
          ) : (
            <div style={{ color: clockIn ? '#ff9800' : '#5a554e', fontSize: 13 }}>{clockIn ? '待打卡' : '—'}</div>
          )}
        </div>
      </div>

      {/* 我的排名 */}
      {(my_rank_qty || my_rank_revenue) && (
        <>
          {secTitle(<Trophy size={16} />, '我的排名')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: 11, color: '#8a8278' }}>銷量排名</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#c9a84c' }}>#{my_rank_qty || '—'}</div>
            </div>
            <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: 11, color: '#8a8278' }}>營收排名</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#c9a84c' }}>#{my_rank_revenue || '—'}</div>
            </div>
          </div>
        </>
      )}

      {/* 排行榜 */}
      {secTitle(<Trophy size={16} />, '本月排行榜')}
      {leaderboard_qty?.length > 0 ? (
        <div style={cardStyle}>
          {leaderboard_qty.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < leaderboard_qty.length - 1 ? '1px solid #2a2520' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: i < 3 ? ['#c9a84c', '#a0a0a0', '#cd7f32'][i] : '#2a2520', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: i < 3 ? '#0a0a0a' : '#8a8278' }}>{i + 1}</span>
                <span style={{ fontSize: 13, color: item.ambassador_id === user.id ? '#c9a84c' : '#e8dcc8', fontWeight: item.ambassador_id === user.id ? 700 : 400 }}>{item.ambassador_name || item.ambassador_id}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#c9a84c' }}>{item.total_qty || 0} 支</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#5a554e', fontSize: 13 }}>本月尚無銷售紀錄</div>
      )}

      {/* 駐點資訊 */}
      {venues?.length > 0 && (
        <>
          {secTitle(<MapPin size={16} />, '我的駐點')}
          {venues.map(v => (
            <div key={v.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{v.name}</div>
                <div style={{ fontSize: 11, color: '#8a8278', marginTop: 2 }}>{v.address}</div>
              </div>
              <MapPin size={16} color="#c9a84c" />
            </div>
          ))}
        </>
      )}
    </div>
  )
}
