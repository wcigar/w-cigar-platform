import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { logAudit } from '../../lib/audit'
import { calcLaborIns, calcHealthIns, calcLaborPension, calcLaborInsER, calcHealthInsER, findBracket, calcOvertimePay, LABOR_INS_BRACKETS, HEALTH_INS_BRACKETS, SHIFTS, LATE_GRACE_MIN, OT_GRACE_MIN } from '../../lib/constants'
import { ChevronDown, ChevronUp, Plus, Trash2, Save, FileText, Printer, Edit3, Clock } from 'lucide-react'
import { format, subMonths, endOfMonth } from 'date-fns'

/* ================================================================
   核心純函式 — 出勤資料
   ================================================================ */
function getAttendanceData(eid, schedules, punches) {
  const es = schedules.filter(s => s.employee_id === eid)
  const ep = punches.filter(p => p.employee_id === eid && p.is_valid)
  let work = 0, sick = 0, personal = 0, off = 0, special = 0, absent = 0
  let lateCount = 0, lateMinutes = 0, earlyCount = 0, earlyMinutes = 0
  let otTotalMin = 0, otDetails = [], lateDetails = [], earlyDetails = []

  es.forEach(s => {
    const v = s.shift || ''
    if (v === '早班' || v === '晚班') {
      work++
      const shift = SHIFTS[v]
      if (!shift) return
      const dayPunches = ep.filter(p => p.date === s.date)
      const clockIn = dayPunches.find(p => p.punch_type === '上班')
      const clockOut = dayPunches.find(p => p.punch_type === '下班')
      if (clockIn?.time) {
        const [h, m] = clockIn.time.slice(11, 16).split(':').map(Number)
        const pm = h * 60 + m, sm = shift.startH * 60 + shift.startM + LATE_GRACE_MIN
        if (pm > sm) {
          const mins = pm - sm
          lateCount++; lateMinutes += mins
          lateDetails.push({ date: s.date, minutes: mins, time: clockIn.time.slice(11, 16) })
        }
      }
      if (clockOut?.time) {
        const [h, m] = clockOut.time.slice(11, 16).split(':').map(Number)
        let pm = h * 60 + m
        if (v === '晚班' && h < 12) pm += 1440
        const endMin = shift.endH * 60 + shift.endM
        if (pm < endMin) {
          const mins = endMin - pm
          earlyCount++; earlyMinutes += mins
          earlyDetails.push({ date: s.date, minutes: mins, time: clockOut.time.slice(11, 16) })
        }
        const graceMin = endMin + OT_GRACE_MIN
        if (pm > graceMin) {
          const otMin = pm - endMin
          otTotalMin += otMin
          otDetails.push({ date: s.date, minutes: otMin, hours: +(otMin / 60).toFixed(1) })
        }
      }
    } else if (v === '病假') sick++
    else if (v === '事假') personal++
    else if (v === '特休') special++
    else if (v === '曠職') absent++
    else off++
  })
  return { work, sick, personal, off, special, absent, total: es.length, lateCount, lateMinutes, lateDetails, earlyCount, earlyMinutes, earlyDetails, otTotalMin, otDetails }
}

/* ================================================================
   核心純函式 — 截至指定日期的累積薪資
   salaryMode:
     calendar_prorated = 正職月薪制（按日曆天按比例）
     attendance_based  = PT出勤制（按實際出勤天數）
   ================================================================ */
function calcSalaryToDate(emp, cfg, bonusDefs, att, isCurrentMonth, targetDate) {
  const year = targetDate.getFullYear()
  const monthNum = targetDate.getMonth() + 1
  const daysInMonth = new Date(year, monthNum, 0).getDate()
  const dayOfMonth = targetDate.getDate()
  const monthlyBase = cfg.monthly_salary || 0
  const salaryMode = (cfg.salary_type === '時薪' || emp.emp_type === 'PT') ? 'attendance_based' : 'calendar_prorated'
  const dailyBase = monthlyBase > 0 ? Math.round(monthlyBase / daysInMonth) : 0
  const hourlyBase = dailyBase > 0 ? Math.round(dailyBase / 8) : 0
  const effectiveDay = isCurrentMonth ? dayOfMonth : daysInMonth
  const proratedBase = salaryMode === 'calendar_prorated' ? dailyBase * effectiveDay : dailyBase * att.work

  let otPay = 0
  att.otDetails.forEach(d => { d.pay = calcOvertimePay(hourlyBase, d.minutes); otPay += d.pay })

  const empBonuses = bonusDefs.filter(b => b.employee_id === emp.id && b.enabled)
  const attendanceBonusDef = empBonuses.find(b => b.bonus_name && b.bonus_name.includes('全勤'))
  const otherBonuses = empBonuses.filter(b => !b.bonus_name?.includes('全勤'))
  let attendanceBonusStatus = 'pending'
  if (att.lateCount > 0 || att.earlyCount > 0 || att.sick > 0 || att.personal > 0 || att.absent > 0) attendanceBonusStatus = 'lost'
  else if (!isCurrentMonth) attendanceBonusStatus = 'eligible'
  const attendanceBonusAmount = attendanceBonusDef?.amount || 0
  const effectiveAttendanceBonus = attendanceBonusStatus === 'lost' ? 0 : attendanceBonusAmount
  const otherBonusTotal = otherBonuses.reduce((s, b) => s + (b.amount || 0), 0)
  const totalBonuses = effectiveAttendanceBonus + otherBonusTotal + otPay

  const sickDeduct = Math.round(att.sick * dailyBase * 0.5)
  const personalDeduct = att.personal * dailyBase
  const absentDeduct = att.absent * dailyBase
  const li = calcLaborIns(monthlyBase), hi = calcHealthIns(monthlyBase)
  const lp = calcLaborPension(monthlyBase), liER = calcLaborInsER(monthlyBase), hiER = calcHealthInsER(monthlyBase)
  const lb = findBracket(monthlyBase, LABOR_INS_BRACKETS)
  const totalDeductions = li + hi + sickDeduct + personalDeduct + absentDeduct
  const currentPayable = proratedBase + totalBonuses - totalDeductions
  const erCost = proratedBase + totalBonuses + liER + hiER + lp

  return {
    salaryMode, monthlyBase, daysInMonth, dayOfMonth: effectiveDay, dailyBase, hourlyBase,
    actualWorkedDays: att.work, proratedBase, empBonuses, otherBonuses,
    attendanceBonus: { def: attendanceBonusDef, amount: attendanceBonusAmount, status: attendanceBonusStatus, effective: effectiveAttendanceBonus },
    otPay, otDetails: att.otDetails, sickDeduct, personalDeduct, absentDeduct,
    li, hi, lp, liER, hiER, lb, totalBonuses, totalDeductions, currentPayable, erCost, att,
  }
}

/* ================================================================
   薪資頁主元件
   ================================================================ */
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

  const isCurrentMonth = month === format(new Date(), 'yyyy-MM')
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const todayDay = today.getDate()
  const [yr, mo] = month.split('-').map(Number)
  const daysInMonth = new Date(yr, mo, 0).getDate()

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01'
    const e = isCurrentMonth ? todayStr : format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
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
  function getCalc(emp) {
    const cfg = getCfg(emp.id)
    const att = getAttendanceData(emp.id, schedules, punches)
    const targetDate = isCurrentMonth ? today : new Date(yr, mo - 1, daysInMonth)
    return calcSalaryToDate(emp, cfg, bonuses, att, isCurrentMonth, targetDate)
  }

  async function saveSalConfig(eid) {
    if (!editingSal) return
    const existing = salConfigs.find(s => s.employee_id === eid)
    if (existing) await supabase.from('salary_config').update({ monthly_salary: +editingSal.monthly_salary, salary_type: editingSal.salary_type }).eq('id', existing.id)
    else await supabase.from('salary_config').insert({ employee_id: eid, monthly_salary: +editingSal.monthly_salary, salary_type: editingSal.salary_type })
    logAudit('Salary', `更新 ${eid} $${editingSal.monthly_salary}`, 'ADMIN')
    setEditingSal(null); load()
  }
  async function addBonus() {
    if (!newBonus.employee_id || !newBonus.bonus_name || !newBonus.amount) return alert('請填完')
    const name = emps.find(e => e.id === newBonus.employee_id)?.name || ''
    await supabase.from('bonus_definitions').insert({ bonus_id: `B_${newBonus.employee_id}_${Date.now()}`, employee_id: newBonus.employee_id, name, bonus_name: newBonus.bonus_name, amount: +newBonus.amount, calc_method: '固定月額', enabled: true })
    setNewBonus({ employee_id: '', bonus_name: '', amount: '' }); setShowBonusForm(false); load()
  }
  async function toggleBonus(id, en) { await supabase.from('bonus_definitions').update({ enabled: en }).eq('id', id); load() }
  async function deleteBonus(id) { if (!confirm('刪除？')) return; await supabase.from('bonus_definitions').delete().eq('id', id); load() }
  async function addExpense() {
    if (!newExp.category || !newExp.amount) return
    await supabase.from('expenses').insert({ date: newExp.date, category: newExp.category, item: newExp.item, amount: +newExp.amount, payment: newExp.payment, handler: 'ADMIN' })
    setNewExp({ category: '', item: '', amount: '', payment: '現金', date: format(new Date(), 'yyyy-MM-dd') }); setShowExpForm(false); load()
  }
  async function deleteExpense(id) { if (!confirm('刪除？')) return; await supabase.from('expenses').delete().eq('id', id); load() }

  function printPayslip() {
    if (!payslip) return
    const { emp, p } = payslip
    const label = isCurrentMonth ? `（截至 ${todayDay} 日累積）` : ''
    const modeLabel = p.salaryMode === 'calendar_prorated' ? '月薪制' : '出勤制'
    const abLabel = p.attendanceBonus.status === 'lost' ? '❌已失效' : p.attendanceBonus.status === 'pending' ? '⏳暫符合' : '✅已確認'
    const w = window.open('', '_blank', 'width=520,height=900')
    w.document.write(`<html><head><title>薪資條 ${emp.name}</title><style>
body{font-family:'Noto Sans TC',sans-serif;padding:30px;color:#333;max-width:500px;margin:0 auto}
h1{font-size:20px;border-bottom:2px solid #c9a84c;padding-bottom:8px}
h2{font-size:13px;color:#666;margin:14px 0 6px;border-bottom:1px solid #eee;padding-bottom:4px}
.r{display:flex;justify-content:space-between;padding:3px 0;font-size:13px;border-bottom:1px dotted #eee}
.r.bold{font-weight:700;font-size:14px;border-bottom:2px solid #333;padding:6px 0}
.g{color:#2d8a4e}.rd{color:#c44d4d}.gl{color:#9a7d2e}.dim{color:#999}
.ft{margin-top:20px;font-size:10px;color:#999;text-align:center;border-top:1px solid #ddd;padding-top:10px}
</style></head><body>
<h1>W Cigar Bar — ${month} 薪資條${label}</h1>
<div class="r bold"><span>${emp.name} (${emp.id})</span><span>${emp.emp_type} · ${modeLabel}</span></div>
<h2>📅 出勤</h2>
<div class="r"><span>上班</span><span>${p.att.work} 天</span></div>
<div class="r"><span>休假</span><span>${p.att.off} 天</span></div>
${p.att.sick?`<div class="r"><span>病假</span><span>${p.att.sick} 天</span></div>`:''}
${p.att.personal?`<div class="r"><span>事假</span><span>${p.att.personal} 天</span></div>`:''}
${p.att.absent?`<div class="r rd"><span>曠職</span><span>${p.att.absent} 天</span></div>`:''}
${p.att.lateCount?`<div class="r rd"><span>遲到</span><span>${p.att.lateCount}次 ${p.att.lateMinutes}分</span></div>`:''}
${p.att.earlyCount?`<div class="r rd"><span>早退</span><span>${p.att.earlyCount}次 ${p.att.earlyMinutes}分</span></div>`:''}
<h2>💰 薪資計算</h2>
<div class="r dim"><span>月底薪</span><span>$${p.monthlyBase.toLocaleString()}</span></div>
<div class="r dim"><span>當月${p.daysInMonth}天 · 日薪</span><span>$${p.dailyBase.toLocaleString()}</span></div>
<div class="r"><span>${p.salaryMode==='calendar_prorated'?'截至今日'+p.dayOfMonth+'天':'出勤'+p.actualWorkedDays+'天'} 底薪</span><span>$${p.proratedBase.toLocaleString()}</span></div>
${p.attendanceBonus.amount?`<div class="r ${p.attendanceBonus.status==='lost'?'rd':'g'}"><span>全勤獎金 ${abLabel}</span><span>${p.attendanceBonus.status==='lost'?'$0':'+$'+p.attendanceBonus.effective.toLocaleString()}</span></div>`:''}
${p.otherBonuses.map(b=>`<div class="r g"><span>+ ${b.bonus_name}</span><span>+$${b.amount.toLocaleString()}</span></div>`).join('')}
${p.otPay?`<div class="r g"><span>+ 加班費</span><span>+$${p.otPay.toLocaleString()}</span></div>`:''}
<div class="r rd"><span>勞保自付20%</span><span>-$${p.li.toLocaleString()}</span></div>
<div class="r rd"><span>健保自付30%</span><span>-$${p.hi.toLocaleString()}</span></div>
${p.sickDeduct?`<div class="r rd"><span>病假扣薪</span><span>-$${p.sickDeduct.toLocaleString()}</span></div>`:''}
${p.personalDeduct?`<div class="r rd"><span>事假扣薪</span><span>-$${p.personalDeduct.toLocaleString()}</span></div>`:''}
${p.absentDeduct?`<div class="r rd"><span>曠職扣薪</span><span>-$${p.absentDeduct.toLocaleString()}</span></div>`:''}
<div class="r bold gl"><span>✦ 截至今日累積可領</span><span>$${p.currentPayable.toLocaleString()}</span></div>
<h2>🏢 雇主負擔</h2>
<div class="r"><span>勞保70%+健保60%+勞退6%</span><span>$${(p.liER+p.hiER+p.lp).toLocaleString()}</span></div>
<div class="r bold"><span>雇主總成本</span><span>$${p.erCost.toLocaleString()}</span></div>
${p.att.lateDetails.length?`<h2>⚠️ 遲到明細</h2>${p.att.lateDetails.map(d=>`<div class="r"><span>${d.date} 打卡${d.time}</span><span class="rd">遲${d.minutes}分</span></div>`).join('')}`:''}
${p.att.earlyDetails.length?`<h2>⚠️ 早退明細</h2>${p.att.earlyDetails.map(d=>`<div class="r"><span>${d.date} 下班${d.time}</span><span class="rd">早${d.minutes}分</span></div>`).join('')}`:''}
${p.otDetails.length?`<h2>⏰ 加班明細</h2>${p.otDetails.map(d=>`<div class="r"><span>${d.date} ${d.hours}hr</span><span class="g">+$${d.pay.toLocaleString()}</span></div>`).join('')}`:''}
<div class="ft">W Cigar Bar 紳士雪茄館<br>${format(new Date(),'yyyy-MM-dd HH:mm')}<br>${isCurrentMonth?'⚠️ 截至今日累積，非月底應發':'本月已結算'}</div>
</body></html>`)
    w.document.close(); setTimeout(() => w.print(), 300)
  }

  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))
  const totalExp = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const allCalcs = emps.map(e => ({ emp: e, calc: getCalc(e) }))
  const totalPayable = allCalcs.reduce((s, { calc }) => s + calc.currentPayable, 0)
  const totalER = allCalcs.reduce((s, { calc }) => s + calc.erCost, 0)
  const tabList = [{ id: 'payroll', l: '薪資明細' }, { id: 'config', l: '薪資設定' }, { id: 'bonus', l: '加給管理' }, { id: 'expenses', l: '支出管理' }]

  if (loading) return <div className="page-container">{[1,2,3].map(i => <div key={i} className="loading-shimmer" style={{height:80,marginBottom:10}}/>)}</div>

  return (
    <div className="page-container fade-in">
      {/* 薪資條 Modal */}
      {payslip && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={() => setPayslip(null)}>
          <div style={{background:'var(--black-card)',border:'1px solid var(--border-gold)',borderRadius:20,padding:24,width:'100%',maxWidth:440,maxHeight:'90vh',overflowY:'auto'}} onClick={e => e.stopPropagation()}>
            <div style={{fontSize:18,fontWeight:700,color:'var(--gold)',marginBottom:4}}>薪資條 — {payslip.emp.name}</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:12}}>{month}{isCurrentMonth ? ` (截至${todayDay}日累積)` : ''}</div>
            <R label="截至今日底薪" value={payslip.p.proratedBase}/>
            {payslip.p.attendanceBonus.amount > 0 && <R label={`全勤獎金（${payslip.p.attendanceBonus.status==='lost'?'已失效':'暫符合'}）`} value={payslip.p.attendanceBonus.effective} positive={payslip.p.attendanceBonus.status!=='lost'}/>}
            {payslip.p.otherBonuses.map(b => <R key={b.id} label={`+ ${b.bonus_name}`} value={b.amount} positive/>)}
            {payslip.p.otPay > 0 && <R label="+ 加班費" value={payslip.p.otPay} positive/>}
            <R label="- 勞保" value={-payslip.p.li} negative/><R label="- 健保" value={-payslip.p.hi} negative/>
            {payslip.p.sickDeduct > 0 && <R label="- 病假" value={-payslip.p.sickDeduct} negative/>}
            {payslip.p.personalDeduct > 0 && <R label="- 事假" value={-payslip.p.personalDeduct} negative/>}
            {payslip.p.absentDeduct > 0 && <R label="- 曠職" value={-payslip.p.absentDeduct} negative/>}
            <div style={{height:2,background:'var(--gold)',margin:'10px 0'}}/>
            <R label="截至今日累積可領" value={payslip.p.currentPayable} highlight/>
            <div style={{display:'flex',gap:8,marginTop:16}}>
              <button className="btn-gold" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6}} onClick={printPayslip}><Printer size={14}/> 列印</button>
              <button className="btn-outline" style={{flex:1}} onClick={() => setPayslip(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}

      <div className="section-title">薪資財務</div>

      <div style={{display:'flex',gap:6,marginBottom:10,overflowX:'auto',paddingBottom:4}}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{padding:'6px 10px',borderRadius:20,fontSize:11,fontWeight:500,whiteSpace:'nowrap',flexShrink:0,cursor:'pointer',background:m===month?'var(--gold-glow)':'transparent',color:m===month?'var(--gold)':'var(--text-dim)',border:m===month?'1px solid var(--border-gold)':'1px solid var(--border)'}}>{parseInt(m.slice(5))}月</button>)}
      </div>

      {isCurrentMonth && (
        <div style={{fontSize:11,color:'var(--gold)',background:'var(--gold-glow)',padding:'6px 12px',borderRadius:8,marginBottom:10,display:'flex',alignItems:'center',gap:4,border:'1px solid var(--border-gold)'}}>
          <Clock size={12}/> 即時計算：顯示截至今日({todayDay}日)已累積可領薪資（每日自動更新）
        </div>
      )}

      <div style={{display:'flex',gap:4,marginBottom:16,overflowX:'auto'}}>
        {tabList.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{padding:'7px 12px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0,background:tab===t.id?'var(--gold-glow)':'transparent',color:tab===t.id?'var(--gold)':'var(--text-dim)',border:tab===t.id?'1px solid var(--border-gold)':'1px solid var(--border)'}}>{t.l}</button>)}
      </div>

      {/* ===== 薪資明細 ===== */}
      {tab === 'payroll' && (<div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
          <SB label={isCurrentMonth?'累積實領':'員工實領'} value={'$'+totalPayable.toLocaleString()} color="var(--gold)"/>
          <SB label={isCurrentMonth?'累積成本':'雇主成本'} value={'$'+totalER.toLocaleString()} color="var(--red)"/>
          <SB label="本月支出" value={'$'+totalExp.toLocaleString()} color="var(--red)"/>
        </div>
        <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:10}}>遲到寬限{LATE_GRACE_MIN}分 · 加班寬限{OT_GRACE_MIN}分 · 當月{daysInMonth}天</div>

        {allCalcs.map(({ emp, calc: p }) => {
          const ex = expanded === emp.id
          const abStatus = p.attendanceBonus.status
          const modeTag = p.salaryMode === 'calendar_prorated' ? '月薪' : '出勤'
          return <div key={emp.id} className="card" style={{marginBottom:8,padding:0,overflow:'hidden'}}>
            <div style={{padding:14,display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'}} onClick={() => setExpanded(ex?null:emp.id)}>
              <div>
                <div style={{fontSize:14,fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                  {emp.name}
                  <span style={{fontSize:9,padding:'2px 6px',borderRadius:8,background:'var(--gold-glow)',color:'var(--gold)',border:'1px solid var(--border-gold)'}}>{modeTag}</span>
                </div>
                <div style={{fontSize:11,color:'var(--text-muted)',display:'flex',gap:4,flexWrap:'wrap',marginTop:2}}>
                  <span style={{color:'var(--green)'}}>出勤{p.att.work}天</span>
                  <span style={{color:'var(--text-muted)'}}>休{p.att.off}天</span>
                  {p.att.lateCount>0&&<span style={{color:'var(--red)',fontWeight:700}}>🔴遲到{p.att.lateCount}</span>}
                  {p.att.earlyCount>0&&<span style={{color:'#f59e0b',fontWeight:700}}>🟡早退{p.att.earlyCount}</span>}
                  {p.attendanceBonus.amount>0&&<span style={{color:abStatus==='lost'?'var(--red)':'var(--green)',fontSize:10}}>{abStatus==='lost'?'全勤❌':'全勤✓'}</span>}
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:16,fontFamily:'var(--font-mono)',fontWeight:600,color:'var(--gold)'}}>${p.currentPayable.toLocaleString()}</div>
                  {isCurrentMonth&&<div style={{fontSize:9,color:'var(--text-muted)'}}>截至{todayDay}日</div>}
                </div>
                {ex?<ChevronUp size={16} color="var(--text-muted)"/>:<ChevronDown size={16} color="var(--text-muted)"/>}
              </div>
            </div>
            {ex && <div style={{padding:'0 14px 14px',borderTop:'1px solid var(--border)'}}>
              <SH>出勤統計</SH>
              <div style={{display:'flex',gap:6,marginBottom:6,fontSize:12,flexWrap:'wrap'}}>
                <span style={{color:'var(--green)'}}>上班{p.att.work}天</span>
                {p.att.sick>0&&<span style={{color:'#ffb347'}}>病假{p.att.sick}天</span>}
                {p.att.personal>0&&<span style={{color:'#ffd700'}}>事假{p.att.personal}天</span>}
                {p.att.special>0&&<span style={{color:'var(--blue)'}}>特休{p.att.special}天</span>}
                {p.att.absent>0&&<span style={{color:'var(--red)'}}>曠職{p.att.absent}天</span>}
                <span style={{color:'var(--text-muted)'}}>休假{p.att.off}天</span>
                {p.att.lateCount>0&&<span style={{color:'var(--red)'}}>遲到{p.att.lateCount}次({p.att.lateMinutes}分)</span>}
                {p.att.earlyCount>0&&<span style={{color:'#f59e0b'}}>早退{p.att.earlyCount}次({p.att.earlyMinutes}分)</span>}
              </div>
              {p.att.lateDetails.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:11,color:'var(--red)',fontWeight:600,marginBottom:4}}>⚠️ 遲到明細</div>{p.att.lateDetails.map((d,i)=><div key={i} style={{fontSize:11,color:'var(--text-dim)',display:'flex',justifyContent:'space-between',padding:'2px 0'}}><span>{d.date} 打卡{d.time}</span><span style={{color:'var(--red)'}}>遲{d.minutes}分</span></div>)}</div>}
              {p.att.earlyDetails.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:11,color:'#f59e0b',fontWeight:600,marginBottom:4}}>⚠️ 早退明細</div>{p.att.earlyDetails.map((d,i)=><div key={i} style={{fontSize:11,color:'var(--text-dim)',display:'flex',justifyContent:'space-between',padding:'2px 0'}}><span>{d.date} 下班{d.time}</span><span style={{color:'#f59e0b'}}>早{d.minutes}分</span></div>)}</div>}
              {p.otDetails.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:11,color:'var(--green)',fontWeight:600,marginBottom:4}}>⏰ 加班明細（時薪${p.hourlyBase}）</div>{p.otDetails.map((d,i)=><div key={i} style={{fontSize:11,color:'var(--text-dim)',display:'flex',justifyContent:'space-between',padding:'2px 0'}}><span>{d.date} · {d.hours}hr</span><span style={{color:'var(--green)'}}>+${d.pay.toLocaleString()}</span></div>)}<div style={{fontSize:12,fontWeight:600,color:'var(--green)',marginTop:4}}>合計 +${p.otPay.toLocaleString()}</div></div>}

              <SH>截至今日薪資明細</SH>
              <R label="月底薪" value={p.monthlyBase} dim/>
              <R label={`當月天數`} value={`${p.daysInMonth} 天`} dim/>
              <R label="每日底薪" value={p.dailyBase} dim/>
              <R label={p.salaryMode==='calendar_prorated'?`截至今日天數`:`實際出勤天數`} value={`${p.salaryMode==='calendar_prorated'?p.dayOfMonth:p.actualWorkedDays} 天`} dim/>
              <div style={{height:1,background:'var(--border)',margin:'4px 0'}}/>
              <R label="截至今日應得底薪" value={p.proratedBase}/>
              {p.attendanceBonus.amount>0&&(
                <div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',fontSize:13}}>
                  <span style={{color:'var(--text-dim)',display:'flex',alignItems:'center',gap:4}}>+ 全勤獎金 <span style={{fontSize:10,padding:'1px 6px',borderRadius:6,background:abStatus==='lost'?'rgba(196,77,77,.15)':'rgba(77,168,108,.15)',color:abStatus==='lost'?'var(--red)':'var(--green)',fontWeight:700}}>{abStatus==='lost'?'已失效':abStatus==='pending'?'暫符合':'已確認'}</span></span>
                  <span style={{fontFamily:'var(--font-mono)',color:abStatus==='lost'?'var(--red)':'var(--green)',textDecoration:abStatus==='lost'?'line-through':'none'}}>{abStatus==='lost'?`$${p.attendanceBonus.amount.toLocaleString()}`:`+$${p.attendanceBonus.effective.toLocaleString()}`}</span>
                </div>
              )}
              {p.otherBonuses.map(b=><R key={b.id} label={`+ ${b.bonus_name}`} value={b.amount} positive/>)}
              {p.otPay>0&&<R label="+ 加班費" value={p.otPay} positive/>}
              <div style={{height:1,background:'var(--border)',margin:'6px 0'}}/>
              <R label={`投保 $${p.lb.toLocaleString()}`} value={p.lb} dim/>
              <R label="- 勞保自付(20%)" value={-p.li} negative/>
              <R label="- 健保自付(30%)" value={-p.hi} negative/>
              {p.sickDeduct>0&&<R label={`- 病假${p.att.sick}天(半薪)`} value={-p.sickDeduct} negative/>}
              {p.personalDeduct>0&&<R label={`- 事假${p.att.personal}天`} value={-p.personalDeduct} negative/>}
              {p.absentDeduct>0&&<R label={`- 曠職${p.att.absent}天`} value={-p.absentDeduct} negative/>}
              <div style={{height:2,background:'var(--gold)',margin:'8px 0'}}/>
              <R label="＝ 截至今日累積可領" value={p.currentPayable} highlight/>
              {isCurrentMonth&&<div style={{fontSize:10,color:'var(--text-muted)',marginTop:4,textAlign:'center'}}>⚠️ 此為截至今日累積數字，非月底應發薪資</div>}
              <div style={{height:1,background:'var(--border)',margin:'8px 0'}}/>
              <SH>雇主負擔</SH>
              <R label="勞保(70%)" value={p.liER} dim/><R label="健保(60%)" value={p.hiER} dim/><R label="勞退6%" value={p.lp} dim/>
              <R label="雇主總成本" value={p.erCost} highlight/>
              <button className="btn-outline" style={{width:'100%',marginTop:10,display:'flex',alignItems:'center',justifyContent:'center',gap:6,fontSize:13}} onClick={() => setPayslip({emp,p})}><FileText size={14}/> 生成薪資條</button>
            </div>}
          </div>
        })}
        {isCurrentMonth&&<div style={{fontSize:10,color:'var(--text-muted)',textAlign:'center',padding:'8px 0'}}>月底預估薪資請至薪資設定查看底薪全額</div>}
      </div>)}

      {/* ===== 薪資設定 ===== */}
      {tab === 'config' && (<div>
        {emps.map(emp => {
          const c = getCfg(emp.id), isE = editingSal?.eid === emp.id
          return <div key={emp.id} className="card" style={{padding:14,marginBottom:8}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:isE?10:0}}>
              <div><div style={{fontSize:14,fontWeight:600}}>{emp.name} <span style={{fontSize:10,color:'var(--text-muted)'}}>{emp.emp_type}</span></div><div style={{fontSize:11,color:'var(--text-muted)'}}>{c.salary_type||'月薪'} · ${(c.monthly_salary||0).toLocaleString()}</div></div>
              {!isE&&<button style={ib} onClick={() => setEditingSal({eid:emp.id,salary_type:c.salary_type||'月薪',monthly_salary:c.monthly_salary||0})}><Edit3 size={14} color="var(--gold)"/></button>}
            </div>
            {isE&&<div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              <select value={editingSal.salary_type} onChange={e => setEditingSal(p=>({...p,salary_type:e.target.value}))} style={{width:80,fontSize:13,padding:8}}><option>月薪</option><option>時薪</option></select>
              <input type="number" inputMode="numeric" value={editingSal.monthly_salary} onChange={e => setEditingSal(p=>({...p,monthly_salary:e.target.value}))} style={{flex:1,fontSize:13,padding:8}}/>
              <button className="btn-gold" style={{padding:'8px 14px',fontSize:12}} onClick={() => saveSalConfig(emp.id)}><Save size={12}/></button>
              <button className="btn-outline" style={{padding:'8px 14px',fontSize:12}} onClick={() => setEditingSal(null)}>取消</button>
            </div>}
          </div>
        })}
      </div>)}

      {/* ===== 加給管理 ===== */}
      {tab === 'bonus' && (<div>
        <button className="btn-outline" style={{marginBottom:16,display:'flex',alignItems:'center',gap:6}} onClick={() => setShowBonusForm(!showBonusForm)}><Plus size={14}/> 新增加給</button>
        {showBonusForm&&<div className="card" style={{marginBottom:16,padding:16}}>
          <select value={newBonus.employee_id} onChange={e => setNewBonus(p=>({...p,employee_id:e.target.value}))} style={{marginBottom:8}}><option value="">選擇員工</option>{emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          <input value={newBonus.bonus_name} onChange={e => setNewBonus(p=>({...p,bonus_name:e.target.value}))} placeholder="加給名稱（含「全勤」自動判斷資格）" style={{marginBottom:8}}/>
          <input type="number" inputMode="numeric" value={newBonus.amount} onChange={e => setNewBonus(p=>({...p,amount:e.target.value}))} placeholder="金額" style={{marginBottom:8}} pattern="[0-9]*"/>
          <button className="btn-gold" onClick={addBonus}>新增</button>
        </div>}
        {emps.map(emp => {
          const eb = bonuses.filter(b => b.employee_id === emp.id); if (!eb.length) return null
          return <div key={emp.id} style={{marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:'var(--gold)',marginBottom:4}}>{emp.name}</div>
            {eb.map(b => <div key={b.id} className="card" style={{padding:12,marginBottom:4,display:'flex',justifyContent:'space-between',alignItems:'center',opacity:b.enabled?1:.5}}>
              <span style={{fontSize:13}}>{b.bonus_name} <strong style={{color:'var(--green)'}}>+${(b.amount||0).toLocaleString()}</strong></span>
              <div style={{display:'flex',gap:4}}><button style={{...ib,color:b.enabled?'var(--red)':'var(--green)'}} onClick={() => toggleBonus(b.id,!b.enabled)}>{b.enabled?'停':'啟'}</button><button style={{...ib,color:'var(--red)'}} onClick={() => deleteBonus(b.id)}><Trash2 size={12}/></button></div>
            </div>)}
          </div>
        })}
      </div>)}

      {/* ===== 支出管理 ===== */}
      {tab === 'expenses' && (<div>
        <div className="card" style={{padding:14,marginBottom:16}}><div style={{fontSize:11,color:'var(--text-dim)'}}>本月支出</div><div style={{fontSize:22,fontFamily:'var(--font-mono)',color:'var(--red)',fontWeight:600}}>${totalExp.toLocaleString()}</div></div>
        <button className="btn-outline" style={{marginBottom:16,display:'flex',alignItems:'center',gap:6}} onClick={() => setShowExpForm(!showExpForm)}><Plus size={14}/> 新增</button>
        {showExpForm&&<div className="card" style={{marginBottom:16,padding:16}}>
          <div style={{display:'flex',gap:8,marginBottom:8}}><input type="date" value={newExp.date} onChange={e => setNewExp(p=>({...p,date:e.target.value}))} style={{flex:1,fontSize:13,padding:8}}/><select value={newExp.category} onChange={e => setNewExp(p=>({...p,category:e.target.value}))} style={{flex:1,fontSize:13,padding:8}}><option value="">分類</option>{['食材','酒水','雪茄進貨','設備','房租','水電','人事','行銷','雜支'].map(c => <option key={c}>{c}</option>)}</select></div>
          <input value={newExp.item} onChange={e => setNewExp(p=>({...p,item:e.target.value}))} placeholder="項目" style={{marginBottom:8}}/>
          <div style={{display:'flex',gap:8,marginBottom:8}}><input type="number" inputMode="numeric" value={newExp.amount} onChange={e => setNewExp(p=>({...p,amount:e.target.value}))} placeholder="金額" style={{flex:1}} pattern="[0-9]*"/><select value={newExp.payment} onChange={e => setNewExp(p=>({...p,payment:e.target.value}))} style={{width:100,fontSize:13,padding:8}}>{['現金','刷卡','轉帳','LINE Pay'].map(p => <option key={p}>{p}</option>)}</select></div>
          <button className="btn-gold" onClick={addExpense}>儲存</button>
        </div>}
        {expenses.map(e => <div key={e.id} className="card" style={{padding:12,marginBottom:6,display:'flex',justifyContent:'space-between'}}>
          <div><div style={{fontSize:13,fontWeight:500}}>{e.item||e.category}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{e.date} · {e.category} · {e.payment}</div></div>
          <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:15,fontFamily:'var(--font-mono)',color:'var(--red)',fontWeight:600}}>-${(e.amount||0).toLocaleString()}</span><button style={{...ib,color:'var(--red)'}} onClick={() => deleteExpense(e.id)}><Trash2 size={12}/></button></div>
        </div>)}
      </div>)}
    </div>
  )
}

function R({label,value,positive,negative,highlight,dim}) {
  const c = highlight?'var(--gold)':positive?'var(--green)':negative?'var(--red)':dim?'var(--text-muted)':'var(--text)'
  const display = typeof value === 'number' ? (value < 0 ? `-$${Math.abs(value).toLocaleString()}` : `$${value.toLocaleString()}`) : value
  return <div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',fontSize:13}}><span style={{color:dim?'var(--text-muted)':'var(--text-dim)'}}>{label}</span><span style={{fontFamily:'var(--font-mono)',fontWeight:highlight?600:400,color:c}}>{display}</span></div>
}
function SH({children}){return<div style={{fontSize:12,fontWeight:600,color:'var(--gold)',marginBottom:4,marginTop:8}}>{children}</div>}
function SB({label,value,color}){return<div className="card" style={{padding:10,textAlign:'center'}}><div style={{fontSize:9,color:'var(--text-dim)'}}>{label}</div><div style={{fontSize:14,fontFamily:'var(--font-mono)',fontWeight:600,color}}>{value}</div></div>}
const ib = {background:'none',border:'none',padding:6,cursor:'pointer',borderRadius:6,fontSize:12,fontWeight:700}
