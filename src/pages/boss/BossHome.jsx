import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, DollarSign, Settings, AlertTriangle, Trophy, Clock, Package, FileText, CheckCircle2, XCircle, Flame, BarChart3, UserCheck, Megaphone, QrCode, Wine, Building2, Truck, Receipt, Coins, Edit3, ChevronDown, ChevronUp } from 'lucide-react'
import { format, endOfMonth } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { getTaskUrgency } from '../../lib/taskUtils'
import { getSlaStatus } from '../../lib/slaUtils'

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
  const [dealerUnsettled, setDealerUnsettled] = useState(0)
  const [dealerUnsettledCount, setDealerUnsettledCount] = useState(0)
  const [openActions, setOpenActions] = useState([])
  const [allEmps, setAllEmps] = useState([])
  const [reassigning, setReassigning] = useState(null)
  const [vipUnpaid, setVipUnpaid] = useState(0)
  const [showMoreStats, setShowMoreStats] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showActions, setShowActions] = useState(true)
  const [today, setToday] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'))

  useEffect(() => { load() }, [today])
  useEffect(() => {
    const tick = () => {
      const t = format(new Date(), 'yyyy-MM-dd')
      const m = format(new Date(), 'yyyy-MM')
      setToday(p => p !== t ? t : p)
      setMonth(p => p !== m ? m : p)
    }
    const id = setInterval(tick, 60000)
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  async function load() {
    setLoading(true)
    const yesterdayStr = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')
    const [eR, sR, tR, aR, lbR, leaveR, invR, punchR, revR, hoR, abnR, audR] = await Promise.all([
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
      supabase.from('task_status').select('id', { count: 'exact' }).eq('date', yesterdayStr).eq('completed', true).not('photo_url', 'is', null).neq('photo_url', '').or('audit_status.is.null,audit_status.eq.'),
    ])
    const tasks = tR.data || [], sc = sR.data || [], emps = eR.data || [], low = invR.data || [], abns = abnR.data || []
    setStats({
      emps: emps.length,
      working: sc.filter(s => s.shift !== '休假' && s.shift !== '臨時請假').length,
      sop: tasks.length ? Math.round(tasks.filter(t => t.completed).length / tasks.length * 100) : 0,
      abnPending: aR.count || 0,
      leavePending: leaveR.count || 0,
      lowStock: low.length,
      pendingAudit: audR.count || 0,
    })
    setScheds(sc); setLowItems(low); setAllEmps(emps.filter(e => !e.is_admin)); setPunches(punchR.data || [])
    setMonthRevenue((revR.data || []).reduce((s, r) => s + (+r.total || 0), 0))
    setPendingHandover((hoR.data || []).length)
    try { const { data: dpData } = await supabase.rpc('get_dealer_pending_orders'); if (dpData?.count !== undefined) setDealerPending(dpData.count) } catch {}
    try { const { data: vd } = await supabase.rpc('get_vip_dashboard'); if (vd?.total_unpaid !== undefined) setVipUnpaid(vd.total_unpaid) } catch {}
    // 跨 project fetch dealer Supabase 月結未結算總額
    try {
      const DEALER_URL = 'https://oecagouzanoddmwfrvka.supabase.co'
      const DEALER_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY2Fnb3V6YW5vZGRtd2ZydmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjQxMDIsImV4cCI6MjA5MTI0MDEwMn0.QTfo2sCcZLbOwHLm_ybzvOWPzO_sJYwCQyOHgNTU7Y8'
      const r = await fetch(DEALER_URL + '/rest/v1/rpc/dealer_unsettled_total', {
        method: 'POST',
        headers: { 'apikey': DEALER_ANON, 'Authorization': 'Bearer ' + DEALER_ANON, 'Content-Type': 'application/json' },
        body: '{}'
      })
      const d = await r.json()
      if (d?.total_amount !== undefined) {
        setDealerUnsettled(+d.total_amount || 0)
        setDealerUnsettledCount(+d.order_count || 0)
      }
    } catch (e) { console.error('dealer unsettled fetch:', e) }

    const dangerList = []
    abns.forEach(a => {
      const sla = getSlaStatus(a)
      if (sla.status === 'overdue') dangerList.push({ type: 'abnormal', severity: 100, icon: '🚨', label: a.description?.slice(0, 20) || '異常報告', detail: sla.remaining, color: 'var(--red)', action: '/operations' })
      else if (sla.status === 'warning') dangerList.push({ type: 'abnormal', severity: 80, icon: '⚠️', label: a.description?.slice(0, 20) || '異常報告', detail: sla.remaining, color: '#f59e0b', action: '/operations' })
    })
    tasks.forEach(t => {
      const urg = getTaskUrgency(t)
      if (urg === 'overdue') dangerList.push({ type: 'sop', severity: 90, icon: '🔴', label: t.title?.slice(0, 20), detail: t.due_time + ' 已逾時', color: 'var(--red)', action: '/operations' })
      else if (urg === 'warning') dangerList.push({ type: 'sop', severity: 70, icon: '🟡', label: t.title?.slice(0, 20), detail: t.due_time + ' 即將到期', color: '#f59e0b', action: '/operations' })
    })
    low.sort((a, b) => ((a.current_stock || 0) / (a.safe_stock || 1)) - ((b.current_stock || 0) / (b.safe_stock || 1))).slice(0, 5).forEach(item => {
      const ratio = (item.current_stock || 0) / (item.safe_stock || 1)
      dangerList.push({ type: 'stock', severity: ratio === 0 ? 60 : 40, icon: '📦', label: item.name, detail: (item.current_stock ?? 0) + '/' + item.safe_stock + item.unit, color: ratio === 0 ? 'var(--red)' : '#f59e0b', action: '/operations' })
    })
    dangerList.sort((a, b) => b.severity - a.severity)
    setDangers(dangerList.slice(0, 6))

    const counts = {}
    ;(lbR.data || []).forEach(r => { if (r.completed_by) counts[r.completed_by] = (counts[r.completed_by] || 0) + 1 })
    setLeaderboard(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
    const { data: aiData } = await supabase.from('meeting_action_items').select('*').in('status', ['pending', 'in_progress']).order('due_date', { ascending: true }).limit(6)
    setOpenActions(aiData || [])
    setLoading(false)
  }

  async function reassignTask(taskId, newEmpId, newEmpName) {
    await supabase.from('meeting_action_items').update({ assigned_to: newEmpId, assigned_to_name: newEmpName, updated_at: new Date().toISOString() }).eq('id', taskId)
    setReassigning(null)
    const { data } = await supabase.from('meeting_action_items').select('*').in('status', ['pending', 'in_progress']).order('due_date', { ascending: true }).limit(6)
    setOpenActions(data || [])
  }

  // === 主要 menu（5 個常用）===
  const mainCards = [
    { icon: Briefcase, label: '營運管理', sub: 'SOP ' + stats.sop + '% · 異常 ' + stats.abnPending, path: '/operations', color: '#c9a84c' },
    { icon: CheckCircle2, label: '環境整潔查核', sub: '昨日待審 ' + (stats.pendingAudit || 0), path: '/audit-tasks', color: '#d4af37' },
    { icon: Users, label: '人事排班', sub: '今日 ' + stats.working + ' 人 · 假單 ' + stats.leavePending, path: '/hr', color: '#4da86c' },
    { icon: DollarSign, label: '薪資財務', sub: '薪資 · 支出 · 勞健保', path: '/payroll', color: '#4d8ac4' },
    { icon: Package, label: '庫存盤點', sub: '進貨 · 庫存 · 盤點', path: '/boss-inventory', color: '#7a8c4d' },
    { icon: Edit3, label: '補打卡', sub: '老闆/會計代員工補登', path: '/admin-punch', color: '#a47a4a' },
    { icon: Clock, label: '全員打卡', sub: '檢視+修正每位員工打卡', path: '/punch-all', color: '#6b8e7a' },
  ]

  // === 進階 menu（折疊起來）===
  const moreCards = [
    { icon: Settings, label: '系統設定', sub: '員工 · SOP · KPI', path: '/settings', color: '#c44d4d' },
    { icon: FileText, label: '報關', sub: '裝箱單 · 發票', path: '/admin/customs', color: '#7d6e5c' },
    { icon: BarChart3, label: 'CRM 儀表板', sub: '客戶分析 · RFM', path: '/crm', color: '#e67e22' },
    { icon: UserCheck, label: '會員審核', sub: '入會申請', path: '/members/registrations', color: '#1abc9c' },
    { icon: Megaphone, label: '行銷發送', sub: 'SMS · 推播', path: '/marketing', color: '#9b59b6' },
    { icon: QrCode, label: 'QR 入會', sub: '掃碼推薦', path: '/qrcode', color: '#3498db' },
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
      {/* === Header === */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', fontWeight: 600 }}>老闆戰情室</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhTW })}</p>
      </div>

      {/* === Zone 1：今日警示（最緊急的事優先） === */}
      {dangers.length > 0 ? (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Flame size={15} /> 今日要處理 {dangers.length} 項
          </div>
          {dangers.slice(0, 4).map((d, i) => (
            <div key={i} className="card" onClick={() => navigate(d.action)} style={{
              padding: 12, marginBottom: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              borderColor: d.severity >= 80 ? 'rgba(196,77,77,.4)' : 'rgba(245,158,11,.3)',
              background: d.severity >= 80 ? 'rgba(196,77,77,.04)' : 'rgba(245,158,11,.03)',
            }}>
              <div style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>{d.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</div>
                <div style={{ fontSize: 11, color: d.color, fontWeight: 700 }}>{d.detail}</div>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
            </div>
          ))}
          {dangers.length > 4 && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: 6 }}>還有 {dangers.length - 4} 項 · 點上方項目進去處理</div>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 14, marginBottom: 20, textAlign: 'center', borderColor: 'rgba(77,168,108,.3)', background: 'rgba(77,168,108,.05)' }}>
          <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>✅ 今日無待處理警示</span>
        </div>
      )}

      {/* === Zone 2：核心指標（4 個大數字 + 點開看更多） === */}
      {/* 經銷商月結 — 拉出折疊區放最明顯位置（單獨橫排） */}
      <div
        onClick={() => window.open('https://dealer.wcigarbar.com/admin', '_blank')}
        style={{
          cursor: 'pointer', marginBottom: 8, padding: '14px 18px', borderRadius: 12,
          background: dealerUnsettled > 0 ? 'linear-gradient(135deg, rgba(245,158,11,.18), rgba(245,158,11,.06))' : 'rgba(255,255,255,.03)',
          border: `1px solid ${dealerUnsettled > 0 ? 'rgba(245,158,11,.45)' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: dealerUnsettled > 0 ? '#f59e0b' : 'var(--text-dim)', fontWeight: 700, letterSpacing: 1 }}>💳 經銷商月結 · 未付款</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{dealerUnsettledCount > 0 ? `${dealerUnsettledCount} 筆未結算 · 點擊查看明細` : '目前無未結帳訂單'}</div>
        </div>
        <div style={{ fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 700, color: dealerUnsettled > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
          ${dealerUnsettled.toLocaleString()}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 8 }}>
        <SB label="本月營收" value={monthRevenue ? '$' + (monthRevenue/1000).toFixed(0) + 'K' : '$0'} color="var(--gold)" tap={() => navigate('/operations')} big />
        <SB label="SOP 達成" value={stats.sop + '%'} color={stats.sop === 100 ? 'var(--green)' : stats.sop >= 70 ? 'var(--gold)' : 'var(--red)'} big />
        <SB label="待審假單" value={stats.leavePending} color={stats.leavePending > 0 ? 'var(--red)' : 'var(--text-muted)'} tap={() => navigate('/hr')} big />
        <SB label="待辦任務" value={openActions.length} color={openActions.length > 0 ? 'var(--gold)' : 'var(--text-muted)'} big />
      </div>
      <button onClick={() => setShowMoreStats(!showMoreStats)} style={{ width: '100%', fontSize: 11, color: 'var(--text-dim)', background: 'none', border: 'none', padding: '4px 0', marginBottom: 12, cursor: 'pointer' }}>
        {showMoreStats ? '收合詳細指標 ▴' : '展開更多指標（在職/出勤/低庫存/交班/經銷/VIP欠款）▾'}
      </button>
      {showMoreStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
          <SB label="在職" value={stats.emps} color="var(--gold)" />
          <SB label="今日出勤" value={stats.working} color="var(--green)" />
          <SB label="異常待處理" value={stats.abnPending} color={stats.abnPending > 0 ? 'var(--red)' : 'var(--text-muted)'} tap={() => navigate('/operations')} />
          <SB label="低庫存" value={stats.lowStock} color={stats.lowStock > 0 ? 'var(--red)' : 'var(--green)'} tap={() => navigate('/operations')} />
          <SB label="待交班" value={pendingHandover} color={pendingHandover > 0 ? '#f59e0b' : 'var(--text-muted)'} />
          <SB label="經銷待出貨" value={dealerPending} color={dealerPending > 0 ? 'var(--red)' : 'var(--text-muted)'} tap={() => navigate('/dealer-orders')} />
          <SB label="VIP 欠款" value={vipUnpaid ? '$' + (vipUnpaid/1000).toFixed(0) + 'K' : '$0'} color={vipUnpaid > 0 ? 'var(--red)' : 'var(--text-muted)'} tap={() => navigate('/vip-cellar/admin')} />
        </div>
      )}

      {/* === 環境整潔查核 醒目 banner（永遠顯示、有待審紅色強調） === */}
      <div
        onClick={() => navigate('/audit-tasks')}
        style={{
          cursor: 'pointer', marginBottom: 12, padding: '18px 20px', borderRadius: 14,
          background: (stats.pendingAudit || 0) > 0
            ? 'linear-gradient(135deg, rgba(196,77,77,.25), rgba(196,77,77,.08))'
            : 'linear-gradient(135deg, rgba(212,175,55,.18), rgba(212,175,55,.04))',
          border: `2px solid ${(stats.pendingAudit || 0) > 0 ? 'rgba(196,77,77,.6)' : 'rgba(212,175,55,.5)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          boxShadow: (stats.pendingAudit || 0) > 0 ? '0 4px 16px rgba(196,77,77,.2)' : '0 2px 8px rgba(212,175,55,.15)',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: (stats.pendingAudit || 0) > 0 ? '#ff6b6b' : '#d4af37', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            🧹 環境整潔查核
            {(stats.pendingAudit || 0) > 0 && <span style={{ fontSize: 10, padding: '3px 10px', background: 'rgba(196,77,77,.3)', color: '#fff', borderRadius: 12, fontWeight: 700, letterSpacing: 1 }}>急</span>}
          </div>
          <div style={{ fontSize: 12, color: (stats.pendingAudit || 0) > 0 ? '#ffb4b4' : 'var(--text-dim)', marginTop: 4, fontWeight: 600 }}>
            {(stats.pendingAudit || 0) > 0
              ? `昨日 ${stats.pendingAudit} 筆照片等查核 → 點我審`
              : '✓ 昨日照片皆已審完'}
          </div>
        </div>
        <div style={{ fontSize: 36, fontFamily: 'var(--font-mono)', fontWeight: 800, color: (stats.pendingAudit || 0) > 0 ? '#ff6b6b' : '#d4af37' }}>
          {stats.pendingAudit || 0}
        </div>
      </div>

      {/* === Zone 3：功能入口（5 大常用 + 6 個進階折疊） === */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>主要功能</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mainCards.map(c => <MenuCard key={c.path} card={c} navigate={navigate} />)}
        </div>
      </div>

      <button onClick={() => setShowMoreMenu(!showMoreMenu)} style={{ width: '100%', fontSize: 12, color: 'var(--text-dim)', background: 'none', border: '1px dashed var(--border)', padding: 10, marginBottom: 12, cursor: 'pointer', borderRadius: 8 }}>
        {showMoreMenu ? '收合進階功能 ▴' : '更多功能（設定 / 報關 / CRM / 行銷 / QR Code）▾'}
      </button>
      {showMoreMenu && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {moreCards.map(c => <MenuCard key={c.path} card={c} navigate={navigate} />)}
        </div>
      )}

      {/* === Zone 4：詳細資訊（預設折疊） === */}
      <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <button onClick={() => setShowSchedule(!showSchedule)} style={{ width: '100%', fontSize: 13, fontWeight: 600, color: 'var(--gold)', background: 'none', border: 'none', padding: 6, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={14} /> 今日出勤狀態 {showSchedule ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showSchedule && (
          <div style={{ marginTop: 8 }}>
            {scheds.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: 12 }}>今日無排班</div>}
            {scheds.map(s => {
              const isOff = s.shift === '休假' || s.shift === '臨時請假'
              const ps = isOff ? null : getPunchStatus(s.employee_id)
              return (
                <div key={s.id} className="card" style={{ padding: 10, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><span style={{ fontSize: 13, fontWeight: 500 }}>{s.employees?.name || s.employee_id}</span><span className={'badge ' + (isOff ? 'badge-blue' : 'badge-gold')} style={{ marginLeft: 8 }}>{s.shift}</span></div>
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
          </div>
        )}
      </div>

      {openActions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setShowActions(!showActions)} style={{ width: '100%', fontSize: 13, fontWeight: 600, color: 'var(--gold)', background: 'none', border: 'none', padding: 6, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            📋 任務追蹤 ({openActions.length}) {showActions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showActions && (
            <div className="card" style={{ marginTop: 8, padding: 10 }}>
              {openActions.map(item => {
                const overdue = item.due_date && item.due_date < today
                return (
                  <div key={item.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: overdue ? 'var(--red)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          <span style={{ color: 'var(--gold)' }}>{item.assigned_to_name}</span>
                          {item.due_date && <span style={{ marginLeft: 8, color: overdue ? 'var(--red)' : 'var(--text-dim)' }}>截止 {item.due_date}{overdue ? ' (逾期!)' : ''}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                        <button onClick={() => setReassigning(reassigning === item.id ? null : item.id)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--black-card)', color: 'var(--text-muted)', cursor: 'pointer' }}>🔀</button>
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
        </div>
      )}

      {/* === 月排行（已折疊，需手動展開）=== */}
      {leaderboard.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Trophy size={14} /> {month.slice(5)}月搶單排行
          </summary>
          <div className="card" style={{ marginTop: 8, padding: 12 }}>
            {leaderboard.slice(0, 5).map((x, i) => (
              <div key={x.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1) + '.'} {x.name}</span>
                <strong style={{ color: 'var(--gold)' }}>{x.count} 單</strong>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function SB({ label, value, color, tap, big }) {
  return (
    <div className="card" onClick={tap} style={{ padding: big ? 14 : 10, textAlign: 'center', cursor: tap ? 'pointer' : 'default' }}>
      <div style={{ fontSize: big ? 11 : 9, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: big ? 24 : 16, fontFamily: 'var(--font-mono)', fontWeight: 600, color, marginTop: big ? 4 : 2 }}>{value}</div>
    </div>
  )
}

function MenuCard({ card, navigate }) {
  return (
    <div className="card" style={{ padding: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => {
      if (card.path === '/qrcode' || card.path === '/join' || card.path.startsWith('/vip-cellar')) window.location.href = card.path
      else navigate(card.path)
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: card.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <card.icon size={20} color={card.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{card.label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{card.sub}</div>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</div>
    </div>
  )
}
