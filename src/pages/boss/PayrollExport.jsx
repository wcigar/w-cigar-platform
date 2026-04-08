import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Printer, FileText } from 'lucide-react'
import { format, subMonths } from 'date-fns'
import { calcLaborIns, calcHealthIns, calcLaborPension, calcLaborInsER, calcHealthInsER, findBracket, calcOvertimePay, LABOR_INS_BRACKETS, HEALTH_INS_BRACKETS, SHIFTS, LATE_GRACE_MIN, OT_GRACE_MIN } from '../../lib/constants'

export default function PayrollExport() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [emps, setEmps] = useState([])
  const [salConfigs, setSalConfigs] = useState([])
  const [bonuses, setBonuses] = useState([])
  const [schedules, setSchedules] = useState([])
  const [punches, setPunches] = useState([])
  const [loading, setLoading] = useState(true)
  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01', e = month + '-31'
    const [eR, sR, bR, scR, pR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true).order('name'),
      supabase.from('salary_config').select('*'),
      supabase.from('bonus_definitions').select('*'),
      supabase.from('schedules').select('*').gte('date', s).lte('date', e),
      supabase.from('punch_records').select('*').gte('date', s).lte('date', e),
    ])
    setEmps((eR.data || []).filter(x => !x.is_admin))
    setSalConfigs(sR.data || [])
    setBonuses(bR.data || [])
    setSchedules(scR.data || [])
    setPunches(pR.data || [])
    setLoading(false)
  }

  function getCfg(eid) { return salConfigs.find(s => s.employee_id === eid) || {} }

  function getAttendance(eid) {
    const es = schedules.filter(s => s.employee_id === eid)
    const ep = punches.filter(p => p.employee_id === eid && p.is_valid)
    let work = 0, sick = 0, personal = 0, off = 0, special = 0
    let lateCount = 0, lateMinutes = 0, otTotalMin = 0, otDetails = []
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
          if (pm > sm) { lateCount++; lateMinutes += pm - sm }
        }
        if (clockOut?.time) {
          const [h, m] = clockOut.time.slice(11, 16).split(':').map(Number)
          let pm = h * 60 + m
          if (v === '晚班' && h < 12) pm += 1440
          const endMin = shift.endH * 60 + shift.endM
          const graceMin = endMin + OT_GRACE_MIN
          if (pm > graceMin) { const otMin = pm - endMin; otTotalMin += otMin; otDetails.push({ date: s.date, minutes: otMin, hours: +(otMin / 60).toFixed(1) }) }
        }
      } else if (v === '病假') sick++
      else if (v === '事假') personal++
      else if (v === '特休') special++
      else off++
    })
    return { work, sick, personal, off, special, total: es.length, lateCount, lateMinutes, otTotalMin, otDetails }
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
    const hourlyRate = base > 0 ? Math.round(base / 30 / 8) : 0
    const sickDeduct = Math.round(att.sick * dailyRate * 0.5)
    const personalDeduct = att.personal * dailyRate
    let otPay = 0
    att.otDetails.forEach(d => { d.pay = calcOvertimePay(hourlyRate, d.minutes); otPay += d.pay })
    const deduct = li + hi + sickDeduct + personalDeduct
    const net = base + empBon + otPay - deduct
    return { base, empBon, empBonuses, li, hi, lp, liER, hiER, lb, deduct, net, erCost: base + empBon + otPay + liER + hiER + lp, att, sickDeduct, personalDeduct, dailyRate, hourlyRate, otPay }
  }

  function printAll() {
    const yr = month.slice(0, 4), mo = parseInt(month.slice(5))
    const rows = emps.map(emp => {
      const p = calcPay(emp)
      return '<tr><td>' + emp.name + '</td><td>' + (emp.emp_type || '') + '</td><td class="r">$' + p.base.toLocaleString() + '</td><td class="r g">$' + p.empBon.toLocaleString() + '</td><td class="r g">$' + p.otPay.toLocaleString() + '</td><td class="r">' + p.att.work + '</td><td class="r rd">$' + p.li.toLocaleString() + '</td><td class="r rd">$' + p.hi.toLocaleString() + '</td><td class="r rd">$' + p.sickDeduct.toLocaleString() + '</td><td class="r rd">$' + p.personalDeduct.toLocaleString() + '</td><td class="r b">$' + p.net.toLocaleString() + '</td><td class="r">$' + p.erCost.toLocaleString() + '</td></tr>'
    }).join('')
    const totalNet = emps.reduce((s, e) => s + calcPay(e).net, 0)
    const totalER = emps.reduce((s, e) => s + calcPay(e).erCost, 0)
    const w = window.open('', '_blank')
    w.document.write('<html><head><title>薪資總表 ' + month + '</title><style>body{font-family:sans-serif;padding:24px;color:#222;font-size:12px}h1{font-size:18px;border-bottom:2px solid #c9a84c;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin:12px 0}th{background:#f5f0e8;padding:6px 4px;text-align:left;border:1px solid #ddd;font-size:10px;white-space:nowrap}td{padding:5px 4px;border:1px solid #ddd;font-size:11px}.r{text-align:right;font-family:monospace}.g{color:#2d8a4e}.rd{color:#c44d4d}.b{font-weight:700;color:#9a7d2e}tfoot td{font-weight:700;background:#faf5e8}@media print{body{padding:10px}}</style></head><body>')
    w.document.write('<h1>W Cigar Bar — ' + yr + '年' + mo + '月 薪資總表</h1>')
    w.document.write('<p style="color:#999;font-size:10px">產生：' + format(new Date(), 'yyyy/MM/dd HH:mm') + ' · 遲到寬限' + LATE_GRACE_MIN + '分 · 加班前2hr×1.34 超過×1.67</p>')
    w.document.write('<table><thead><tr><th>姓名</th><th>類型</th><th class="r">底薪</th><th class="r">加給</th><th class="r">加班費</th><th class="r">出勤</th><th class="r">勞保</th><th class="r">健保</th><th class="r">病假扣</th><th class="r">事假扣</th><th class="r">實發</th><th class="r">雇主成本</th></tr></thead><tbody>' + rows + '</tbody>')
    w.document.write('<tfoot><tr><td colspan="10" style="text-align:right">合計</td><td class="r b">$' + totalNet.toLocaleString() + '</td><td class="r">$' + totalER.toLocaleString() + '</td></tr></tfoot></table></body></html>')
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  function printSlip(emp) {
    const p = calcPay(emp)
    const yr = month.slice(0, 4), mo = parseInt(month.slice(5))
    const w = window.open('', '_blank')
    w.document.write('<html><head><title>薪資條 ' + emp.name + '</title><style>body{font-family:sans-serif;padding:30px;color:#333;max-width:480px;margin:0 auto}h1{font-size:18px;border-bottom:2px solid #c9a84c;padding-bottom:6px;margin-bottom:2px}.sub{color:#999;font-size:11px;margin-bottom:14px}h2{font-size:12px;color:#666;margin:14px 0 4px;border-bottom:1px solid #eee;padding-bottom:3px}.row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px dotted #eee}.row.bold{font-weight:700;font-size:14px;border-bottom:2px solid #333;padding:6px 0}.g{color:#2d8a4e}.rd{color:#c44d4d}.gl{color:#9a7d2e}.ft{margin-top:20px;font-size:9px;color:#999;text-align:center;border-top:1px solid #ddd;padding-top:8px}@media print{body{padding:15px}}</style></head><body>')
    w.document.write('<h1>W Cigar Bar — ' + yr + '年' + mo + '月 薪資條</h1>')
    w.document.write('<div class="sub">列印 ' + format(new Date(), 'yyyy/MM/dd HH:mm') + '</div>')
    w.document.write('<div class="row bold"><span>員工</span><span>' + emp.name + ' (' + emp.id + ') · ' + (emp.emp_type || '') + '</span></div>')
    w.document.write('<h2>📅 出勤統計</h2>')
    w.document.write('<div class="row"><span class="g">上班</span><span>' + p.att.work + ' 天</span></div>')
    if (p.att.sick) w.document.write('<div class="row"><span>病假</span><span>' + p.att.sick + ' 天</span></div>')
    if (p.att.personal) w.document.write('<div class="row"><span>事假</span><span>' + p.att.personal + ' 天</span></div>')
    if (p.att.special) w.document.write('<div class="row"><span>特休</span><span>' + p.att.special + ' 天</span></div>')
    w.document.write('<div class="row"><span>休假</span><span>' + p.att.off + ' 天</span></div>')
    if (p.att.lateCount) w.document.write('<div class="row"><span class="rd">遲到(寬限' + LATE_GRACE_MIN + '分)</span><span class="rd">' + p.att.lateCount + ' 次 · 共' + p.att.lateMinutes + '分鐘</span></div>')
    if (p.att.otDetails.length) w.document.write('<div class="row"><span class="g">加班(寬限' + OT_GRACE_MIN + '分)</span><span class="g">' + p.att.otDetails.length + ' 次 · 共' + (p.att.otTotalMin / 60).toFixed(1) + '小時</span></div>')
    w.document.write('<h2>💰 薪資明細</h2>')
    w.document.write('<div class="row"><span>底薪</span><span>$' + p.base.toLocaleString() + '</span></div>')
    p.empBonuses.forEach(function(b) { w.document.write('<div class="row"><span class="g">+ ' + b.bonus_name + '</span><span class="g">+$' + b.amount.toLocaleString() + '</span></div>') })
    if (p.otPay) w.document.write('<div class="row"><span class="g">+ 加班費(時薪$' + p.hourlyRate + '×1.34/1.67)</span><span class="g">+$' + p.otPay.toLocaleString() + '</span></div>')
    w.document.write('<h2>📉 法定扣除</h2>')
    w.document.write('<div class="row"><span>投保薪資級距</span><span>$' + p.lb.toLocaleString() + '</span></div>')
    w.document.write('<div class="row"><span class="rd">勞保費(員工20%)</span><span class="rd">-$' + p.li.toLocaleString() + '</span></div>')
    w.document.write('<div class="row"><span class="rd">健保費(員工30%)</span><span class="rd">-$' + p.hi.toLocaleString() + '</span></div>')
    if (p.sickDeduct) w.document.write('<div class="row"><span class="rd">病假扣薪(' + p.att.sick + '天×半薪)</span><span class="rd">-$' + p.sickDeduct.toLocaleString() + '</span></div>')
    if (p.personalDeduct) w.document.write('<div class="row"><span class="rd">事假扣薪(' + p.att.personal + '天)</span><span class="rd">-$' + p.personalDeduct.toLocaleString() + '</span></div>')
    w.document.write('<div class="row bold"><span class="gl">✦ 實發金額</span><span class="gl">$' + p.net.toLocaleString() + '</span></div>')
    w.document.write('<h2>🏢 雇主負擔</h2>')
    w.document.write('<div class="row"><span>勞保(雇主70%)</span><span>$' + p.liER.toLocaleString() + '</span></div>')
    w.document.write('<div class="row"><span>健保(雇主60%)</span><span>$' + p.hiER.toLocaleString() + '</span></div>')
    w.document.write('<div class="row"><span>勞退提繳(6%)</span><span>$' + p.lp.toLocaleString() + '</span></div>')
    w.document.write('<div class="row bold"><span>雇主總成本</span><span>$' + p.erCost.toLocaleString() + '</span></div>')
    if (p.att.otDetails.length) {
      w.document.write('<h2>⏰ 加班明細</h2>')
      p.att.otDetails.forEach(function(d) { w.document.write('<div class="row"><span>' + d.date + ' · ' + d.hours + '小時</span><span class="g">+$' + d.pay.toLocaleString() + '</span></div>') })
    }
    w.document.write('<div class="ft">W Cigar Bar 紳士雪茄館 · 統一營運平台<br>遲到寬限' + LATE_GRACE_MIN + '分 · 加班寬限' + OT_GRACE_MIN + '分 · 勞基法加班費率</div>')
    w.document.write('</body></html>')
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  if (loading) return <div>{[1, 2].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8 }} />)}</div>

  const totalNet = emps.reduce((s, e) => s + calcPay(e).net, 0)
  const totalER = emps.reduce((s, e) => s + calcPay(e).erCost, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', background: m === month ? 'var(--gold-glow)' : 'transparent', color: m === month ? 'var(--gold)' : 'var(--text-dim)', border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{parseInt(m.slice(5))}月</button>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div className="card" style={{ padding: 10, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>全員實發</div><div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>${totalNet.toLocaleString()}</div></div>
        <div className="card" style={{ padding: 10, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>雇主總成本</div><div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>${totalER.toLocaleString()}</div></div>
      </div>

      <button className="btn-gold" onClick={printAll} style={{ width: '100%', padding: 14, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Printer size={18} /> 列印全員薪資總表</button>

      {emps.map(emp => {
        const p = calcPay(emp)
        return (
          <div key={emp.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div><div style={{ fontSize: 15, fontWeight: 700 }}>{emp.name}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emp.emp_type} · 出勤{p.att.work}天{p.att.lateCount ? ' · 遲到' + p.att.lateCount : ''}{p.att.otDetails.length ? ' · 加班' + p.att.otDetails.length + '次' : ''}</div></div>
              <button className="btn-outline" onClick={() => printSlip(emp)} style={{ padding: '6px 12px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><FileText size={12} /> 薪資條</button>
            </div>

            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dotted var(--border)' }}><span style={{ color: 'var(--text-dim)' }}>底薪</span><span style={{ fontFamily: 'var(--font-mono)' }}>${p.base.toLocaleString()}</span></div>
              {p.empBonuses.map(b => <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dotted var(--border)' }}><span style={{ color: 'var(--green)' }}>+ {b.bonus_name}</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>+${b.amount.toLocaleString()}</span></div>)}
              {p.otPay > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dotted var(--border)' }}><span style={{ color: 'var(--green)' }}>+ 加班費</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>+${p.otPay.toLocaleString()}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dotted var(--border)' }}><span style={{ color: 'var(--text-muted)' }}>投保 ${p.lb.toLocaleString()}</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>${p.lb.toLocaleString()}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dotted var(--border)' }}><span style={{ color: 'var(--red)' }}>勞保(20%)</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>-${p.li.toLocaleString()}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dotted var(--border)' }}><span style={{ color: 'var(--red)' }}>健保(30%)</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>-${p.hi.toLocaleString()}</span></div>
              {p.sickDeduct > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dotted var(--border)' }}><span style={{ color: 'var(--red)' }}>病假{p.att.sick}天(半薪)</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>-${p.sickDeduct.toLocaleString()}</span></div>}
              {p.personalDeduct > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dotted var(--border)' }}><span style={{ color: 'var(--red)' }}>事假{p.att.personal}天</span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>-${p.personalDeduct.toLocaleString()}</span></div>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid var(--gold)' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>✦ 實發金額</span>
              <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>${p.net.toLocaleString()}</span>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span>雇主: 勞保${p.liER.toLocaleString()} 健保${p.hiER.toLocaleString()} 勞退${p.lp.toLocaleString()}</span>
              <span style={{ fontWeight: 600 }}>成本 ${p.erCost.toLocaleString()}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
