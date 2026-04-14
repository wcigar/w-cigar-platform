import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { format, startOfWeek, addWeeks, endOfWeek } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function StaffMeeting() {
  const { user } = useAuth()
  const [weekOffset, setWeekOffset] = useState(-1)
  const [review, setReview] = useState('')
  const [issues, setIssues] = useState('')
  const [suggestions, setSuggestions] = useState('')
  const [nextGoals, setNextGoals] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submittedAt, setSubmittedAt] = useState(null)
  const [bossComment, setBossComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Action items
  const [actionItems, setActionItems] = useState([])
  const [claimTitle, setClaimTitle] = useState('')
  const [assignTask, setAssignTask] = useState({ title: '', assigned_to: '' })
  const STAFF = ['RICKY', 'DANIEL', 'JESSICA']

  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 })
  const weekKey = format(weekStart, 'yyyy-MM-dd')
  const weekLabel = format(weekStart, 'M/d', { locale: zhTW })
  const weekEndLabel = format(new Date(weekStart.getTime() + 6 * 86400000), 'M/d', { locale: zhTW })

  useEffect(() => { loadNote() }, [weekOffset])

  async function loadNote() {
    setLoading(true)
    const { data } = await supabase.from('weekly_meeting_notes')
      .select('*').eq('week', weekKey).eq('employee_id', user.employee_id).maybeSingle()
    if (data) {
      setReview(data.review || '')
      setIssues(data.issues || '')
      setSuggestions(data.suggestions || '')
      setNextGoals(data.next_goals || '')
      setSubmitted(!!data.submitted_at)
      setSubmittedAt(data.submitted_at)
      setBossComment(data.boss_comment || '')
    } else {
      setReview(''); setIssues(''); setSuggestions(''); setNextGoals('')
      setSubmitted(false); setSubmittedAt(null); setBossComment('')
    }
    // Load action items for this week
    const { data: aiData } = await supabase.from('meeting_action_items').select('*').eq('week', weekKey).order('created_at')
    setActionItems(aiData || [])
    setLoading(false)
  }

  async function claimTask() {
    if (!claimTitle.trim()) return
    await supabase.from('meeting_action_items').insert({
      week: weekKey, title: claimTitle.trim(), assigned_to: user.employee_id,
      assigned_to_name: user.name, assigned_by: user.employee_id,
      assigned_by_name: user.name, priority: 'normal', status: 'pending'
    })
    setClaimTitle('')
    loadNote()
  }

  async function assignToColleague() {
    if (!assignTask.title.trim() || !assignTask.assigned_to) return alert('請填寫任務並選擇同事')
    await supabase.from('meeting_action_items').insert({
      week: weekKey, title: assignTask.title.trim(), assigned_to: assignTask.assigned_to,
      assigned_to_name: assignTask.assigned_to, assigned_by: user.employee_id,
      assigned_by_name: user.name, priority: 'normal', status: 'pending'
    })
    setAssignTask({ title: '', assigned_to: '' })
    loadNote()
  }

  async function saveDraft() {
    setSaving(true)
    await supabase.from('weekly_meeting_notes').upsert({
      week: weekKey, employee_id: user.employee_id, employee_name: user.name,
      review, issues, suggestions, next_goals: nextGoals, updated_at: new Date().toISOString()
    }, { onConflict: 'week,employee_id' })
    setSaving(false)
    alert('草稿已暫存')
  }

  async function submit() {
    if (!review.trim()) return alert('請填寫工作回顧')
    setSaving(true)
    const now = new Date().toISOString()
    await supabase.from('weekly_meeting_notes').upsert({
      week: weekKey, employee_id: user.employee_id, employee_name: user.name,
      review, issues, suggestions, next_goals: nextGoals, submitted_at: now, updated_at: now
    }, { onConflict: 'week,employee_id' })
    setSubmitted(true)
    setSubmittedAt(now)
    setSaving(false)
    alert('已提交！提交後無法修改')
  }

  const fields = [
    { label: '工作回顧', hint: '本週完成了哪些工作？', value: review, set: setReview },
    { label: '遇到的問題', hint: '有什麼困難或需要協助的？', value: issues, set: setIssues },
    { label: '建議 / 想法', hint: '對店務流程、產品、服務的建議', value: suggestions, set: setSuggestions },
    { label: '下週目標', hint: '下週打算完成什麼？', value: nextGoals, set: setNextGoals },
  ]

  return (
    <div className="page-container fade-in">
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold)', fontWeight: 600, marginBottom: 4 }}>週會準備</h2>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--black-card)', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>{weekLabel} — {weekEndLabel}</span>
        <button onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--black-card)', color: weekOffset >= 0 ? 'var(--text-muted)' : 'var(--text)', cursor: weekOffset >= 0 ? 'default' : 'pointer', fontSize: 13 }}>›</button>
        <button onClick={() => setWeekOffset(-1)} style={{ fontSize: 11, color: weekOffset === -1 ? '#000' : 'var(--gold)', background: weekOffset === -1 ? 'var(--gold)' : 'none', border: '1px solid var(--border-gold)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: weekOffset === -1 ? 700 : 400 }}>上週</button>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>載入中…</div> : (
        <>
          {submitted && (
            <div style={{ background: 'rgba(77,168,108,.08)', border: '1px solid rgba(77,168,108,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>
              已提交 ({new Date(submittedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })})
            </div>
          )}

          {bossComment && (
            <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(201,168,76,.3)', background: 'rgba(201,168,76,.04)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>老闆批註</div>
              <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{bossComment}</div>
            </div>
          )}

          {fields.map(f => (
            <div key={f.label} className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{f.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{f.hint}</div>
              <textarea
                value={f.value} onChange={e => f.set(e.target.value)} disabled={submitted}
                rows={4} placeholder={submitted ? '' : '請填寫…'}
                style={{ width: '100%', background: submitted ? 'transparent' : 'var(--black)', border: submitted ? 'none' : '1px solid var(--border)', borderRadius: 8, padding: 10, color: 'var(--text)', fontSize: 13, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>
          ))}

          {!submitted && (
            <div style={{ display: 'flex', gap: 10, marginTop: 8, marginBottom: 20 }}>
              <button onClick={saveDraft} disabled={saving} className="btn-outline" style={{ flex: 1, padding: 14, fontSize: 14 }}>
                {saving ? '儲存中…' : '暫存草稿'}
              </button>
              <button onClick={submit} disabled={saving} className="btn-gold" style={{ flex: 1, padding: 14, fontSize: 14, fontWeight: 700 }}>
                {saving ? '提交中…' : '提交'}
              </button>
            </div>
          )}

          {/* Action items section */}
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📋</span><span>會議任務</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{actionItems.length} 項</span>
            </div>

            {/* Task list */}
            {actionItems.length > 0 ? actionItems.map(item => {
              const done = item.status === 'completed'
              const isMe = item.assigned_to === user.employee_id
              const priorityColor = item.priority === 'high' ? 'var(--red)' : item.priority === 'urgent' ? '#f59e0b' : 'var(--text-muted)'
              return (
                <div key={item.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: done ? 'var(--text-muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none', fontWeight: isMe ? 600 : 400 }}>{item.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      <span style={{ color: isMe ? 'var(--green)' : 'var(--gold)' }}>{item.assigned_to_name}{isMe ? ' (我)' : ''}</span>
                      {item.due_date && <span style={{ marginLeft: 8 }}>截止 {item.due_date}</span>}
                      {item.priority !== 'normal' && <span style={{ marginLeft: 8, color: priorityColor, fontWeight: 600 }}>{item.priority === 'high' ? '高' : '緊急'}</span>}
                      {item.assigned_by_name && item.assigned_by !== item.assigned_to && <span style={{ marginLeft: 8 }}>by {item.assigned_by_name}</span>}
                      {item.progress_note && <span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>💬 {item.progress_note}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600, flexShrink: 0, background: done ? 'rgba(77,168,108,.1)' : item.status === 'in_progress' ? 'rgba(77,140,196,.15)' : 'rgba(201,168,76,.1)', color: done ? 'var(--green)' : item.status === 'in_progress' ? 'var(--blue)' : 'var(--gold)' }}>
                    {done ? '完成' : item.status === 'in_progress' ? '進行中' : '待執行'}
                  </span>
                </div>
              )
            }) : <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>尚無任務</div>}

            {/* Claim task */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', marginBottom: 6 }}>🙋 我認領任務</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={claimTitle} onChange={e => setClaimTitle(e.target.value)} placeholder="我要做的事…" style={{ flex: 1, fontSize: 12, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--black)', color: 'var(--text)' }} />
                <button onClick={claimTask} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(201,168,76,.1)', color: 'var(--gold)', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}>＋ 認領</button>
              </div>
            </div>

            {/* Assign to colleague */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', marginBottom: 6 }}>📤 分派給同事</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={assignTask.title} onChange={e => setAssignTask(p => ({ ...p, title: e.target.value }))} placeholder="任務描述…" style={{ flex: 1, fontSize: 12, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--black)', color: 'var(--text)' }} />
                <select value={assignTask.assigned_to} onChange={e => setAssignTask(p => ({ ...p, assigned_to: e.target.value }))} style={{ width: 90, fontSize: 12, padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--black)', color: 'var(--text)' }}>
                  <option value="">同事</option>
                  {STAFF.filter(s => s !== user.employee_id).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={assignToColleague} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(201,168,76,.1)', color: 'var(--gold)', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}>＋ 分派</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
