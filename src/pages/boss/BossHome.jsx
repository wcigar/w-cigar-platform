import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Users, DollarSign, Settings, AlertTriangle, Trophy, Clock, Package, FileText, CheckCircle2, XCircle } from 'lucide-react'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function BossHome() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ emps: 0, working: 0, sop: 0, abnPending: 0, leavePending: 0, lowStock: 0 })
  const [scheds, setScheds] = useState([])
  const [punches, setPunches] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [lowItems, setLowItems] = useState([])
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = format(new Date(), 'yyyy-MM')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [eR, sR, tR, aR, lbR, leaveR, invR, punchR] = await Promise.all([
      supabase.from('employees').select('*').eq('is_active', true),
      supabase.from('schedules').select('*, employees(name)').eq('date', today),
      supabase.from('task_status').select('completed').eq('date', today),
      supabase.from('abnormal_reports').select('id', { count: 'exact' }).eq('status', '待處理'),
      supabase.from('task_status').select('completed_by').eq('owner', 'ALL').eq('completed', true).gte('date', month + '-01').lte('date', month + '-31'),
      supabase.from('leave_requests').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('inventory_master').select('id, name, current_stock, safe_stock, unit, category').eq('is_low', true).eq('enabled', true),
      supabase.from('punch_records').select('*').eq('date', today),
    ])
    const tasks = tR.data || [], sc = sR.data || [], emps = eR.data || [], low = invR.data || []
    setStats({
      emps: emps.length,
      working: sc.filter(s => s.shift_type !== '休假' && s.shift_type !== '臨時請假').length,
      sop: tasks.length ? Math.round(tasks.filter(t => t.completed).length / tasks.length * 100) : 0,
      abnPending: aR.count || 0,
      leavePending: leaveR.count || 0,
      lowStock: low.length,
    })
    setScheds(sc)
    setLowItems(low)
    setPunches(punchR.data || [])
    const counts = {}
    ;(lbR.data || []).forEach(r => { if (r.completed_by) counts[r.completed_by] = (counts[r.completed_by] || 0) + 1 })
    setLeaderboard(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
    setLoading(false)
  }

  const cards = [
    { icon: Briefcase, label: '營運管理', sub: `SOP ${stats.sop}%・異常 ${stats.abnPending}`, path: '/operations', color: 'var(--gold)' },
    { icon: Users, label: '人事排班', sub: `今日 ${stats.working} 人・假單 ${stats.leavePending}`, path: '/hr', color: '#4da86c' },
    { icon: DollarSign, label: '薪資財務', sub: '薪資・支出・勞健保', path: '/payroll', color: '#4d8ac4' },
    { icon: Settings, label: '系統設定', sub: '員工・SOP定義・KPI考核', path: '/settings', color: '#c44d4d' },
  ]

  // Punch status logic
  function getPunchStatus(empId, shift) {
    const punch = punches.find(p => p.employee_id === empId)
    if (!punch) return { status: 'none', label: '未打卡', color: 'var(--text-muted)' }
    if (punch.is_late) return { status: 'late', label: `遲到 ${punch.clock_in?.slice(11,16) || ''}`, color: 'var(--red)' }
    return { status: 'ok', label: punch.clock_in?.slice(11,16) || '已打卡', color: 'var(--green)' }
  }

  if (loading) return <div className="page-container">{[1,2,3,4].map(i => <div key={i} className="loading-shimmer" style={{ height: 90, marginBottom: 12 }} />)}</div>

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--gold)', fontWeight: 600 }}>老闆戰情室</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{format(new Date(), 'yyyy年M月d日 EEEE', { locale: zhTW })}</p>
      </div>

      {/* Quick stats - 6 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <SB label="在職" value={stats.emps} color="var(--gold)" />
        <SB label="今日出勤" value={stats.working} color="var(--green)" />
        <SB label="SOP完成" value={stats.sop + '%'} color={stats.sop === 100 ? 'var(--green)' : 'var(--gold)'} />
        <SB label="待審假單" value={stats.leavePending} color={stats.leavePending > 0 ? 'var(--red)' : 'var(--text-muted)'} tap={() => navigate('/hr')} />
        <SB label="異常待處理" value={stats.abnPending} color={stats.abnPending > 0 ? 'var(--red)' : 'var(--text-muted)'} tap={() => navigate('/operations')} />
        <SB label="低庫存" value={stats.lowStock} color={stats.lowStock > 0 ? 'var(--red)' : 'var(--green)'} tap={() => navigate('/operations')} />
      </div>

      {/* ⚠️ Alerts section */}
      {(stats.lowStock > 0 || stats.abnPending > 0 || stats.leavePending > 0) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} /> 需要注意
          </div>

          {stats.leavePending > 0 && (
            <div className="card" onClick={() => navigate('/hr')} style={{ padding: 12, marginBottom: 6, cursor: 'pointer', borderColor: 'rgba(196,77,77,.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <FileText size={16} color="var(--red)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>待審假單 {stats.leavePending} 筆</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>點擊前往審核</div>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
            </div>
          )}

          {stats.abnPending > 0 && (
            <div className="card" onClick={() => navigate('/operations')} style={{ padding: 12, marginBottom: 6, cursor: 'pointer', borderColor: 'rgba(196,77,77,.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={16} color="var(--red)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>異常待處理 {stats.abnPending} 筆</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>點擊前往處理</div>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
            </div>
          )}

          {stats.lowStock > 0 && (
            <div className="card" onClick={() => navigate('/operations')} style={{ padding: 12, marginBottom: 6, cursor: 'pointer', borderColor: 'rgba(196,77,77,.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Package size={16} color="var(--red)" />
                <div style={{ fontSize: 13, fontWeight: 600 }}>低庫存警報 {stats.lowStock} 項</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {lowItems.slice(0, 8).map(item => (
                  <span key={item.id} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: 'rgba(196,77,77,.12)', color: 'var(--red)', fontWeight: 600 }}>
                    {item.name} ({item.current_stock ?? 0}/{item.safe_stock}{item.unit})
                  </span>
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
          <div key={c.path} className="card" style={{ padding: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }} onClick={() => navigate(c.path)}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: c.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><c.icon size={22} color={c.color} /></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{c.label}</div><div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{c.sub}</div></div>
            <div style={{ color: 'var(--text-muted)', fontSize: 18 }}>›</div>
          </div>
        ))}
      </div>

      {/* Today schedule + punch status */}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={15} /> 今日出勤狀態
      </div>
      {scheds.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: 16 }}>今日無排班</div>}
      {scheds.map(s => {
        const isOff = s.shift_type === '休假' || s.shift_type === '臨時請假'
        const ps = isOff ? null : getPunchStatus(s.employee_id, s.shift_type)
        return (
          <div key={s.id} className="card" style={{ padding: 12, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{s.employees?.name || s.employee_id}</span>
              <span className={`badge ${isOff ? 'badge-blue' : 'badge-gold'}`} style={{ marginLeft: 8 }}>{s.shift_type}</span>
            </div>
            {ps ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {ps.status === 'ok' && <CheckCircle2 size={14} color={ps.color} />}
                {ps.status === 'late' && <AlertTriangle size={14} color={ps.color} />}
                {ps.status === 'none' && <XCircle size={14} color={ps.color} />}
                <span style={{ fontSize: 12, fontWeight: 600, color: ps.color }}>{ps.label}</span>
              </div>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>休假</span>
            )}
          </div>
        )
      })}

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Trophy size={16} color="var(--gold)" /><span style={{ fontSize: 14, fontWeight: 600 }}>{month.slice(5)}月搶單排行</span></div>
          {leaderboard.slice(0, 5).map((x, i) => (
            <div key={x.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
              <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {x.name}</span>
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
