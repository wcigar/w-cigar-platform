import ShiftHandover from '../../components/ShiftHandover'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { compressImage } from '../../lib/imageUtils'
import { CheckCircle2, Circle, Camera, Send, RotateCcw, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { format } from 'date-fns'

export default function StaffSOP() {
  const [mode, setMode] = useState('sop')
  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button onClick={() => setMode('sop')} style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: mode === 'sop' ? 'var(--gold-glow)' : 'transparent', color: mode === 'sop' ? 'var(--gold)' : 'var(--text-dim)', border: mode === 'sop' ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>每日 SOP</button>
        <button onClick={() => setMode('clean')} style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: mode === 'clean' ? 'var(--gold-glow)' : 'transparent', color: mode === 'clean' ? 'var(--gold)' : 'var(--text-dim)', border: mode === 'clean' ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}><Sparkles size={12} style={{ marginRight: 4 }} />大掃除</button>
        <button onClick={() => setMode('handover')} style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: mode === 'handover' ? 'var(--gold-glow)' : 'transparent', color: mode === 'handover' ? 'var(--gold)' : 'var(--text-dim)', border: mode === 'handover' ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>交班</button>
      </div>
      {mode === 'sop' ? <SOPView /> : mode === 'clean' ? <CleanView /> : <ShiftHandover />}
    </div>
  )
}

function SOPView() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [defs, setDefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [checked, setChecked] = useState({})
  const [photos, setPhotos] = useState({})
  const [previews, setPreviews] = useState({})
  const [notes, setNotes] = useState({})
  const [humData, setHumData] = useState({})
  const [expanded, setExpanded] = useState({})
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [tRes, dRes] = await Promise.all([
      supabase.from('task_status').select('*').eq('date', today).or(`owner.eq.${user.employee_id},owner.eq.ALL`).order('task_id'),
      supabase.from('sop_definitions').select('*').or(`owner.eq.${user.employee_id},owner.eq.ALL`).order('task_id'),
    ])
    setTasks(tRes.data || []); setDefs(dRes.data || [])
    setChecked({}); setPhotos({}); setPreviews({}); setNotes({})
    setLoading(false)
  }

  function getDef(taskId) { return defs.find(d => d.task_id === taskId) || {} }

  async function handlePhoto(taskId, file) {
    if (!file) { setPhotos(p => ({ ...p, [taskId]: null })); setPreviews(p => ({ ...p, [taskId]: null })); return }
    const compressed = await compressImage(file)
    setPhotos(p => ({ ...p, [taskId]: compressed }))
    const reader = new FileReader()
    reader.onload = e => setPreviews(p => ({ ...p, [taskId]: e.target.result }))
    reader.readAsDataURL(compressed)
  }

  async function handleSubmit() {
    const checkedIds = Object.keys(checked).filter(id => checked[id])
    if (!checkedIds.length) return alert('請先勾選要送出的任務')
    for (const taskId of checkedIds) {
      const def = getDef(taskId), task = tasks.find(t => t.task_id === taskId)
      if (def.need_photo && !photos[taskId] && !task?.photo_url) return alert(`「${def.title || taskId}」需要拍照`)
      if (def.need_input && taskId === 'r_hum') {
        const h = humData[taskId] || {}
        if (!h.ht || !h.hr || !h.ct || !h.cr) return alert('溫濕度欄位皆須填寫')
      }
    }
    setSubmitting(true)
    let success = 0
    for (const taskId of checkedIds) {
      const task = tasks.find(t => t.task_id === taskId)
      if (!task) continue
      if (task.owner === 'ALL' && task.completed && task.completed_by && task.completed_by !== user.name) continue
      let photoUrl = task.photo_url || ''
      if (photos[taskId]) {
        const ext = 'jpg'
        const path = `${today}/${user.employee_id}/${taskId}_${Date.now()}.${ext}`
        await supabase.storage.from('photos').upload(path, photos[taskId])
        const { data } = supabase.storage.from('photos').getPublicUrl(path)
        photoUrl = data.publicUrl
      }
      const h = humData[taskId] || {}
      await supabase.from('task_status').update({
        completed: true, completed_at: new Date().toISOString(), completed_by: user.name, completed_by_id: user.employee_id,
        photo_url: photoUrl, humidor_temp: h.ht || '', humidor_rh: h.hr || '', cabinet_temp: h.ct || '', cabinet_rh: h.cr || '', note: notes[taskId] || '',
      }).eq('id', task.id)
      success++
    }
    setSubmitting(false)
    alert(`成功送出 ${success} 項任務`)
    load()
  }

  async function recallTask(task) {
    if (!confirm('確定撤回？')) return
    if (task.completed_by !== user.name) return alert('只能撤回自己的')
    await supabase.from('task_status').update({ completed: false, completed_at: null, completed_by: '', completed_by_id: '', photo_url: '' }).eq('id', task.id)
    load()
  }

  const myTasks = tasks.filter(t => t.owner === user.employee_id)
  const grabTasks = tasks.filter(t => t.owner === 'ALL')
  const myDone = myTasks.filter(t => t.completed).length
  const pct = myTasks.length ? Math.round((myDone / myTasks.length) * 100) : 0
  const cats = {}
  myTasks.forEach(t => { const c = t.category || '其他'; if (!cats[c]) cats[c] = []; cats[c].push(t) })

  if (loading) return <div>{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 70, marginBottom: 8 }} />)}</div>

  return (
    <div>
      <div className="card" style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 48, fontFamily: 'var(--font-mono)', color: pct === 100 ? 'var(--green)' : 'var(--gold)', fontWeight: 600, lineHeight: 1 }}>{pct}%</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>{myDone} / {myTasks.length} 完成</div>
        <div style={{ height: 6, background: 'var(--black)', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}><div style={{ height: '100%', width: pct + '%', background: pct === 100 ? 'var(--green)' : 'linear-gradient(90deg,var(--gold-dim),var(--gold))', borderRadius: 3, transition: 'width .5s' }} /></div>
      </div>

      {Object.entries(cats).map(([cat, items]) => (
        <div key={cat}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', padding: '10px 0 6px', borderBottom: '1px solid var(--border)', letterSpacing: 1 }}>{cat}</div>
          {items.map(t => <TaskCard key={t.id} task={t} def={getDef(t.task_id)} user={user}
            checked={checked[t.task_id]} onCheck={v => setChecked(p => ({ ...p, [t.task_id]: v }))}
            photo={photos[t.task_id]} preview={previews[t.task_id]} onPhoto={f => handlePhoto(t.task_id, f)}
            note={notes[t.task_id] || ''} onNote={v => setNotes(p => ({ ...p, [t.task_id]: v }))}
            humData={humData[t.task_id] || {}} onHumData={v => setHumData(p => ({ ...p, [t.task_id]: v }))}
            expanded={expanded[t.task_id]} onExpand={() => setExpanded(p => ({ ...p, [t.task_id]: !p[t.task_id] }))}
            onRecall={() => recallTask(t)} />)}
        </div>
      ))}

      {grabTasks.length > 0 && (<>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', marginTop: 20, marginBottom: 8 }}>🏆 搶單任務 ({grabTasks.filter(t => t.completed).length}/{grabTasks.length})</div>
        {grabTasks.map(t => <TaskCard key={t.id} task={t} def={getDef(t.task_id)} user={user} isGrab
          checked={checked[t.task_id]} onCheck={v => setChecked(p => ({ ...p, [t.task_id]: v }))}
          photo={photos[t.task_id]} preview={previews[t.task_id]} onPhoto={f => handlePhoto(t.task_id, f)}
          note={notes[t.task_id] || ''} onNote={v => setNotes(p => ({ ...p, [t.task_id]: v }))}
          humData={humData[t.task_id] || {}} onHumData={v => setHumData(p => ({ ...p, [t.task_id]: v }))}
          expanded={expanded[t.task_id]} onExpand={() => setExpanded(p => ({ ...p, [t.task_id]: !p[t.task_id] }))}
          onRecall={() => recallTask(t)} />)}
      </>)}

      <button className="btn-gold" style={{ width: '100%', fontSize: 18, marginTop: 20, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? .6 : 1 }} onClick={handleSubmit} disabled={submitting}>
        <Send size={18} /> {submitting ? '上傳中...' : '批次送出已勾選任務'}
      </button>
      {tasks.length === 0 && <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', marginTop: 20 }}>今日尚無 SOP 任務</div>}
    </div>
  )
}

function TaskCard({ task: t, def, user, isGrab, checked, onCheck, photo, preview, onPhoto, note, onNote, humData, onHumData, expanded, onExpand, onRecall }) {
  const fileRef = useRef(null)
  const grabbedByOther = isGrab && t.completed && t.completed_by && t.completed_by !== user.name
  const canEdit = !t.completed && !grabbedByOther
  const needPhoto = def?.need_photo
  const isHum = t.task_id === 'r_hum'
  const cardOpacity = t.completed ? 0.7 : 1

  return (
    <div className="card" style={{ padding: 0, marginBottom: 6, overflow: 'hidden', borderColor: checked ? 'var(--border-gold)' : t.completed ? 'rgba(77,168,108,.2)' : undefined, background: checked ? 'rgba(201,168,76,.04)' : undefined, opacity: cardOpacity }}>
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={onExpand}>
        {canEdit ? <input type="checkbox" checked={!!checked} onChange={e => { e.stopPropagation(); onCheck(e.target.checked) }} style={{ width: 24, height: 24, accentColor: '#c9a84c', flexShrink: 0 }} onClick={e => e.stopPropagation()} />
          : t.completed ? <CheckCircle2 size={22} color="var(--green)" style={{ flexShrink: 0 }} /> : <Circle size={22} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: t.completed ? 'var(--text-dim)' : 'var(--text)', textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
            {isGrab && <span style={{ color: 'var(--green)', fontWeight: 600 }}>搶單</span>}
            {needPhoto && !t.completed && <span style={{ color: 'var(--red)' }}>📷需拍照</span>}
            {(def?.weight || 1) > 1 && <span>權重{def.weight}</span>}
            {t.completed && t.completed_by && <span style={{ color: 'var(--green)' }}>✓{t.completed_by} {t.completed_at ? format(new Date(t.completed_at), 'HH:mm') : ''}</span>}
            {grabbedByOther && <span style={{ color: 'var(--red)' }}>已被{t.completed_by}搶走</span>}
          </div>
        </div>
        <div style={{ flexShrink: 0, display: 'flex', gap: 4, alignItems: 'center' }}>
          {t.completed && t.completed_by === user.name && <button className="btn-outline" style={{ padding: '4px 8px', fontSize: 11, color: 'var(--red)', borderColor: 'rgba(196,77,77,.3)' }} onClick={e => { e.stopPropagation(); onRecall() }}><RotateCcw size={12} /></button>}
          {canEdit && (expanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />)}
        </div>
      </div>

      {t.completed && t.photo_url && (
        <div style={{ padding: '0 14px 12px' }}>
          <img src={t.photo_url} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => window.open(t.photo_url, '_blank')} />
          {t.note && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>備註：{t.note}</div>}
          {t.humidor_temp && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>🌡️ 雪茄房 {t.humidor_temp}°C/{t.humidor_rh}% · 雪茄櫃 {t.cabinet_temp}°C/{t.cabinet_rh}%</div>}
        </div>
      )}

      {expanded && canEdit && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
          {needPhoto && (
            <div style={{ marginTop: 8 }}>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => onPhoto(e.target.files?.[0] || null)} />
              <button className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', width: '100%', justifyContent: 'center', background: photo ? 'rgba(77,168,108,.08)' : undefined, borderColor: photo ? 'rgba(77,168,108,.3)' : undefined, color: photo ? 'var(--green)' : undefined }} onClick={() => fileRef.current?.click()}>
                <Camera size={16} /> {photo ? `已選擇 (${Math.round(photo.size / 1024)}KB)` : '拍照 / 選擇照片'}
              </button>
              {preview && <img src={preview} alt="預覽" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 10, marginTop: 8, border: '1px solid var(--border-gold)' }} />}
            </div>
          )}
          {def?.need_input && isHum && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input placeholder="雪茄房溫度" value={humData.ht || ''} onChange={e => onHumData({ ...humData, ht: e.target.value })} inputMode="decimal" style={{ fontSize: 13, padding: 10 }} />
              <input placeholder="雪茄房濕度" value={humData.hr || ''} onChange={e => onHumData({ ...humData, hr: e.target.value })} inputMode="decimal" style={{ fontSize: 13, padding: 10 }} />
              <input placeholder="雪茄櫃溫度" value={humData.ct || ''} onChange={e => onHumData({ ...humData, ct: e.target.value })} inputMode="decimal" style={{ fontSize: 13, padding: 10 }} />
              <input placeholder="雪茄櫃濕度" value={humData.cr || ''} onChange={e => onHumData({ ...humData, cr: e.target.value })} inputMode="decimal" style={{ fontSize: 13, padding: 10 }} />
            </div>
          )}
          <input placeholder="備註（選填）" value={note} onChange={e => onNote(e.target.value)} style={{ marginTop: 8, fontSize: 13, padding: 10 }} />
        </div>
      )}
    </div>
  )
}

// ===== 大掃除子視圖 =====
function CleanView() {
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
    const { data } = await supabase.from('cleaning_status').select('*').eq('date', today).eq('owner', user.employee_id).order('clean_id')
    setTasks(data || []); setChecked({}); setPhotos({}); setNotes({}); setLoading(false)
  }

  async function handleSubmit() {
    const ids = Object.keys(checked).filter(id => checked[id])
    if (!ids.length) return alert('請先勾選')
    for (const cid of ids) {
      const t = tasks.find(x => x.clean_id === cid)
      if (!photos[cid] && !t?.photo_url) return alert(`「${t?.title}」必須拍照`)
    }
    setSubmitting(true)
    for (const cid of ids) {
      const t = tasks.find(x => x.clean_id === cid)
      if (!t) continue
      let photoUrl = t.photo_url || ''
      if (photos[cid]) {
        const compressed = await compressImage(photos[cid])
        const path = `cleaning/${today}/${user.employee_id}/${cid}_${Date.now()}.jpg`
        await supabase.storage.from('photos').upload(path, compressed)
        const { data } = supabase.storage.from('photos').getPublicUrl(path)
        photoUrl = data.publicUrl
      }
      await supabase.from('cleaning_status').update({ completed: true, completed_at: new Date().toISOString(), completed_by: user.name, photo_url: photoUrl, note: notes[cid] || '' }).eq('id', t.id)
    }
    setSubmitting(false); alert('送出成功！'); load()
  }

  const done = tasks.filter(t => t.completed).length
  const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0

  if (loading) return <div>{[1, 2].map(i => <div key={i} className="loading-shimmer" style={{ height: 70, marginBottom: 8 }} />)}</div>

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 36, fontFamily: 'var(--font-mono)', color: pct === 100 ? 'var(--green)' : 'var(--gold)', fontWeight: 600 }}>{pct}%</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{done}/{tasks.length} 完成</div>
      </div>
      {tasks.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>今日無大掃除任務</div> :
        tasks.map(t => {
          const fileRef = { current: null }
          return (
            <div key={t.id} className="card" style={{ padding: 14, marginBottom: 8, opacity: t.completed ? .7 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: t.completed ? 0 : 10 }}>
                {!t.completed ? <input type="checkbox" checked={!!checked[t.clean_id]} onChange={e => setChecked(p => ({ ...p, [t.clean_id]: e.target.checked }))} style={{ width: 24, height: 24, accentColor: '#c9a84c' }} /> : <CheckCircle2 size={22} color="var(--green)" />}
                <div><div style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.area} {t.completed_by && `· ✓${t.completed_by}`}</div></div>
              </div>
              {t.photo_url && <img src={t.photo_url} alt="" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8, marginTop: 6, border: '1px solid var(--border)' }} onClick={() => window.open(t.photo_url)} />}
              {!t.completed && <>
                <input ref={el => fileRef.current = el} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => setPhotos(p => ({ ...p, [t.clean_id]: e.target.files?.[0] }))} />
                <button className="btn-outline" style={{ width: '100%', fontSize: 12, padding: 8, marginBottom: 6 }} onClick={() => fileRef.current?.click()}><Camera size={14} /> {photos[t.clean_id] ? '已選擇' : '拍照（必須）'}</button>
                <input placeholder="備註" value={notes[t.clean_id] || ''} onChange={e => setNotes(p => ({ ...p, [t.clean_id]: e.target.value }))} style={{ fontSize: 12, padding: 8 }} />
              </>}
            </div>
          )
        })}
      {tasks.length > 0 && <button className="btn-gold" style={{ width: '100%', fontSize: 16, marginTop: 12, padding: 14, opacity: submitting ? .6 : 1 }} onClick={handleSubmit} disabled={submitting}><Send size={16} /> {submitting ? '上傳中...' : '送出大掃除'}</button>}
    </div>
  )
}
