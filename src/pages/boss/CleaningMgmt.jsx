import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { CheckCircle2, Circle, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, subDays, addDays } from 'date-fns'

export default function CleaningMgmt() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [tasks, setTasks] = useState([])
  const [photoModal, setPhotoModal] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [date])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('cleaning_status').select('*').eq('date', date).order('owner').order('clean_id')
    setTasks(data || [])
    setLoading(false)
  }

  async function auditTask(id, result) {
    if (result === '不合格') {
      await supabase.from('cleaning_status').update({ audit_status: '不合格', completed: false, completed_at: null }).eq('id', id)
    } else {
      await supabase.from('cleaning_status').update({ audit_status: '合格' }).eq('id', id)
    }
    load()
  }

  const done = tasks.filter(t => t.completed).length
  const total = tasks.length
  const pct = total ? Math.round(done / total * 100) : 0

  // Group by owner
  const byOwner = {}
  tasks.forEach(t => { const k = t.owner || '未指定'; if (!byOwner[k]) byOwner[k] = []; byOwner[k].push(t) })

  if (loading) return <div>{[1, 2].map(i => <div key={i} className="loading-shimmer" style={{ height: 80, marginBottom: 10 }} />)}</div>

  return (
    <div>
      {photoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPhotoModal(null)}>
          <div style={{ maxWidth: 600, width: '100%' }} onClick={e => e.stopPropagation()}>
            <img src={photoModal.url} alt="" style={{ width: '100%', borderRadius: 12, maxHeight: '80vh', objectFit: 'contain' }} />
            <div style={{ color: 'var(--text)', fontSize: 14, textAlign: 'center', marginTop: 10 }}>{photoModal.title} — {photoModal.by}</div>
            <button className="btn-outline" style={{ width: '100%', marginTop: 10 }} onClick={() => setPhotoModal(null)}>關閉</button>
          </div>
        </div>
      )}

      {/* Date nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button style={nb} onClick={() => setDate(format(subDays(new Date(date), 1), 'yyyy-MM-dd'))}><ChevronLeft size={18} /></button>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)' }}>{date}</span>
        <button style={nb} onClick={() => setDate(format(addDays(new Date(date), 1), 'yyyy-MM-dd'))}><ChevronRight size={18} /></button>
      </div>

      {/* Progress */}
      <div className="card" style={{ marginBottom: 14, textAlign: 'center', padding: 14 }}>
        <Sparkles size={18} color="var(--gold)" style={{ marginBottom: 4 }} />
        <div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', color: pct === 100 ? 'var(--green)' : 'var(--gold)', fontWeight: 600 }}>{pct}%</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{done}/{total} 完成</div>
        <div style={{ height: 5, background: 'var(--black)', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: pct + '%', background: pct === 100 ? 'var(--green)' : 'linear-gradient(90deg,var(--gold-dim),var(--gold))', borderRadius: 3 }} />
        </div>
      </div>

      {total === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>此日無大掃除任務</div> :
        Object.entries(byOwner).map(([owner, items]) => (
          <div key={owner} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>{owner}</div>
            {items.map(t => (
              <div key={t.id} className="card" style={{ padding: 12, marginBottom: 6, borderColor: t.completed ? 'rgba(77,168,108,.2)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: t.photo_url ? 8 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {t.completed ? <CheckCircle2 size={16} color="var(--green)" /> : <Circle size={16} color="var(--text-muted)" />}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {t.area && `📍${t.area}`}
                        {t.completed_by && <span style={{ color: 'var(--green)', marginLeft: 6 }}>✓ {t.completed_by} {t.completed_at?.slice(11, 16)}</span>}
                        {t.note && <span style={{ marginLeft: 6 }}>📝{t.note}</span>}
                      </div>
                    </div>
                  </div>
                  {t.completed && (
                    <div style={{ display: 'flex', gap: 2 }}>
                      {t.audit_status === '合格' ? <span className="badge badge-green" style={{ fontSize: 10 }}>合格</span> :
                        t.audit_status === '不合格' ? <span className="badge badge-red" style={{ fontSize: 10 }}>不合格</span> : (<>
                          <button style={{ background: 'rgba(77,168,108,.15)', color: 'var(--green)', border: 'none', borderRadius: 6, padding: '3px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }} onClick={() => auditTask(t.id, '合格')}>✓</button>
                          <button style={{ background: 'rgba(196,77,77,.15)', color: 'var(--red)', border: 'none', borderRadius: 6, padding: '3px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }} onClick={() => auditTask(t.id, '不合格')}>✗</button>
                        </>)}
                    </div>
                  )}
                </div>
                {t.photo_url && (
                  <img src={t.photo_url} alt="" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)' }}
                    onClick={() => setPhotoModal({ url: t.photo_url, title: t.title, by: t.completed_by })} />
                )}
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}

const nb = { background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
