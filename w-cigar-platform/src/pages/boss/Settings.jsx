import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Users, Save, Plus, Trash2, Shield } from 'lucide-react'

export default function BossSettings() {
  const { user } = useAuth()
  const [tab, setTab] = useState('employees')
  const [employees, setEmployees] = useState([])
  const [salaryConfigs, setSalaryConfigs] = useState([])
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [empRes, salRes] = await Promise.all([
      supabase.from('employees').select('*').order('name'),
      supabase.from('salary_config').select('*'),
    ])
    setEmployees(empRes.data || [])
    setSalaryConfigs(salRes.data || [])
    setLoading(false)
  }

  function getSalary(empId) {
    return salaryConfigs.find(s => s.employee_id === empId) || {}
  }

  async function saveEmployee(emp) {
    const { id, ...data } = emp
    if (id) {
      await supabase.from('employees').update(data).eq('id', id)
    } else {
      await supabase.from('employees').insert(data)
    }
    setEditing(null)
    loadData()
  }

  async function saveSalaryConfig(empId, config) {
    const existing = getSalary(empId)
    if (existing.id) {
      await supabase.from('salary_config').update(config).eq('id', existing.id)
    } else {
      await supabase.from('salary_config').insert({ employee_id: empId, ...config })
    }
    loadData()
  }

  async function toggleActive(emp) {
    await supabase.from('employees').update({ is_active: !emp.is_active }).eq('id', emp.id)
    loadData()
  }

  const tabs = [
    { id: 'employees', label: '員工管理' },
    { id: 'salary', label: '薪資設定' },
  ]

  if (loading) return <div className="page-container">{[1,2,3].map(i=><div key={i} className="loading-shimmer" style={{height:60,marginBottom:10}}/>)}</div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">系統設定</div>

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

      {tab === 'employees' && (
        <div>
          <button className="btn-outline" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setEditing({ employee_id: '', name: '', role: 'staff', pin: '', is_active: true, position: '' })}>
            <Plus size={14}/> 新增員工
          </button>

          {/* Edit form */}
          {editing && (
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', marginBottom: 12 }}>
                {editing.id ? '編輯員工' : '新增員工'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input placeholder="員工編號 (英文大寫)" value={editing.employee_id} onChange={e => setEditing(p => ({ ...p, employee_id: e.target.value.toUpperCase() }))} />
                <input placeholder="姓名" value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} />
                <input placeholder="職稱" value={editing.position || ''} onChange={e => setEditing(p => ({ ...p, position: e.target.value }))} />
                <select value={editing.role} onChange={e => setEditing(p => ({ ...p, role: e.target.value }))}>
                  <option value="staff">員工</option>
                  <option value="boss">管理者</option>
                  <option value="admin">系統管理員</option>
                </select>
                <input placeholder="PIN碼" type="password" value={editing.pin || ''} onChange={e => setEditing(p => ({ ...p, pin: e.target.value }))} maxLength={6} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-gold" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={() => saveEmployee(editing)}>
                    <Save size={14}/> 儲存
                  </button>
                  <button className="btn-outline" style={{ flex: 1 }} onClick={() => setEditing(null)}>取消</button>
                </div>
              </div>
            </div>
          )}

          {/* Employee list */}
          {employees.map(emp => (
            <div key={emp.id} className="card" style={{ padding: 14, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: emp.is_active ? 'var(--gold-glow)' : 'var(--black)',
                  border: `1px solid ${emp.is_active ? 'var(--border-gold)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 14, color: emp.is_active ? 'var(--gold)' : 'var(--text-muted)',
                }}>
                  {emp.name?.charAt(0) || '?'}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: emp.is_active ? 'var(--text)' : 'var(--text-muted)' }}>{emp.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emp.employee_id} · {emp.position || emp.role}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge ${emp.is_active ? 'badge-green' : 'badge-red'}`}>{emp.is_active ? '在職' : '離職'}</span>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} onClick={() => setEditing({ ...emp })}>
                  編輯
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'salary' && (
        <div>
          {employees.filter(e => e.is_active).map(emp => {
            const cfg = getSalary(emp.employee_id)
            return (
              <SalaryConfigCard
                key={emp.employee_id}
                emp={emp}
                config={cfg}
                onSave={(c) => saveSalaryConfig(emp.employee_id, c)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function SalaryConfigCard({ emp, config, onSave }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    base_salary: config.base_salary || 0,
    allowances: config.allowances || 0,
    dependents: config.dependents || 0,
  })

  return (
    <div className="card" style={{ padding: 14, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editing ? 12 : 0 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{emp.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            底薪 ${(config.base_salary || 0).toLocaleString()} + 加給 ${(config.allowances || 0).toLocaleString()}
          </div>
        </div>
        <button style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 12 }} onClick={() => setEditing(!editing)}>
          {editing ? '收起' : '編輯'}
        </button>
      </div>
      {editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>底薪</label>
              <input type="number" value={form.base_salary} onChange={e => setForm(p => ({ ...p, base_salary: Number(e.target.value) }))} inputMode="numeric" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>加給</label>
              <input type="number" value={form.allowances} onChange={e => setForm(p => ({ ...p, allowances: Number(e.target.value) }))} inputMode="numeric" />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>健保眷屬人數</label>
            <input type="number" value={form.dependents} onChange={e => setForm(p => ({ ...p, dependents: Number(e.target.value) }))} inputMode="numeric" min={0} />
          </div>
          <button className="btn-gold" style={{ padding: '8px', fontSize: 13 }} onClick={() => { onSave(form); setEditing(false) }}>
            儲存薪資設定
          </button>
        </div>
      )}
    </div>
  )
}
