import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Send, CheckCircle2, Plus, Trash2, ClipboardList } from 'lucide-react'
import { format } from 'date-fns'

export default function ShiftHandover() {
  const { user } = useAuth()
  const [records, setRecords] = useState([])
  const [items, setItems] = useState([''])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('shift_handover').select('*').eq('date', today).order('created_at', { ascending: false })
    setRecords(data || [])
    setLoading(false)
  }

  async function handleSubmit() {
    const validItems = items.filter(i => i.trim())
    if (!validItems.length) return alert('\u8acb\u81f3\u5c11\u586b\u5beb\u4e00\u9805\u4ea4\u73ed\u4e8b\u9805')
    if (!confirm('\u78ba\u5b9a\u9001\u51fa\u4ea4\u73ed\u5099\u5fd8\u9304\uff1f')) return
    setSubmitting(true)
    await supabase.from('shift_handover').insert({
      date: today, from_shift: '\u65e9\u73ed', from_employee: user.name,
      to_shift: '\u665a\u73ed', items: validItems, note
    })
    setSubmitting(false)
    alert('\u4ea4\u73ed\u5099\u5fd8\u9304\u5df2\u9001\u51fa\uff01')
    setItems(['']); setNote(''); load()
  }

  async function acknowledge(id) {
    await supabase.from('shift_handover').update({
      acknowledged: true, acknowledged_by: user.name, acknowledged_at: new Date().toISOString()
    }).eq('id', id)
    load()
  }

  const myPending = records.filter(r => !r.acknowledged && r.from_employee !== user.name)

  if (loading) return <div>{[1,2].map(i => <div key={i} className="loading-shimmer" style={{ height: 50, marginBottom: 8 }} />)}</div>

  return (
    <div>
      {myPending.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>\u26a0\ufe0f \u5f85\u78ba\u8a8d\u4ea4\u73ed\u4e8b\u9805</div>
          {myPending.map(r => (
            <div key={r.id} className="card" style={{ padding: 14, marginBottom: 8, borderColor: '#f59e0b30' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{r.from_employee} ({r.from_shift}) \u2192 {r.to_shift}</div>
              {(r.items || []).map((item, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-dim)', padding: '3px 0', display: 'flex', gap: 6 }}>
                  <span style={{ color: 'var(--gold)' }}>\u2022</span> {item}
                </div>
              ))}
              {r.note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>\ud83d\udcdd {r.note}</div>}
              <button className="btn-gold" onClick={() => acknowledge(r.id)} style={{ marginTop: 8, width: '100%', padding: 10, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> \u78ba\u8a8d\u5df2\u8b80
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ClipboardList size={16} /> \u4ea4\u73ed\u5099\u5fd8\u9304
        </div>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--gold)', width: 20 }}>{i + 1}.</span>
            <input value={item} onChange={e => { const n = [...items]; n[i] = e.target.value; setItems(n) }} placeholder="\u4ea4\u73ed\u4e8b\u9805..." style={{ flex: 1, fontSize: 13, padding: 8 }} />
            {items.length > 1 && <button onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>}
          </div>
        ))}
        <button className="btn-outline" onClick={() => setItems([...items, ''])} style={{ fontSize: 12, padding: '6px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={12} /> \u65b0\u589e\u4e8b\u9805</button>
        <input placeholder="\u5099\u8a3b\uff08\u9078\u586b\uff09" value={note} onChange={e => setNote(e.target.value)} style={{ marginBottom: 12, fontSize: 13, padding: 8 }} />
        <button className="btn-gold" onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: 12, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? .5 : 1 }}>
          <Send size={16} /> {submitting ? '\u9001\u51fa\u4e2d...' : '\u9001\u51fa\u4ea4\u73ed\u5099\u5fd8\u9304'}
        </button>
      </div>

      {records.filter(r => r.from_employee === user.name || r.acknowledged).length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>\u4eca\u65e5\u4ea4\u73ed\u7d00\u9304</div>
          {records.map(r => (
            <div key={r.id} className="card" style={{ padding: 12, marginBottom: 6, opacity: r.acknowledged ? 0.7 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.from_employee} \u2192 {r.to_shift}</span>
                {r.acknowledged ? <span style={{ fontSize: 11, color: 'var(--green)' }}>\u2713 {r.acknowledged_by} \u5df2\u78ba\u8a8d</span> : <span style={{ fontSize: 11, color: '#f59e0b' }}>\u5f85\u78ba\u8a8d</span>}
              </div>
              {(r.items || []).map((item, i) => <div key={i} style={{ fontSize: 11, color: 'var(--text-dim)', padding: '2px 0' }}>\u2022 {item}</div>)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
