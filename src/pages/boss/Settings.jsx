import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Save } from 'lucide-react'

export default function Settings() {
  const [tab, setTab] = useState('employees')
  const [emps, setEmps] = useState([])
  const [sopDefs, setSopDefs] = useState([])
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const [eR,sR] = await Promise.all([
      supabase.from('employees').select('*').order('name'),
      supabase.from('sop_definitions').select('*').order('task_id'),
    ])
    setEmps(eR.data||[]); setSopDefs(sR.data||[]); setLoading(false)
  }

  async function saveEmp(emp) {
    const {id,...data} = emp
    if (id && emps.find(e=>e.id===id)) await supabase.from('employees').update(data).eq('id',id)
    else await supabase.from('employees').insert(emp)
    setEditing(null); load()
  }

  async function toggleEmp(emp) {
    await supabase.from('employees').update({enabled:!emp.enabled}).eq('id',emp.id); load()
  }

  if (loading) return <div className="page-container">{[1,2,3].map(i=><div key={i} className="loading-shimmer" style={{height:60,marginBottom:10}}/>)}</div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">系統設定</div>
      <div style={{display:'flex',gap:8,marginBottom:20}}>
        {[{id:'employees',l:'員工管理'},{id:'sop',l:'SOP定義'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{padding:'8px 16px',borderRadius:20,fontSize:13,fontWeight:500,cursor:'pointer',background:tab===t.id?'var(--gold-glow)':'transparent',color:tab===t.id?'var(--gold)':'var(--text-dim)',border:tab===t.id?'1px solid var(--border-gold)':'1px solid var(--border)'}}>{t.l}</button>
        ))}
      </div>
      {tab==='employees' && <div>
        {emps.filter(e=>!e.is_admin).map(emp => (
          <div key={emp.id} className="card" style={{padding:14,marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:36,height:36,borderRadius:8,background:emp.enabled?'var(--gold-glow)':'var(--black)',border:`1px solid ${emp.enabled?'var(--border-gold)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:14,color:emp.enabled?'var(--gold)':'var(--text-muted)'}}>{emp.name?.charAt(0)}</div>
              <div><div style={{fontSize:14,fontWeight:500,color:emp.enabled?'var(--text)':'var(--text-muted)'}}>{emp.name}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{emp.id} · {emp.title} · {emp.emp_type||''}</div></div>
            </div>
            <span className={`badge ${emp.enabled?'badge-green':'badge-red'}`} style={{cursor:'pointer'}} onClick={() => toggleEmp(emp)}>{emp.enabled?'在職':'離職'}</span>
          </div>
        ))}
      </div>}
      {tab==='sop' && <div>
        {sopDefs.map(d => (
          <div key={d.task_id} className="card" style={{padding:12,marginBottom:6}}>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <div><div style={{fontSize:14,fontWeight:500}}>{d.title}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{d.task_id} · {d.owner} · {d.category} · 權重{d.weight}</div></div>
              <div style={{display:'flex',gap:4}}>
                {d.need_photo && <span className="badge badge-red">需拍照</span>}
                <span className="badge badge-gold">{d.frequency}</span>
              </div>
            </div>
          </div>
        ))}
      </div>}
    </div>
  )
}
