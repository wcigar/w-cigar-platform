import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { format, startOfWeek, addWeeks } from 'date-fns'
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
    setLoading(false)
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
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={saveDraft} disabled={saving} className="btn-outline" style={{ flex: 1, padding: 14, fontSize: 14 }}>
                {saving ? '儲存中…' : '暫存草稿'}
              </button>
              <button onClick={submit} disabled={saving} className="btn-gold" style={{ flex: 1, padding: 14, fontSize: 14, fontWeight: 700 }}>
                {saving ? '提交中…' : '提交'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
