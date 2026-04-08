import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Send, Calendar, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { format, addDays } from 'date-fns'

const LEAVE_TYPES = [
  { id: '事假', icon: '📝', color: '#f59e0b' },
  { id: '病假', icon: '🩺', color: '#ef4444' },
  { id: '特休', icon: '✨', color: '#8b5cf6' },
  { id: '補假', icon: '🔄', color: '#3b82f6' },
  { id: '其他', icon: '📋', color: '#6b7280' },
]

const STATUS_MAP = {
  '待審核': { icon: AlertCircle, color: '#f59e0b', bg: 'rgba(245,158,11,.08)' },
  '已核准': { icon: CheckCircle2, color: '#4da86c', bg: 'rgba(77,168,108,.08)' },
  '已駁回': { icon: XCircle, color: '#ef4444', bg: 'rgba(239,68,68,.08)' },
}

export default function LeaveRequest() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [tab, setTab] = useState('new')
  const [form, setForm] = useState({ date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), leave_type: '事假', reason: '' })
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('leave_requests').select('*').eq('employee_id', user.employee_id).order('date', { ascending: false }).limit(30)
    setRequests(data || [])
    setLoading(false)
  }

  async function handleSubmit() {
    if (!form.date) return alert('請選擇日期')
    if (!form.reason.trim()) return alert('請填寫請假事由')
    const exists = requests.find(r => r.date === form.date && r.status !== '已駁回')
    if (exists) return alert('該日已有請假紀錄')
    if (!confirm('確定提交 ' + form.date + ' 的' + form.leave_type + '申請？')) return
    setSubmitting(true)
    await supabase.from('leave_requests').insert({
      employee_id: user.employee_id, employee_name: user.name,
      date: form.date, leave_type: form.leave_type, reason: form.reason, status: '待審核'
    })
    setSubmitting(false)
    alert('請假申請已送出，請等待老闆審核')
    setForm({ date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), leave_type: '事假', reason: '' })
    setTab('history')
    load()
  }

  async function cancelRequest(id) {
    if (!confirm('確定取消此假單？')) return
    await supabase.from('leave_requests').delete().eq('id', id)
    load()
  }

  const pending = requests.filter(r => r.status === '待審核').length

  if (loading) return <div>{[1,2].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8 }} />)}</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {[['new','新假單'],['history','我的假單' + (pending ? ' (' + pending + ')' : '')]].map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: tab === v ? 'var(--gold-glow)' : 'transparent', color: tab === v ? 'var(--gold)' : 'var(--text-dim)', border: tab === v ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{l}</button>
        ))}
      </div>

      {tab === 'new' && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gold)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={16} /> 請假申請</div>
          
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>請假日期 *</div>
          <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} min={format(new Date(), 'yyyy-MM-dd')} style={{ marginBottom: 12, fontSize: 14, padding: 10 }} />
          
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>假別 *</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {LEAVE_TYPES.map(t => (
              <button key={t.id} onClick={() => setForm(p => ({ ...p, leave_type: t.id }))} style={{
                padding: '8px 14px', borderRadius: 14, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: form.leave_type === t.id ? 'rgba(' + (t.id === '事假' ? '245,158,11' : t.id === '病假' ? '239,68,68' : t.id === '特休' ? '139,92,246' : '59,130,246') + ',.12)' : 'transparent',
                color: form.leave_type === t.id ? t.color : 'var(--text-dim)',
                border: form.leave_type === t.id ? '1px solid ' + t.color + '40' : '1px solid var(--border)',
              }}>{t.icon} {t.id}</button>
            ))}
          </div>
          
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>事由 *</div>
          <textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="請說明請假原因..." rows={3} style={{ marginBottom: 14, fontSize: 13, padding: 10, resize: 'vertical' }} />
          
          <button className="btn-gold" onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: 14, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? .5 : 1 }}>
            <Send size={16} /> {submitting ? '提交中...' : '提交請假申請'}
          </button>
        </div>
      )}

      {tab === 'history' && (
        <div>
          {requests.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>無請假紀錄</div> :
            requests.map(r => {
              const st = STATUS_MAP[r.status] || STATUS_MAP['待審核']
              const Icon = st.icon
              return (
                <div key={r.id} className="card" style={{ padding: 14, marginBottom: 6, borderColor: st.color + '30' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon size={18} color={st.color} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{r.date}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{LEAVE_TYPES.find(t => t.id === r.leave_type)?.icon} {r.leave_type}</div>
                      </div>
                    </div>
                    <div style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{r.status}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>事由：{r.reason}</div>
                  {r.reject_reason && <div style={{ fontSize: 11, color: 'var(--red)' }}>駁回原因：{r.reject_reason}</div>}
                  {r.reviewed_by && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>審核：{r.reviewed_by} {r.reviewed_at ? format(new Date(r.reviewed_at), 'MM/dd HH:mm') : ''}</div>}
                  {r.status === '待審核' && (
                    <button className="btn-outline" style={{ marginTop: 6, padding: '4px 10px', fontSize: 11, color: 'var(--red)', borderColor: 'rgba(239,68,68,.3)' }} onClick={() => cancelRequest(r.id)}>取消申請</button>
                  )}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
