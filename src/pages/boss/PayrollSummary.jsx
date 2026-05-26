import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Download, RefreshCw } from 'lucide-react'
import { format, endOfMonth } from 'date-fns'
import { useAuth } from '../../lib/auth'
import { getAttendanceData, calcSalaryToDate } from './PayrollContent'

export default function PayrollSummary() {
  const { user } = useAuth()
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01'
    const e = format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const isCurrentMonth = month === format(new Date(), 'yyyy-MM')

    const [eR, sR, bR, scR, pR, penR, prR, lbR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true).order('name'),
      supabase.rpc('get_salary_configs', { p_admin_id: user?.employee_id }),
      supabase.rpc('get_bonus_definitions', { p_admin_id: user?.employee_id }),
      supabase.from('schedules').select('*').gte('date', s).lte('date', e),
      supabase.from('punch_records').select('*').gte('date', s).lte('date', e),
      supabase.from('sop_penalties').select('*').gte('date', s).lte('date', e),
      supabase.from('payroll_records').select('*').eq('month', month),
      supabase.from('leave_balances').select('employee_id, leave_type, hours'),
    ])

    const emps = (eR.data || []).filter(x => !x.is_admin)
    const salConfigs = sR.data || []
    const bonuses = bR.data || []
    const schedules = scR.data || []
    const punches = pR.data || []
    const penalties = penR.data || []
    const finalized = prR.data || []
    const leaves = lbR.data || []

    const [yr, mo] = month.split('-').map(Number)
    const daysInMonth = new Date(yr, mo, 0).getDate()
    const targetDate = isCurrentMonth ? new Date() : new Date(yr, mo - 1, daysInMonth)

    const out = emps.map(emp => {
      const cfg = salConfigs.find(c => c.employee_id === emp.id) || {}
      const empPenalties = penalties.filter(p => p.employee_id === emp.id)
      const att = getAttendanceData(emp.id, schedules, punches, emp)
      const calc = calcSalaryToDate(emp, cfg, bonuses, att, isCurrentMonth, targetDate, empPenalties)
      const finalRec = finalized.find(f => f.employee_id === emp.id)
      const compHr = leaves.filter(l => l.employee_id === emp.id && l.leave_type === '補休').reduce((s2, l) => s2 + (+l.hours || 0), 0)
      const annHr = leaves.filter(l => l.employee_id === emp.id && l.leave_type === '年假').reduce((s2, l) => s2 + (+l.hours || 0), 0)
      return {
        employee_id: emp.id,
        name: emp.name,
        emp_type: emp.emp_type,
        base_amount: calc.proratedBase || 0,
        bonus_amount: calc.totalBonuses || 0,
        labor_ins_ee: calc.li || 0,
        labor_ins_er: calc.liER || 0,
        health_ins_ee: calc.hi || 0,
        health_ins_er: calc.hiER || 0,
        labor_pension: calc.lp || 0,
        sop_penalty: calc.sopPenaltyTotal || 0,
        net_amount: calc.currentPayable || 0,
        comp_leave_balance: compHr,
        annual_leave_balance: annHr,
        status: finalRec?.status || 'draft',
        finalized_at: finalRec?.finalized_at || null,
      }
    })
    setRows(out)
    setLoading(false)
  }

  function exportCSV() {
    const headers = ['員工ID','姓名','類型','底薪','獎金','勞保(個人)','勞保(公司)','健保(個人)','健保(公司)','勞退提撥','SOP罰款','實發','補休餘額','年假餘額','狀態']
    const lines = [headers.join(',')]
    rows.forEach(r => {
      lines.push([r.employee_id, r.name, r.emp_type, r.base_amount, r.bonus_amount, r.labor_ins_ee, r.labor_ins_er, r.health_ins_ee, r.health_ins_er, r.labor_pension, r.sop_penalty, r.net_amount, r.comp_leave_balance, r.annual_leave_balance, r.status].join(','))
    })
    const sumER = rows.reduce((s, r) => s + (+r.labor_ins_er || 0) + (+r.health_ins_er || 0) + (+r.labor_pension || 0), 0)
    const sumNet = rows.reduce((s, r) => s + (+r.net_amount || 0), 0)
    lines.push('')
    lines.push(`小計,,,,,,,,,,,${sumNet},,,`)
    lines.push(`公司負擔合計,,,,,,,,,,,${sumER},,,`)
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `薪資總表_${month}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const totalBase = rows.reduce((s, r) => s + (+r.base_amount || 0), 0)
  const totalNet = rows.reduce((s, r) => s + (+r.net_amount || 0), 0)
  const totalER = rows.reduce((s, r) => s + (+r.labor_ins_er || 0) + (+r.health_ins_er || 0) + (+r.labor_pension || 0), 0)
  const totalSop = rows.reduce((s, r) => s + (+r.sop_penalty || 0), 0)
  const finalizedCount = rows.filter(r => r.status === 'finalized').length

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ fontSize: 14, padding: 8, width: 150 }} />
        <button onClick={load} className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13 }}><RefreshCw size={14} /> 重新整理</button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rows.length} 人 · 已結轉 {finalizedCount} · {rows.length - finalizedCount} 草稿</div>
        <button onClick={exportCSV} className="btn-gold" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13 }}><Download size={14} /> 匯出 CSV</button>
      </div>

      {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>載入中…</div>}

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1200 }}>
          <thead>
            <tr style={{ background: 'rgba(201,168,76,.08)' }}>
              <th style={th}>員工</th>
              <th style={th}>類型</th>
              <th style={thNum}>底薪</th>
              <th style={thNum}>獎金</th>
              <th style={thNum}>勞保<br/><span style={subTh}>個人</span></th>
              <th style={thNum}>勞保<br/><span style={subTh}>公司</span></th>
              <th style={thNum}>健保<br/><span style={subTh}>個人</span></th>
              <th style={thNum}>健保<br/><span style={subTh}>公司</span></th>
              <th style={thNum}>勞退<br/><span style={subTh}>公司</span></th>
              <th style={thNum}>SOP罰款</th>
              <th style={thNum}>實發</th>
              <th style={thNum}>補休<br/>(hr)</th>
              <th style={thNum}>年假<br/>(hr)</th>
              <th style={th}>狀態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.employee_id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={td}><strong>{r.name}</strong> <span style={{ color: 'var(--text-muted)' }}>({r.employee_id})</span></td>
                <td style={td}><span style={{ color: r.emp_type === '正職' ? 'var(--green)' : 'var(--blue)' }}>{r.emp_type}</span></td>
                <td style={tdNum}>{fmt(r.base_amount)}</td>
                <td style={tdNum}>{fmt(r.bonus_amount)}</td>
                <td style={tdNumNeg}>{fmt(r.labor_ins_ee)}</td>
                <td style={tdNumER}>{fmt(r.labor_ins_er)}</td>
                <td style={tdNumNeg}>{fmt(r.health_ins_ee)}</td>
                <td style={tdNumER}>{fmt(r.health_ins_er)}</td>
                <td style={tdNumER}>{fmt(r.labor_pension)}</td>
                <td style={tdNumNeg}>{fmt(r.sop_penalty)}</td>
                <td style={{ ...tdNum, color: 'var(--gold)', fontWeight: 700 }}>{fmt(r.net_amount)}</td>
                <td style={tdNum}>{(+r.comp_leave_balance || 0).toFixed(1)}</td>
                <td style={tdNum}>{(+r.annual_leave_balance || 0).toFixed(1)}</td>
                <td style={td}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: r.status === 'finalized' ? 'rgba(77,168,108,.15)' : 'rgba(245,158,11,.12)', color: r.status === 'finalized' ? 'var(--green)' : '#f59e0b' }}>
                    {r.status === 'finalized' ? '✓ 已結轉' : r.status === 'paid' ? '已發放' : '草稿（live）'}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && <tr><td colSpan={14} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>本月無在職員工</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ background: 'rgba(201,168,76,.06)', borderTop: '2px solid var(--border-gold)' }}>
                <td colSpan={2} style={{ ...td, fontWeight: 700, color: 'var(--gold)' }}>合計</td>
                <td style={tdNum}>{fmt(totalBase)}</td>
                <td colSpan={6}></td>
                <td style={tdNumNeg}>{fmt(totalSop)}</td>
                <td style={{ ...tdNum, color: 'var(--gold)', fontWeight: 700 }}>{fmt(totalNet)}</td>
                <td colSpan={3}></td>
              </tr>
              <tr style={{ background: 'rgba(255,200,100,.04)' }}>
                <td colSpan={2} style={{ ...td, fontWeight: 700, color: '#f59e0b' }}>公司負擔合計（勞保+健保+勞退）</td>
                <td colSpan={11}></td>
                <td style={{ ...tdNum, color: '#f59e0b', fontWeight: 700 }}>{fmt(totalER)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
        💡 「草稿（live）」= 即時計算未結轉、「✓ 已結轉」= 在「薪資計算」按鈕結轉過。CSV 含「公司負擔合計」給君姐核帳。
      </div>
    </div>
  )
}

function fmt(n) { return '$' + (+n || 0).toLocaleString() }
const th = { padding: '10px 8px', textAlign: 'left', fontSize: 11, color: 'var(--gold)', fontWeight: 700, whiteSpace: 'nowrap' }
const thNum = { ...th, textAlign: 'right' }
const subTh = { fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }
const td = { padding: '10px 8px', fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' }
const tdNum = { ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }
const tdNumNeg = { ...tdNum, color: 'var(--red)' }
const tdNumER = { ...tdNum, color: '#f59e0b' }
