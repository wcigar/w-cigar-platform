import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { calcLaborIns, calcHealthIns, calcLaborPension, calcLaborInsER, calcHealthInsER, findBracket, LABOR_INS_BRACKETS, HEALTH_INS_BRACKETS } from '../../lib/constants'
import { ChevronDown, ChevronUp, Plus, Trash2, Save, FileText, Printer, Edit3 } from 'lucide-react'
import { format, subMonths } from 'date-fns'

export default function Payroll() {
  const [tab, setTab] = useState('payroll')
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [emps, setEmps] = useState([])
  const [salConfigs, setSalConfigs] = useState([])
  const [bonuses, setBonuses] = useState([])
  const [expenses, setExpenses] = useState([])
  const [schedules, setSchedules] = useState([])
  const [punches, setPunches] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [editingSal, setEditingSal] = useState(null)
  const [newBonus, setNewBonus] = useState({ employee_id: '', bonus_name: '', amount: '' })
  const [showBonusForm, setShowBonusForm] = useState(false)
  const [newExp, setNewExp] = useState({ category: '', item: '', amount: '', payment: '現金', date: format(new Date(), 'yyyy-MM-dd') })
  const [showExpForm, setShowExpForm] = useState(false)
  const [payslip, setPayslip] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01', e = month + '-31'
    const [eR, sR, bR, xR, scR, pR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true).order('name'),
      supabase.from('salary_config').select('*'),
      supabase.from('bonus_definitions').select('*'),
      supabase.from('expenses').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }),
      supabase.from('schedules').select('*').gte('date', s).lte('date', e),
      supabase.from('punch_records').select('*').gte('date', s).lte('date', e),
    ])
    setEmps((eR.data || []).filter(x => !x.is_admin))
    setSalConfigs(sR.data || []); setBonuses(bR.data || [])
    setExpenses(xR.data || []); setSchedules(scR.data || []); setPunches(pR.data || [])
    setLoading(false)
  }

  function getCfg(eid) { return salConfigs.find(s => s.employee_id === eid) || {} }

  function getAttendance(eid) {
    const es = schedules.filter(s => s.employee_id === eid)
    let work = 0, sick = 0, personal = 0, off = 0, special = 0
    es.forEach(s => { const v = s.shift || ''
      if (v === '早班' || v === '晚班') work++
      else if (v === '病假') sick++; else if (v === '事假') personal++
      else if (v === '特休') special++; else off++
    })
    // Late count from punch records
    const ep = punches.filter(p => p.employee_id === eid && p.punch_type === '上班' && p.is_valid)
    let lateCount = 0, lateMinutes = 0
    ep.forEach(p => {
      const sched = schedules.find(s => s.employee_id === eid && s.date === p.date)
      if (!sched) return
      const shiftStart = sched.shift === '早班' ? '12:05' : sched.shift === '晚班' ? '15:05' : null
      if (!shiftStart || !p.time) return
      const punchTime = p.time.slice(11, 16)
      if (punchTime > shiftStart) { lateCount++; const [ph, pm] = punchTime.split(':').map(Number); const [sh, sm] = shiftStart.split(':').map(Number); lateMinutes += (ph * 60 + pm) - (sh * 60 + sm) }
    })
    return { work, sick, personal, off, special, total: es.length, lateCount, lateMinutes }
  }

  function calcPay(emp) {
    const c = getCfg(emp.id), base = c.monthly_salary || 0
    const att = getAttendance(emp.id)
    const li = calcLaborIns(base), hi = calcHealthIns(base), lp = calcLaborPension(base)
    const liER = calcLaborInsER(base), hiER = calcHealthInsER(base)
    const lb = findBracket(base, LABOR_INS_BRACKETS)
    const empBonuses = bonuses.filter(b => b.employee_id === emp.id && b.enabled)
    const empBon = empBonuses.reduce((s, b) => s + (b.amount || 0), 0)
    const dailyRate = base > 0 ? Math.round(base / 30) : 0
    const sickDeduct = Math.round(att.sick * dailyRate * 0.5)
    const personalDeduct = att.personal * dailyRate
    const deduct = li + hi + sickDeduct + personalDeduct
    const net = base + empBon - deduct
    return { base, empBon, empBonuses, li, hi, lp, liER, hiER, lb, deduct, net, erCost: base + empBon + liER + hiER + lp, att, sickDeduct, personalDeduct, dailyRate }
  }

  // Salary config CRUD
  async function saveSalConfig(eid) {
    if (!editingSal) return
    const existing = salConfigs.find(s => s.employee_id === eid)
    if (existing) {
      await supabase.from('salary_config').update({ monthly_salary: +editingSal.monthly_salary, hourly_rate: +editingSal.hourly_rate, salary_type: editingSal.salary_type }).eq('id', existing.id)
    } else {
      await supabase.from('salary_config').insert({ employee_id: eid, ...editingSal })
    }
    logAudit('Salary', `更新 ${eid} 薪資 $${editingSal.monthly_salary}`, 'ADMIN')
    setEditingSal(null); load()
  }

  // Bonus CRUD
  async function addBonus() {
    if (!newBonus.employee_id || !newBonus.bonus_name || !newBonus.amount) return alert('請填完')
    const empName = emps.find(e => e.id === newBonus.employee_id)?.name || ''
    await supabase.from('bonus_definitions').insert({
      bonus_id: `B_${newBonus.employee_id}_${Date.now()}`, employee_id: newBonus.employee_id,
      name: empName, bonus_name: newBonus.bonus_name, amount: +newBonus.amount,
      calc_method: '固定月額', enabled: true
    })
    logAudit('Bonus', `新增 ${empName} ${newBonus.bonus_name} $${newBonus.amount}`, 'ADMIN')
    setNewBonus({ employee_id: '', bonus_name: '', amount: '' }); setShowBonusForm(false); load()
  }

  async function toggleBonus(id, enabled) {
    await supabase.from('bonus_definitions').update({ enabled }).eq('id', id); load()
  }

  async function deleteBonus(id) {
    if (!confirm('確定刪除？')) return
    await supabase.from('bonus_definitions').delete().eq('id', id); load()
  }

  // Expense CRUD
  async function addExpense() {
    if (!newExp.category || !newExp.amount) return alert('分類和金額必填')
    await supabase.from('expenses').insert({ date: newExp.date, category: newExp.category, item: newExp.item, amount: +newExp.amount, payment: newExp.payment, handler: 'ADMIN' })
    logAudit('Expense', `${newExp.item} $${newExp.amount}`, 'ADMIN')
    setNewExp({ category: '', item: '', amount: '', payment: '現金', date: format(new Date(), 'yyyy-MM-dd') }); setShowExpForm(false); load()
  }

  async function deleteExpense(id) { if (!confirm('確定刪除？')) return; await supabase.from('expenses').delete().eq('id', id); load() }

  // Payslip generator
  function generatePayslip(emp) {
    const p = calcPay(emp)
    setPayslip({ emp, pay: p, month })
  }

  function printPayslip() {
    if (!payslip) return
    const { emp, pay: p } = payslip
    const w = window.open('', '_blank', 'width=500,height=700')
    w.document.write(`<html><head><title>薪資條 - ${emp.name}</title><style>
      body{font-family:'Noto Sans TC',sans-serif;padding:30px;color:#333;max-width:500px;margin:0 auto}
      h1{font-size:20px;border-bottom:2px solid #c9a84c;padding-bottom:8px;color:#333}
      h2{font-size:14px;color:#666;margin:16px 0 8px}
      .row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px dotted #ddd}
      .row.bold{font-weight:700;font-size:14px;border-bottom:2px solid #333}
      .green{color:#2d8a4e}.red{color:#c44d4d}.gold{color:#9a7d2e}
      .footer{margin-top:24px;font-size:10px;color:#999;text-align:center;border-top:1px solid #ddd;padding-top:12px}
      @media print{body{padding:20px}}
    </style></head><body>
    <h1>W Cigar Bar — ${payslip.month} 薪資條</h1>
    <div class="row bold"><span>員工</span><span>${emp.name} (${emp.id})</span></div>
    <div class="row"><span>職稱</span><span>${emp.title || ''} · ${emp.emp_type || ''}</span></div>
    <h2>出勤統計</h2>
    <div class="row"><span>上班天數</span><span>${p.att.work} 天</span></div>
    ${p.att.sick ? `<div class="row"><span>病假</span><span>${p.att.sick} 天</span></div>` : ''}
    ${p.att.personal ? `<div class="row"><span>事假</span><span>${p.att.personal} 天</span></div>` : ''}
    ${p.att.special ? `<div class="row"><span>特休</span><span>${p.att.special} 天</span></div>` : ''}
    <div class="row"><span>休假</span><span>${p.att.off} 天</span></div>
    ${p.att.lateCount ? `<div class="row red"><span>遲到</span><span>${p.att.lateCount} 次 (共${p.att.lateMinutes}分鐘)</span></div>` : ''}
    <h2>薪資項目</h2>
    <div class="row"><span>底薪</span><span>$${p.base.toLocaleString()}</span></div>
    ${p.empBonuses.map(b => `<div class="row green"><span>+ ${b.bonus_name}</span><span>+$${b.amount.toLocaleString()}</span></div>`).join('')}
    <h2>法定扣除</h2>
    <div class="row"><span>投保薪資級距</span><span>$${p.lb.toLocaleString()}</span></div>
    <div class="row red"><span>勞保費(員工20%)</span><span>-$${p.li.toLocaleString()}</span></div>
    <div class="row red"><span>健保費(員工30%)</span><span>-$${p.hi.toLocaleString()}</span></div>
    ${p.sickDeduct ? `<div class="row red"><span>病假扣薪(${p.att.sick}天×半薪)</span><span>-$${p.sickDeduct.toLocaleString()}</span></div>` : ''}
    ${p.personalDeduct ? `<div class="row red"><span>事假扣薪(${p.att.personal}天)</span><span>-$${p.personalDeduct.toLocaleString()}</span></div>` : ''}
    <div class="row bold gold"><span>實發金額</span><span>$${p.net.toLocaleString()}</span></div>
    <h2>雇主負擔（不從員工扣除）</h2>
    <div class="row"><span>勞保(雇主70%)</span><span>$${p.liER.toLocaleString()}</span></div>
    <div class="row"><span>健保(雇主60%)</span><span>$${p.hiER.toLocaleString()}</span></div>
    <div class="row"><span>勞退提繳(6%)</span><span>$${p.lp.toLocaleString()}</span></div>
    <div class="row bold"><span>雇主總成本</span><span>$${p.erCost.toLocaleString()}</span></div>
    <div class="footer">W Cigar Bar 紳士雪茄館 · 統一營運平台自動產出<br>列印日期：${format(new Date(), 'yyyy-MM-dd HH:mm')}<br>2026年勞保費率12.5% · 健保費率5.17% · 勞退雇主提繳6%</div>
    </body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 300)
  }

  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))
  const totalExp = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const totalNet = emps.reduce((s, e) => s + calcPay(e).net, 0)
  const totalER = emps.reduce((s, e) => s + calcPay(e).erCost, 0)

  const tabList = [{ id: 'payroll', l: '薪資明細' }, { id: 'config', l: '薪資設定' }, { id: 'bonus', l: '加給管理' }, { id: 'expenses', l: '支出管理' }]

  if (loading) return <div className="page-container">{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 80, marginBottom: 10 }} />)}</div>

  return (
    <div className="page-container fade-in">
      {/* Payslip modal */}
      {payslip && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPayslip(null)}>
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--border-gold)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', marginBottom: 4 }}>薪資條 — {payslip.emp.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>{payslip.month}</div>
            <R label="底薪" value={payslip.pay.base} />
            {payslip.pay.empBonuses.map(b => <R key={b.id} label={`+ ${b.bonus_name}`} value={b.amount} positive />)}
            <R label="勞保" value={-payslip.pay.li} negative />
            <R label="健保" value={-payslip.pay.hi} negative />
            {payslip.pay.sickDeduct > 0 && <R label="病假扣薪" value={-payslip.pay.sickDeduct} negative />}
            {payslip.pay.personalDeduct > 0 && <R label="事假扣薪" value={-payslip.pay.personalDeduct} negative />}
            <div style={{ height: 2, background: 'var(--gold)', margin: '10px 0' }} />
            <R label="實發" value={payslip.pay.net} highlight />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn-gold" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={printPayslip}><Printer size={14} /> 列印薪資條</button>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setPayslip(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}

      <div className="section-title">薪資財務</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', background: m === month ? 'var(--gold-glow)' : 'transparent', color: m === month ? 'var(--gold)' : 'var(--text-dim)', border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{parseInt(m.slice(5))}月</button>)}
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
        {tabList.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '7px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: tab === t.id ? 'var(--gold-glow)' : 'transparent', color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)', border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{t.l}</button>)}
      </div>

      {/* === 薪資明細 === */}
      {tab === 'payroll' && (<div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <SB label="員工實領" value={'$' + totalNet.toLocaleString()} color="var(--gold)" />
          <SB label="雇主成本" value={'$' + totalER.toLocaleString()} color="var(--red)" />
          <SB label="本月支出" value={'$' + totalExp.toLocaleString()} color="var(--red)" />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>2026 勞保12.5% ｜ 健保5.17% ｜ 勞退6%（自動帶入排班+打卡）</div>
        {emps.map(emp => {
          const p = calcPay(emp), ex = expanded === emp.id
          return <div key={emp.id} className="card" style={{ marginBottom: 8, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpanded(ex ? null : emp.id)}>
              <div><div style={{ fontSize: 14, fontWeight: 600 }}>{emp.name}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emp.emp_type} · 出勤{p.att.work}天{p.att.lateCount ? ` · 遲到${p.att.lateCount}次` : ''}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)' }}>${p.net.toLocaleString()}</div></div>
                {ex ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
              </div>
            </div>
            {ex && <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 10 }}>
                <SH>出勤統計</SH>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, fontSize: 12, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--green)' }}>上班 {p.att.work}天</span>
                  {p.att.sick > 0 && <span style={{ color: '#ffb347' }}>病假 {p.att.sick}天</span>}
                  {p.att.personal > 0 && <span style={{ color: '#ffd700' }}>事假 {p.att.personal}天</span>}
                  {p.att.special > 0 && <span style={{ color: 'var(--blue)' }}>特休 {p.att.special}天</span>}
                  <span style={{ color: 'var(--text-muted)' }}>休假 {p.att.off}天</span>
                  {p.att.lateCount > 0 && <span style={{ color: 'var(--red)' }}>遲到 {p.att.lateCount}次({p.att.lateMinutes}分)</span>}
                </div>
                <SH>薪資明細</SH>
                <R label="底薪" value={p.base} />
                {p.empBonuses.map(b => <R key={b.id} label={`+ ${b.bonus_name}`} value={b.amount} positive />)}
                <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                <R label={`投保薪資 $${p.lb.toLocaleString()}`} value={p.lb} dim />
                <R label="勞保(自付20%)" value={-p.li} negative />
                <R label="健保(自付30%)" value={-p.hi} negative />
                {p.sickDeduct > 0 && <R label={`病假${p.att.sick}天(半薪)`} value={-p.sickDeduct} negative />}
                {p.personalDeduct > 0 && <R label={`事假${p.att.personal}天`} value={-p.personalDeduct} negative />}
                <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                <R label="實發金額" value={p.net} highlight />
                <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                <SH>雇主負擔</SH>
                <R label="勞保(70%)" value={p.liER} dim />
                <R label="健保(60%)" value={p.hiER} dim />
                <R label="勞退6%" value={p.lp} dim />
                <R label="雇主總成本" value={p.erCost} highlight />
                <button className="btn-outline" style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }} onClick={() => generatePayslip(emp)}>
                  <FileText size={14} /> 生成薪資條
                </button>
              </div>
            </div>}
          </div>
        })}
      </div>)}

      {/* === 薪資設定 === */}
      {tab === 'config' && (<div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>修改底薪、薪資類型</div>
        {emps.map(emp => {
          const c = getCfg(emp.id), isEditing = editingSal?.eid === emp.id
          return <div key={emp.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isEditing ? 10 : 0 }}>
              <div><div style={{ fontSize: 14, fontWeight: 600 }}>{emp.name}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.salary_type || '月薪'} · ${(c.monthly_salary || 0).toLocaleString()}</div></div>
              {!isEditing && <button style={iconBtn} onClick={() => setEditingSal({ eid: emp.id, salary_type: c.salary_type || '月薪', monthly_salary: c.monthly_salary || 0, hourly_rate: c.hourly_rate || 0 })}><Edit3 size={14} color="var(--gold)" /></button>}
            </div>
            {isEditing && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={editingSal.salary_type} onChange={e => setEditingSal(p => ({ ...p, salary_type: e.target.value }))} style={{ width: 80, fontSize: 13, padding: 8 }}>
                  <option>月薪</option><option>時薪</option>
                </select>
                <input type="number" value={editingSal.monthly_salary} onChange={e => setEditingSal(p => ({ ...p, monthly_salary: e.target.value }))} placeholder="月薪" style={{ flex: 1, fontSize: 13, padding: 8 }} />
                <button className="btn-gold" style={{ padding: '8px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => saveSalConfig(emp.id)}><Save size={12} /> 儲存</button>
                <button className="btn-outline" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => setEditingSal(null)}>取消</button>
              </div>
            )}
          </div>
        })}
      </div>)}

      {/* === 加給管理 === */}
      {tab === 'bonus' && (<div>
        <button className="btn-outline" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowBonusForm(!showBonusForm)}><Plus size={14} /> 新增加給</button>
        {showBonusForm && (
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <select value={newBonus.employee_id} onChange={e => setNewBonus(p => ({ ...p, employee_id: e.target.value }))} style={{ marginBottom: 8 }}>
              <option value="">選擇員工</option>
              {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <input value={newBonus.bonus_name} onChange={e => setNewBonus(p => ({ ...p, bonus_name: e.target.value }))} placeholder="加給名稱" style={{ marginBottom: 8 }} />
            <input type="number" value={newBonus.amount} onChange={e => setNewBonus(p => ({ ...p, amount: e.target.value }))} placeholder="金額" style={{ marginBottom: 8 }} inputMode="numeric" />
            <button className="btn-gold" onClick={addBonus}>新增</button>
          </div>
        )}
        {emps.map(emp => {
          const eb = bonuses.filter(b => b.employee_id === emp.id)
          if (!eb.length) return null
          return (
            <div key={emp.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 4 }}>{emp.name}</div>
              {eb.map(b => (
                <div key={b.id} className="card" style={{ padding: 12, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: b.enabled ? 1 : .5 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{b.bonus_name}</span>
                    <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--green)', fontWeight: 600, marginLeft: 8 }}>+${(b.amount || 0).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button style={{ ...iconBtn, color: b.enabled ? 'var(--red)' : 'var(--green)' }} onClick={() => toggleBonus(b.id, !b.enabled)}>
                      {b.enabled ? '停' : '啟'}
                    </button>
                    <button style={{ ...iconBtn, color: 'var(--red)' }} onClick={() => deleteBonus(b.id)}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
        {bonuses.length === 0 && <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>無加給設定</div>}
      </div>)}

      {/* === 支出管理 === */}
      {tab === 'expenses' && (<div>
        <div className="card" style={{ padding: 14, marginBottom: 16 }}><div style={{ fontSize: 11, color: 'var(--text-dim)' }}>本月支出</div><div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>${totalExp.toLocaleString()}</div></div>
        <button className="btn-outline" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowExpForm(!showExpForm)}><Plus size={14} /> 新增支出</button>
        {showExpForm && (
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input type="date" value={newExp.date} onChange={e => setNewExp(p => ({ ...p, date: e.target.value }))} style={{ flex: 1, fontSize: 13, padding: 8 }} />
              <select value={newExp.category} onChange={e => setNewExp(p => ({ ...p, category: e.target.value }))} style={{ flex: 1, fontSize: 13, padding: 8 }}>
                <option value="">分類</option>{['食材', '酒水', '雪茄進貨', '設備', '房租', '水電', '人事', '行銷', '雜支'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <input value={newExp.item} onChange={e => setNewExp(p => ({ ...p, item: e.target.value }))} placeholder="項目說明" style={{ marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input type="number" value={newExp.amount} onChange={e => setNewExp(p => ({ ...p, amount: e.target.value }))} placeholder="金額" style={{ flex: 1 }} inputMode="numeric" />
              <select value={newExp.payment} onChange={e => setNewExp(p => ({ ...p, payment: e.target.value }))} style={{ width: 100, fontSize: 13, padding: 8 }}>
                {['現金', '刷卡', '轉帳', 'LINE Pay'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <button className="btn-gold" onClick={addExpense}>儲存</button>
          </div>
        )}
        {expenses.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>無支出</div> :
          expenses.map(e => <div key={e.id} className="card" style={{ padding: 12, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <div><div style={{ fontSize: 13, fontWeight: 500 }}>{e.item || e.category}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.date} · {e.category} · {e.payment}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>-${(e.amount || 0).toLocaleString()}</span>
              <button style={{ ...iconBtn, color: 'var(--red)' }} onClick={() => deleteExpense(e.id)}><Trash2 size={12} /></button>
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
function SH({ children }) { return <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', marginBottom: 4, marginTop: 8 }}>{children}</div> }
function SB({ label, value, color }) { return <div className="card" style={{ padding: 10, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{label}</div><div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>{value}</div></div> }
const iconBtn = { background: 'none', border: 'none', padding: 6, cursor: 'pointer', borderRadius: 6, fontSize: 12, fontWeight: 700 }
