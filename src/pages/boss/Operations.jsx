import ExpenseDashboard from './ExpenseDashboard'
import AbnormalStats from './AbnormalStats'
import NoticesMgmt from './NoticesMgmt'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { CheckCircle2, Circle, Plus, AlertTriangle, Trophy, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { getTaskUrgency, URGENCY_COLORS } from '../../lib/taskUtils'
import { getSlaStatus } from '../../lib/slaUtils'
import CleaningMgmt from './CleaningMgmt'
import InventoryMgmt from './InventoryMgmt'

export default function Operations() {
  const [tab, setTab] = useState('sop')
  const [tasks, setTasks] = useState([])
  const [notices, setNotices] = useState([])
  const [abnormals, setAbnormals] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [newNotice, setNewNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [photoModal, setPhotoModal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = format(new Date(), 'yyyy-MM')

  useEffect(() => { load() }, [])
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 60000); return () => clearInterval(iv) }, [])

  async function load() {
    setLoading(true)
    const [tR, nR, aR, lbR] = await Promise.all([
      supabase.from('task_status').select('*').eq('date', today).order('owner').order('task_id'),
      supabase.from('notices').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('abnormal_reports').select('*').order('time', { ascending: false }).limit(20),
      supabase.from('task_status').select('completed_by').eq('owner', 'ALL').eq('completed', true).gte('date', month + '-01').lte('date', month + '-31'),
    ])
    setTasks(tR.data || []); setNotices(nR.data || []); setAbnormals(aR.data || [])
    const counts = {}
    ;(lbR.data || []).forEach(r => { if (r.completed_by) counts[r.completed_by] = (counts[r.completed_by] || 0) + 1 })
    setLeaderboard(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count))
    setLoading(false)
  }

  async function publish() { if (!newNotice) return; await supabase.from('notices').insert({ content: newNotice, enabled: true, publisher: 'ADMIN' }); setNewNotice(''); setShowForm(false); load() }
  async function toggleNotice(id, en) { await supabase.from('notices').update({ enabled: en }).eq('id', id); load() }
  async function deleteNotice(id) { if (!confirm('刪除？')) return; await supabase.from('notices').delete().eq('id', id); load() }
  async function auditTask(id, result) {
    if (result === '不合格') await supabase.from('task_status').update({ audit_status: '不合格', completed: false, completed_at: null }).eq('id', id)
    else await supabase.from('task_status').update({ audit_status: '合格' }).eq('id', id)
    load()
  }
  async function updateAbnormalStatus(id, status) {
    const update = { status }
    if (status === '已解決') update.escalated = false
    await supabase.from('abnormal_reports').update(update).eq('id', id); load()
  }

  const byOwner = {}; tasks.forEach(t => { const k = t.owner; if (!byOwner[k]) byOwner[k] = []; byOwner[k].push(t) })
  const overdueCount = tasks.filter(t => getTaskUrgency(t) === 'overdue').length
  const warningCount = tasks.filter(t => getTaskUrgency(t) === 'warning').length
  const slaOverdue = abnormals.filter(a => getSlaStatus(a).status === 'overdue').length
  const slaWarning = abnormals.filter(a => getSlaStatus(a).status === 'warning').length

  const tabs = [
    { id: 'sop', l: 'SOP儀表板' + (overdueCount ? ' 🔴' + overdueCount : warningCount ? ' 🟡' + warningCount : '') },
    { id: 'cleaning', l: '大掃除' },
    { id: 'inventory', l: '庫存管理' },
    { id: 'abnormal', l: '異常(' + abnormals.filter(a => a.status === '待處理').length + ')' + (slaOverdue ? ' 🔴' : slaWarning ? ' 🟡' : '') },
    { id: 'expense', l: '支出分析' },
    { id: 'abnormal_stats', l: '異常統計' },
    { id: 'ranking', l: '搶單排行' },
    { id: 'notices', l: '公告' },
  ]

  if (loading) return <div className="page-container">{[1,2,3].map(i => <div key={i} className="loading-shimmer" style={{ height: 80, marginBottom: 10 }} />)}</div>

  return (
    <div className="page-container fade-in">
      {photoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPhotoModal(null)}>
          <div style={{ maxWidth: 600, width: '100%' }} onClick={e => e.stopPropagation()}>
            <img src={photoModal.url} alt="" style={{ width: '100%', borderRadius: 12, maxHeight: '80vh', objectFit: 'contain' }} />
            <div style={{ color: 'var(--text)', fontSize: 14, textAlign: 'center', marginTop: 10 }}>{photoModal.title} — {photoModal.by}</div>
            <button className="btn-outline" style={{ width: '100%', marginTop: 10 }} onClick={() => setPhotoModal(null)}>關閉</button>
          </div>
        </div>
      )}
      <div className="section-title">營運管理</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '7px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: tab === t.id ? 'var(--gold-glow)' : 'transparent', color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)', border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{t.l}</button>)}
      </div>

      {tab === 'sop' && (
        <div>
          {(overdueCount > 0 || warningCount > 0) && (
            <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: overdueCount > 0 ? 'rgba(196,77,77,.4)' : 'rgba(245,158,11,.4)', background: overdueCount > 0 ? 'rgba(196,77,77,.06)' : 'rgba(245,158,11,.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
                {overdueCount > 0 && <span style={{ color: 'var(--red)' }}>🔴 已逾時 {overdueCount} 項</span>}
                {warningCount > 0 && <span style={{ color: '#f59e0b' }}>🟡 即將逾時 {warningCount} 項</span>}
              </div>
            </div>
          )}
          {Object.keys(byOwner).length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>今日無SOP</div> :
            Object.entries(byOwner).map(([owner, ownerTasks]) => {
              const done = ownerTasks.filter(t => t.completed).length, total = ownerTasks.length, pct = Math.round(done / total * 100)
              return (
                <div key={owner} className="card" style={{ marginBottom: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{owner === 'ALL' ? '搶單任務' : owner}</span>
                    <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: pct === 100 ? 'var(--green)' : 'var(--gold)' }}>{done}/{total} ({pct}%)</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--black)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ height: '100%', width: pct + '%', background: pct === 100 ? 'var(--green)' : 'linear-gradient(90deg,var(--gold-dim),var(--gold))', borderRadius: 3 }} />
                  </div>
                  {ownerTasks.map(t => {
                    const urgency = getTaskUrgency(t)
                    const urgColor = URGENCY_COLORS[urgency]
                    const isUrgent = urgency === 'overdue' || urgency === 'warning'
                    return (
                      <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--border)', background: isUrgent ? (urgency === 'overdue' ? 'rgba(196,77,77,.04)' : 'rgba(245,158,11,.04)') : undefined, marginLeft: isUrgent ? -8 : 0, marginRight: isUrgent ? -8 : 0, paddingLeft: isUrgent ? 8 : 0, paddingRight: isUrgent ? 8 : 0, borderRadius: isUrgent ? 6 : 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, gap: 6 }}>
                          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {t.completed ? <CheckCircle2 size={14} color="var(--green)" /> : <Circle size={14} color={urgColor} />}
                            <span style={{ color: t.completed ? 'var(--text-dim)' : 'var(--text)' }}>{t.title}</span>
                            {!t.completed && t.due_time && <span style={{ fontSize: 10, color: urgColor, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}><Clock size={10} />{t.due_time}{urgency === 'overdue' ? ' 逾時！' : urgency === 'warning' ? ' 即將到期' : ''}</span>}
                            {t.photo_url && <span style={{ cursor: 'pointer', fontSize: 11 }} onClick={() => setPhotoModal({ url: t.photo_url, title: t.title, by: t.completed_by })}>📷</span>}
                          </span>
                          {t.completed ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 600 }}>✓{t.completed_by} {t.completed_at ? format(new Date(t.completed_at), 'HH:mm') : ''}</span>
                              {t.audit_status === '合格' ? <span className="badge badge-green" style={{ fontSize: 10 }}>合格</span> :
                                t.audit_status === '不合格' ? <span className="badge badge-red" style={{ fontSize: 10 }}>不合格</span> : (
                                  <div style={{ display: 'flex', gap: 2 }}>
                                    <button style={{ background: 'rgba(77,168,108,.15)', color: 'var(--green)', border: 'none', borderRadius: 6, padding: '3px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }} onClick={() => auditTask(t.id, '合格')}>✓</button>
                                    <button style={{ background: 'rgba(196,77,77,.15)', color: 'var(--red)', border: 'none', borderRadius: 6, padding: '3px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }} onClick={() => auditTask(t.id, '不合格')}>✗</button>
                                  </div>
                                )}
                            </div>
                          ) : <span style={{ color: urgColor, fontSize: 11, fontWeight: 600 }}>{urgency === 'overdue' ? '🔴逾時' : urgency === 'warning' ? '🟡快到期' : '未完成'}</span>}
                        </div>
                        {t.completed && t.photo_url && <div style={{ marginTop: 6, cursor: 'pointer' }} onClick={() => setPhotoModal({ url: t.photo_url, title: t.title, by: t.completed_by })}><img src={t.photo_url} alt="" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} /></div>}
                        {t.completed && t.note && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>📝 {t.note}</div>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
        </div>
      )}

      {tab === 'cleaning' && <CleaningMgmt />}
      {tab === 'inventory' && <InventoryMgmt />}

      {tab === 'abnormal' && (
        <div>
          {(slaOverdue > 0 || slaWarning > 0) && (
            <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: slaOverdue > 0 ? 'rgba(196,77,77,.4)' : 'rgba(245,158,11,.4)', background: slaOverdue > 0 ? 'rgba(196,77,77,.06)' : 'rgba(245,158,11,.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
                <Clock size={14} />
                {slaOverdue > 0 && <span style={{ color: 'var(--red)' }}>🔴 SLA逾期 {slaOverdue} 筆</span>}
                {slaWarning > 0 && <span style={{ color: '#f59e0b' }}>🟡 即將到期 {slaWarning} 筆</span>}
              </div>
            </div>
          )}
          {abnormals.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>無異常</div> :
            abnormals.map(a => {
              const sla = getSlaStatus(a)
              return (
                <div key={a.id} className="card" style={{ padding: 14, marginBottom: 8, borderColor: sla.status === 'overdue' ? 'rgba(196,77,77,.4)' : sla.status === 'warning' ? 'rgba(245,158,11,.3)' : a.status === '待處理' ? 'rgba(196,77,77,.3)' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600 }}>{a.reporter} · {a.date}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {a.status !== '已解決' && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: sla.color, display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 10, background: sla.status === 'overdue' ? 'rgba(196,77,77,.12)' : sla.status === 'warning' ? 'rgba(245,158,11,.12)' : 'rgba(77,168,108,.08)' }}>
                          <Clock size={11} />{sla.remaining}
                        </span>
                      )}
                      <select value={a.status || '待處理'} onChange={e => updateAbnormalStatus(a.id, e.target.value)} style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}>
                        <option>待處理</option><option>處理中</option><option>已解決</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ fontSize: 14 }}>{a.description}</div>
                  {a.sla_hours && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>SLA: {a.sla_hours}h · 截止: {a.sla_deadline ? format(new Date(a.sla_deadline), 'MM/dd HH:mm') : '—'}</div>}
                  {a.photo_url && <img src={a.photo_url} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, marginTop: 8, cursor: 'pointer' }} onClick={() => setPhotoModal({ url: a.photo_url, title: '異常', by: a.reporter })} />}
                </div>
              )
            })}
        </div>
      )}

      {tab === 'expense' && <ExpenseDashboard />}

      {tab === 'abnormal_stats' && <AbnormalStats />}

      {tab === 'ranking' && (
        <div>
          {leaderboard.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>本月無搶單</div> :
            leaderboard.map((x, i) => (
              <div key={x.name} className="card" style={{ padding: 14, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.'} {x.name}</span>
                <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>{x.count} 單</span>
              </div>
            ))}
        </div>
      )}

      {tab === 'notices' && <NoticesMgmt />}
      {tab === 'notices_OLD' && (
        <div>
          <button className="btn-outline" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowForm(!showForm)}><Plus size={14} /> 新增公告</button>
          {showForm && <div className="card" style={{ marginBottom: 16, padding: 16 }}><textarea placeholder="公告內容" rows={3} value={newNotice} onChange={e => setNewNotice(e.target.value)} style={{ marginBottom: 10, resize: 'none' }} /><button className="btn-gold" onClick={publish}>發布</button></div>}
          {notices.map(n => (
            <div key={n.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, flex: 1 }}>{n.content}</span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button className={n.enabled ? 'btn-red' : 'btn-outline'} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => toggleNotice(n.id, !n.enabled)}>{n.enabled ? '停用' : '啟用'}</button>
                  <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }} onClick={() => deleteNotice(n.id)}>刪</button>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>{n.publisher} · {n.created_at?.slice(0, 16)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
