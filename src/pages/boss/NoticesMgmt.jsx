import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getReadStatus } from '../../lib/noticeUtils'
import { Plus, Eye, EyeOff, Users, Check } from 'lucide-react'

export default function NoticesMgmt() {
  const [notices, setNotices] = useState([])
  const [emps, setEmps] = useState([])
  const [readMap, setReadMap] = useState({})
  const [newNotice, setNewNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [nR, eR] = await Promise.all([
      supabase.from('notices').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('employees').select('*').eq('is_active', true),
    ])
    const noticeData = nR.data || []
    const empData = (eR.data || []).filter(e => !e.is_admin && e.employee_id !== 'ADMIN')
    setNotices(noticeData)
    setEmps(empData)
    if (noticeData.length) {
      const rm = await getReadStatus(noticeData.map(n => n.id))
      setReadMap(rm)
    }
    setLoading(false)
  }

  async function publish() {
    if (!newNotice) return
    await supabase.from('notices').insert({ content: newNotice, enabled: true, publisher: 'ADMIN' })
    setNewNotice(''); setShowForm(false); load()
  }

  async function toggleNotice(id, en) {
    await supabase.from('notices').update({ enabled: en }).eq('id', id); load()
  }

  async function deleteNotice(id) {
    if (!confirm('刪除？')) return
    await supabase.from('notices').delete().eq('id', id); load()
  }

  if (loading) return <div>{[1,2].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8 }} />)}</div>

  return (
    <div>
      <button className="btn-outline" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowForm(!showForm)}>
        <Plus size={14} /> 新增公告
      </button>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <textarea placeholder="公告內容" rows={3} value={newNotice} onChange={e => setNewNotice(e.target.value)} style={{ marginBottom: 10, resize: 'none' }} />
          <button className="btn-gold" onClick={publish}>發布</button>
        </div>
      )}

      {notices.map(n => {
        const readers = readMap[n.id] || []
        const readIds = new Set(readers.map(r => r.employee_id))
        const unread = emps.filter(e => !readIds.has(e.employee_id))
        const readCount = readers.length
        const totalStaff = emps.length
        const allRead = totalStaff > 0 && readCount >= totalStaff
        const expanded = expandedId === n.id

        return (
          <div key={n.id} className="card" style={{ padding: 14, marginBottom: 8, borderColor: !n.enabled ? 'var(--border)' : allRead ? 'rgba(77,168,108,.3)' : 'rgba(245,158,11,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14, flex: 1, color: n.enabled ? 'var(--text)' : 'var(--text-muted)' }}>{n.content}</span>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className={n.enabled ? 'btn-red' : 'btn-outline'} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => toggleNotice(n.id, !n.enabled)}>
                  {n.enabled ? '停用' : '啟用'}
                </button>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }} onClick={() => deleteNotice(n.id)}>刪</button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{n.publisher} · {n.created_at?.slice(0, 16)}</div>

              <div onClick={() => setExpandedId(expanded ? null : n.id)} style={{
                display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '3px 8px', borderRadius: 10,
                background: allRead ? 'rgba(77,168,108,.1)' : readCount > 0 ? 'rgba(245,158,11,.1)' : 'rgba(196,77,77,.1)',
                fontSize: 11, fontWeight: 700,
                color: allRead ? 'var(--green)' : readCount > 0 ? '#f59e0b' : 'var(--red)',
              }}>
                {allRead ? <Check size={11} /> : <Eye size={11} />}
                {readCount}/{totalStaff} 已讀
              </div>
            </div>

            {expanded && (
              <div style={{ marginTop: 10, padding: 10, background: 'var(--black)', borderRadius: 8 }}>
                {readers.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, marginBottom: 4 }}>✅ 已讀</div>
                    {readers.map(r => (
                      <div key={r.employee_id} style={{ fontSize: 11, color: 'var(--text-dim)', padding: '2px 0', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{r.name || r.employee_id}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.read_at?.slice(5, 16)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {unread.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700, marginBottom: 4 }}>❌ 未讀</div>
                    {unread.map(e => (
                      <div key={e.employee_id} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 0' }}>{e.name}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
