import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
  getInsuranceBracket, calcLaborInsuranceEmployee, calcLaborInsuranceEmployer,
  calcHealthInsuranceEmployee, calcHealthInsuranceEmployer, calcPensionEmployer
} from '../../lib/constants'
import { DollarSign, Download, ChevronDown, ChevronUp, Receipt, Plus } from 'lucide-react'
import { format, subMonths } from 'date-fns'

export default function BossPayroll() {
  const [tab, setTab] = useState('payroll')
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [employees, setEmployees] = useState([])
  const [salaryConfigs, setSalaryConfigs] = useState([])
  const [bonuses, setBonuses] = useState([])
  const [expenses, setExpenses] = useState([])
  const [expandedEmp, setExpandedEmp] = useState(null)
  const [newExpense, setNewExpense] = useState({ category: '', description: '', amount: '' })
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [month])

  async function loadData() {
    setLoading(true)
    const [empRes, salRes, bonRes, expRes] = await Promise.all([
      supabase.from('employees').select('*').eq('is_active', true).order('name'),
      supabase.from('salary_config').select('*'),
      supabase.from('bonus_definitions').select('*').eq('month', month),
      supabase.from('expenses').select('*').gte('date', `${month}-01`).lte('date', `${month}-31`).order('date', { ascending: false }),
    ])
    setEmployees(empRes.data || [])
    setSalaryConfigs(salRes.data || [])
    setBonuses(bonRes.data || [])
    setExpenses(expRes.data || [])
    setLoading(false)
  }

  function getConfig(empId) {
    return salaryConfigs.find(s => s.employee_id === empId) || {}
  }

  function calcPayroll(emp) {
    const cfg = getConfig(emp.employee_id)
    const baseSalary = cfg.base_salary || 0
    const allowances = cfg.allowances || 0
    const insuredSalary = getInsuranceBracket(baseSalary)

    const laborEmp = calcLaborInsuranceEmployee(insuredSalary)
    const laborEr = calcLaborInsuranceEmployer(insuredSalary)
    const healthEmp = calcHealthInsuranceEmployee(insuredSalary, cfg.dependents || 0)
    const healthEr = calcHealthInsuranceEmployer(insuredSalary)
    const pensionEr = calcPensionEmployer(baseSalary)

    const empBonus = bonuses.filter(b => b.employee_id === emp.employee_id).reduce((s, b) => s + (b.amount || 0), 0)
    const totalDeductions = laborEmp + healthEmp
    const netPay = baseSalary + allowances + empBonus - totalDeductions

    return {
      baseSalary, allowances, insuredSalary,
      laborEmp, laborEr, healthEmp, healthEr, pensionEr,
      bonus: empBonus, totalDeductions, netPay,
      employerCost: baseSalary + allowances + empBonus + laborEr + healthEr + pensionEr,
    }
  }

  async function addExpense() {
    if (!newExpense.category || !newExpense.amount) return
    await supabase.from('expenses').insert({
      ...newExpense,
      amount: Number(newExpense.amount),
      date: format(new Date(), 'yyyy-MM-dd'),
      created_by: 'ADMIN',
    })
    setNewExpense({ category: '', description: '', amount: '' })
    setShowExpenseForm(false)
    loadData()
  }

  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0)

  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))

  const tabs = [
    { id: 'payroll', label: '薪資明細' },
    { id: 'expenses', label: '支出管理' },
  ]

  if (loading) return <div className="page-container">{[1,2,3].map(i=><div key={i} className="loading-shimmer" style={{height:80,marginBottom:10}}/>)}</div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">薪資財務</div>

      {/* Month selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {months.map(m => (
          <button key={m} onClick={() => setMonth(m)} style={{
            padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer',
            background: m === month ? 'var(--gold-glow)' : 'transparent',
            color: m === month ? 'var(--gold)' : 'var(--text-dim)',
            border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)',
          }}>{parseInt(m.slice(5))}月</button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            background: tab === t.id ? 'var(--gold-glow)' : 'transparent',
            color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)',
            border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'payroll' && (
        <div>
          {/* Summary */}
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="card" style={{ padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>員工實領總計</div>
              <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontWeight: 600 }}>
                ${employees.reduce((s, e) => s + calcPayroll(e).netPay, 0).toLocaleString()}
              </div>
            </div>
            <div className="card" style={{ padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>雇主總成本</div>
              <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>
                ${employees.reduce((s, e) => s + calcPayroll(e).employerCost, 0).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Employee payroll cards */}
          {employees.map(emp => {
            const p = calcPayroll(emp)
            const expanded = expandedEmp === emp.employee_id
            return (
              <div key={emp.employee_id} className="card" style={{ marginBottom: 8, padding: 0, overflow: 'hidden' }}>
                <div
                  style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => setExpandedEmp(expanded ? null : emp.employee_id)}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emp.employee_id} · {emp.position || '員工'}</div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)' }}>
                        ${p.netPay.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>實領</div>
                    </div>
                    {expanded ? <ChevronUp size={16} color="var(--text-muted)"/> : <ChevronDown size={16} color="var(--text-muted)"/>}
                  </div>
                </div>

                {expanded && (
                  <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ paddingTop: 12 }}>
                      <Row label="底薪" value={p.baseSalary} />
                      <Row label="加給/津貼" value={p.allowances} />
                      {p.bonus > 0 && <Row label="獎金" value={p.bonus} positive />}
                      <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                      <Row label="投保薪資" value={p.insuredSalary} dim />
                      <Row label="勞保 (自付)" value={-p.laborEmp} negative />
                      <Row label="健保 (自付)" value={-p.healthEmp} negative />
                      <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                      <Row label="實發金額" value={p.netPay} highlight />
                      <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>雇主負擔</div>
                      <Row label="勞保 (雇主)" value={p.laborEr} dim />
                      <Row label="健保 (雇主)" value={p.healthEr} dim />
                      <Row label="勞退 6%" value={p.pensionEr} dim />
                      <Row label="雇主總成本" value={p.employerCost} highlight />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'expenses' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card" style={{ padding: 14, flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>本月支出總計</div>
              <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>
                ${totalExpenses.toLocaleString()}
              </div>
            </div>
          </div>

          <button className="btn-outline" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowExpenseForm(!showExpenseForm)}>
            <Plus size={14}/> 新增支出
          </button>

          {showExpenseForm && (
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <select value={newExpense.category} onChange={e => setNewExpense(p => ({ ...p, category: e.target.value }))} style={{ marginBottom: 10 }}>
                <option value="">選擇分類</option>
                <option value="rent">租金</option>
                <option value="supplies">耗材</option>
                <option value="utilities">水電</option>
                <option value="food">餐飲</option>
                <option value="maintenance">維修</option>
                <option value="marketing">行銷</option>
                <option value="other">其他</option>
              </select>
              <input placeholder="說明" value={newExpense.description} onChange={e => setNewExpense(p => ({ ...p, description: e.target.value }))} style={{ marginBottom: 10 }} />
              <input type="number" placeholder="金額" value={newExpense.amount} onChange={e => setNewExpense(p => ({ ...p, amount: e.target.value }))} style={{ marginBottom: 10 }} inputMode="numeric" />
              <button className="btn-gold" onClick={addExpense}>儲存</button>
            </div>
          )}

          {expenses.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>本月無支出記錄</div>
          ) : (
            expenses.map(ex => (
              <div key={ex.id} className="card" style={{ padding: 12, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{ex.description || ex.category}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ex.date} · {ex.category}</div>
                </div>
                <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>
                  -${(ex.amount || 0).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, positive, negative, highlight, dim }) {
  const color = highlight ? 'var(--gold)' : positive ? 'var(--green)' : negative ? 'var(--red)' : dim ? 'var(--text-muted)' : 'var(--text)'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
      <span style={{ color: dim ? 'var(--text-muted)' : 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: highlight ? 600 : 400, color }}>
        {typeof value === 'number' ? (value < 0 ? `-$${Math.abs(value).toLocaleString()}` : `$${value.toLocaleString()}`) : value}
      </span>
    </div>
  )
}
