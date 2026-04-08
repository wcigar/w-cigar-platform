import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Send, CheckCircle2, Plus, Trash2, ClipboardList } from 'lucide-react'
import { format } from 'date-fns'
import { zhTW } from 'date-fns/locale'

export default function ShiftHandover() {
  const { user } = useAuth()
  const [items, setItems] = useState([{ text: '', done: false }])
  const [records, setRecords] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('shift_handover')
      .select('*')
      .eq('date', today)
      .order('created_at', { ascending: false })
    setRecords(data || [])
  }

  function addItem() {
    setItems(prev => [...prev, { text: '', done: false }])
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx, text) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, text } : item))
  }

  async function submit() {
    const validItems = items.filter(i => i.text.trim())
    if (!validItems.length) return alert('請填寫至少一項交接事項')
    setSubmitting(true)
    const content = validItems.map(i => i.text.trim()).join('\n')
    await supabase.from('shift_handover').insert({
      date: today,
      employee_id: user.employee_id,
      employee_name: user.name,
      content,
      acknowledged: false
    })
    setItems([{ text: '', done: false }])
    setSubmitting(false)
    load()
  }

  async function acknowledge(id) {
    await supabase.from('shift_handover').update({ acknowledged: true, acknowledged_by: user.name }).eq('id', id)
    load()
  }

  return (
    <div style={{ padding: '0 0 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <ClipboardList size={18} color="var(--gold)" />
        <span style={{ fontWeight: 600, color: 'var(--gold)' }}>交班備忘錄</span>
      </div>

      {items.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: 13, minWidth: 20 }}>{idx + 1}.</span>
          <input
            placeholder="交接事項..."
            value={item.text}
            onChange={e => updateItem(idx, e.target.value)}
            style={{ flex: 1, fontSize: 14, padding: '10px 12px' }}
          />
          {items.length > 1 && (
            <button onClick={() => removeItem(idx)} style={{ background: 'transparent', color: 'var(--red)', padding: 6 }}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ))}

      <button onClick={addItem} style={{ background: 'transparent', color: 'var(--green)', border: '1px dashed rgba(77,168,108,.4)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', marginBottom: 12 }}>
        <Plus size={14} style={{ marginRight: 4 }} />新增事項
      </button>

      <input
        placeholder="確認事項（選填）"
        id="handover-note"
        style={{ width: '100%', fontSize: 14, padding: '10px 12px', marginBottom: 12 }}
      />

      <button
        onClick={submit}
        disabled={submitting}
        className="btn-gold"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <Send size={16} />
        {submitting ? '提交中...' : '送出交班備忘錄'}
      </button>

      {records.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>今日交班紀錄</div>
          {records.map(r => (
            <div key={r.id} style={{ background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{r.employee_name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {format(new Date(r.created_at), 'HH:mm')}
                </span>
              </div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-line', color: 'var(--text)', lineHeight: 1.6 }}>
                {r.content}
              </div>
              {r.acknowledged ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 12, color: 'var(--green)' }}>
                  <CheckCircle2 size={14} />已確認 ({r.acknowledged_by})
                </div>
              ) : (
                user.employee_id !== r.employee_id && (
                  <button onClick={() => acknowledge(r.id)} style={{ marginTop: 8, background: 'rgba(77,168,108,.12)', color: 'var(--green)', border: '1px solid rgba(77,168,108,.3)', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                    <CheckCircle2 size={14} style={{ marginRight: 4 }} />確認已讀
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
