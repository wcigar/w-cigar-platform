import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { SHIFTS } from '../../lib/constants'
import { Clock, CheckCircle2, Circle, AlertCircle, MapPin, AlertTriangle, Trophy } from 'lucide-react'
import { format, endOfMonth } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import AbnormalReport from '../../components/AbnormalReport'
import { markNoticesRead } from '../../lib/noticeUtils'
import { toTaipei } from '../../lib/timezone'

export default function StaffHome() {
  const { user } = useAuth()
  const [shift, setShift] = useState(null)
  const [tasks, setTasks] = useState([])
  const [punch, setPunch] = useState(null)
  const [punchIn, setPunchIn] = useState(null)
  const [punchOut, setPunchOut] = useState(null)
  const [notices, setNotices] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [showAbnormal, setShowAbnormal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [motivation, setMotivation] = useState(null)
  const [monthRevenue, setMonthRevenue] = useState(0)
  const today = format(new Date(), 'yyyy-MM-dd')
  const punchCamRef = useRef(null)
  const punchCanvasRef = useRef(null)
  const [punchType, setPunchType] = useState(null)
  const [punchStream, setPunchStream] = useState(null)
  const [showPunchCam, setShowPunchCam] = useState(false)
  const month = format(new Date(), 'yyyy-MM')

  useEffect(() => { load() }, [])

  useEffect(() => { if (notices.length > 0 && user) markNoticesRead(notices, user.employee_id, user.name) }, [notices])

  async function load() {
    setLoading(true)
    const [sRes, tRes, pRes, nRes, lbRes] = await Promise.all([
      supabase.from('schedules').select('*').eq('employee_id', user.employee_id).eq('date', today).maybeSingle(),
      supabase.from('task_status').select('*').eq('owner', user.employee_id).eq('date', today).order('task_id'),
      supabase.from('punch_records').select('*').eq('employee_id', user.employee_id).eq('date', today).order('time', { ascending: true }),
      supabase.from('notices').select('*').eq('enabled', true).order('created_at', { ascending: false }).limit(3),
      supabase.from('task_status').select('completed_by').eq('owner', 'ALL').eq('completed', true).gte('date', month + '-01').lte('date', format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')),
    ])
    setShift(sRes.data); setTasks(tRes.data || []); setPunch(pRes.data); setNotices(nRes.data || [])
    const punchRecords = pRes.data || []
    const pIn = punchRecords.find(r => r.punch_type === '上班')
    const pOut = [...punchRecords].reverse().find(r => r.punch_type === '下班')
    setPunchIn(pIn || null)
    setPunchOut(pOut || null)
    const counts = {}
    ;(lbRes.data || []).forEach(r => { if (r.completed_by) counts[r.completed_by] = (counts[r.completed_by] || 0) + 1 })
    setLeaderboard(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
    // Month revenue for commission card
    const { data: revData } = await supabase.from('daily_revenue').select('total').gte('date', month + '-01').lte('date', format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd'))
    setMonthRevenue((revData || []).reduce((s, r) => s + (+r.total || 0), 0))
    setLoading(false)
  }

  function openPunchCam(type) {
    setPunchType(type)
    setShowPunchCam(true)
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => { setPunchStream(stream); setTimeout(() => { if (punchCamRef.current) punchCamRef.current.srcObject = stream }, 100) })
      .catch(() => alert('無法開啟相機'))
  }

  function closePunchCam() {
    if (punchStream) { punchStream.getTracks().forEach(t => t.stop()); setPunchStream(null) }
    setShowPunchCam(false); setPunchType(null)
  }

  async function capturePunchPhoto() {
    const video = punchCamRef.current
    const canvas = punchCanvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    // Watermark: employee name + date/time → bottom-right
    const now = new Date()
    const timeStr = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    const label = user.name + ' · ' + punchType + '打卡'
    ctx.font = 'bold 18px sans-serif'
    const labelW = ctx.measureText(label).width
    ctx.font = '14px sans-serif'
    const timeW = ctx.measureText(timeStr).width
    const boxW = Math.max(labelW, timeW) + 24
    const boxH = 52
    const boxX = canvas.width - boxW - 8
    const boxY = canvas.height - boxH - 8
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(boxX, boxY, boxW, boxH)
    ctx.fillStyle = '#FFD700'
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(label, canvas.width - 20, boxY + 22)
    ctx.fillStyle = '#fff'
    ctx.font = '14px sans-serif'
    ctx.fillText(timeStr, canvas.width - 20, boxY + 42)
    ctx.textAlign = 'left'
    // Upload
    let photoUrl = null
    try {
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8))
      if (blob && blob.size > 0) {
        const fileName = 'punch/' + user.employee_id + '_' + (punchType === '上班' ? 'in' : 'out') + '_' + format(now, 'yyyyMMdd_HHmmss') + '.jpg'
        const { data: upData, error: upErr } = await supabase.storage.from('photos').upload(fileName, blob)
        if (upData?.path) photoUrl = supabase.storage.from('photos').getPublicUrl(upData.path).data.publicUrl
        if (upErr) console.error('Photo upload error:', upErr)
      }
    } catch (e) { console.error('Photo capture error:', e) }
    closePunchCam()
    handlePunch(punchType, photoUrl)
  }

  async function handlePunch(type, photoUrl) {
    if (!navigator.geolocation) return alert('請開啟定位')
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords
      const R = 6371000, dLat = (25.0269184 - lat) * Math.PI / 180, dLng = (121.5419774 - lng) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(25.0269184 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      const valid = dist <= 100
      await supabase.from('punch_records').insert({ date: today, employee_id: user.employee_id, name: user.name, punch_type: type, photo_url: photoUrl || null, lat, lng, distance_m: Math.round(dist), is_valid: valid })
      if (valid) {
        const msgs = ['今天也是充滿雪茄香氣的一天！🚬','每一支雪茄背後都有你的專業服務 💎','好的開始是成功的一半，準備好迎接貴客了！✨','專業、熱情、細心 — 這就是你 🌟','讓每位客人都感受到 VIP 尊榮 👑','今天的努力是明天的業績 💰','雪茄不只是商品，是一種生活態度 🎩','服務從微笑開始，業績從細節累積 📈','你的專業讓每支雪茄都更有價值 🏆','準備好了嗎？今天又是滿分服務日！⭐','細心呵護每一位會員的窖藏 🗄️','用心推薦，讓客人找到命定的那支 💫','每一次開櫃都是信任的延續 🔑','你不只是店員，你是雪茄管家 🎯','今天的一杯好茶配一支好茄 = 完美 ☕']
        setMotivation({ text: msgs[Math.floor(Math.random() * msgs.length)], type })
        setTimeout(() => setMotivation(null), 5000)
      } else { alert(`距離店面 ${Math.round(dist)}m，超出範圍`) }
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

      {/* Motivation popup */}
      {motivation && <div onClick={() => setMotivation(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.85)', zIndex: 9998, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 20 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', marginBottom: 8 }}>{motivation.type}打卡成功！</div>
        <div style={{ fontSize: 16, color: 'var(--text)', textAlign: 'center', lineHeight: 1.6, maxWidth: 300 }}>{motivation.text}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16 }}>點擊任意處關閉</div>
      </div>}

      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', fontWeight: 600 }}>{greeting}，{user.name}</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhTW })}</p>
      </div>

      {/* Notices — moved to top */}
      {notices.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(196,77,77,.25)', background: 'rgba(196,77,77,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><span style={{ fontSize: 16 }}>📢</span><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>公告</span></div>
          {notices.map(n => <div key={n.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{n.content}<div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{n.publisher}</div></div>)}
        </div>
      )}

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
          <>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, padding: '8px 10px', background: 'rgba(201,168,76,.06)', borderRadius: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>上班打卡</div>
              {punchIn ? <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--green)' }}>{toTaipei(punchIn.time, true)}</div>
                : <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>尚未上班打卡</div>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>下班打卡</div>
              {punchOut ? <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--blue)' }}>{toTaipei(punchOut.time, true)}</div>
                : <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>尚未下班打卡</div>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn-gold" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => openPunchCam('上班')}><MapPin size={14} />上班打卡</button>
            <button className="btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => openPunchCam('下班')}><MapPin size={14} />下班打卡</button>
          </div>
          </>
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

      {/* Commission card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><span style={{ fontSize: 16 }}>💰</span><span style={{ fontSize: 14, fontWeight: 600 }}>POS 收銀分紅</span></div>
        {(() => {
          const tiers = [{min:0,max:300000,pct:0},{min:300000,max:500000,pct:3},{min:500000,max:700000,pct:5},{min:700000,max:1000000,pct:7},{min:1000000,max:Infinity,pct:10}]
          const current = tiers.find(t => monthRevenue >= t.min && monthRevenue < t.max) || tiers[0]
          const next = tiers.find(t => t.min > monthRevenue)
          const fmtK = n => n >= 10000 ? Math.round(n/10000)+'萬' : '$'+n.toLocaleString()
          return <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>
              <span>本月店內營收</span>
              <span style={{ color: 'var(--gold)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>${monthRevenue.toLocaleString()}</span>
            </div>
            <div style={{ height: 6, background: 'var(--black)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', borderRadius: 3, width: Math.min(100, monthRevenue / 1000000 * 100) + '%', background: current.pct > 0 ? 'var(--green)' : 'var(--gold-dim)', transition: 'width .5s' }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {tiers.map(t => <span key={t.min} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: current.min === t.min ? (t.pct > 0 ? 'rgba(77,168,108,.15)' : 'rgba(201,168,76,.1)') : 'transparent', color: current.min === t.min ? (t.pct > 0 ? 'var(--green)' : 'var(--gold)') : 'var(--text-muted)', border: current.min === t.min ? '1px solid' : '1px solid transparent', fontWeight: current.min === t.min ? 700 : 400 }}>{fmtK(t.min)}~{t.max === Infinity ? '以上' : fmtK(t.max)} → {t.pct}%</span>)}
            </div>
            {current.pct > 0 ? <div style={{ fontSize: 12, color: 'var(--green)' }}>🎉 已達 {current.pct}% 分紅門檻！{next ? ` 再 $${(next.min - monthRevenue).toLocaleString()} 升級到 ${next.pct}%` : ''}</div>
            : next ? <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>再 ${(next.min - monthRevenue).toLocaleString()} 即達 {next.pct}% 分紅門檻</div>
            : null}
          </>
        })()}
      </div>
    
      {showPunchCam && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.9)', zIndex:9999, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          <div style={{ fontSize:16, color:'var(--gold)', fontWeight:700, marginBottom:12 }}>{punchType}打卡 - 請拍照</div>
          <video ref={punchCamRef} autoPlay playsInline muted style={{ width:'90%', maxWidth:400, borderRadius:12, border:'2px solid var(--gold)' }} />
          <canvas ref={punchCanvasRef} style={{ display:'none' }} />
          <div style={{ display:'flex', gap:12, marginTop:16 }}>
            <button onClick={capturePunchPhoto} className="btn-gold" style={{ padding:'14px 32px', fontSize:16 }}>📸 拍照打卡</button>
            <button onClick={closePunchCam} className="btn-outline" style={{ padding:'14px 24px', fontSize:14 }}>取消</button>
          </div>
        </div>
      )}
</div>
  )
}
