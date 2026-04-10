import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, DollarSign, Settings, AlertTriangle, Trophy, Clock, Package, FileText, CheckCircle2, XCircle, Flame } from 'lucide-react'
import { format, endOfMonth } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { getTaskUrgency } from '../../lib/taskUtils'
import { getSlaStatus } from '../../lib/slaUtils'
import DashboardCards from '../../components/DashboardCards'

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
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = format(new Date(), 'yyyy-MM')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [eR, sR, tR, aR, lbR, leaveR, invR, punchR, revR, hoR, abnR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true),
      supabase.from('schedules').select('*').eq('date', today),
      supabase.from('task_status').select('*').eq('date', today),
      supabase.from('abnormal_reports').select('id', { count: 'exact' }).eq('status', 'å¾èç'),
      supabase.from('task_status').select('completed_by').eq('owner', 'ALL').eq('completed', true).gte('date', month + '-01').lte('date', format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')),
      supabase.from('leave_requests').select('id', { count: 'exact' }).eq('status', 'å¾å¯©æ ¸'),
      supabase.from('inventory_master').select('id, name, current_stock, safe_stock, unit, category').eq('is_low', true).eq('enabled', true),
      supabase.from('punch_records').select('*').eq('date', today),
      supabase.from('daily_revenue').select('total').gte('date', month + '-01').lte('date', format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')),
      supabase.from('shift_handover').select('id').eq('date', today).eq('acknowledged', false),
      supabase.from('abnormal_reports').select('*').neq('status', 'å·²è§£æ±º').order('time', { ascending: false }).limit(10),
    ])
    const tasks = tR.data || [], sc = sR.data || [], emps = eR.data || [], low = invR.data || [], abns = abnR.data || []
    setStats({
      emps: emps.length,
      working: sc.filter(s => s.shift !== 'ä¼å' && s.shift !== 'è¨æè«å').length,
      sop: tasks.length ? Math.round(tasks.filter(t => t.completed).length / tasks.length * 100) : 0,
      abnPending: aR.count || 0,
      leavePending: leaveR.count || 0,
      lowStock: low.length,
    })
    setScheds(sc)
    setLowItems(low)
    setPunches(punchR.data || [])
    setMonthRevenue((revR.data || []).reduce((s, r) => s + (+r.total || 0), 0))
    setPendingHandover((hoR.data || []).length)

    // Build danger list
    const dangerList = []

    // 1. SLA overdue abnormals (highest priority)
    abns.forEach(a => {
      const sla = getSlaStatus(a)
      if (sla.status === 'overdue') dangerList.push({ type: 'abnormal', severity: 100, icon: 'ð¨', label: a.description?.slice(0, 20) || 'ç°å¸¸å ±å', detail: sla.remaining, color: 'var(--red)', action: '/operations' })
      else if (sla.status === 'warning') dangerList.push({ type: 'abnormal', severity: 80, icon: 'â ï¸', label: a.description?.slice(0, 20) || 'ç°å¸¸å ±å', detail: sla.remaining, color: '#f59e0b', action: '/operations' })
    })

    // 2. Overdue SOP tasks
    tasks.forEach(t => {
      const urg = getTaskUrgency(t)
      if (urg === 'overdue') dangerList.push({ type: 'sop', severity: 90, icon: 'ð´', label: t.title?.slice(0, 20), detail: t.due_time + ' å·²é¾æ', color: 'var(--red)', action: '/operations' })
      else if (urg === 'warning') dangerList.push({ type: 'sop', severity: 70, icon: 'ð¡', label: t.title?.slice(0, 20), detail: t.due_time + ' å³å°å°æ', color: '#f59e0b', action: '/operations' })
    })

    // 3. Lowest stock items (sort by how far below safe stock)
    low.sort((a, b) => {
      const aRatio = (a.current_stock || 0) / (a.safe_stock || 1)
      const bRatio = (b.current_stock || 0) / (b.safe_stock || 1)
      return aRatio - bRatio
    }).slice(0, 5).forEach(item => {
      const ratio = (item.current_stock || 0) / (item.safe_stock || 1)
      dangerList.push({
        type: 'stock', severity: ratio === 0 ? 60 : 40, icon: 'ð¦',
        label: item.name, detail: (item.current_stock ?? 0) + '/' + item.safe_stock + item.unit,
        color: ratio === 0 ? 'var(--red)' : '#f59e0b', action: '/operations'
      })
    })

    dangerList.sort((a, b) => b.severity - a.severity)
    setDangers(dangerList.slice(0, 5))

    const counts = {}
    ;(lbR.data || []).forEach(r => { if (r.completed_by) counts[r.completed_by] = (counts[r.completed_by] || 0) + 1 })
    setLeaderboard(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
    setLoading(false)
  }

  const cards = [
    { icon: Briefcase, label: 'çéç®¡ç', sub: 'SOP ' + stats.sop + '%ã»ç°å¸¸ ' + stats.abnPending, path: '/operations', color: 'var(--gold)' },
    { icon: Users, label: 'äººäºæç­', sub: 'ä»æ¥ ' + stats.working + ' äººã»åå® ' + stats.leavePending, path: '/hr', color: '#4da86c' },
    { icon: DollarSign, label: 'èªè³è²¡å', sub: 'èªè³ã»æ¯åºã»åå¥ä¿', path: '/payroll', color: '#4d8ac4' },
    { icon: Settings, label: 'ç³»çµ±è¨­å®', sub: 'å¡å·¥ã»SOPå®ç¾©ã»KPIèæ ¸', path: '/settings', color: '#c44d4d' },
  ]

  function getPunchStatus(empId) {
    const punch = punches.find(p => p.employee_id === empId)
    if (!punch) return { status: 'none', label: 'æªæå¡', color: 'var(--text-muted)' }
    if (punch.is_late) return { status: 'late', label: 'é²å° ' + (punch.clock_in?.slice(11,16) || ''), color: 'var(--red)' }
    return { status: 'ok', label: punch.clock_in?.slice(11,16) || 'å·²æå¡', color: 'var(--green)' }
  }

  if (loading) return <div className="page-container">{[1,2,3,4].map(i => <div key={i} className="loading-shimmer" style={{ height: 90, marginBottom: 12 }} />)}</div>

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', fontWeight: 600 }}>èéæ°æå®¤</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{format(new Date(), 'yyyyå¹´Mædæ¥ EEEE', { locale: zhTW })}</p>
      </div>

      <DashboardCards />

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <SB label="å¨è·" value={stats.emps} color="var(--gold)" />
        <SB label="ä»æ¥åºå¤" value={stats.working} color="var(--green)" />
        <SB label="SOPå®æ" value={stats.sop + '%'} color={stats.sop === 100 ? 'var(--green)' : 'var(--gold)'} />
        <SB label="å¾å¯©åå®" value={stats.leavePending} color={stats.leavePending > 0 ? 'var(--red)' : 'var(--text-muted)'} tap={() => navigate('/hr')} />
        <SB label="ç°å¸¸å¾èç" value={stats.abnPending} color={stats.abnPending > 0 ? 'var(--red)' : 'var(--text-muted)'} tap={() => navigate('/operations')} />
        <SB label="æçæ¶" value={monthRevenue ? '$' + monthRevenue.toLocaleString() : '$0'} color="var(--gold)" tap={() => navigate('/operations')} />
        <SB label="å¾ç¢ºèªäº¤ç­" value={pendingHandover} color={pendingHandover > 0 ? '#f59e0b' : 'var(--text-muted)'} />
        <SB label="ä½åº«å­" value={stats.lowStock} color={stats.lowStock > 0 ? 'var(--red)' : 'var(--green)'} tap={() => navigate('/operations')} />
      </div>

      {/* ð¥ Today's Top 5 Dangers */}
      {dangers.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Flame size={16} /> ä»æ¥æå±éª {dangers.length} é 
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
              }}>{d.type === 'abnormal' ? 'ç°å¸¸' : d.type === 'sop' ? 'SOP' : 'åº«å­'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Alert cards */}
      {(stats.lowStock > 0 || stats.abnPending > 0 || stats.leavePending > 0) && dangers.length === 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} /> éè¦æ³¨æ
          </div>
          {stats.leavePending > 0 && (
            <div className="card" onClick={() => navigate('/hr')} style={{ padding: 12, marginBottom: 6, cursor: 'pointer', borderColor: 'rgba(196,77,77,.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <FileText size={16} color="var(--red)" /><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>å¾å¯©åå® {stats.leavePending} ç­</div></div><span style={{ color: 'var(--text-muted)', fontSize: 16 }}>âº</span>
            </div>
          )}
          {stats.lowStock > 0 && (
            <div className="card" onClick={() => navigate('/operations')} style={{ padding: 12, marginBottom: 6, cursor: 'pointer', borderColor: 'rgba(196,77,77,.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><Package size={16} color="var(--red)" /><div style={{ fontSize: 13, fontWeight: 600 }}>ä½åº«å­è­¦å ± {stats.lowStock} é </div></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {lowItems.slice(0, 8).map(item => (
                  <span key={item.id} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: 'rgba(196,77,77,.12)', color: 'var(--red)', fontWeight: 600 }}>{item.name} ({item.current_stock ?? 0}/{item.safe_stock}{item.unit})</span>
                ))}
                {lowItems.length > 8 && <span style={{ fontSize: 10, color: 'var(--text-dim)', padding: '3px 8px' }}>+{lowItems.length - 8} é </span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4 category cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {cards.map(c => (
          <div key={c.path} className="card" style={{ padding: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }} onClick={() => navigate(c.path)}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: c.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><c.icon size={22} color={c.color} /></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{c.label}</div><div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{c.sub}</div></div>
            <div style={{ color: 'var(--text-muted)', fontSize: 18 }}>âº</div>
          </div>
        ))}
      </div>

      {/* Today schedule + punch */}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={15} /> ä»æ¥åºå¤çæ</div>
      {scheds.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: 16 }}>ä»æ¥ç¡æç­</div>}
      {scheds.map(s => {
        const isOff = s.shift === 'ä¼å' || s.shift === 'è¨æè«å'
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
            ) : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ä¼å</span>}
          </div>
        )
      })}

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Trophy size={16} color="var(--gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>{month.slice(5)}ææ¶å®æè¡</span></div>
          {leaderboard.slice(0, 5).map((x, i) => (
            <div key={x.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
              <span>{i === 0 ? 'ð¥' : i === 1 ? 'ð¥' : i === 2 ? 'ð¥' : (i+1) + '.'} {x.name}</span>
              <strong style={{ color: 'var(--gold)' }}>{x.count} å®</strong>
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
