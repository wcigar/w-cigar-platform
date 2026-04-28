import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { SHIFTS } from '../../lib/constants'
import { useNavigate } from 'react-router-dom'
import { Clock, CheckCircle2, Circle, AlertCircle, MapPin, AlertTriangle, Trophy, FileText } from 'lucide-react'
import { format, endOfMonth } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import AbnormalReport from '../../components/AbnormalReport'
import { markNoticesRead } from '../../lib/noticeUtils'
import { toTaipei } from '../../lib/timezone'
import { StaffCigarReward } from '../../components/CigarRewardCard'

export default function StaffHome() {
  const navigate = useNavigate()
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
  const [cabinetRewards, setCabinetRewards] = useState([])
  const [actionItems, setActionItems] = useState([])
  const [progressNote, setProgressNote] = useState({})
  const [reassigning, setReassigning] = useState(null)
  const [colleagues, setColleagues] = useState([])
  const [invReminder, setInvReminder] = useState([])
  const [crossDayPunchDate, setCrossDayPunchDate] = useState(null)
  const [showPerformance, setShowPerformance] = useState(false)
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
    let pIn = punchRecords.find(r => r.punch_type === '上班')
    let pOut = [...punchRecords].reverse().find(r => r.punch_type === '下班')
    setCrossDayPunchDate(null)
    const hour = new Date().getHours()
    if (!pIn && hour < 6) {
      const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')
      const { data: yPunches } = await supabase.from('punch_records').select('*').eq('employee_id', user.employee_id).eq('date', yesterday).order('time', { ascending: true })
      const yIn = (yPunches || []).find(r => r.punch_type === '上班')
      const yOut = [...(yPunches || [])].reverse().find(r => r.punch_type === '下班')
      if (yIn && !yOut) { pIn = yIn; setCrossDayPunchDate(yesterday) }
    }
    setPunchIn(pIn || null); setPunchOut(pOut || null)
    const counts = {}
    ;(lbRes.data || []).forEach(r => { if (r.completed_by) counts[r.completed_by] = (counts[r.completed_by] || 0) + 1 })
    setLeaderboard(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
    const { data: revData } = await supabase.from('daily_revenue').select('total').gte('date', month + '-01').lte('date', format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd'))
    setMonthRevenue((revData || []).reduce((s, r) => s + (+r.total || 0), 0))
    const { data: crData } = await supabase.from('cabinet_rewards').select('*').eq('month', month).order('created_at', { ascending: false })
    setCabinetRewards((crData || []).filter(r => (r.staff_ids || []).includes(user.employee_id)))
    const [aiRes, colRes] = await Promise.all([
      supabase.from('meeting_action_items').select('*').eq('assigned_to', user.employee_id).in('status', ['pending', 'in_progress']).order('due_date', { ascending: true }),
      supabase.from('employees').select('id, name').eq('enabled', true),
    ])
    setActionItems(aiRes.data || [])
    setColleagues((colRes.data || []).filter(e => e.id !== user.employee_id && e.id !== 'ADMIN'))
    const now = new Date()
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    if (lastDay - now.getDate() <= 2) {
      const { data: invItems } = await supabase.from('inventory_master').select('id, name, category, current_stock, safe_stock, unit').eq('enabled', true).eq('owner', user.employee_id)
      const todayRecords = await supabase.from('inventory_records').select('item_id').eq('staff_code', user.employee_id).gte('created_at', today + 'T00:00:00')
      const doneIds = new Set((todayRecords.data || []).map(r => r.item_id))
      setInvReminder((invItems || []).filter(i => !doneIds.has(i.id)))
    } else { setInvReminder([]) }
    setLoading(false)
  }

  function openPunchCam(type) {
    setPunchType(type); setShowPunchCam(true)
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => { setPunchStream(stream); setTimeout(() => { if (punchCamRef.current) punchCamRef.current.srcObject = stream }, 100) })
      .catch(() => alert('無法開啟相機'))
  }
  function closePunchCam() { if (punchStream) { punchStream.getTracks().forEach(t => t.stop()); setPunchStream(null) }; setShowPunchCam(false); setPunchType(null) }

  async function capturePunchPhoto() {
    const video = punchCamRef.current, canvas = punchCanvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0)
    const now = new Date()
    const timeStr = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    const label = user.name + ' · ' + punchType + '打卡'
    ctx.font = 'bold 18px sans-serif'; const labelW = ctx.measureText(label).width
    ctx.font = '14px sans-serif'; const timeW = ctx.measureText(timeStr).width
    const boxW = Math.max(labelW, timeW) + 24, boxH = 52, boxX = canvas.width - boxW - 8, boxY = canvas.height - boxH - 8
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(boxX, boxY, boxW, boxH)
    ctx.fillStyle = '#FFD700'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(label, canvas.width - 20, boxY + 22)
    ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.fillText(timeStr, canvas.width - 20, boxY + 42); ctx.textAlign = 'left'
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
    closePunchCam(); handlePunch(punchType, photoUrl)
  }

  async function handlePunch(type, photoUrl) {
    if (!navigator.geolocation) return alert('請開啟定位')
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords
      const R = 6371000, dLat = (25.0269184 - lat) * Math.PI / 180, dLng = (121.5419774 - lng) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(25.0269184 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      const valid = dist <= 100
      const punchDate = (type === '下班' && crossDayPunchDate) ? crossDayPunchDate : today
      await supabase.from('punch_records').insert({ date: punchDate, employee_id: user.employee_id, name: user.name, punch_type: type, photo_url: photoUrl || null, lat, lng, distance_m: Math.round(dist), is_valid: valid })
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
  const hh = new Date().getHours()
  const greeting = hh < 12 ? '早安' : hh < 18 ? '午安' : '晚安'
  const greetingEn = hh < 12 ? 'Good Morning' : hh < 18 ? 'Good Afternoon' : 'Good Evening'
  const myGrabs = leaderboard.find(x => x.name === user.name)?.count || 0
  const tiers = [{min:0,max:300000,pct:0},{min:300000,max:500000,pct:3},{min:500000,max:700000,pct:5},{min:700000,max:1000000,pct:7},{min:1000000,max:Infinity,pct:10}]
  const cur = tiers.find(t => monthRevenue >= t.min && monthRevenue < t.max) || tiers[0]
  const next = tiers.find(t => t.min > monthRevenue)
  const curIdx = tiers.indexOf(cur)
  const gap = next ? next.min - monthRevenue : 0
  const pctInTier = cur.max === Infinity ? 100 : Math.min(100, ((monthRevenue - cur.min) / (cur.max - cur.min)) * 100)
  const myCabinetCount = cabinetRewards.length
  const myBonus = cabinetRewards.reduce((s, r) => s + (+r.bonus_per_staff || 0), 0)
  const nowTime = new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false })
  const shiftLabel = shiftName || '未排班'
  const sopPct = tasks.length ? Math.round(done / tasks.length * 100) : 0

  async function updateActionItem(id, updates) {
    await supabase.from('meeting_action_items').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    const { data } = await supabase.from('meeting_action_items').select('*').eq('assigned_to', user.employee_id).in('status', ['pending', 'in_progress']).order('due_date', { ascending: true })
    setActionItems(data || [])
  }
  async function reassignTask(taskId, newEmpId, newEmpName) {
    await supabase.from('meeting_action_items').update({ assigned_to: newEmpId, assigned_to_name: newEmpName, progress_note: `由 ${user.name} 轉派`, updated_at: new Date().toISOString() }).eq('id', taskId)
    setReassigning(null)
    const { data } = await supabase.from('meeting_action_items').select('*').eq('assigned_to', user.employee_id).in('status', ['pending', 'in_progress']).order('due_date', { ascending: true })
    setActionItems(data || [])
  }

  if (loading) return <div style={{padding:24}}><div className="loading-shimmer" style={{height:120,marginBottom:12,borderRadius:14}}/><div className="loading-shimmer" style={{height:80,borderRadius:14}}/></div>

  return (
    <div style={{padding:'0 20px 100px',maxWidth:460,margin:'0 auto'}}>
      <AbnormalReport show={showAbnormal} onClose={() => setShowAbnormal(false)} />
      {motivation && <div onClick={() => setMotivation(null)} style={{position:'fixed',inset:0,background:'rgba(5,4,3,.9)',zIndex:9998,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:'pointer',padding:20}}>
        <div style={{fontSize:48,marginBottom:16}}>✅</div>
        <div style={{fontFamily:'var(--serif)',fontSize:22,fontWeight:600,color:'var(--cream)',marginBottom:8}}>{motivation.type}打卡成功！</div>
        <div style={{fontFamily:'var(--serif)',fontSize:15,color:'var(--bone)',textAlign:'center',lineHeight:1.8,maxWidth:300}}>{motivation.text}</div>
        <div style={{fontFamily:'var(--display)',fontSize:11,fontStyle:'italic',color:'rgba(196,163,90,.3)',marginTop:20,letterSpacing:3}}>tap anywhere to close</div>
      </div>}

      {/* ══ Header ══ */}
      <div style={{textAlign:'center',padding:'48px 0 36px'}}>
        <div style={{width:120,height:1,margin:'0 auto 20px',background:'linear-gradient(90deg,transparent,rgba(196,163,90,.4),transparent)',position:'relative'}}>
          <span style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',fontSize:6,color:'rgba(196,163,90,.5)',background:'#050403',padding:'0 8px'}}>◆</span>
        </div>
        <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:56,fontWeight:300,letterSpacing:8,background:'linear-gradient(180deg,#f0e8d8 30%,rgba(196,163,90,.7))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>W</div>
        <div style={{fontFamily:'Noto Serif TC,serif',fontSize:11,color:'rgba(196,163,90,.5)',letterSpacing:8,marginTop:8,fontWeight:300}}>紳 士 雪 茄 館</div>
      </div>

      {/* ══ Greeting ══ */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',padding:'0 4px 20px'}}>
        <div>
          <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:12,fontStyle:'italic',color:'rgba(196,163,90,.4)',letterSpacing:2}}>{greetingEn}</div>
          <div style={{fontFamily:'Noto Serif TC,serif',fontSize:22,fontWeight:500,color:'#f0e8d8',marginTop:4}}>{user.name}，{greeting}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'rgba(196,163,90,.35)',letterSpacing:1}}>{format(new Date(), 'yyyy.MM.dd')}</div>
          <div style={{display:'inline-block',marginTop:4,fontFamily:'JetBrains Mono,monospace',fontSize:9,color:'rgba(196,163,90,.6)',padding:'3px 10px',borderRadius:20,border:'1px solid rgba(196,163,90,.12)',letterSpacing:2}}>{shiftLabel}</div>
        </div>
      </div>

      {/* ══════ Zone A：即時行動 ══════ */}
      <div className="wcb-zone">
        <div className="wcb-zone-head"><div className="wcb-zone-accent gold"/><div className="wcb-zone-label">即時行動</div><div className="wcb-zone-eng">Immediate</div></div>

        {/* 打卡卡片 */}
        <div className="wcb-card" style={{background:'linear-gradient(160deg,rgba(30,24,18,.96),rgba(14,12,10,.99))',borderColor:'rgba(196,163,90,.15)',padding:'28px 24px',textAlign:'center'}}>
          <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:11,fontStyle:'italic',color:'rgba(196,163,90,.4)',letterSpacing:4}}>Current Shift</div>
          {shiftInfo?.start ? (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,margin:'8px 0',lineHeight:1}}><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:32,fontWeight:300,letterSpacing:4,color:'#f0e8d8'}}>{shiftInfo.start}</span><span style={{fontSize:20,color:'rgba(196,163,90,.3)'}}>—</span><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:32,fontWeight:300,letterSpacing:4,color:'#f0e8d8'}}>{shiftInfo.end}</span></div>
          ) : <div style={{fontFamily:'var(--serif)',fontSize:18,color:'rgba(196,163,90,.4)',margin:'16px 0'}}>{shiftName ? `今日${shiftName}` : '尚未排班'}</div>}

          {shiftInfo?.start && <>
            <div style={{display:'flex',gap:16,justifyContent:'center',alignItems:'center',margin:'16px 0'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}><span style={{fontFamily:'var(--mono)',fontSize:9,color:'rgba(196,163,90,.3)',letterSpacing:1}}>CLOCK IN{crossDayPunchDate?` (${crossDayPunchDate.slice(5)})`:''}</span><span style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:400,color:punchIn?(crossDayPunchDate?'#f59e0b':'rgba(100,170,100,.8)'):'rgba(196,163,90,.2)'}}>{punchIn?toTaipei(punchIn.time,true):'—:—'}</span></div>
              <div style={{width:1,height:16,background:'rgba(196,163,90,.1)'}}/>
              <div style={{display:'flex',alignItems:'center',gap:8}}><span style={{fontFamily:'var(--mono)',fontSize:9,color:'rgba(196,163,90,.3)',letterSpacing:1}}>OUT</span><span style={{fontFamily:'var(--mono)',fontSize:16,fontWeight:400,color:punchOut?'rgba(100,140,170,.8)':'rgba(196,163,90,.2)'}}>{punchOut?toTaipei(punchOut.time,true):'—:—'}</span></div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button className="wcb-btn-gold" style={{flex:1,letterSpacing:3}} onClick={() => openPunchCam('上班')}>上班打卡</button>
              <button className="wcb-btn-outline" style={{flex:1,padding:16,letterSpacing:3}} onClick={() => openPunchCam('下班')}>下班打卡</button>
            </div>
          </>}
        </div>

        {/* 盤點提醒 */}
        {invReminder.length > 0 && (
          <div className="wcb-card" style={{borderColor:'rgba(190,70,60,.2)'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}><span style={{fontFamily:'var(--serif)',fontSize:13,color:'rgba(190,70,60,.8)'}}>📦 月底盤點提醒</span><span className="wcb-tag wcb-tag-red">{invReminder.length} 項待盤</span></div>
            {invReminder.slice(0,5).map(item => <div key={item.id} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid rgba(196,163,90,.04)',fontFamily:'var(--serif)',fontSize:12}}><span style={{color:'var(--bone)'}}>{item.name} <span style={{color:'var(--ash)'}}>{item.category}</span></span><span style={{fontFamily:'var(--mono)',fontSize:11,color:item.current_stock<=(item.safe_stock||0)?'rgba(190,70,60,.7)':'var(--ash)'}}>{item.current_stock??'?'} {item.unit}</span></div>)}
            <button className="wcb-btn-outline" style={{width:'100%',marginTop:10}} onClick={() => navigate('/inventory')}>📋 前往盤點</button>
          </div>
        )}

        {/* 異常回報 */}
        <button className="wcb-btn-danger" style={{width:'100%',padding:16,fontSize:14,letterSpacing:2}} onClick={() => setShowAbnormal(true)}>🚨 突發異常回報</button>
      </div>

      {/* ══════ Zone B：今日任務 ══════ */}
      <div className="wcb-zone">
        <div className="wcb-zone-head"><div className="wcb-zone-accent blue"/><div className="wcb-zone-label">今日任務</div><div className="wcb-zone-eng">Today's Tasks</div></div>

        {/* SOP 進度 */}
        <div className="wcb-card">
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}><span style={{fontFamily:'var(--serif)',fontSize:12,color:'var(--ash)'}}>SOP 進度</span><span style={{fontFamily:'var(--mono)',fontSize:13,color:'rgba(196,163,90,.7)'}}>{done} / {tasks.length}</span></div>
          <div className="wcb-progress-track"><div className="wcb-progress-fill" style={{width:`${sopPct}%`}}/></div>
          <div className="wcb-sep"/>
          {tasks.slice(0,5).map(t => (
            <div key={t.id} style={{display:'flex',alignItems:'center',gap:14,padding:'11px 0',borderBottom:'1px solid rgba(196,163,90,.03)'}}>
              <div style={{width:18,height:18,borderRadius:5,flexShrink:0,border:`1px solid rgba(196,163,90,${t.completed?.15:.08})`,display:'flex',alignItems:'center',justifyContent:'center',...(t.completed?{background:'rgba(196,163,90,.1)'}:{})}}>{t.completed&&<span style={{fontSize:9,color:'rgba(196,163,90,.7)'}}>✓</span>}</div>
              <span style={{fontFamily:'var(--serif)',fontSize:13,color:t.completed?'rgba(232,220,200,.3)':'rgba(232,220,200,.85)',flex:1,...(t.completed?{textDecoration:'line-through',textDecorationColor:'rgba(196,163,90,.1)'}:{})}}>{t.title}</span>
              {t.due_time&&<span style={{fontFamily:'var(--mono)',fontSize:9,color:'rgba(196,163,90,.25)',letterSpacing:1}}>{t.due_time}</span>}
            </div>
          ))}
        </div>

        {/* 待辦任務 */}
        {actionItems.length > 0 && (
          <div className="wcb-card" style={{borderColor:'rgba(100,140,170,.15)'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}><span style={{fontFamily:'var(--serif)',fontSize:13,color:'var(--bone)'}}>📋 待辦任務</span><span className="wcb-tag wcb-tag-blue">{actionItems.length} 項</span></div>
            {actionItems.map(item => {
              const overdue = item.due_date && item.due_date < today
              return <div key={item.id} style={{padding:'12px 0',borderTop:'1px solid rgba(196,163,90,.04)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                  <div style={{flex:1}}><div style={{fontFamily:'var(--serif)',fontSize:13,fontWeight:500,color:overdue?'rgba(190,70,60,.8)':'var(--bone)'}}>{item.title}</div><div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ash)',marginTop:3}}>{item.due_date&&<span style={{color:overdue?'rgba(190,70,60,.6)':'var(--ash)'}}>截止 {item.due_date}{overdue?' (逾期!)':''}</span>}{item.priority!=='normal'&&<span style={{marginLeft:8,color:item.priority==='high'?'rgba(190,70,60,.7)':'#f59e0b'}}>{item.priority==='high'?'高':'緊急'}</span>}</div></div>
                  <span className={`wcb-tag ${item.status==='in_progress'?'wcb-tag-blue':'wcb-tag-gold'}`}>{item.status==='pending'?'待執行':'進行中'}</span>
                </div>
                <div style={{display:'flex',gap:6,marginTop:8}}>
                  {item.status==='pending'&&<button className="wcb-btn-outline" style={{fontSize:11,padding:'5px 12px'}} onClick={()=>updateActionItem(item.id,{status:'in_progress'})}>🔄 開始</button>}
                  <button className="wcb-btn-outline" style={{fontSize:11,padding:'5px 12px',borderColor:'rgba(100,170,100,.2)',color:'rgba(100,170,100,.7)'}} onClick={()=>updateActionItem(item.id,{status:'completed',completed_at:new Date().toISOString()})}>✅ 完成</button>
                  <button className="wcb-btn-outline" style={{fontSize:11,padding:'5px 12px'}} onClick={()=>setReassigning(reassigning===item.id?null:item.id)}>🔀 轉派</button>
                </div>
                {reassigning===item.id&&<div style={{marginTop:6,display:'flex',flexWrap:'wrap',gap:4}}>{colleagues.map(c=><button key={c.id} className="wcb-btn-outline" style={{fontSize:10,padding:'4px 10px'}} onClick={()=>reassignTask(item.id,c.id,c.name)}>{c.name}</button>)}</div>}
                <div style={{display:'flex',gap:6,marginTop:6}}>
                  <input className="wcb-input" style={{fontSize:11,padding:'6px 10px'}} value={progressNote[item.id]||item.progress_note||''} onChange={e=>setProgressNote(prev=>({...prev,[item.id]:e.target.value}))} placeholder="回報進度…"/>
                  <button className="wcb-btn-outline" style={{padding:'6px 12px',fontSize:11}} onClick={()=>{const note=progressNote[item.id]||item.progress_note||'';if(note.trim())updateActionItem(item.id,{progress_note:note.trim()})}}>💬</button>
                </div>
              </div>
            })}
          </div>
        )}

        <button className="wcb-btn-outline" style={{width:'100%',padding:16,letterSpacing:2,marginTop:4}} onClick={()=>navigate('/meeting')}><FileText size={14} style={{marginRight:8,verticalAlign:'middle'}}/>週會準備</button>
      </div>

      {/* ══════ Zone C：本月績效 ══════ */}
      <div className="wcb-zone">
        <div className="wcb-zone-head"><div className="wcb-zone-accent green"/><div className="wcb-zone-label">本月績效</div><div className="wcb-zone-eng">Performance</div></div>

        {/* 收合/展開 */}
        <div className="wcb-card" onClick={()=>setShowPerformance(!showPerformance)} style={{cursor:'pointer'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{display:'flex',gap:20,alignItems:'baseline'}}>
              <span style={{fontFamily:'var(--mono)',fontSize:12,color:'rgba(196,163,90,.5)'}}>${monthRevenue.toLocaleString()}</span>
              <span style={{fontFamily:'var(--mono)',fontSize:12,color:cur.pct>0?'rgba(100,170,100,.6)':'rgba(196,163,90,.3)'}}>{cur.pct}%</span>
              <span style={{fontFamily:'var(--mono)',fontSize:12,color:'rgba(196,163,90,.4)'}}>{myGrabs} 單</span>
            </div>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:10,fontStyle:'italic',color:'rgba(196,163,90,.3)',letterSpacing:2,padding:'4px 14px',borderRadius:20,border:'1px solid rgba(196,163,90,.1)'}}>{showPerformance?'收合 ▴':'展開 ▾'}</div>
          </div>
        </div>

        {showPerformance && <>
          {/* 營業額分紅 */}
          <div className="wcb-card">
            <div style={{fontFamily:'var(--serif)',fontSize:13,color:'var(--bone)',marginBottom:12}}>💰 營業額分紅</div>
            <div className="wcb-stat"><span className="wcb-stat-k">本月營業額</span><span className="wcb-stat-v hero">${monthRevenue.toLocaleString()}</span></div>
            <div className="wcb-stat"><span className="wcb-stat-k">目前分紅</span><span className="wcb-stat-v" style={{color:cur.pct>0?'rgba(100,170,100,.8)':'var(--ash)'}}>{cur.pct}%</span></div>
            <div className="wcb-progress-track" style={{margin:'12px 0'}}><div className="wcb-progress-fill" style={{width:`${pctInTier}%`}}/></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:9,fontFamily:'var(--mono)',color:'var(--ash)',marginBottom:8}}>{tiers.map((t,i)=><span key={i} style={{color:i<=curIdx?'rgba(196,163,90,.6)':'var(--smoke)',fontWeight:i===curIdx?600:400}}>{t.pct}%</span>)}</div>
            {next&&gap>0&&<div style={{fontFamily:'var(--serif)',fontSize:12,color:'var(--ash)',textAlign:'center',padding:'8px 0',background:'rgba(196,163,90,.03)',borderRadius:8}}>{cur.pct>0?<>📈 再 <b style={{color:'var(--gold-hex)'}}>${gap.toLocaleString()}</b> → <b style={{color:'rgba(100,170,100,.8)'}}>{next.pct}%</b></>:<>💪 再 <b style={{color:'var(--gold-hex)'}}>${gap.toLocaleString()}</b> 即達 <b style={{color:'rgba(100,170,100,.8)'}}>{next.pct}%</b></>}</div>}
          </div>

          {/* 開櫃 VIP */}
          <div className="wcb-card">
            <div style={{fontFamily:'var(--serif)',fontSize:13,color:'var(--bone)',marginBottom:12}}>🔑 開櫃 VIP 獎勵</div>
            <div style={{display:'flex',gap:12}}>
              <div style={{flex:1,textAlign:'center',padding:'10px 0',background:'rgba(196,163,90,.03)',borderRadius:8}}><div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ash)',letterSpacing:1}}>CABINET</div><div style={{fontFamily:'var(--mono)',fontSize:22,fontWeight:300,color:'rgba(196,163,90,.7)',marginTop:4}}>{myCabinetCount}</div></div>
              <div style={{flex:1,textAlign:'center',padding:'10px 0',background:'rgba(196,163,90,.03)',borderRadius:8}}><div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ash)',letterSpacing:1}}>BONUS</div><div style={{fontFamily:'var(--mono)',fontSize:22,fontWeight:300,color:myBonus>0?'rgba(100,170,100,.7)':'var(--ash)',marginTop:4}}>${myBonus.toLocaleString()}</div></div>
            </div>
            {myCabinetCount>0&&<div style={{marginTop:10}}>{cabinetRewards.map(r=><div key={r.id} className="wcb-stat"><span className="wcb-stat-k">{r.customer_name}</span><span className="wcb-stat-v" style={{color:r.status==='approved'?'rgba(100,170,100,.7)':'rgba(196,163,90,.5)'}}>${(+r.bonus_per_staff).toLocaleString()} {r.status==='approved'?'✓':'⏳'}</span></div>)}</div>}
          </div>

          {/* 全勤 */}
          <div className="wcb-card">
            <div className="wcb-stat" style={{border:'none',padding:0}}><span className="wcb-stat-k">✅ 全勤獎金</span><span className="wcb-stat-v hero">$2,000</span></div>
            <div style={{fontFamily:'var(--serif)',fontSize:11,color:'var(--smoke)',marginTop:6}}>本月無遲到、無缺勤、無臨時請假即可領取</div>
          </div>

          {/* 雪茄獎勵 */}
          <StaffCigarReward user={user} />

          {/* 搶單排行 */}
          {leaderboard.length>0&&(
            <div className="wcb-card">
              <div style={{fontFamily:'var(--serif)',fontSize:13,color:'var(--bone)',marginBottom:10}}>🏆 搶單排行榜</div>
              {leaderboard.slice(0,5).map((x,i)=><div key={x.name} className="wcb-stat"><span className="wcb-stat-k">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`} {x.name}</span><span className="wcb-stat-v">{x.count} 單</span></div>)}
            </div>
          )}

          {/* 公告 */}
          {notices.length>0&&(
            <div className="wcb-card" style={{borderColor:'rgba(190,70,60,.12)'}}>
              <div style={{fontFamily:'var(--serif)',fontSize:13,color:'rgba(190,70,60,.7)',marginBottom:8}}>📢 公告</div>
              {notices.map(n=><div key={n.id} style={{padding:'8px 0',borderBottom:'1px solid rgba(196,163,90,.04)',fontFamily:'var(--serif)',fontSize:13,color:'var(--bone)'}}>{n.content}<div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--smoke)',marginTop:3}}>{n.publisher}</div></div>)}
            </div>
          )}
        </>}
      </div>

      <div className="wcb-ornament">◇</div>

      {/* 打卡相機 */}
      {showPunchCam && (
        <div className="wcb-modal-overlay" style={{alignItems:'center'}} onClick={closePunchCam}>
          <div style={{maxWidth:420,width:'100%',textAlign:'center'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:'var(--serif)',fontSize:16,color:'var(--cream)',marginBottom:12}}>{punchType}打卡 — 請拍照</div>
            <video ref={punchCamRef} autoPlay playsInline muted style={{width:'100%',borderRadius:14,border:'2px solid rgba(196,163,90,.3)'}}/>
            <canvas ref={punchCanvasRef} style={{display:'none'}}/>
            <div style={{display:'flex',gap:12,marginTop:16,justifyContent:'center'}}>
              <button className="wcb-btn-gold" style={{flex:1,maxWidth:200}} onClick={capturePunchPhoto}>📸 拍照打卡</button>
              <button className="wcb-btn-outline" style={{padding:'14px 24px'}} onClick={closePunchCam}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
