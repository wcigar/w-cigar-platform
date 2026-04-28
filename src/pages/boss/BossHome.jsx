import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, DollarSign, Settings, AlertTriangle, Trophy, Clock, Package, FileText, CheckCircle2, XCircle, Flame, BarChart3, UserCheck, Megaphone, QrCode, Wine, Building2, Truck, Receipt, Coins } from 'lucide-react'
import { format, endOfMonth } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { getTaskUrgency } from '../../lib/taskUtils'
import { getSlaStatus } from '../../lib/slaUtils'
import DashboardCards from '../../components/DashboardCards'
import { BossCigarRewardSection } from '../../components/CigarRewardCard'

export default function BossHome() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ emps: 0, working: 0, sop: 0, abnPending: 0, leavePending: 0, lowStock: 0 })
  const [scheds, setScheds] = useState([])
  const [punches, setPunches] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [lowItems, setLowItems] = useState([])
  const [dangers, setDangers] = useState([])
  const [loading, setLoading] = useState(true)
  const [monthRevenue, setMonthRevenue] = useState(0)
  const [pendingHandover, setPendingHandover] = useState(0)
  const [dealerPending, setDealerPending] = useState(0)
  const [openActions, setOpenActions] = useState([])
  const [allEmps, setAllEmps] = useState([])
  const [reassigning, setReassigning] = useState(null)
  const [vipUnpaid, setVipUnpaid] = useState(0)
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = format(new Date(), 'yyyy-MM')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [eR, sR, tR, aR, lbR, leaveR, invR, punchR, revR, hoR, abnR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true),
      supabase.from('schedules').select('*').eq('date', today),
      supabase.from('task_status').select('*').eq('date', today),
      supabase.from('abnormal_reports').select('id', { count: 'exact' }).eq('status', '待處理'),
      supabase.from('task_status').select('completed_by').eq('owner', 'ALL').eq('completed', true).gte('date', month + '-01').lte('date', format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')),
      supabase.from('leave_requests').select('id', { count: 'exact' }).eq('status', '待審核'),
      supabase.from('inventory_master').select('id, name, current_stock, safe_stock, unit, category').eq('is_low', true).eq('enabled', true),
      supabase.from('punch_records').select('*').eq('date', today),
      supabase.from('daily_revenue').select('total').gte('date', month + '-01').lte('date', format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')),
      supabase.from('shift_handover').select('id').eq('date', today).eq('acknowledged', false),
      supabase.from('abnormal_reports').select('*').neq('status', '已解決').order('time', { ascending: false }).limit(10),
    ])
    const tasks = tR.data || [], sc = sR.data || [], emps = eR.data || [], low = invR.data || [], abns = abnR.data || []
    setStats({ emps: emps.length, working: sc.filter(s => s.shift !== '休假' && s.shift !== '臨時請假').length, sop: tasks.length ? Math.round(tasks.filter(t => t.completed).length / tasks.length * 100) : 0, abnPending: aR.count || 0, leavePending: leaveR.count || 0, lowStock: low.length })
    setScheds(sc); setLowItems(low); setAllEmps(emps.filter(e => !e.is_admin)); setPunches(punchR.data || [])
    setMonthRevenue((revR.data || []).reduce((s, r) => s + (+r.total || 0), 0))
    setPendingHandover((hoR.data || []).length)
    try { const { data: dpData } = await supabase.rpc('get_dealer_pending_orders'); if (dpData?.count !== undefined) setDealerPending(dpData.count) } catch {}
    try { const { data: vd } = await supabase.rpc('get_vip_dashboard'); if (vd?.total_unpaid !== undefined) setVipUnpaid(vd.total_unpaid) } catch {}
    const dangerList = []
    abns.forEach(a => { const sla = getSlaStatus(a); if (sla.status === 'overdue') dangerList.push({ type:'abnormal', severity:100, icon:'🚨', label:a.description?.slice(0,20)||'異常報告', detail:sla.remaining, color:'rgba(190,70,60,.8)', action:'/operations' }); else if (sla.status === 'warning') dangerList.push({ type:'abnormal', severity:80, icon:'⚠️', label:a.description?.slice(0,20)||'異常報告', detail:sla.remaining, color:'#f59e0b', action:'/operations' }) })
    tasks.forEach(t => { const urg = getTaskUrgency(t); if (urg === 'overdue') dangerList.push({ type:'sop', severity:90, icon:'🔴', label:t.title?.slice(0,20), detail:t.due_time+' 已逾時', color:'rgba(190,70,60,.8)', action:'/operations' }); else if (urg === 'warning') dangerList.push({ type:'sop', severity:70, icon:'🟡', label:t.title?.slice(0,20), detail:t.due_time+' 即將到期', color:'#f59e0b', action:'/operations' }) })
    low.sort((a, b) => (a.current_stock||0)/(a.safe_stock||1) - (b.current_stock||0)/(b.safe_stock||1)).slice(0,5).forEach(item => { const ratio = (item.current_stock||0)/(item.safe_stock||1); dangerList.push({ type:'stock', severity:ratio===0?60:40, icon:'📦', label:item.name, detail:(item.current_stock??0)+'/'+item.safe_stock+item.unit, color:ratio===0?'rgba(190,70,60,.8)':'#f59e0b', action:'/operations' }) })
    const nowDate = new Date(); const lastDay = new Date(nowDate.getFullYear(), nowDate.getMonth()+1, 0).getDate()
    if (lastDay - nowDate.getDate() <= 2) { const { data: invAssigned } = await supabase.from('inventory_master').select('owner').eq('enabled', true); const assignedStaff = [...new Set((invAssigned||[]).map(i=>i.owner).filter(Boolean))]; if (assignedStaff.length) { const { data: todayRecords } = await supabase.from('inventory_records').select('staff_code').gte('created_at', today+'T00:00:00'); const doneStaff = new Set((todayRecords||[]).map(r=>r.staff_code)); const pending = assignedStaff.filter(id=>!doneStaff.has(id)); if (pending.length) { const names = pending.map(id=>emps.find(e=>e.id===id)?.name||id).join('、'); dangerList.push({ type:'inventory', severity:50, icon:'📦', label:'月底盤點未完成', detail:names, color:'#f59e0b', action:'/boss-inventory' }) } } }
    dangerList.sort((a,b) => b.severity - a.severity); setDangers(dangerList.slice(0,6))
    const counts = {}; (lbR.data||[]).forEach(r => { if (r.completed_by) counts[r.completed_by] = (counts[r.completed_by]||0)+1 }); setLeaderboard(Object.entries(counts).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count))
    const { data: aiData } = await supabase.from('meeting_action_items').select('*').in('status', ['pending','in_progress']).order('due_date', { ascending: true }).limit(6); setOpenActions(aiData || [])
    setLoading(false)
  }

  async function reassignTask(taskId, newEmpId, newEmpName) {
    await supabase.from('meeting_action_items').update({ assigned_to: newEmpId, assigned_to_name: newEmpName, updated_at: new Date().toISOString() }).eq('id', taskId)
    setReassigning(null); const { data } = await supabase.from('meeting_action_items').select('*').in('status', ['pending','in_progress']).order('due_date', { ascending: true }).limit(6); setOpenActions(data || [])
  }

  const cards = [
    { icon: Briefcase, label: '營運管理', sub: 'SOP '+stats.sop+'%・異常 '+stats.abnPending, path: '/operations' },
    { icon: Users, label: '人事排班', sub: '今日 '+stats.working+' 人・假單 '+stats.leavePending, path: '/hr' },
    { icon: DollarSign, label: '薪資財務', sub: '薪資・支出・勞健保', path: '/payroll' },
    { icon: Settings, label: '系統設定', sub: '員工・SOP定義・KPI考核', path: '/settings' },
    { icon: BarChart3, label: 'CRM 儀表板', sub: '客戶分析・RFM・生命週期', path: '/crm' },
    { icon: UserCheck, label: '會員申請審核', sub: '入會申請・資格審核', path: '/members/registrations' },
    { icon: Megaphone, label: '行銷發送', sub: 'SMS・推播・優惠券', path: '/marketing' },
    { icon: QrCode, label: 'QR Code 入會', sub: '掃碼加入・推薦碼', path: '/qrcode' },
  ]

  function getPunchStatus(empId) {
    const punch = punches.find(p => p.employee_id === empId)
    if (!punch) return { status:'none', label:'未打卡', color:'var(--ash)' }
    if (punch.is_late) return { status:'late', label:'遲到 '+(punch.clock_in?.slice(11,16)||''), color:'rgba(190,70,60,.8)' }
    return { status:'ok', label:punch.clock_in?.slice(11,16)||'已打卡', color:'rgba(100,170,100,.8)' }
  }

  if (loading) return <div style={{padding:24}}>{[1,2,3,4].map(i=><div key={i} className="loading-shimmer" style={{height:90,marginBottom:12,borderRadius:14}}/>)}</div>

  const quickStats = [
    { label:'在職', value:stats.emps, color:'rgba(196,163,90,.7)' },
    { label:'今日出勤', value:stats.working, color:'rgba(100,170,100,.7)' },
    { label:'SOP', value:stats.sop+'%', color:stats.sop===100?'rgba(100,170,100,.8)':'rgba(196,163,90,.7)' },
    { label:'假單', value:stats.leavePending, color:stats.leavePending>0?'rgba(190,70,60,.8)':'var(--ash)', tap:()=>navigate('/hr') },
    { label:'異常', value:stats.abnPending, color:stats.abnPending>0?'rgba(190,70,60,.8)':'var(--ash)', tap:()=>navigate('/operations') },
    { label:'月營收', value:'$'+monthRevenue.toLocaleString(), color:'rgba(196,163,90,.7)', tap:()=>navigate('/operations') },
    { label:'低庫存', value:stats.lowStock, color:stats.lowStock>0?'rgba(190,70,60,.8)':'rgba(100,170,100,.7)', tap:()=>navigate('/operations') },
    { label:'經銷待出', value:dealerPending, color:dealerPending>0?'rgba(190,70,60,.8)':'var(--ash)', tap:()=>navigate('/dealer-orders') },
  ]

  return (
    <div style={{padding:'0 20px 100px',maxWidth:460,margin:'0 auto'}}>

      {/* ══ Header ══ */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'36px 0 20px'}}>
        <div>
          <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:36,fontWeight:300,background:'linear-gradient(180deg,#f0e8d8 30%,rgba(196,163,90,.7))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',letterSpacing:4}}>W</div>
        </div>
        <div style={{textAlign:'right'}}>
          <span className="wcb-tag wcb-tag-gold">老闆</span>
          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'rgba(196,163,90,.35)',letterSpacing:1,marginTop:6}}>{format(new Date(), 'yyyy.MM.dd')}</div>
        </div>
      </div>
      <div style={{height:1,background:'linear-gradient(90deg,transparent,rgba(196,163,90,.2),transparent)',marginBottom:24}}/>

      <DashboardCards />

      {/* ══ Quick Stats ══ */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:20}}>
        {quickStats.map(s => (
          <div key={s.label} className="wcb-card" onClick={s.tap} style={{padding:10,textAlign:'center',cursor:s.tap?'pointer':'default',marginBottom:0}}>
            <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--ash)',letterSpacing:1}}>{s.label}</div>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:18,fontWeight:300,color:s.color,marginTop:3}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ══ Dangers ══ */}
      {dangers.length > 0 && (
        <div className="wcb-zone">
          <div className="wcb-zone-head"><div className="wcb-zone-accent gold" style={{background:'rgba(190,70,60,.3)'}}><div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(190,70,60,.8),rgba(190,70,60,.2))',animation:'wcb-shimmer 3s ease-in-out infinite'}}/></div><div className="wcb-zone-label" style={{color:'rgba(190,70,60,.8)'}}>🔥 今日警報</div><div className="wcb-zone-eng">Alerts</div></div>
          {dangers.map((d,i) => (
            <div key={i} className="wcb-card" onClick={()=>navigate(d.action)} style={{cursor:'pointer',display:'flex',alignItems:'center',gap:12,borderColor:d.severity>=80?'rgba(190,70,60,.2)':'rgba(245,158,11,.15)'}}>
              <div style={{fontSize:20,width:28,textAlign:'center',flexShrink:0}}>{d.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:'var(--serif)',fontSize:13,fontWeight:500,color:'var(--bone)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.label}</div>
                <div style={{fontFamily:'var(--mono)',fontSize:11,color:d.color,fontWeight:600}}>{d.detail}</div>
              </div>
              <span className={`wcb-tag ${d.type==='abnormal'?'wcb-tag-red':d.type==='sop'?'wcb-tag-gold':'wcb-tag-red'}`}>{d.type==='abnormal'?'異常':d.type==='sop'?'SOP':'庫存'}</span>
            </div>
          ))}
        </div>
      )}

      {/* ══ Navigation Cards ══ */}
      <div className="wcb-zone">
        <div className="wcb-zone-head"><div className="wcb-zone-accent gold"/><div className="wcb-zone-label">功能總覽</div><div className="wcb-zone-eng">Navigation</div></div>
        {cards.map(c => (
          <div key={c.path} className="wcb-card" style={{cursor:'pointer',display:'flex',alignItems:'center',gap:14}} onClick={() => ['/qrcode','/join'].some(p=>c.path.startsWith(p)) ? window.location.href=c.path : navigate(c.path)}>
            <div style={{width:40,height:40,borderRadius:10,background:'rgba(196,163,90,.06)',display:'flex',alignItems:'center',justifyContent:'center'}}><c.icon size={20} color="rgba(196,163,90,.5)" /></div>
            <div style={{flex:1}}><div style={{fontFamily:'var(--serif)',fontSize:14,fontWeight:500,color:'var(--bone)'}}>{c.label}</div><div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--smoke)',marginTop:2,letterSpacing:1}}>{c.sub}</div></div>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:18,color:'rgba(196,163,90,.2)'}}>›</div>
          </div>
        ))}
      </div>

      {/* ══ 今日出勤 ══ */}
      <div className="wcb-zone">
        <div className="wcb-zone-head"><div className="wcb-zone-accent blue"/><div className="wcb-zone-label">今日出勤</div><div className="wcb-zone-eng">Attendance</div></div>
        {scheds.length === 0 && <div style={{fontFamily:'var(--serif)',fontSize:13,color:'var(--smoke)',textAlign:'center',padding:20}}>今日無排班</div>}
        <div className="wcb-card" style={{padding:0,overflow:'hidden'}}>
          {scheds.map((s,i) => {
            const isOff = s.shift === '休假' || s.shift === '臨時請假'
            const ps = isOff ? null : getPunchStatus(s.employee_id)
            return (
              <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 18px',borderBottom:i<scheds.length-1?'1px solid rgba(196,163,90,.04)':'none'}}>
                <div><span style={{fontFamily:'var(--serif)',fontSize:13,fontWeight:500,color:'var(--bone)'}}>{s.employees?.name || s.employee_id}</span><span className={`wcb-tag ${isOff?'wcb-tag-blue':'wcb-tag-gold'}`} style={{marginLeft:8}}>{s.shift}</span></div>
                {ps ? (
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    {ps.status==='ok'&&<CheckCircle2 size={13} color={ps.color}/>}
                    {ps.status==='late'&&<AlertTriangle size={13} color={ps.color}/>}
                    {ps.status==='none'&&<XCircle size={13} color={ps.color}/>}
                    <span style={{fontFamily:'var(--mono)',fontSize:11,color:ps.color}}>{ps.label}</span>
                  </div>
                ) : <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--smoke)'}}>休假</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* ══ 雪茄獎勵簽核 ══ */}
      <BossCigarRewardSection />

      {/* ══ 任務追蹤 ══ */}
      {openActions.length > 0 && (
        <div className="wcb-zone">
          <div className="wcb-zone-head"><div className="wcb-zone-accent green"/><div className="wcb-zone-label">任務追蹤</div><div className="wcb-zone-eng">Tasks</div></div>
          <div className="wcb-card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <span className="wcb-tag wcb-tag-gold">{openActions.length} 項未完成</span>
              <button className="wcb-btn-outline" style={{fontSize:10,padding:'4px 12px'}} onClick={()=>navigate('/hr')}>週會報表 →</button>
            </div>
            {openActions.map(item => {
              const overdue = item.due_date && item.due_date < today
              return (
                <div key={item.id} style={{padding:'10px 0',borderTop:'1px solid rgba(196,163,90,.04)'}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:'var(--serif)',fontSize:13,fontWeight:500,color:overdue?'rgba(190,70,60,.8)':'var(--bone)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.title}</div>
                      <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--ash)',marginTop:3}}>
                        <span style={{color:'rgba(196,163,90,.6)'}}>{item.assigned_to_name}</span>
                        {item.due_date&&<span style={{marginLeft:8,color:overdue?'rgba(190,70,60,.6)':'var(--smoke)'}}>截止 {item.due_date}{overdue?' (逾期!)':''}</span>}
                        {item.priority!=='normal'&&<span style={{marginLeft:8,color:item.priority==='high'?'rgba(190,70,60,.7)':'#f59e0b'}}>{item.priority==='high'?'高':'緊急'}</span>}
                        {item.progress_note&&<span style={{marginLeft:8,color:'var(--smoke)'}}>💬 {item.progress_note}</span>}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:4,alignItems:'center',flexShrink:0}}>
                      <button className="wcb-btn-outline" style={{fontSize:9,padding:'3px 8px'}} onClick={()=>setReassigning(reassigning===item.id?null:item.id)}>🔀 轉派</button>
                      <span className={`wcb-tag ${item.status==='in_progress'?'wcb-tag-blue':'wcb-tag-gold'}`}>{item.status==='pending'?'待執行':'進行中'}</span>
                    </div>
                  </div>
                  {reassigning===item.id&&(
                    <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}}>
                      {allEmps.map(e=><button key={e.id} className="wcb-btn-outline" style={{fontSize:9,padding:'3px 8px',borderColor:e.id===item.assigned_to?'rgba(196,163,90,.3)':'rgba(196,163,90,.1)',color:e.id===item.assigned_to?'rgba(196,163,90,.8)':'var(--ash)'}} onClick={()=>reassignTask(item.id,e.id,e.name)}>{e.name}</button>)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══ 搶單排行 ══ */}
      {leaderboard.length > 0 && (
        <div className="wcb-card" style={{marginTop:16}}>
          <div style={{fontFamily:'var(--serif)',fontSize:13,color:'var(--bone)',marginBottom:12}}>🏆 {month.slice(5)}月搶單排行</div>
          {leaderboard.slice(0,5).map((x,i) => <div key={x.name} className="wcb-stat"><span className="wcb-stat-k">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`} {x.name}</span><span className="wcb-stat-v">{x.count} 單</span></div>)}
        </div>
      )}

      <div className="wcb-ornament">◇</div>
    </div>
  )
}
