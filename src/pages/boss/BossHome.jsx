import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, DollarSign, Settings, AlertTriangle, Trophy, Clock, Package, FileText, CheckCircle2, XCircle, Flame, BarChart3, UserCheck, Megaphone, QrCode, ChevronDown, ChevronUp } from 'lucide-react'
import { format, endOfMonth } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { getTaskUrgency } from '../../lib/taskUtils'
import { getSlaStatus } from '../../lib/slaUtils'
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
  const [showDetails, setShowDetails] = useState(false)
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
    abns.forEach(a => { const sla = getSlaStatus(a); if (sla.status === 'overdue') dangerList.push({ type:'abnormal', severity:100, icon:'🚨', label:a.description?.slice(0,20)||'異常報告', detail:sla.remaining, color:'var(--red)', action:'/operations' }); else if (sla.status === 'warning') dangerList.push({ type:'abnormal', severity:80, icon:'⚠️', label:a.description?.slice(0,20)||'異常報告', detail:sla.remaining, color:'#f59e0b', action:'/operations' }) })
    tasks.forEach(t => { const urg = getTaskUrgency(t); if (urg === 'overdue') dangerList.push({ type:'sop', severity:90, icon:'🔴', label:t.title?.slice(0,20), detail:t.due_time+' 已逾時', color:'var(--red)', action:'/operations' }); else if (urg === 'warning') dangerList.push({ type:'sop', severity:70, icon:'🟡', label:t.title?.slice(0,20), detail:t.due_time+' 即將到期', color:'#f59e0b', action:'/operations' }) })
    low.sort((a, b) => (a.current_stock||0)/(a.safe_stock||1) - (b.current_stock||0)/(b.safe_stock||1)).slice(0,3).forEach(item => { const ratio = (item.current_stock||0)/(item.safe_stock||1); dangerList.push({ type:'stock', severity:ratio===0?60:40, icon:'📦', label:item.name, detail:(item.current_stock??0)+'/'+item.safe_stock+item.unit, color:ratio===0?'var(--red)':'#f59e0b', action:'/operations' }) })
    dangerList.sort((a,b) => b.severity - a.severity); setDangers(dangerList.slice(0,5))
    const counts = {}; (lbR.data||[]).forEach(r => { if (r.completed_by) counts[r.completed_by] = (counts[r.completed_by]||0)+1 }); setLeaderboard(Object.entries(counts).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count))
    const { data: aiData } = await supabase.from('meeting_action_items').select('*').in('status', ['pending','in_progress']).order('due_date', { ascending: true }).limit(6); setOpenActions(aiData || [])
    setLoading(false)
  }

  async function reassignTask(taskId, newEmpId, newEmpName) {
    await supabase.from('meeting_action_items').update({ assigned_to: newEmpId, assigned_to_name: newEmpName, updated_at: new Date().toISOString() }).eq('id', taskId)
    setReassigning(null); const { data } = await supabase.from('meeting_action_items').select('*').in('status', ['pending','in_progress']).order('due_date', { ascending: true }).limit(6); setOpenActions(data || [])
  }

  function getPunchStatus(empId) {
    const punch = punches.find(p => p.employee_id === empId)
    if (!punch) return { status:'none', label:'未打卡', color:'var(--text-muted)' }
    if (punch.is_late) return { status:'late', label:'遲到', color:'var(--red)' }
    return { status:'ok', label:'已打卡', color:'var(--green)' }
  }

  const alertCount = stats.abnPending + stats.leavePending + (stats.lowStock > 0 ? 1 : 0) + (dealerPending > 0 ? 1 : 0)

  if (loading) return <div className="page-container">{[1,2,3].map(i=><div key={i} className="loading-shimmer" style={{height:80,marginBottom:10}}/>)}</div>

  const navItems = [
    { icon: Briefcase, label: '營運', path: '/operations', badge: stats.abnPending > 0 ? stats.abnPending : null },
    { icon: Users, label: '人事', path: '/hr', badge: stats.leavePending > 0 ? stats.leavePending : null },
    { icon: DollarSign, label: '薪資', path: '/payroll' },
    { icon: Package, label: '庫存', path: '/boss-inventory', badge: stats.lowStock > 0 ? stats.lowStock : null },
    { icon: BarChart3, label: 'CRM', path: '/crm' },
    { icon: UserCheck, label: '會員', path: '/members/registrations' },
    { icon: Settings, label: '設定', path: '/settings' },
    { icon: QrCode, label: 'QR', path: '/qrcode' },
    { icon: FileText, label: '報關', path: '/admin/customs' },
  ]

  return (
    <div className="page-container fade-in">

      {/* ═══ 頂部：問候 + 日期 ═══ */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <div style={{fontSize:20,fontWeight:700,color:'var(--gold)'}}>老闆好</div>
          <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{format(new Date(), 'M月d日 EEEE', { locale: zhTW })}</div>
        </div>
        <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>{format(new Date(), 'yyyy.MM.dd')}</div>
      </div>

      {/* ═══ 第一層：4 大核心指標 ═══ */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
        <div className="card" style={{padding:14,textAlign:'center',cursor:'pointer',borderColor:monthRevenue>0?'rgba(77,168,108,.2)':'var(--border)'}} onClick={()=>navigate('/operations')}>
          <div style={{fontSize:10,color:'var(--text-dim)'}}>本月營收</div>
          <div style={{fontSize:22,fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--gold)',marginTop:4}}>${monthRevenue.toLocaleString()}</div>
        </div>
        <div className="card" style={{padding:14,textAlign:'center',cursor:'pointer'}} onClick={()=>navigate('/hr')}>
          <div style={{fontSize:10,color:'var(--text-dim)'}}>今日出勤</div>
          <div style={{fontSize:22,fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--green)',marginTop:4}}>{stats.working}<span style={{fontSize:12,color:'var(--text-muted)'}}>/{stats.emps}</span></div>
        </div>
        <div className="card" style={{padding:14,textAlign:'center',cursor:'pointer',borderColor:alertCount>0?'rgba(196,77,77,.2)':'var(--border)'}} onClick={()=>navigate('/operations')}>
          <div style={{fontSize:10,color:'var(--text-dim)'}}>待處理</div>
          <div style={{fontSize:22,fontFamily:'var(--font-mono)',fontWeight:700,color:alertCount>0?'var(--red)':'var(--green)',marginTop:4}}>{alertCount}</div>
        </div>
        <div className="card" style={{padding:14,textAlign:'center'}}>
          <div style={{fontSize:10,color:'var(--text-dim)'}}>SOP 完成</div>
          <div style={{fontSize:22,fontFamily:'var(--font-mono)',fontWeight:700,color:stats.sop===100?'var(--green)':'var(--gold)',marginTop:4}}>{stats.sop}%</div>
        </div>
      </div>

      {/* ═══ 第二層：警報（有才顯示）═══ */}
      {dangers.length > 0 && (
        <div className="card" style={{padding:14,marginBottom:16,borderColor:'rgba(196,77,77,.2)',background:'rgba(196,77,77,.03)'}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--red)',marginBottom:10,display:'flex',alignItems:'center',gap:6}}><Flame size={14}/> 需要注意 ({dangers.length})</div>
          {dangers.map((d,i) => (
            <div key={i} onClick={()=>navigate(d.action)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderTop:i>0?'1px solid var(--border)':'none',cursor:'pointer'}}>
              <span style={{fontSize:16,width:24,textAlign:'center'}}>{d.icon}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.label}</div><div style={{fontSize:11,color:d.color,fontWeight:600}}>{d.detail}</div></div>
              <span style={{fontSize:10,color:d.color,fontWeight:700}}>{d.type==='abnormal'?'異常':d.type==='sop'?'SOP':'庫存'}</span>
            </div>
          ))}
        </div>
      )}

      {/* ═══ 第三層：快速導航 2×4 圖標格 ═══ */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:20}}>
        {navItems.map(n => (
          <div key={n.path} onClick={()=>['/qrcode'].includes(n.path)?window.location.href=n.path:navigate(n.path)} style={{textAlign:'center',padding:'12px 4px',borderRadius:12,background:'var(--black-card)',border:'1px solid var(--border)',cursor:'pointer',position:'relative'}}>
            <n.icon size={20} color="var(--gold)" style={{margin:'0 auto 4px'}}/>
            <div style={{fontSize:10,color:'var(--text-dim)',fontWeight:600}}>{n.label}</div>
            {n.badge && <span style={{position:'absolute',top:4,right:4,minWidth:16,height:16,borderRadius:8,background:'var(--red)',color:'#fff',fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px'}}>{n.badge}</span>}
          </div>
        ))}
      </div>

      {/* ═══ 經銷商 + VIP 快捷 ═══ */}
      <div style={{display:'flex',gap:8,marginBottom:20}}>
        <div className="card" style={{flex:1,padding:12,cursor:'pointer',display:'flex',alignItems:'center',gap:10}} onClick={()=>navigate('/dealer-orders')}>
          <Megaphone size={18} color="var(--gold)"/>
          <div><div style={{fontSize:13,fontWeight:600}}>經銷商訂單</div>{dealerPending>0&&<div style={{fontSize:11,color:'var(--red)',fontWeight:700}}>{dealerPending} 筆待出貨</div>}</div>
        </div>
        <div className="card" style={{flex:1,padding:12,cursor:'pointer',display:'flex',alignItems:'center',gap:10}} onClick={()=>window.location.href='/vip-cellar/admin'}>
          <Trophy size={18} color="var(--gold)"/>
          <div><div style={{fontSize:13,fontWeight:600}}>VIP 窖藏</div>{vipUnpaid>0&&<div style={{fontSize:11,color:'var(--red)',fontWeight:700}}>欠款 ${vipUnpaid.toLocaleString()}</div>}</div>
        </div>
      </div>

      {/* ═══ 今日詳情（可收合）═══ */}
      <div className="card" style={{padding:0,marginBottom:16,overflow:'hidden'}}>
        <div onClick={()=>setShowDetails(!showDetails)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 16px',cursor:'pointer'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <Clock size={16} color="var(--gold)"/>
            <span style={{fontSize:14,fontWeight:700}}>今日詳情</span>
            <span style={{fontSize:11,color:'var(--text-muted)'}}>出勤 {stats.working} 人 · 任務 {openActions.length} 項</span>
          </div>
          {showDetails?<ChevronUp size={16} color="var(--text-muted)"/>:<ChevronDown size={16} color="var(--text-muted)"/>}
        </div>

        {showDetails && (
          <div style={{borderTop:'1px solid var(--border)'}}>
            {/* 出勤 */}
            <div style={{padding:'12px 16px'}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--gold)',marginBottom:8}}>👥 出勤狀態</div>
              {scheds.length===0?<div style={{fontSize:12,color:'var(--text-dim)',textAlign:'center',padding:8}}>今日無排班</div>:
                scheds.map(s => {
                  const isOff = s.shift==='休假'||s.shift==='臨時請假'
                  const ps = isOff?null:getPunchStatus(s.employee_id)
                  return <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
                    <span>{s.employees?.name||s.employee_id} <span className={`badge ${isOff?'badge-blue':'badge-gold'}`} style={{fontSize:10,padding:'2px 6px'}}>{s.shift}</span></span>
                    {ps?<span style={{color:ps.color,fontWeight:600,display:'flex',alignItems:'center',gap:3}}>
                      {ps.status==='ok'&&<CheckCircle2 size={12}/>}{ps.status==='late'&&<AlertTriangle size={12}/>}{ps.status==='none'&&<XCircle size={12}/>}{ps.label}
                    </span>:<span style={{color:'var(--text-muted)'}}>休假</span>}
                  </div>
                })}
            </div>

            {/* 任務 */}
            {openActions.length>0&&(
              <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:600,color:'var(--gold)'}}>📋 任務追蹤 ({openActions.length})</span>
                  <button onClick={()=>navigate('/hr')} style={{fontSize:10,color:'var(--gold)',background:'none',border:'1px solid var(--border-gold)',borderRadius:6,padding:'2px 8px',cursor:'pointer'}}>週會 →</button>
                </div>
                {openActions.map(item => {
                  const overdue = item.due_date && item.due_date < today
                  return <div key={item.id} style={{padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <span style={{fontWeight:600,color:overdue?'var(--red)':'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block'}}>{item.title}</span>
                        <span style={{fontSize:10,color:'var(--text-muted)'}}>{item.assigned_to_name}{item.due_date&&` · ${item.due_date}`}{overdue&&' ⚠️'}</span>
                      </div>
                      <div style={{display:'flex',gap:4,alignItems:'center',flexShrink:0}}>
                        <button onClick={()=>setReassigning(reassigning===item.id?null:item.id)} style={{fontSize:9,padding:'2px 6px',borderRadius:4,border:'1px solid var(--border)',background:'var(--black-card)',color:'var(--text-muted)',cursor:'pointer'}}>🔀</button>
                        <span className={`badge ${item.status==='in_progress'?'badge-blue':'badge-gold'}`} style={{fontSize:9,padding:'2px 6px'}}>{item.status==='pending'?'待辦':'進行'}</span>
                      </div>
                    </div>
                    {reassigning===item.id&&<div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:4}}>{allEmps.map(e=><button key={e.id} onClick={()=>reassignTask(item.id,e.id,e.name)} style={{fontSize:9,padding:'2px 6px',borderRadius:4,border:'1px solid var(--border)',background:e.id===item.assigned_to?'var(--gold-glow)':'var(--black-card)',color:e.id===item.assigned_to?'var(--gold)':'var(--text-muted)',cursor:'pointer'}}>{e.name}</button>)}</div>}
                  </div>
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ 雪茄獎勵簽核 ═══ */}
      <BossCigarRewardSection />

      {/* ═══ 搶單排行 ═══ */}
      {leaderboard.length>0&&(
        <div className="card" style={{padding:14,marginTop:12}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}><Trophy size={14} color="var(--gold)"/><span style={{fontSize:13,fontWeight:600}}>{month.slice(5)}月搶單排行</span></div>
          {leaderboard.slice(0,3).map((x,i) => <div key={x.name} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:12,borderBottom:'1px solid var(--border)'}}><span>{['🥇','🥈','🥉'][i]} {x.name}</span><strong style={{color:'var(--gold)',fontFamily:'var(--font-mono)'}}>{x.count} 單</strong></div>)}
        </div>
      )}
    </div>
  )
}
