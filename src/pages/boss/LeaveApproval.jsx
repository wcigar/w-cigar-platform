import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { CheckCircle2, XCircle, AlertCircle, Calendar, Users } from 'lucide-react'
import { format, subMonths } from 'date-fns'

export default function LeaveApproval() {
  const [requests, setRequests] = useState([])
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [filter, setFilter] = useState('pending')
  const [rejectId, setRejectId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [loading, setLoading] = useState(true)
  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01', e = month + '-31'
    const { data } = await supabase.from('leave_requests').select('*').gte('date', s).lte('date', e).order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  async function approve(id) {
    if (!confirm('核准此假單？')) return
    const req = requests.find(r => r.id === id)
    await supabase.from('leave_requests').update({ status: '已核准', reviewed_by: 'Wilson', reviewed_at: new Date().toISOString() }).eq('id', id)
    if (req) {
      await supabase.from('schedules').upsert({ employee_id: req.employee_id, date: req.date, shift: req.leave_type }, { onConflict: 'employee_id,date' })
    }
    load()
  }

  async function reject(id) {
    if (!rejectReason.trim()) return alert('請填寫駁回原因')
    await supabase.from('leave_requests').update({ status: '已駁回', reviewed_by: 'Wilson', reviewed_at: new Date().toISOString(), reject_reason: rejectReason }).eq('id', id)
    setRejectId(null); setRejectReason('')
    load()
  }

  const pending = requests.filter(r => r.status === '待審核')
  const approved = requests.filter(r => r.status === '已核准')
  const rejected = requests.filter(r => r.status === '已駁回')
  const shown = filter === 'pending' ? pending : filter === 'approved' ? approved : filter === 'rejected' ? rejected : requests

  if (loading) return <div>{[1,2].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8 }} />)}</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', background: m === month ? 'var(--gold-glow)' : 'transparent', color: m === month ? 'var(--gold)' : 'var(--text-dim)', border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{parseInt(m.slice(5))}月</button>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 14 }}>
        <div className="card" style={{ padding: 10, textAlign: 'center', cursor: 'pointer', borderColor: filter === 'pending' ? 'var(--border-gold)' : undefined }} onClick={() => setFilter('pending')}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>待審核</div>
          <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: pending.length ? '#f59e0b' : 'var(--text-dim)' }}>{pending.length}</div>
        </div>
        <div className="card" style={{ padding: 10, textAlign: 'center', cursor: 'pointer', borderColor: filter === 'approved' ? 'rgba(77,168,108,.3)' : undefined }} onClick={() => setFilter('approved')}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>已核准</div>
          <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>{approved.length}</div>
        </div>
        <div className="card" style={{ padding: 10, textAlign: 'center', cursor: 'pointer', borderColor: filter === 'rejected' ? 'rgba(239,68,68,.3)' : undefined }} onClick={() => setFilter('rejected')}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>已駁回</div>
          <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>{rejected.length}</div>
        </div>
      </div>

      {shown.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>無{filter === 'pending' ? '待審核' : filter === 'approved' ? '已核准' : '已駁回'}假單</div> :
        shown.map(r => {
          const isPending = r.status === '待審核'
          const stColor = r.status === '已核准' ? 'var(--green)' : r.status === '已駁回' ? 'var(--red)' : '#f59e0b'
          return (
            <div key={r.id} className="card" style={{ padding: 14, marginBottom: 8, borderColor: isPending ? '#f59e0b30' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{r.employee_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.date} · {r.leave_type}</div>
                </div>
                <div style={{ padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 700, color: stColor, background: stColor + '15' }}>{r.status}</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8, padding: '6px 10px', background: 'var(--black)', borderRadius: 8 }}>事由：{r.reason}</div>
              {r.reject_reason && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 6 }}>駁回原因：{r.reject_reason}</div>}
              {r.reviewed_by && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>審核：{r.reviewed_by} {r.reviewed_at ? format(new Date(r.reviewed_at), 'MM/dd HH:mm') : ''}</div>}
              
              {isPending && (
                <div>
                  {rejectId === r.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input placeholder="駁回原因" value={rejectReason} onChange={e => setRejectReason(e.target.value)} style={{ flex: 1, fontSize: 12, padding: 8 }} />
                      <button className="btn-outline" style={{ padding: '6px 12px', fontSize: 12, color: 'var(--red)', borderColor: 'rgba(239,68,68,.3)' }} onClick={() => reject(r.id)}>確認駁回</button>
                      <button className="btn-outline" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => { setRejectId(null); setRejectReason('') }}>取消</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-gold" style={{ flex: 1, padding: 10, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => approve(r.id)}><CheckCircle2 size={16} /> 核准</button>
                      <button className="btn-outline" style={{ flex: 1, padding: 10, fontSize: 14, color: 'var(--red)', borderColor: 'rgba(239,68,68,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => setRejectId(r.id)}><XCircle size={16} /> 駁回</button>
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
