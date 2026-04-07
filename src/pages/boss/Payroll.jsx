import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { calcLaborIns, calcHealthIns, calcLaborPension, calcLaborInsER, calcHealthInsER, findBracket, LABOR_INS_BRACKETS, HEALTH_INS_BRACKETS, LEAVE_TYPES } from '../../lib/constants'
import { ChevronDown, ChevronUp, Plus, Calculator, FileText } from 'lucide-react'
import { format, subMonths } from 'date-fns'

export default function Payroll() {
  const [tab, setTab] = useState('payroll')
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [emps, setEmps] = useState([])
  const [salConfigs, setSalConfigs] = useState([])
  const [bonuses, setBonuses] = useState([])
  const [expenses, setExpenses] = useState([])
  const [schedules, setSchedules] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [newExp, setNewExp] = useState({ category: '', item: '', amount: '' })
  const [showExpForm, setShowExpForm] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01', e = month + '-31'
    const [eR, sR, bR, xR, scR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true).order('name'),
      supabase.from('salary_config').select('*'),
      supabase.from('bonus_definitions').select('*').eq('enabled', true),
      supabase.from('expenses').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }),
      supabase.from('schedules').select('*').gte('date', s).lte('date', e),
    ])
    setEmps((eR.data || []).filter(x => !x.is_admin))
    setSalConfigs(sR.data || []); setBonuses(bR.data || [])
    setExpenses(xR.data || []); setSchedules(scR.data || [])
    setLoading(false)
  }

  function getCfg(eid) { return salConfigs.find(s => s.employee_id === eid) || {} }

  function getAttendance(eid) {
    const empScheds = schedules.filter(s => s.employee_id === eid)
    let work = 0, sick = 0, personal = 0, off = 0, special = 0
    empScheds.forEach(s => {
      const v = s.shift || ''
      if (v === '早班' || v === '晚班') work++
      else if (v === '病假') sick++
      else if (v === '事假') personal++
      else if (v === '特休') special++
      else if (v === '休假' || v === '臨時請假' || v === '調班') off++
    })
    return { work, sick, personal, off, special, total: empScheds.length }
  }

  function calcPay(emp) {
    const c = getCfg(emp.id), base = c.monthly_salary || 0
    const att = getAttendance(emp.id)
    const lb = findBracket(base, LABOR_INS_BRACKETS), hb = findBracket(base, HEALTH_INS_BRACKETS)
    const li = calcLaborIns(base), hi = calcHealthIns(base), lp = calcLaborPension(base)
    const liER = calcLaborInsER(base), hiER = calcHealthInsER(base)
    const empBon = bonuses.filter(b => b.employee_id === emp.id).reduce((s, b) => s + (b.amount || 0), 0)
    const dailyRate = base > 0 ? Math.round(base / 30) : 0
    const sickDeduct = Math.round(att.sick * dailyRate * 0.5)
    const personalDeduct = att.personal * dailyRate
    const deduct = li + hi + sickDeduct + personalDeduct
    const net = base + empBon - deduct
    return { base, empBon, li, hi, lp, liER, hiER, lb, hb, deduct, net, erCost: base + empBon + liER + hiER + lp, att, sickDeduct, personalDeduct, dailyRate, bonusItems: bonuses.filter(b => b.employee_id === emp.id) }
  }

  async function addExpense() {
    if (!newExp.category || !newExp.amount) return
    await supabase.from('expenses').insert({ ...newExp, amount: +newExp.amount, date: format(new Date(), 'yyyy-MM-dd'), handler: 'ADMIN' })
    logAudit('Expense', `新增支出 ${newExp.item} $${newExp.amount}`, 'ADMIN')
    setNewExp({ category: '', item: '', amount: '' }); setShowExpForm(false); load()
  }

  async function deleteExpense(id) {
    if (!confirm('確定刪除？')) return
    await supabase.from('expenses').delete().eq('id', id); load()
  }

  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))
  const totalExp = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const totalNet = emps.reduce((s, e) => s + calcPay(e).net, 0)
  const totalER = emps.reduce((s, e) => s + calcPay(e).erCost, 0)
  const tabs = [{ id: 'payroll', l: '薪資明細' }, { id: 'expenses', l: '支出管理' }]

  if (loading) return <div className="page-container">{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 80, marginBottom: 10 }} />)}</div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">薪資財務</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', background: m === month ? 'var(--gold-glow)' : 'transparent', color: m === month ? 'var(--gold)' : 'var(--text-dim)', border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{parseInt(m.slice(5))}月</button>)}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: tab === t.id ? 'var(--gold-glow)' : 'transparent', color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)', border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{t.l}</button>)}
      </div>

      {tab === 'payroll' && (<div>
        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div className="card" style={{ padding: 12, textAlign: 'center' }}><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>員工實領</div><div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontWeight: 600 }}>${totalNet.toLocaleString()}</div></div>
          <div className="card" style={{ padding: 12, textAlign: 'center' }}><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>雇主成本</div><div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>${totalER.toLocaleString()}</div></div>
          <div className="card" style={{ padding: 12, textAlign: 'center' }}><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>本月支出</div><div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>${totalExp.toLocaleString()}</div></div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>2026 勞保 12.5% ｜ 健保 5.17% ｜ 勞退 6%（自動帶入排班出勤）</div>

        {emps.map(emp => {
          const p = calcPay(emp), ex = expanded === emp.id
          return <div key={emp.id} className="card" style={{ marginBottom: 8, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpanded(ex ? null : emp.id)}>
              <div><div style={{ fontSize: 14, fontWeight: 600 }}>{emp.name}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emp.id} · {emp.emp_type} · 出勤{p.att.work}天</div></div>
              <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div><div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)' }}>${p.net.toLocaleString()}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>實領</div></div>
                {ex ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
              </div>
            </div>
            {ex && <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', marginBottom: 6 }}>出勤統計</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 12, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--green)' }}>上班 {p.att.work}天</span>
                  {p.att.sick > 0 && <span style={{ color: '#ffb347' }}>病假 {p.att.sick}天</span>}
                  {p.att.personal > 0 && <span style={{ color: '#ffd700' }}>事假 {p.att.personal}天</span>}
                  {p.att.special > 0 && <span style={{ color: 'var(--blue)' }}>特休 {p.att.special}天</span>}
                  <span style={{ color: 'var(--text-muted)' }}>休假 {p.att.off}天</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', marginBottom: 6 }}>薪資明細</div>
                <R label="底薪" value={p.base} />
                {p.bonusItems.map(b => <R key={b.id} label={`+ ${b.bonus_name}`} value={b.amount} positive />)}
                {p.empBon > 0 && <R label="加給合計" value={p.empBon} positive />}
                <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                <R label={`投保薪資(勞保${p.lb.toLocaleString()})`} value={p.lb} dim />
                <R label="勞保(自付20%)" value={-p.li} negative />
                <R label="健保(自付30%)" value={-p.hi} negative />
                {p.sickDeduct > 0 && <R label={`病假${p.att.sick}天扣薪`} value={-p.sickDeduct} negative />}
                {p.personalDeduct > 0 && <R label={`事假${p.att.personal}天扣薪`} value={-p.personalDeduct} negative />}
                <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                <R label="實發金額" value={p.net} highlight />
                <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>雇主負擔</div>
                <R label="勞保(雇主70%)" value={p.liER} dim />
                <R label="健保(雇主60%)" value={p.hiER} dim />
                <R label="勞退6%" value={p.lp} dim />
                <R label="雇主總成本" value={p.erCost} highlight />
              </div>
            </div>}
          </div>
        })}
      </div>)}

      {tab === 'expenses' && (<div>
        <div className="card" style={{ padding: 14, marginBottom: 16 }}><div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>本月支出</div><div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>${totalExp.toLocaleString()}</div></div>
        <button className="btn-outline" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowExpForm(!showExpForm)}><Plus size={14} /> 新增支出</button>
        {showExpForm && <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <select value={newExp.category} onChange={e => setNewExp(p => ({ ...p, category: e.target.value }))} style={{ marginBottom: 10 }}><option value="">選擇分類</option>{['食材', '酒水', '雪茄進貨', '設備', '房租', '水電', '人事', '行銷', '雜支'].map(c => <option key={c}>{c}</option>)}</select>
          <input placeholder="說明" value={newExp.item} onChange={e => setNewExp(p => ({ ...p, item: e.target.value }))} style={{ marginBottom: 10 }} />
          <input type="number" placeholder="金額" value={newExp.amount} onChange={e => setNewExp(p => ({ ...p, amount: e.target.value }))} style={{ marginBottom: 10 }} inputMode="numeric" />
          <button className="btn-gold" onClick={addExpense}>儲存</button>
        </div>}
        {expenses.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>無支出</div> :
          expenses.map(e => <div key={e.id} className="card" style={{ padding: 12, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <div><div style={{ fontSize: 13, fontWeight: 500 }}>{e.item || e.category}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.date} · {e.category} · {e.payment || '現金'}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>-${(e.amount || 0).toLocaleString()}</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }} onClick={() => deleteExpense(e.id)}>刪</button>
            </div>
          </div>)}
      </div>)}
    </div>
  )
}

function R({ label, value, positive, negative, highlight, dim }) {
  const c = highlight ? 'var(--gold)' : positive ? 'var(--green)' : negative ? 'var(--red)' : dim ? 'var(--text-muted)' : 'var(--text)'
  return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
    <span style={{ color: dim ? 'var(--text-muted)' : 'var(--text-dim)' }}>{label}</span>
    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: highlight ? 600 : 400, color: c }}>{typeof value === 'number' ? (value < 0 ? `-$${Math.abs(value).toLocaleString()}` : `$${value.toLocaleString()}`) : value}</span>
  </div>
}
