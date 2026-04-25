import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, DollarSign, Settings, AlertTriangle, Trophy, Clock, Package, FileText, CheckCircle2, XCircle, Flame, BarChart3, UserCheck, Megaphone, QrCode } from 'lucide-react'
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
    setStats({
      emps: emps.length,
      working: sc.filter(s => s.shift !== '休假' && s.shift !== '臨時請假').length,
      sop: tasks.length ? Math.round(tasks.filter(t => t.completed).length / tasks.length * 100) : 0,
      abnPending: aR.count || 0,
      leavePending: leaveR.count || 0,
      lowStock: low.length,
    })
    setScheds(sc)
    setLowItems(low)
    setAllEmps(emps.filter(e => !e.is_admin))
    setPunches(punchR.data || [])
    setMonthRevenue((revR.data || []).reduce((s, r) => s + (+r.total || 0), 0))
    setPendingHandover((hoR.data || []).length)
    try { const { data: dpData } = await supabase.rpc('get_dealer_pending_orders'); if (dpData?.count !== undefined) setDealerPending(dpData.count) } catch {}
    try { const { data: vd } = await supabase.rpc('get_vip_dashboard'); if (vd?.total_unpaid !== undefined) setVipUnpaid(vd.total_unpaid) } catch {}

    // Build danger list
    const dangerList = []

    // 1. SLA overdue abnormals (highest priority)
    abns.forEach(a => {
      const sla = getSlaStatus(a)
      if (sla.status === 'overdue') dangerList.push({ type: 'abnormal', severity: 100, icon: '🚨', label: a.description?.slice(0, 20) || '異常報告', detail: sla.remaining, color: 'var(--red)', action: '/operations' })
      else if (sla.status === 'warning') dangerList.push({ type: 'abnormal', severity: 80, icon: '⚠️', label: a.description?.slice(0, 20) || '異常報告', detail: sla.remaining, color: '#f59e0b', action: '/operations' })
    })

    // 2. Overdue SOP tasks
    tasks.forEach(t => {
      const urg = getTaskUrgency(t)
      if (urg === 'overdue') dangerList.push({ type: 'sop', severity: 90, icon: '🔴', label: t.title?.slice(0, 20), detail: t.due_time + ' 已逾時', color: 'var(--red)', action: '/operations' })
      else if (urg === 'warning') dangerList.push({ type: 'sop', severity: 70, icon: '🟡', label: t.title?.slice(0, 20), detail: t.due_time + ' 即將到期', color: '#f59e0b', action: '/operations' })
    })

    // 3. Lowest stock items (sort by how far below safe stock)
    low.sort((a, b) => {
      const aRatio = (a.current_stock || 0) / (a.safe_stock || 1)
      const bRatio = (b.current_stock || 0) / (b.safe_stock || 1)
      return aRatio - bRatio
    }).slice(0, 5).forEach(item => {
      const ratio = (item.current_stock || 0) / (item.safe_stock || 1)
      dangerList.push({
        type: 'stock', severity: ratio === 0 ? 60 : 40, icon: '📦',
        label: item.name, detail: (item.current_stock ?? 0) + '/' + item.safe_stock + item.unit,
        color: ratio === 0 ? 'var(--red)' : '#f59e0b', action: '/oprations'
      })
    })

    // 4. 盤點提醒：每月最後3天全員盤點
    const nowDate = new Date()
    const lastDay = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate()
    if (lastDay - nowDate.getDate() <= 2) {
      const { data: invAssigned } = await supabase.from('inventory_master').select('owner').eq('enabled', true)
      const assignedStaff = [...new Set((invAssigned || []).map(i => i.owner).filter(Boolean))]
      if (assignedStaff.length) {
        const { data: todayRecords } = await supabase.from('inventory_records').select('staff_code').gte('created_at', today + 'T00:00:00')
        const doneStaff = new Set((todayRecords || []).map(r => r.staff_code))
        const pending = assignedStaff.filter(id => !doneStaff.has(id))
        if (pending.length) {
          const names = pending.map(id => emps.find(e => e.id === id)?.name || id).join('、')
          dangerList.push({ type: 'inventory', severity: 50, icon: '📦', label: '月底盤點未完成', detail: names, color: '#f59e0b', action: '/boss-inventory' })
        }
      }
    }

    dangerList.sort((a, b) => b.severity - a.severity)
    setDangers(dangerList.slice(0, 6))

    const counts = {}
    ;(lbR.data || []).forEach(r => { if (r.completed_by) counts[r.completed_by] = (counts[r.completed_by] || 0) + 1 })
    setLeaderboard(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
    // Open action items (pending + in_progress)
    const { data: aiData } = await supabase.from('meeting_action_items').select('*').in('status', ['pending', 'in_progress']).order('due_date', { ascending: true }).limit(6)
    setOpenActions(aiData || [])
    setLoading(false)
  }

  async function reassignTask(taskId, newEmpId, newEmpName) {
    await supabase.from('meeting_action_items').update({
      assigned_to: newEmpId, assigned_to_name: newEmpName,
      updated_at: new Date().toISOString(),
    }).eq('id', taskId)
    setReassigning(null)
    const { data } = await supabase.from('meeting_action_items').select('*').in('status', ['pending', 'in_progress']).order('due_date', { ascending: true }).limit(6)
    setOpenActions(data || [])
  }

  const cards = [
    { icon: Briefcase, label: '營運管理', sub: 'SOP ' + stats.sop + '%・異常 ' + stats.abnPending, path: '/operations', color: 'var(--gold)' },
    { icon: Users, label: '人事排班', sub: '今日 ' + stats.working + ' 人・假單 ' + stats.leavePending, path: '/hr', color: '#4da86c' },
    { icon: DollarSign, label: '薪資財務', sub: '薪資・支出・勞健保', path: '/payroll', color: '#4d8ac4' },
    { icon: Settings, label: '系統設定', sub: '員工・SOP定義・KPI考核', path: '/settings', color: '#c44d4d' },
    { icon: BarChart3, label: 'CRM 儀表板', sub: '客戶分析・RFM・生命週期', path: '/crm', color: '#e67e22' },
    { icon: UserCheck, label: '會員申請審核', sub: '入會申請・資格審核', path: '/members/registrations', color: '#1abc9c' },
    { icon: Megaphone, label: '行銷發送', sub: 'SMS・推播・優惠券', path: '/marketing', color: '#9b59b6' },
    { icon: QrCode, label: 'QR Code 入會', sub: '掃碼加入・推薦碼', path: '/qrcode', color: '#3498db' },
  ]

  function getPunchStatus(empId) {
    const punch = punches.find(p => p.employee_id === empId)
    if (!punch) return { status: 'none', label: '未打卡', color: 'var(--text-muted)' }
    if (punch.is_late) return { status: 'late', label: '遲到 ' + (punch.clock_in?.slice(11,16) || ''), color: 'var(--red)' }
    return { status: 'ok', label: punch.clock_in?.slice(11,16) || '已打卡', color: 'var(--green)' }
  }

  if (loading) return <div className="page-container">{[1,2,3,4].map(i => <div key={i} className="loading-shimmer" style={{ height: 90, marginBottom: 12 }} />)}</div>

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', fontWeight: 600 }}>老闆戰情室</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhTW })}</p>
      </div>

      <DashboardCards />

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <SB label="在職" value={stats.emps} color="var(--gold)" />
        <SB label="今日出勤" value={stats.working} color="var(--green)" />
        <SB label="SOP完成" value={stats.sop + '%'} color={stats.sop === 100 ? 'var(--green)' : 'var(--gold)'} />
        <SB label="待審假單" value={stats.leavePending} color={stats.leavePending > 0 ? 'var(--red)' : 'var(--text-muted)'} tap={() => navigate('/hr')} />
        <SB label="異常待處理" value={stats.abnPending} color={stats.abnPending > 0 ? 'var(--red)' : 'var(--text-muted)'} tap={() => navigate('/operations')} />
        <SB label="月營收" value={monthRevenue ? '$' + monthRevenue.toLocaleString() : '$0'} color="var(--gold)" tap={() => navigate('/operations')} />
        <SB label="待確認交班" value={pendingHandover} color={pendingHandover > 0 ? '#f59e0b' : 'var(--text-muted)'} />
        <SB label="低庫存" value={stats.lowStock} color={stats.lowStock > 0 ? 'var(--red)' : 'var(--green)'} tap={() => navigate('/operations')} />
        <SB label="經銷商待出貨" value={dealerPending} color={dealerPending > 0 ? 'var(--red)' : 'var(--text-muted)'} tap={() => navigate('/dealer-orders')} />
        <SB label="💎 VIP窖藏欠款" value={vipUnpaid ? '$' + vipUnpaid.toLocaleString() : '$0'} color={vipUnpaid > 0 ? 'var(--red)' : 'var(--text-muted)'} tap={() => navigate('/vip-cellar/admin')} />
      </div>

      {/* 🔥 Today's Top 5 Dangers */}
      {dangers.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Flame size={16} /> 今日最危險 {dangers.length} 項
          </div>
          {dangers.map((d, i) => (
            <div key={i} className="card" onClick={() => navigate(d.action)} style={{
              padding: 12, marginBottom: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              borderColor: d.severity >= 80 ? 'rgba(196,77,77,.4)' : 'rgba(245,158,11,.3)',
              background: d.severity >= 80 ? 'rgba(196,77,77,.04)' : 'rgba(245,158,11,.03)',
            }}>
              <div style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>{d.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</div>
                <div style={{ fontSize: 11, color: d.color, fontWeight: 700 }}>{d.detail}</div>
              </div>
              <div style={{
                fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 10, flexShrink: 0,
                background: d.type === 'abnormal' ? 'rgba(196,77,77,.15)' : d.type === 'sop' ? 'rgba(245,158,11,.15)' : 'rgba(196,77,77,.1)',
                color: d.color,
              }}>{d.type === 'abnormal' ? '異常' : d.type === 'sop' ? 'SOP' : '庫存'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Alert cards */}
      {(stats.lowStock > 0 || stats.abnPending > 0 || stats.leavePending > 0) && dangers.length === 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} /> 需要注意
          </div>
          {stats.leavePending > 0 && (
            <div className="card" onClick={() => navigate('/hr')} style={{ padding: 12, marginBottom: 6, cursor: 'pointer', borderColor: 'rgba(196,77,77,.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <FileText size={16} color="var(--red)" /><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>待審假單 {stats.leavePending} 筆</div></div><span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
            </div>
          )}
          {stats.lowStock > 0 && (
            <div className="card" onClick={() => navigate('/operations')} style={{ padding: 12, marginBottom: 6, cursor: 'pointer', borderColor: 'rgba(196,77,77,.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><Package size={16} color="var(--red)" /><div style={{ fontSize: 13, fontWeight: 600 }}>低庫存警報 {stats.lowStock} 項</div></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {lowItems.slice(0, 8).map(item => (
                  <span key={item.id} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: 'rgba(196,77,77,.12)', color: 'var(--red)', fontWeight: 600 }}>{item.name} ({item.current_stock ?? 0}/{item.safe_stock}{item.unit})</span>
                ))}
                {lowItems.length > 8 && <span style={{ fontSize: 10, color: 'var(--text-dim)', padding: '3px 8px' }}>+{lowItems.length - 8} 項</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4 category cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {cards.map(c => (
          <div key={c.path} className="card" style={{ padding: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }} onClick={() => {
            if (c.path === '/qrcode' || c.path === '/join' || c.path.startsWith('/vip-cellar')) {
              window.location.href = c.path
            } else {
              navigate(c.path)
            }
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: c.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><c.icon size={22} color={c.color} /></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{c.label}</div><div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{c.sub}</div></div>
            <div style={{ color: 'var(--text-muted)', fontSize: 18 }}>›</div>
          </div>
        ))}
      </div>

      {/* Today schedule + punch */}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={15} /> 今日出勤狀態</div>
      {scheds.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: 16 }}>今日無排班</div>}
      {scheds.map(s => {
        const isOff = s.shift === '休假' || s.shift === '臨時請假'
        const ps = isOff ? null : getPunchStatus(s.employee_id)
        return (
          <div key={s.id} className="card" style={{ padding: 12, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><span style={{ fontSize: 14, fontWeight: 500 }}>{s.employees?.name || s.employee_id}</span><span className={'badge ' + (isOff ? 'badge-blue' : 'badge-gold')} style={{ marginLeft: 8 }}>{s.shift}</span></div>
            {ps ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {ps.status === 'ok' && <CheckCircle2 size={14} color={ps.color} />}
                {ps.status === 'late' && <AlertTriangle size={14} color={ps.color} />}
                {ps.status === 'none' && <XCircle size={14} color={ps.color} />}
                <span style={{ fontSize: 12, fontWeight: 600, color: ps.color }}>{ps.label}</span>
              </div>
            ) : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>休假</span>}
          </div>
        )
      })}

      {/* Action items tracking */}
      {/* 雪茄獎勵簽核 */}
      <BossCigarRewardSection />

      {openActions.length > 0 && (
        <div className="card" style={{ marginTop: 16, marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>📋</span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>任務追蹤</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{openActions.length} 項未完成</span>
            </div>
            <button onClick={() => navigate('/hr')} style={{ fontSize: 11, color: 'var(--gold)', background: 'none', border: '1px solid var(--border-gold)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>週會報表 →</button>
          </div>
          {openActions.map(item => {
            const overdue = item.due_date && item.due_date < today
            const priorityColor = item.priority === 'high' ? 'var(--red)' : item.priority === 'urgent' ? '#f59e0b' : 'var(--text-muted)'
            return (
              <div key={item.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: overdue ? 'var(--red)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      <span style={{ color: 'var(--gold)' }}>{item.assigned_to_name}</span>
                      {item.due_date && <span style={{ marginLeft: 8, color: overdue ? 'var(--red)' : 'var(--text-dim)' }}>截止 {item.due_date}{overdue ? ' (逾期!)' : ''}</span>}
                      {item.priority !== 'normal' && <span style={{ marginLeft: 8, color: priorityColor, fontWeight: 600 }}>{item.priority === 'high' ? '高' : '緊急'}</span>}
                      {item.progress_note && <span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>💬 {item.progress_note}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    <button onClick={() => setReassigning(reassigning === item.id ? null : item.id)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--black-card)', color: 'var(--text-muted)', cursor: 'pointer' }}>🔀 轉派</button>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: item.status === 'in_progress' ? 'rgba(77,140,196,.15)' : 'rgba(201,168,76,.1)', color: item.status === 'in_progress' ? 'var(--blue)' : 'var(--gold)' }}>
                      {item.status === 'pending' ? '待執行' : '進行中'}
                    </span>
                  </div>
                </div>
                {reassigning === item.id && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {allEmps.map(e => (
                      <button key={e.id} onClick={() => reassignTask(item.id, e.id, e.name)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: '1px solid ' + (e.id === item.assigned_to ? 'var(--border-gold)' : 'var(--border)'), background: e.id === item.assigned_to ? 'rgba(201,168,76,.15)' : 'var(--black-card)', color: e.id === item.assigned_to ? 'var(--gold)' : 'var(--text)', cursor: 'pointer' }}>{e.name}</button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Trophy size={16} color="var(--gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>{month.slice(5)}月搶單排行</span></div>
          {leaderboard.slice(0, 5).map((x, i) => (
            <div key={x.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
              <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1) + '.'} {x.name}</span>
              <strong style={{ color: 'var(--gold)' }}>{x.count} 單</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SB({ label, value, color, tap }) {
  return (
    <div className="card" onClick={tap} style={{ padding: 10, textAlign: 'center', cursor: tap ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 600, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}
