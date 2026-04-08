import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Save, Trash2, Lock, Unlock, LogOut, Edit3, Clock } from 'lucide-react'
import { format, subMonths } from 'date-fns'

export default function Settings() {
  const [tab, setTab] = useState('employees')
  const tabs = [
    { id: 'employees', l: '員工管理' },
    { id: 'sop', l: 'SOP定義' },
    { id: 'kpi', l: 'KPI考核' },
  ]
  return (
    <div className="page-container fade-in">
      <div className="section-title">系統設定</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: tab === t.id ? 'var(--gold-glow)' : 'transparent', color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)', border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{t.l}</button>
        ))}
      </div>
      {tab === 'employees' && <EmployeeManager />}
      {tab === 'sop' && <SOPManager />}
      {tab === 'kpi' && <KPIManager />}
    </div>
  )
}

/* ========== 員工管理 ========== */
function EmployeeManager() {
  const [emps, setEmps] = useState([])
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newEmp, setNewEmp] = useState({ id: '', name: '', title: '', login_code: '', emp_type: '正職' })
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('employees').select('*').order('name')
    setEmps((data || []).filter(e => !e.is_admin))
    setLoading(false)
  }
  async function toggleEmp(emp) { await supabase.from('employees').update({ enabled: !emp.enabled }).eq('id', emp.id); load() }
  async function saveEdit() {
    if (!editing) return
    await supabase.from('employees').update({ name: editing.name, title: editing.title, login_code: editing.login_code, emp_type: editing.emp_type }).eq('id', editing.id)
    setEditing(null); load()
  }
  async function addEmployee() {
    if (!newEmp.id || !newEmp.name || !newEmp.login_code) return alert('ID、名稱、登入碼必填')
    if (newEmp.login_code.length < 4) return alert('登入碼至少4碼')
    if (emps.find(e => e.id === newEmp.id.toUpperCase())) return alert('ID已存在')
    await supabase.from('employees').insert({ ...newEmp, id: newEmp.id.toUpperCase(), enabled: true, is_admin: false })
    setNewEmp({ id: '', name: '', title: '', login_code: '', emp_type: '正職' }); setAdding(false); load()
  }
  if (loading) return <Loading />
  return (
    <div>
      {emps.map(emp => (
        <div key={emp.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
          {editing?.id === emp.id ? (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <input value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="名稱" style={{ flex: 1, minWidth: 80, fontSize: 13, padding: 8 }} />
                <input value={editing.title} onChange={e => setEditing(p => ({ ...p, title: e.target.value }))} placeholder="職稱" style={{ flex: 1, minWidth: 80, fontSize: 13, padding: 8 }} />
                <select value={editing.emp_type} onChange={e => setEditing(p => ({ ...p, emp_type: e.target.value }))} style={{ width: 80, fontSize: 13, padding: 8 }}>
                  <option>正職</option><option>PT</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={editing.login_code} onChange={e => setEditing(p => ({ ...p, login_code: e.target.value }))} placeholder="登入碼" type="password" style={{ flex: 1, fontSize: 13, padding: 8 }} />
                <button className="btn-gold" style={{ padding: '8px 14px', fontSize: 12 }} onClick={saveEdit}><Save size={12} /> 儲存</button>
                <button className="btn-outline" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => setEditing(null)}>取消</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: emp.enabled ? 'var(--gold-glow)' : 'var(--black)', border: `1px solid ${emp.enabled ? 'var(--border-gold)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: emp.enabled ? 'var(--gold)' : 'var(--text-muted)' }}>{emp.name?.charAt(0)}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: emp.enabled ? 'var(--text)' : 'var(--text-muted)' }}>{emp.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emp.id} · {emp.title} · <span style={{ color: emp.emp_type === '正職' ? 'var(--green)' : 'var(--blue)' }}>{emp.emp_type}</span></div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button style={iconBtn} onClick={() => setEditing({ ...emp })}><Edit3 size={14} color="var(--gold)" /></button>
                <span className={`badge ${emp.enabled ? 'badge-green' : 'badge-red'}`} style={{ cursor: 'pointer' }} onClick={() => toggleEmp(emp)}>{emp.enabled ? '在職' : '離職'}</span>
              </div>
            </div>
          )}
        </div>
      ))}
      <button className="btn-outline" style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => setAdding(!adding)}><Plus size={14} /> 新增員工</button>
      {adding && (
        <div className="card" style={{ marginTop: 12, padding: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <input value={newEmp.id} onChange={e => setNewEmp(p => ({ ...p, id: e.target.value.toUpperCase() }))} placeholder="員工代碼(英文大寫)" style={{ flex: 1, minWidth: 120, fontSize: 13, padding: 8 }} />
            <input value={newEmp.name} onChange={e => setNewEmp(p => ({ ...p, name: e.target.value }))} placeholder="顯示名稱" style={{ flex: 1, minWidth: 80, fontSize: 13, padding: 8 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <input value={newEmp.title} onChange={e => setNewEmp(p => ({ ...p, title: e.target.value }))} placeholder="職稱" style={{ flex: 1, fontSize: 13, padding: 8 }} />
            <select value={newEmp.emp_type} onChange={e => setNewEmp(p => ({ ...p, emp_type: e.target.value }))} style={{ width: 80, fontSize: 13, padding: 8 }}><option>正職</option><option>PT</option></select>
            <input value={newEmp.login_code} onChange={e => setNewEmp(p => ({ ...p, login_code: e.target.value }))} placeholder="登入碼(至少4碼)" style={{ flex: 1, minWidth: 100, fontSize: 13, padding: 8 }} />
          </div>
          <button className="btn-gold" style={{ width: '100%' }} onClick={addEmployee}>新增員工</button>
        </div>
      )}
    </div>
  )
}

/* ========== SOP 定義管理 ========== */
function SOPManager() {
  const [defs, setDefs] = useState([])
  const [emps, setEmps] = useState([])
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newTask, setNewTask] = useState({ task_id: '', owner: 'ALL', category: '', title: '', description: '', need_photo: false, need_input: false, weight: 1, deadline: '18:00', due_time: '', frequency: '每日' })
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [dR, eR] = await Promise.all([
      supabase.from('sop_definitions').select('*').order('owner').order('task_id'),
      supabase.from('employees').select('id, name').eq('enabled', true),
    ])
    setDefs(dR.data || [])
    setEmps([{ id: 'ALL', name: '全員搶單' }, ...(eR.data || []).filter(e => !e.is_admin)])
    setLoading(false)
  }
  async function saveEdit() {
    if (!editing) return
    const { task_id, ...rest } = editing
    await supabase.from('sop_definitions').update(rest).eq('task_id', task_id)
    setEditing(null); load()
  }
  async function addTask() {
    if (!newTask.task_id || !newTask.title) return alert('ID和名稱必填')
    if (defs.find(d => d.task_id === newTask.task_id)) return alert('ID已存在')
    await supabase.from('sop_definitions').insert(newTask)
    setNewTask({ task_id: '', owner: 'ALL', category: '', title: '', description: '', need_photo: false, need_input: false, weight: 1, deadline: '18:00', due_time: '', frequency: '每日' })
    setAdding(false); load()
  }
  async function deleteTask(tid) {
    if (!confirm(`確定刪除「${tid}」？明天起生效`)) return
    await supabase.from('sop_definitions').delete().eq('task_id', tid); load()
  }
  if (loading) return <Loading />

  const byOwner = {}
  defs.forEach(d => { const k = d.owner; if (!byOwner[k]) byOwner[k] = []; byOwner[k].push(d) })

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>修改後明天起生效，共 {defs.length} 項定義</div>
      {Object.entries(byOwner).map(([owner, items]) => (
        <div key={owner} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            {emps.find(e => e.id === owner)?.name || owner} ({items.length})
          </div>
          {items.map(d => (
            <div key={d.task_id} className="card" style={{ padding: 12, marginBottom: 4 }}>
              {editing?.task_id === d.task_id ? (
                <div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                    <input value={editing.title} onChange={e => setEditing(p => ({ ...p, title: e.target.value }))} placeholder="名稱" style={{ flex: 2, minWidth: 120, fontSize: 12, padding: 6 }} />
                    <select value={editing.owner} onChange={e => setEditing(p => ({ ...p, owner: e.target.value }))} style={{ width: 100, fontSize: 12, padding: 6 }}>
                      {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    <input value={editing.category} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))} placeholder="類別" style={{ width: 80, fontSize: 12, padding: 6 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={editing.need_photo} onChange={e => setEditing(p => ({ ...p, need_photo: e.target.checked }))} />需拍照</label>
                    <input type="number" value={editing.weight} onChange={e => setEditing(p => ({ ...p, weight: +e.target.value }))} style={{ width: 50, fontSize: 12, padding: 6 }} min={1} max={3} />
                    <select value={editing.frequency} onChange={e => setEditing(p => ({ ...p, frequency: e.target.value }))} style={{ width: 80, fontSize: 12, padding: 6 }}>
                      <option>每日</option><option>每週一</option><option>每週二</option><option>每週三</option><option>每週四</option><option>每週五</option><option>每週六</option><option>每週日</option>
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--gold-glow)', padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border-gold)' }}>
                      <Clock size={11} color="var(--gold)" />
                      <span style={{ fontSize: 10, color: 'var(--gold)' }}>截止</span>
                      <input type="time" value={editing.due_time || ''} onChange={e => setEditing(p => ({ ...p, due_time: e.target.value }))} style={{ width: 85, fontSize: 12, padding: '4px 6px', background: 'var(--black)', border: '1px solid var(--border-gold)', borderRadius: 6, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }} />
                    </div>
                    <button className="btn-gold" style={{ padding: '4px 10px', fontSize: 11 }} onClick={saveEdit}>儲存</button>
                    <button className="btn-outline" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setEditing(null)}>取消</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{d.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                      {d.task_id} · {d.category}
                      {d.need_photo && <span style={{ color: 'var(--red)' }}>📷</span>}
                      {d.weight > 1 && <span>W={d.weight}</span>}
                      {d.frequency !== '每日' && <span style={{ color: 'var(--blue)' }}>{d.frequency}</span>}
                      {d.due_time && <span style={{ color: 'var(--gold)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>⏰{d.due_time}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button style={iconBtn} onClick={() => setEditing({ ...d })}><Edit3 size={12} color="var(--gold)" /></button>
                    <button style={iconBtn} onClick={() => deleteTask(d.task_id)}><Trash2 size={12} color="var(--red)" /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <button className="btn-outline" style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => setAdding(!adding)}><Plus size={14} /> 新增 SOP 任務</button>
      {adding && (
        <div className="card" style={{ marginTop: 12, padding: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <input value={newTask.task_id} onChange={e => setNewTask(p => ({ ...p, task_id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))} placeholder="任務ID(小寫英文)" style={{ flex: 1, minWidth: 120, fontSize: 13, padding: 8 }} />
            <input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="任務名稱" style={{ flex: 2, minWidth: 120, fontSize: 13, padding: 8 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <select value={newTask.owner} onChange={e => setNewTask(p => ({ ...p, owner: e.target.value }))} style={{ flex: 1, fontSize: 13, padding: 8 }}>
              {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <input value={newTask.category} onChange={e => setNewTask(p => ({ ...p, category: e.target.value }))} placeholder="任務類別" style={{ flex: 1, fontSize: 13, padding: 8 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={newTask.need_photo} onChange={e => setNewTask(p => ({ ...p, need_photo: e.target.checked }))} /> 需拍照</label>
            <input type="number" value={newTask.weight} onChange={e => setNewTask(p => ({ ...p, weight: +e.target.value }))} placeholder="權重" style={{ width: 60, fontSize: 13, padding: 8 }} min={1} max={3} />
            <select value={newTask.frequency} onChange={e => setNewTask(p => ({ ...p, frequency: e.target.value }))} style={{ width: 80, fontSize: 13, padding: 8 }}>
              <option>每日</option><option>每週一</option><option>每週二</option><option>每週三</option><option>每週四</option><option>每週五</option><option>每週六</option><option>每週日</option>
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--gold-glow)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-gold)' }}>
              <Clock size={13} color="var(--gold)" />
              <span style={{ fontSize: 12, color: 'var(--gold)' }}>截止</span>
              <input type="time" value={newTask.due_time} onChange={e => setNewTask(p => ({ ...p, due_time: e.target.value }))} style={{ width: 85, fontSize: 13, padding: '6px 8px', background: 'var(--black)', border: '1px solid var(--border-gold)', borderRadius: 6, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }} />
            </div>
          </div>
          <button className="btn-gold" style={{ width: '100%' }} onClick={addTask}>新增任務</button>
        </div>
      )}
    </div>
  )
}

/* ========== KPI 考核管理 ========== */
function KPIManager() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [emps, setEmps] = useState([])
  const [tasks, setTasks] = useState([])
  const [kpis, setKpis] = useState([])
  const [loading, setLoading] = useState(true)
  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))

  useEffect(() => { load() }, [month])
  async function load() {
    setLoading(true)
    const start = month + '-01', end = month + '-31'
    const [eR, tR, kR] = await Promise.all([
      supabase.from('employees').select('id, name').eq('enabled', true),
      supabase.from('task_status').select('owner, completed, completed_by').gte('date', start).lte('date', end),
      supabase.from('kpi_evaluations').select('*').eq('month', month),
    ])
    setEmps((eR.data || []).filter(e => e.id !== 'ADMIN'))
    setTasks(tR.data || []); setKpis(kR.data || []); setLoading(false)
  }
  function calcMetrics(empId, empName) {
    const myTasks = tasks.filter(t => t.owner === empId)
    const done = myTasks.filter(t => t.completed).length
    const rate = myTasks.length ? Math.round(done / myTasks.length * 100) : 0
    const grabs = tasks.filter(t => t.owner === 'ALL' && t.completed && t.completed_by === empName).length
    let grade = 'C'
    if (rate >= 95 && grabs >= 15) grade = 'A+'
    else if (rate >= 85 && grabs >= 8) grade = 'A'
    else if (rate >= 70 && grabs >= 3) grade = 'B'
    return { total: myTasks.length, done, rate, grabs, grade }
  }
  async function saveKPI(empId, empName, bossGrade, comment) {
    const m = calcMetrics(empId, empName)
    const existing = kpis.find(k => k.employee_id === empId)
    const row = { month, employee_id: empId, name: empName, sop_rate: m.rate, grab_count: m.grabs, suggested_grade: m.grade, boss_grade: bossGrade, boss_comment: comment, lock_status: '草稿' }
    if (existing) await supabase.from('kpi_evaluations').update(row).eq('id', existing.id)
    else await supabase.from('kpi_evaluations').insert(row)
    alert('評鑑已儲存'); load()
  }
  async function toggleLock(empId, lock) {
    if (lock && !confirm('鎖定後無法修改，確定？')) return
    const existing = kpis.find(k => k.employee_id === empId)
    if (!existing) return alert('請先儲存評鑑')
    await supabase.from('kpi_evaluations').update({ lock_status: lock ? '已鎖定' : '草稿' }).eq('id', existing.id); load()
  }
  if (loading) return <Loading />
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', background: m === month ? 'var(--gold-glow)' : 'transparent', color: m === month ? 'var(--gold)' : 'var(--text-dim)', border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{parseInt(m.slice(5))}月</button>)}
      </div>
      {emps.map(emp => {
        const m = calcMetrics(emp.id, emp.name)
        const saved = kpis.find(k => k.employee_id === emp.id)
        const locked = saved?.lock_status === '已鎖定'
        return <KPICard key={emp.id} emp={emp} metrics={m} saved={saved} locked={locked} onSave={(g, c) => saveKPI(emp.id, emp.name, g, c)} onToggleLock={(l) => toggleLock(emp.id, l)} />
      })}
    </div>
  )
}

function KPICard({ emp, metrics: m, saved, locked, onSave, onToggleLock }) {
  const [grade, setGrade] = useState(saved?.boss_grade || '-')
  const [comment, setComment] = useState(saved?.boss_comment || '')
  useEffect(() => { setGrade(saved?.boss_grade || '-'); setComment(saved?.boss_comment || '') }, [saved])
  return (
    <div className="card" style={{ marginBottom: 12, padding: 16, borderColor: locked ? 'rgba(77,168,108,.3)' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{emp.name}</div>
        <div style={{ fontSize: 13, color: 'var(--gold)' }}>建議: {m.grade} {locked && <span style={{ color: 'var(--green)' }}>· 已鎖定</span>}</div>
      </div>
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <div style={{ padding: 10, background: 'var(--black)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>SOP達成</div>
          <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 600, color: m.rate >= 85 ? 'var(--green)' : m.rate >= 70 ? 'var(--gold)' : 'var(--red)' }}>{m.rate}%</div>
        </div>
        <div style={{ padding: 10, background: 'var(--black)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>搶單</div>
          <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)' }}>{m.grabs}</div>
        </div>
      </div>
      {!locked ? (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <select value={grade} onChange={e => setGrade(e.target.value)} style={{ width: 80, fontSize: 14, padding: 8 }}>
              <option>-</option><option>A+</option><option>A</option><option>B</option><option>C</option>
            </select>
            <input value={comment} onChange={e => setComment(e.target.value)} placeholder="老闆評語" style={{ flex: 1, fontSize: 13, padding: 8 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-gold" style={{ flex: 1, padding: '8px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={() => onSave(grade, comment)}><Save size={14} /> 儲存</button>
            <button className="btn-outline" style={{ padding: '8px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--green)', borderColor: 'rgba(77,168,108,.3)' }} onClick={() => onToggleLock(true)}><Lock size={14} /> 鎖定</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>老闆評級: <strong style={{ color: 'var(--gold)', fontSize: 20 }}>{saved?.boss_grade || '-'}</strong>{saved?.boss_comment && <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>{saved.boss_comment}</span>}</div>
          <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 12, color: 'var(--red)', borderColor: 'rgba(196,77,77,.3)', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => onToggleLock(false)}><Unlock size={12} /> 解鎖</button>
        </div>
      )}
    </div>
  )
}

function Loading() { return <div>{[1,2,3].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 10 }} />)}</div> }
const iconBtn = { background: 'none', border: 'none', padding: 6, cursor: 'pointer', borderRadius: 6 }
