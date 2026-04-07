import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { CheckCircle2, Circle, Plus, AlertTriangle, Trophy, Eye, X, Check, Camera } from 'lucide-react'
import { format } from 'date-fns'

export default function Operations() {
  const [tab, setTab] = useState('sop')
  const [tasks, setTasks] = useState([])
  const [notices, setNotices] = useState([])
  const [abnormals, setAbnormals] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [newNotice, setNewNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = format(new Date(), 'yyyy-MM')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [tR, nR, aR, lbR] = await Promise.all([
      supabase.from('task_status').select('*').eq('date', today).order('owner').order('task_id'),
      supabase.from('notices').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('abnormal_reports').select('*').order('time', { ascending: false }).limit(20),
      supabase.from('task_status').select('completed_by').eq('owner', 'ALL').eq('completed', true).gte('date', month + '-01').lte('date', month + '-31'),
    ])
    setTasks(tR.data || [])
    setNotices(nR.data || [])
    setAbnormals(aR.data || [])
    // Calc leaderboard
    const counts = {}
    ;(lbR.data || []).forEach(r => { if (r.completed_by) counts[r.completed_by] = (counts[r.completed_by] || 0) + 1 })
    setLeaderboard(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
    setLoading(false)
  }

  async function publish() {
    if (!newNotice) return
    await supabase.from('notices').insert({ content: newNotice, enabled: true, publisher: 'ADMIN' })
    setNewNotice(''); setShowForm(false); load()
  }

  async function toggleNotice(id, enabled) {
    await supabase.from('notices').update({ enabled }).eq('id', id); load()
  }

  async function auditTask(taskId, result) {
    if (result === '不合格') {
      await supabase.from('task_status').update({ audit_status: '不合格', completed: false, completed_at: null }).eq('id', taskId)
    } else {
      await supabase.from('task_status').update({ audit_status: '合格' }).eq('id', taskId)
    }
    load()
  }

  async function updateAbnormalStatus(id, status) {
    await supabase.from('abnormal_reports').update({ status }).eq('id', id); load()
  }

  // Group tasks by owner
  const byOwner = {}
  tasks.forEach(t => {
    const k = t.owner
    if (!byOwner[k]) byOwner[k] = []
    byOwner[k].push(t)
  })

  const tabs = [
    { id: 'sop', l: 'SOP 儀表板' },
    { id: 'abnormal', l: `異常 (${abnormals.filter(a => a.status === '待處理').length})` },
    { id: 'ranking', l: '搶單排行' },
    { id: 'notices', l: '公告管理' },
  ]

  if (loading) return <div className="page-container">{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 80, marginBottom: 10 }} />)}</div>

  return (
    <div className="page-container fade-in">
      <div className="section-title">營運管理</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: tab === t.id ? 'var(--gold-glow)' : 'transparent', color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)', border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{t.l}</button>
        ))}
      </div>

      {/* SOP Dashboard */}
      {tab === 'sop' && (
        <div>
          {Object.keys(byOwner).length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>今日無 SOP</div> :
            Object.entries(byOwner).map(([owner, ownerTasks]) => {
              const done = ownerTasks.filter(t => t.completed).length
              const total = ownerTasks.length
              const pct = Math.round(done / total * 100)
              return (
                <div key={owner} className="card" style={{ marginBottom: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{owner === 'ALL' ? '搶單任務' : owner}</span>
                    <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: pct === 100 ? 'var(--green)' : 'var(--gold)' }}>{done}/{total} ({pct}%)</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--black)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ height: '100%', width: pct + '%', background: pct === 100 ? 'var(--green)' : 'linear-gradient(90deg,var(--gold-dim),var(--gold))', borderRadius: 3 }} />
                  </div>
                  {ownerTasks.map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed var(--border)', fontSize: 13, gap: 6 }}>
                      <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {t.completed ? <CheckCircle2 size={14} color="var(--green)" /> : <Circle size={14} color="var(--text-muted)" />}
                        <span style={{ color: t.completed ? 'var(--text-dim)' : 'var(--text)' }}>{t.title}</span>
                        {t.photo_url && <a href={t.photo_url} target="_blank" style={{ color: 'var(--green)', textDecoration: 'none' }}></a>}
                      </span>
                      {t.completed ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 600 }}>{t.completed_by}</span>
                          {t.audit_status === '合格' ? <span className="badge badge-green" style={{ fontSize: 10 }}>合格</span> :
                            t.audit_status === '不合格' ? <span className="badge badge-red" style={{ fontSize: 10 }}>不合格</span> : (
                              <div style={{ display: 'flex', gap: 2 }}>
                                <button style={{ background: 'rgba(77,168,108,.15)', color: 'var(--green)', border: 'none', borderRadius: 6, padding: '3px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }} onClick={() => auditTask(t.id, '合格')}>合格</button>
                                <button style={{ background: 'rgba(196,77,77,.15)', color: 'var(--red)', border: 'none', borderRadius: 6, padding: '3px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }} onClick={() => auditTask(t.id, '不合格')}>退回</button>
                              </div>
                            )}
                        </div>
                      ) : <span style={{ color: 'var(--red)', fontSize: 11, fontWeight: 600 }}>未完成</span>}
                    </div>
                  ))}
                </div>
              )
            })}
        </div>
      )}

      {/* Abnormal Reports */}
      {tab === 'abnormal' && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={16} /> 異常回報紀錄
          </div>
          {abnormals.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>無異常回報</div> :
            abnormals.map(a => (
              <div key={a.id} className="card" style={{ padding: 14, marginBottom: 8, borderColor: a.status === '待處理' ? 'rgba(196,77,77,.3)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>{a.reporter}  {a.date}</span>
                  <select value={a.status || '待處理'} onChange={e => updateAbnormalStatus(a.id, e.target.value)}
                    style={{ width: 'auto', fontSize: 12, padding: '4px 8px', background: a.status === '已解決' ? 'rgba(77,168,108,.1)' : 'rgba(196,77,77,.1)', borderColor: a.status === '已解決' ? 'rgba(77,168,108,.2)' : 'rgba(196,77,77,.2)', color: a.status === '已解決' ? 'var(--green)' : 'var(--red)' }}>
                    <option>待處理</option><option>處理中</option><option>已解決</option>
                  </select>
                </div>
                <div style={{ fontSize: 14, color: 'var(--text)' }}>{a.description}</div>
                {a.photo_url && <a href={a.photo_url} target="_blank" style={{ fontSize: 12, color: 'var(--blue)', marginTop: 4, display: 'block' }}>查看照片</a>}
              </div>
            ))}
        </div>
      )}

      {/* Leaderboard */}
      {tab === 'ranking' && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Trophy size={16} /> {month} 搶單排行榜
          </div>
          {leaderboard.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>本月無搶單紀錄</div> :
            leaderboard.map((x, i) => (
              <div key={x.name} className="card" style={{ padding: 14, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: i === 0 ? 'var(--border-gold)' : undefined }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {i === 0 ? '' : i === 1 ? '' : i === 2 ? '' : `${i + 1}.`} {x.name}
                </span>
                <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>{x.count} 單</span>
              </div>
            ))}
        </div>
      )}

      {/* Notices */}
      {tab === 'notices' && (
        <div>
          <button className="btn-outline" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowForm(!showForm)}><Plus size={14} /> 新增公告</button>
          {showForm && <div className="card" style={{ marginBottom: 16, padding: 16 }}><textarea placeholder="公告內容" rows={3} value={newNotice} onChange={e => setNewNotice(e.target.value)} style={{ marginBottom: 10, resize: 'none' }} /><button className="btn-gold" onClick={publish}>發布</button></div>}
          {notices.map(n => (
            <div key={n.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, flex: 1 }}>{n.content}</span>
                <button className={n.enabled ? 'btn-red' : 'btn-outline'} style={{ padding: '4px 10px', fontSize: 11, flexShrink: 0 }} onClick={() => toggleNotice(n.id, !n.enabled)}>
                  {n.enabled ? '停用' : '啟用'}
                </button>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>{n.publisher}  {n.created_at?.slice(0, 16)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
