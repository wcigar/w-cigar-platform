import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { CheckCircle2, Circle, Camera, Send, Sparkles } from 'lucide-react'
import { format } from 'date-fns'

export default function StaffCleaning() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [photos, setPhotos] = useState({})
  const [notes, setNotes] = useState({})
  const [checked, setChecked] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('cleaning_status').select('*')
      .eq('date', today).eq('owner', user.employee_id).order('clean_id')
    setTasks(data || [])
    setChecked({}); setPhotos({}); setNotes({})
    setLoading(false)
  }

  async function handleSubmit() {
    const ids = Object.keys(checked).filter(id => checked[id])
    if (!ids.length) return alert('請先勾選要送出的項目')

    for (const cid of ids) {
      const task = tasks.find(t => t.clean_id === cid)
      if (!photos[cid] && !task?.photo_url) return alert(`「${task?.title || cid}」必須拍照`)
    }

    setSubmitting(true)
    let success = 0

    for (const cid of ids) {
      const task = tasks.find(t => t.clean_id === cid)
      if (!task) continue

      let photoUrl = task.photo_url || ''
      if (photos[cid]) {
        const ext = photos[cid].name.split('.').pop() || 'jpg'
        const path = `cleaning/${today}/${user.employee_id}/${cid}_${Date.now()}.${ext}`
        const { error } = await supabase.storage.from('photos').upload(path, photos[cid])
        if (!error) {
          const { data } = supabase.storage.from('photos').getPublicUrl(path)
          photoUrl = data.publicUrl
        }
      }

      await supabase.from('cleaning_status').update({
        completed: true, completed_at: new Date().toISOString(), completed_by: user.name,
        photo_url: photoUrl, note: notes[cid] || ''
      }).eq('id', task.id)
      success++
    }

    setSubmitting(false)
    alert(`成功送出 ${success} 項大掃除！`)
    load()
  }

  const done = tasks.filter(t => t.completed).length
  const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0

  if (loading) return <div className="page-container">{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 70, marginBottom: 8 }} />)}</div>

  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Sparkles size={20} color="var(--gold)" />
        <span className="section-title" style={{ marginBottom: 0 }}>月底大掃除</span>
      </div>

      {/* Progress */}
      <div className="card" style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 48, fontFamily: 'var(--font-mono)', color: pct === 100 ? 'var(--green)' : 'var(--gold)', fontWeight: 600, lineHeight: 1 }}>{pct}%</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>{done} / {tasks.length} 完成</div>
        <div style={{ height: 6, background: 'var(--black)', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: pct + '%', background: pct === 100 ? 'var(--green)' : 'linear-gradient(90deg,var(--gold-dim),var(--gold))', borderRadius: 3, transition: 'width .5s' }} />
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>今日無大掃除任務</div>
      ) : (
        tasks.map(t => <CleanCard key={t.id} task={t} user={user}
          checked={checked[t.clean_id]} onCheck={v => setChecked(p => ({ ...p, [t.clean_id]: v }))}
          photo={photos[t.clean_id]} onPhoto={f => setPhotos(p => ({ ...p, [t.clean_id]: f }))}
          note={notes[t.clean_id] || ''} onNote={v => setNotes(p => ({ ...p, [t.clean_id]: v }))}
        />)
      )}

      {tasks.length > 0 && (
        <button className="btn-gold" style={{ width: '100%', fontSize: 18, marginTop: 16, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? .6 : 1 }}
          onClick={handleSubmit} disabled={submitting}>
          <Send size={18} /> {submitting ? '上傳中...' : '批次送出大掃除'}
        </button>
      )}
    </div>
  )
}

function CleanCard({ task: t, user, checked, onCheck, photo, onPhoto, note, onNote }) {
  const fileRef = useRef(null)
  const canEdit = !t.completed

  return (
    <div className="card" style={{ padding: 14, marginBottom: 8, borderColor: checked ? 'var(--border-gold)' : t.completed ? 'rgba(77,168,108,.2)' : undefined, opacity: t.completed ? .65 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: canEdit ? 10 : 0 }}>
        {canEdit ? (
          <input type="checkbox" checked={!!checked} onChange={e => onCheck(e.target.checked)} style={{ width: 24, height: 24, accentColor: '#c9a84c', flexShrink: 0 }} />
        ) : <CheckCircle2 size={22} color="var(--green)" style={{ flexShrink: 0 }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: t.completed ? 'var(--text-dim)' : 'var(--text)' }}>{t.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {t.area && <span>📍{t.area}</span>}
            {t.completed && t.completed_by && <span style={{ marginLeft: 8, color: 'var(--green)' }}>✓ {t.completed_by}</span>}
          </div>
        </div>
        {photo && <span style={{ fontSize: 10, color: 'var(--green)' }}>📷已選</span>}
      </div>

      {canEdit && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => onPhoto(e.target.files?.[0])} />
          <button className="btn-outline" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, padding: '8px', marginBottom: 8, background: photo ? 'rgba(77,168,108,.08)' : undefined, borderColor: photo ? 'rgba(77,168,108,.3)' : undefined, color: photo ? 'var(--green)' : undefined }}
            onClick={() => fileRef.current?.click()}>
            <Camera size={14} /> {photo ? photo.name.slice(0, 25) : '拍照（必須）'}
          </button>
          <input placeholder="備註（選填）" value={note} onChange={e => onNote(e.target.value)} style={{ fontSize: 13, padding: 8 }} />
        </div>
      )}

      {t.photo_url && <a href={t.photo_url} target="_blank" style={{ fontSize: 11, color: 'var(--blue)', display: 'block', marginTop: 4 }}>查看照片</a>}
    </div>
  )
}
